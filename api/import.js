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
  ['bottom',   /\b(jean|trouser|pant|chino|shorts|skirt|legging|jogger|slack|culotte)s?\b/i],
  ['hat',      /\b(hat|beanie|cap|bucket|balaclava)s?\b/i],
  ['glasses',  /\b(sunglasses|glasses|eyewear|shades|spectacles|goggles)\b/i],
  ['watch',    /\bwatch(?:es)?\b/i],
  ['necklace', /\b(necklace|pendant)s?\b/i],
  ['bracelet', /\b(bracelet|bangle|cuff)s?\b/i],
  ['tie',      /\b(necktie|bow ?tie)s?\b|\bties?\b(?![-\s]*dye)/i],   // "tie"/"ties" but not "tie-dye"
  ['belt',     /\bbelts?\b/i],
  ['suit',     /\b(suit|tuxedo|blazer suit|two-piece|three-piece)s?\b/i],   // standalone "suit" only (not tracksuit/swimsuit)
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

/* ---- request handler ---- */

const MAX_HTML = 2_000_000;
const MAX_IMG = 10_000_000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/* Fetch that re-applies guardUrl to every redirect hop — fetch's own redirect:'follow'
   would chase a 3xx into a private/metadata host and defeat the SSRF guard. */
export async function guardedFetch(startUrl, opts, maxHops = 4) {
  let url = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(url, { ...opts, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      let next;
      try { next = new URL(loc, url).href; } catch { return res; }
      const g = guardUrl(next);
      if (!g.ok) throw new Error('blocked-redirect');
      url = g.url.href;
      continue;
    }
    return res;
  }
  throw new Error('too-many-redirects');
}

export default async function handler(req) {
  let params;
  try { params = new URL(req.url).searchParams; } catch { return json({ ok: false, reason: 'bad-request' }, 400); }
  const img = params.get('img');
  const page = params.get('url');
  const store = params.get('store');
  if (img) return proxyImage(img);
  if (store) return importStore(store);
  if (page) return importMeta(page);
  return json({ ok: false, reason: 'missing-param' }, 400);
}

async function importMeta(raw) {
  const g = guardUrl(raw);
  if (!g.ok) return json({ ok: false, reason: g.reason }, 400);
  let res;
  try {
    res = await guardedFetch(g.url.href, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
  } catch { return json({ ok: false, reason: 'blocked' }, 200); }
  if (!res.ok) return json({ ok: false, reason: 'blocked' }, 200);
  if (!/html|xml/i.test(res.headers.get('content-type') || '')) return json({ ok: false, reason: 'not-html' }, 200);
  let html;
  try { html = await res.text(); } catch { return json({ ok: false, reason: 'blocked' }, 200); }
  if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);
  let product = extractProduct(html, g.url.href);
  product = refineForHost(g.url.hostname, product);
  if (!product.images.length) return json({ ok: false, reason: 'no-data' }, 200);
  return json({
    ok: true,
    source: { name: product.name, price: product.price, currency: product.currency, host: g.url.hostname.replace(/^www\./, '') },
    images: product.images,
    suggestedCategory: guessCategory(`${product.name || ''} ${product.breadcrumb || ''}`),
  }, 200);
}

async function proxyImage(raw) {
  const g = guardUrl(raw);
  if (!g.ok) return json({ ok: false, reason: g.reason }, 400);
  let res;
  try {
    res = await guardedFetch(g.url.href, { headers: { ...FETCH_HEADERS, Accept: 'image/*', Referer: g.url.origin + '/' }, signal: AbortSignal.timeout(10000) });
  } catch { return json({ ok: false, reason: 'blocked' }, 502); }
  if (!res.ok) return json({ ok: false, reason: 'blocked' }, 502);
  const ct = res.headers.get('content-type') || '';
  if (!/^image\//i.test(ct)) return json({ ok: false, reason: 'not-image' }, 415);
  const len = res.headers.get('content-length');
  if (len && Number(len) > MAX_IMG) return json({ ok: false, reason: 'too-large' }, 413);
  return new Response(res.body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } });
}

/* ---- Yupoo store/category import (bulk) ----
   A Yupoo category page is server-rendered as a grid of `album__main` cards, each
   an <a title=… href="/albums/…"> wrapping a cover <img data-src="photo.yupoo.com/…">.
   One card = one product. Parse every card on a page into {name, image, albumUrl}. */
export function extractYupooStore(html, baseUrl) {
  const out = [];
  const parts = html.split('album__main');
  for (let k = 1; k < parts.length; k++) {
    const seg = parts[k].slice(0, 900);                       // the anchor + its imgwrap
    const title = (seg.match(/title="([^"]*)"/i) || [])[1] || '';
    const href = (seg.match(/href="(\/albums\/[^"]+)"/i) || [])[1];
    const img = (seg.match(/data-src="([^"]*photo\.yupoo\.com[^"]+)"/i) || [])[1];
    if (!href || !img) continue;
    let albumUrl, image;
    try { albumUrl = new URL(href.replace(/&amp;/g, '&'), baseUrl).href; } catch { continue; }
    try { image = new URL(img.replace(/&amp;/g, '&'), baseUrl).href; } catch { continue; }
    image = image.replace(/\/(small|medium)\.jpg/i, '/big.jpg');   // bump cover to a larger variant
    out.push({ name: title.trim(), image, albumUrl, category: guessCategory(title) });
  }
  return out;
}

/* Fetch ONE store page and return its album cards. The client paginates (calls this
   with ?page=1,2,… until empty) — one page per request keeps each call well under the
   Edge function's time limit even when the store host is slow / far away. */
async function importStore(raw) {
  const g = guardUrl(raw);
  if (!g.ok) return json({ ok: false, reason: g.reason }, 400);
  let res;
  try { res = await guardedFetch(g.url.href, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) }); }
  catch { return json({ ok: false, reason: 'blocked' }, 200); }
  if (!res.ok) return json({ ok: false, reason: 'blocked' }, 200);
  let html;
  try { html = await res.text(); } catch { return json({ ok: false, reason: 'blocked' }, 200); }
  const items = extractYupooStore(html, g.url.href);
  return json({ ok: true, store: { host: g.url.hostname.replace(/^www\./, '') }, items }, 200);
}
