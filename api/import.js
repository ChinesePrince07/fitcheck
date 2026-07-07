/* Vercel Edge Function — import a garment from a shop product URL.
   ?url=<page>  → JSON { ok, source:{name,price,currency,host}, images:[{url,kind}], suggestedCategory }
   ?img=<image> → the image bytes, streamed back SAME-ORIGIN so the resize canvas isn't tainted.
   Public + unauthenticated (same open-relay class as /api/generate). SSRF-guarded below. */

export const config = { runtime: 'edge' };

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.localhost|0\.0\.0\.0|metadata\.google\.internal)$/i;

function isPrivateIp(h) {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;   // link-local, incl. 169.254.169.254 metadata
    if (a >= 224) return true;                 // multicast / reserved
    return false;
  }
  const lh = h.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = lh.match(/^::ffff:(.+)$/i);   // IPv4-mapped IPv6 → fold to embedded IPv4 and re-check
  if (mapped) {
    const emb = mapped[1];
    if (emb.includes('.')) return isPrivateIp(emb);
    const hx = emb.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hx) {
      const hi = parseInt(hx[1], 16), lo = parseInt(hx[2], 16);
      return isPrivateIp(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
    }
  }
  if (lh === '::1' || lh === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lh)) return true;   // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lh)) return true;   // fe80::/10 link-local
  return false;
}

/* Best-effort SSRF guard: hostname-based only (Edge can't resolve DNS), so a public
   name that resolves to a private IP — DNS rebinding — is NOT caught. Acceptable
   residual risk for a personal tool; documented in the spec's Security section. */
export function guardUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'bad-url' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'bad-scheme' };
  const host = url.hostname;
  if (PRIVATE_HOST.test(host) || isPrivateIp(host)) return { ok: false, reason: 'blocked-host' };
  return { ok: true, url };
}

/* ---- structured-data extraction (no DOM in Edge; regex + JSON.parse) ---- */

function ogMeta(html, prop) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
  return (html.match(a) || html.match(b) || [])[1] || null;
}

function jsonLdNodes(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) { stack.push(...n); continue; }
      if (n && typeof n === 'object') { out.push(n); if (Array.isArray(n['@graph'])) stack.push(...n['@graph']); }
    }
  }
  return out;
}

const typeIs = (n, t) => { const a = n['@type']; return a === t || (Array.isArray(a) && a.includes(t)); };
const toNum = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isNaN(n) ? null : n; };

export function extractProduct(html, baseUrl) {
  const nodes = jsonLdNodes(html);
  const product = nodes.find(n => typeIs(n, 'Product'));
  let name = null, price = null, currency = null;
  const images = [];
  const pushImg = (u, kind) => {
    if (!u || typeof u !== 'string') return;
    let abs; try { abs = new URL(u, baseUrl).href; } catch { return; }
    if (!/^https?:/i.test(abs)) return;
    if (!images.some(x => x.url === abs)) images.push({ url: abs, kind });
  };
  if (product) {
    if (typeof product.name === 'string') name = product.name;
    const field = product.image;
    const arr = Array.isArray(field) ? field : field ? [field] : [];
    for (const it of arr) pushImg(typeof it === 'string' ? it : it && it.url, 'packshot');
    let offer = product.offers;
    if (Array.isArray(offer)) offer = offer[0];
    if (offer && typeof offer === 'object') {
      price = toNum(offer.price ?? offer.lowPrice ?? offer.highPrice);
      if (typeof offer.priceCurrency === 'string') currency = offer.priceCurrency;
    }
  }
  if (!name) name = ogMeta(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null;
  pushImg(ogMeta(html, 'og:image:secure_url') || ogMeta(html, 'og:image'), 'og');
  if (price == null) price = toNum(ogMeta(html, 'product:price:amount') || ogMeta(html, 'og:price:amount'));
  if (!currency) currency = ogMeta(html, 'product:price:currency') || ogMeta(html, 'og:price:currency') || null;

  let breadcrumb = '';
  const bc = nodes.find(n => typeIs(n, 'BreadcrumbList'));
  if (bc && Array.isArray(bc.itemListElement)) {
    breadcrumb = bc.itemListElement.map(e => e && (e.name || (e.item && e.item.name))).filter(Boolean).join(' ');
  }
  return { name: name ? name.trim() : null, price, currency, images, breadcrumb };
}

/* ---- category guess (ordered: specific accessories/outer before generic 'top') ---- */

const CAT_KEYWORDS = [
  ['shoes',    /\b(sneaker|trainer|shoe|boot|loafer|heel|sandal|footwear|moccasin|derby|brogue)s?\b/i],
  ['outer',    /\b(coat|jacket|blazer|parka|overcoat|outerwear|gilet|cardigan|puffer|windbreaker|trench)s?\b/i],
  ['bottom',   /\b(jean|trouser|pant|chino|short|skirt|legging|jogger|slack|culotte)s?\b/i],
  ['hat',      /\b(hat|beanie|cap|bucket|balaclava)s?\b/i],
  ['watch',    /\bwatch(?:es)?\b/i],
  ['necklace', /\b(necklace|pendant)s?\b/i],
  ['bracelet', /\b(bracelet|bangle|cuff)s?\b/i],
  ['top',      /\b(shirt|tee|t-shirt|top|blouse|sweater|jumper|hoodie|polo|knit|sweatshirt|vest|turtleneck|tank|camisole)s?\b/i],
];
export function guessCategory(text) {
  const t = String(text || '');
  for (const [key, re] of CAT_KEYWORDS) if (re.test(t)) return key;
  return 'other';
}

/* ---- per-host high-res refinement (the "tuned favorites") ----
   Each rule rewrites the image URL to request a bigger render. Rewrites use
   String.replace, so a non-matching pattern returns the URL unchanged (safe
   fallback). The exact param/segment shapes below are the common ones for
   each CDN; verify against a live product page and adjust if a shop changed. */
const HOST_RULES = [
  { match: /uniqlo\.com/i, hi: u => u.replace(/([?&](?:w|width)=)\d+/i, '$12000') },
  { match: /zara\.(net|com)/i, hi: u => u.replace(/([?&]w=)\d+/i, '$11500') },
  { match: /(mngbcn|mango)\.com/i, hi: u => u.replace(/([?&]imwidth=)\d+/i, '$11200') },
  { match: /cos\.com|cosstores|hmcdn/i, hi: u => u.replace(/([?&]imwidth=)\d+/i, '$11200') },
];
export function refineForHost(host, product) {
  const rule = HOST_RULES.find(r => r.match.test(host) || (product.images || []).some(i => r.match.test(i.url)));
  if (!rule) return product;
  const images = (product.images || []).map(i => { try { return { ...i, url: rule.hi(i.url) }; } catch { return i; } });
  return { ...product, images };
}
