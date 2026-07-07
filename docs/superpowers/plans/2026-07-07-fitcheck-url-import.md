# FitCheck Shop-URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a shop product URL into FitCheck and get a ready-to-use wardrobe item — clean image, product name, and price — without manually screenshotting.

**Architecture:** A new Vercel Edge Function `api/import.js` with two modes: `?url=` returns extracted product metadata (name/price/image gallery) via a fetch ladder (per-host high-res refinement layered over generic `og:`/schema.org JSON-LD parsing), and `?img=` streams a chosen image back same-origin so it feeds FitCheck's existing resize/IndexedDB pipeline untainted. The client (`app.js`) adds an import field, a preview-and-confirm modal, and a "↗ shop" buy-back link on imported items.

**Tech Stack:** Vanilla JS (zero build, zero runtime deps), Vercel Edge runtime (web-standard `fetch`/`Response`/`URL`/`AbortSignal`), IndexedDB, Node v26 built-in test runner (`node --test`) for the server-side pure logic.

## Global Constraints

- **No new runtime dependencies.** The app is zero-deps vanilla JS; keep it that way. Node's built-in `node --test` is the only tooling added, and only for local testing (not shipped).
- **Never commit `config.js`** (holds the real Gemini key; gitignored + in `.vercelignore`). This task touches neither.
- **Deploy only via** `cd ~/fitcheck && npx vercel --prod --yes` **or git push to main** (git-connected auto-deploy). NEVER the zero-arg `deploy_to_vercel` MCP tool — it would publish the whole home directory.
- **No filenames in the UI.** Imported items show the product *name* (e.g. "Oversized Shirt"), never a file name — consistent with the existing "no filenames" rule.
- **Import is deploy-only.** It depends on `/api`, which does not exist under local `python3 -m http.server`. Locally the import field must degrade gracefully (a note + a friendly toast), never crash. Gate on the existing `proxyAvailable()`.
- **Security posture (carried from the spec):** SSRF guard on both modes (http/https only; reject localhost + private/loopback/link-local/metadata hosts). The endpoint remains a public unauthenticated relay — the *same* parked open-proxy class as `/api/generate`; do NOT add a token gate in this plan (user deferred it for both).
- **Theme:** old-money palette. Reuse CSS variables from `style.css` (`--paper`, `--paper-2`, `--paper-3`, `--ink`, `--ink-soft`, `--green`, `--gold`, `--gold-br`, `--line`, `--wine`, `--serif`, `--sans`) and existing classes (`.btn`, `.tile`, `.grid`, `.field`, `.modal`, `.chip`, `.hint`).

---

### Task 1: Project test harness + SSRF URL guard

**Files:**
- Create: `package.json`
- Create: `api/import.js`
- Test: `test/import.test.js`

**Interfaces:**
- Produces: `guardUrl(raw: string) → { ok: true, url: URL } | { ok: false, reason: string }`. Later tasks and the handler call this before any outbound fetch.

- [ ] **Step 1: Create `package.json`** so Node parses `api/import.js` as ESM (needed to `import` its exports in tests). This is a static + Edge Vercel project; keep it dependency-free and build-free.

```json
{
  "private": true,
  "type": "module",
  "name": "fitcheck",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test** `test/import.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardUrl } from '../api/import.js';

test('guardUrl accepts a normal https product URL', () => {
  const g = guardUrl('https://www.zara.com/us/en/shirt-p123.html');
  assert.equal(g.ok, true);
  assert.equal(g.url.hostname, 'www.zara.com');
});

test('guardUrl rejects non-http schemes', () => {
  assert.equal(guardUrl('file:///etc/passwd').ok, false);
  assert.equal(guardUrl('ftp://example.com/x').ok, false);
  assert.equal(guardUrl('not a url').ok, false);
});

test('guardUrl rejects localhost and private/metadata hosts', () => {
  for (const u of [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/x',
    'http://[::1]/x',
  ]) {
    assert.equal(guardUrl(u).ok, false, u);
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd ~/fitcheck && node --test`
Expected: FAIL — `Cannot find module '../api/import.js'` (or `guardUrl is not a function`).

- [ ] **Step 4: Create `api/import.js` with the guard**

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/fitcheck && node --test`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add package.json api/import.js test/import.test.js
git commit -m "feat: add import.js Edge fn scaffold + SSRF URL guard"
```

---

### Task 2: Product extractor + category guess

**Files:**
- Modify: `api/import.js` (append exports)
- Test: `test/import.test.js` (append tests)

**Interfaces:**
- Consumes: nothing from prior tasks (pure string/JSON parsing).
- Produces:
  - `extractProduct(html: string, baseUrl: string) → { name: string|null, price: number|null, currency: string|null, images: {url,kind}[], breadcrumb: string }`. Prefers schema.org JSON-LD `Product`, falls back to OpenGraph. All image URLs absolute + deduped.
  - `guessCategory(text: string) → string` — one of the FitCheck category keys (`wholeset|top|bottom|outer|hat|shoes|necklace|watch|bracelet|other`), defaulting to `'other'`.

- [ ] **Step 1: Write the failing tests** (append to `test/import.test.js`)

```js
import { extractProduct, guessCategory } from '../api/import.js';

const SAMPLE_JSONLD = `<!doctype html><html><head>
<meta property="og:title" content="Ignore Me">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Oversized Cotton Shirt",
 "image":["https://cdn.shop.com/a.jpg","https://cdn.shop.com/b.jpg"],
 "offers":{"@type":"Offer","price":"39.90","priceCurrency":"GBP"}}
</script>
<script type="application/ld+json">
{"@type":"BreadcrumbList","itemListElement":[{"name":"Men"},{"name":"Shirts"}]}
</script>
</head><body></body></html>`;

test('extractProduct reads name, gallery, price from JSON-LD', () => {
  const p = extractProduct(SAMPLE_JSONLD, 'https://cdn.shop.com/product');
  assert.equal(p.name, 'Oversized Cotton Shirt');
  assert.equal(p.price, 39.9);
  assert.equal(p.currency, 'GBP');
  assert.deepEqual(p.images.map(i => i.url), ['https://cdn.shop.com/a.jpg', 'https://cdn.shop.com/b.jpg']);
  assert.match(p.breadcrumb, /Shirts/);
});

const SAMPLE_OG = `<html><head>
<meta property="og:title" content="Slim Chino Trousers">
<meta property="og:image" content="//img.cdn.com/chino.jpg">
<meta property="product:price:amount" content="49.99">
<meta property="product:price:currency" content="USD">
</head></html>`;

test('extractProduct falls back to OpenGraph, resolving protocol-relative URLs', () => {
  const p = extractProduct(SAMPLE_OG, 'https://shop.com/p/1');
  assert.equal(p.name, 'Slim Chino Trousers');
  assert.equal(p.price, 49.99);
  assert.equal(p.currency, 'USD');
  assert.deepEqual(p.images.map(i => i.url), ['https://img.cdn.com/chino.jpg']);
});

test('extractProduct returns no images when the page has none', () => {
  const p = extractProduct('<html><head><title>Home</title></head></html>', 'https://shop.com/');
  assert.equal(p.images.length, 0);
});

test('guessCategory maps keywords to FitCheck categories', () => {
  assert.equal(guessCategory('Oversized Cotton Shirt'), 'top');
  assert.equal(guessCategory('Slim Chino Trousers'), 'bottom');
  assert.equal(guessCategory('Leather Chelsea Boots'), 'shoes');
  assert.equal(guessCategory('Wool Overcoat'), 'outer');
  assert.equal(guessCategory('Ribbed Beanie'), 'hat');
  assert.equal(guessCategory('Automatic Dive Watch'), 'watch');
  assert.equal(guessCategory('Gold Pendant Necklace'), 'necklace');
  assert.equal(guessCategory('Silver Cuff Bracelet'), 'bracelet');
  assert.equal(guessCategory('Scented Candle'), 'other');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/fitcheck && node --test`
Expected: FAIL — `extractProduct is not a function`.

- [ ] **Step 3: Append the implementation** to `api/import.js`

```js
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
  ['shoes',    /\b(sneaker|trainer|shoe|boot|loafer|heel|sandal|footwear|moccasin|derby|brogue)\b/i],
  ['outer',    /\b(coat|jacket|blazer|parka|overcoat|outerwear|gilet|cardigan|puffer|windbreaker|trench)\b/i],
  ['bottom',   /\b(jean|trouser|pant|chino|short|skirt|legging|jogger|slack|culotte)\b/i],
  ['hat',      /\b(hat|beanie|cap|bucket|balaclava)\b/i],
  ['watch',    /\bwatch\b/i],
  ['necklace', /\b(necklace|pendant)\b/i],
  ['bracelet', /\b(bracelet|bangle|cuff)\b/i],
  ['top',      /\b(shirt|tee|t-shirt|top|blouse|sweater|jumper|hoodie|polo|knit|sweatshirt|vest|turtleneck|tank|camisole)\b/i],
];
export function guessCategory(text) {
  const t = String(text || '');
  for (const [key, re] of CAT_KEYWORDS) if (re.test(t)) return key;
  return 'other';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/fitcheck && node --test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add api/import.js test/import.test.js
git commit -m "feat: JSON-LD/OpenGraph product extractor + category guess"
```

---

### Task 3: Per-host high-res image refinement

**Files:**
- Modify: `api/import.js` (append `refineForHost`)
- Test: `test/import.test.js` (append tests)

**Interfaces:**
- Consumes: the `{ images, ... }` shape from `extractProduct`.
- Produces: `refineForHost(host: string, product) → product` — for tuned CDNs (Uniqlo, Zara, COS, Mango), rewrites image URLs to request a larger size; **non-destructive** (a rewrite that doesn't match leaves the URL unchanged) so unknown hosts and unexpected URL shapes pass through untouched.

- [ ] **Step 1: Write the failing tests**

```js
import { refineForHost } from '../api/import.js';

test('refineForHost bumps Zara image width', () => {
  const out = refineForHost('www.zara.com', { images: [{ url: 'https://static.zara.net/photos/x.jpg?ts=1&w=563', kind: 'packshot' }] });
  assert.match(out.images[0].url, /w=1500/);
});

test('refineForHost leaves unknown hosts untouched', () => {
  const input = { images: [{ url: 'https://cdn.random.com/x.jpg', kind: 'og' }] };
  const out = refineForHost('random.com', input);
  assert.equal(out.images[0].url, 'https://cdn.random.com/x.jpg');
});

test('refineForHost is non-destructive when the pattern does not match', () => {
  const out = refineForHost('www.zara.com', { images: [{ url: 'https://static.zara.net/photos/x.jpg', kind: 'packshot' }] });
  assert.equal(out.images[0].url, 'https://static.zara.net/photos/x.jpg');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/fitcheck && node --test`
Expected: FAIL — `refineForHost is not a function`.

- [ ] **Step 3: Append the implementation** to `api/import.js`

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/fitcheck && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/import.js test/import.test.js
git commit -m "feat: per-host high-res image refinement (Uniqlo/Zara/COS/Mango)"
```

---

### Task 4: Edge handler — metadata + image-proxy modes

**Files:**
- Modify: `api/import.js` (add `default` handler + two async helpers)
- Test: `test/import.test.js` (append network-free handler tests)

**Interfaces:**
- Consumes: `guardUrl`, `extractProduct`, `refineForHost`, `guessCategory` from Tasks 1–3.
- Produces: `export default async function handler(req: Request) → Response`. `?img=` streams image bytes same-origin; `?url=` returns the metadata JSON; missing params → 400. Network-failure / bot-block on `?url=` returns HTTP 200 with `{ ok:false, reason }` so the client can show a friendly manual-paste fallback instead of an error.

- [ ] **Step 1: Write the failing tests** (only the network-free branches — real fetches are covered by the live smoke test in Task 6)

```js
import handler from '../api/import.js';

test('handler 400s when neither url nor img is given', async () => {
  const res = await handler(new Request('https://site/api/import'));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('handler 400s on a blocked image host (SSRF guard, no network hit)', async () => {
  const res = await handler(new Request('https://site/api/import?img=' + encodeURIComponent('http://169.254.169.254/latest')));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.reason, 'blocked-host');
});

test('handler 400s on a blocked page host', async () => {
  const res = await handler(new Request('https://site/api/import?url=' + encodeURIComponent('http://localhost/admin')));
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/fitcheck && node --test`
Expected: FAIL — the default export isn't defined yet.

- [ ] **Step 3: Append the handler** to `api/import.js`

```js
/* ---- request handler ---- */

const MAX_HTML = 2_000_000;
const MAX_IMG = 10_000_000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  let params;
  try { params = new URL(req.url).searchParams; } catch { return json({ ok: false, reason: 'bad-request' }, 400); }
  const img = params.get('img');
  const page = params.get('url');
  if (img) return proxyImage(img);
  if (page) return importMeta(page);
  return json({ ok: false, reason: 'missing-param' }, 400);
}

async function importMeta(raw) {
  const g = guardUrl(raw);
  if (!g.ok) return json({ ok: false, reason: g.reason }, 400);
  let res;
  try {
    res = await fetch(g.url.href, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  } catch { return json({ ok: false, reason: 'blocked' }, 200); }
  if (!res.ok) return json({ ok: false, reason: 'blocked' }, 200);
  if (!/html|xml/i.test(res.headers.get('content-type') || '')) return json({ ok: false, reason: 'not-html' }, 200);
  let html = await res.text();
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
    res = await fetch(g.url.href, { headers: { ...FETCH_HEADERS, Accept: 'image/*', Referer: g.url.origin + '/' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  } catch { return json({ ok: false, reason: 'blocked' }, 502); }
  if (!res.ok) return json({ ok: false, reason: 'blocked' }, 502);
  const ct = res.headers.get('content-type') || '';
  if (!/^image\//i.test(ct)) return json({ ok: false, reason: 'not-image' }, 415);
  const len = res.headers.get('content-length');
  if (len && Number(len) > MAX_IMG) return json({ ok: false, reason: 'too-large' }, 413);
  return new Response(res.body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/fitcheck && node --test`
Expected: PASS — all handler + extractor + guard tests green.

- [ ] **Step 5: Commit**

```bash
git add api/import.js test/import.test.js
git commit -m "feat: import handler with metadata + same-origin image-proxy modes"
```

---

### Task 5: Client import flow — field, preview modal, buy-back link

**Files:**
- Modify: `index.html` (import row in the Wardrobe section + import modal)
- Modify: `app.js` (state, import functions, handlers, tile shop-link, viewer buy-back)
- Modify: `style.css` (import row, thumbs, shop link)

**Interfaces:**
- Consumes: `/api/import?url=` and `/api/import?img=` from Task 4; existing `resizeFile(blob, ITEM_MAX_DIM) → { dataUrl, w, h }`, `dbPut`, `proxyAvailable()`, `renderAll`, `toast`, `CATS`, `uid`, `esc`.
- Produces: wardrobe items with an extra `source: { name, price, currency, host, url }` field (all other item fields unchanged: `{ id, cat, dataUrl, name, createdAt }`).

- [ ] **Step 1: Add the import row + modal to `index.html`.** Insert the import row inside `#wardrobe-section` immediately before `<div id="categories"></div>` (after the `</header>` on line 63):

```html
      <div class="import-row">
        <input id="import-url" type="url" placeholder="Paste a product link — Uniqlo, Zara, COS, Mango…" autocomplete="off" spellcheck="false">
        <button class="btn" id="import-btn" data-action="import-url">Import</button>
      </div>
      <p class="hint import-note hidden" id="import-note">Import runs on the hosted site — open fitcheck.andypandy.org.</p>
```

Then add the import modal just after the closing `</div>` of the Look viewer modal (after line 122, before `<div id="toasts"></div>`):

```html
<!-- Import preview modal -->
<div class="modal" id="import-modal">
  <div class="modal-card">
    <header><h3 id="import-title">Import</h3><button class="iconbtn" data-action="close-modal">✕</button></header>
    <p class="import-sub" id="import-sub"></p>
    <div class="grid import-thumbs" id="import-thumbs"></div>
    <label class="field"><span>Add as</span><select id="import-cat"></select></label>
    <div class="row">
      <span class="spacer"></span>
      <button class="btn primary" id="import-add-btn" data-action="confirm-import">Add to wardrobe</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add `importMeta` to state** in `app.js`. In the `const state = { … }` object (around line 82), add after `currentLookId: null,`:

```js
  importMeta: null,        // { pageUrl, source, images:[{url,kind}], cat, chosen:Set<idx> } while the import modal is open
```

- [ ] **Step 3: Add the import functions** to `app.js`. Insert this block right after the `handleFiles` function (after line 567, before `async function generate()`):

```js
/* ============================== import from a shop URL ============================== */

async function importFromUrl() {
  if (!proxyAvailable()) { toast('Import runs on the hosted site (fitcheck.andypandy.org), not locally.', 'err'); return; }
  const raw = ($('#import-url')?.value || '').trim();
  if (!/^https?:\/\//i.test(raw)) { toast('Paste a full product link (starting with http).', 'err'); return; }
  const btn = $('#import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  try {
    const res = await fetch('/api/import?url=' + encodeURIComponent(raw));
    const meta = await res.json().catch(() => ({ ok: false }));
    if (!meta.ok || !meta.images?.length) { toast("Couldn't read that link — try the image upload instead.", 'err'); return; }
    state.importMeta = {
      pageUrl: raw,
      source: meta.source || {},
      images: meta.images,
      cat: meta.suggestedCategory || 'other',
      chosen: new Set([0]),          // first (packshot) selected by default
    };
    renderImportModal();
    $('#import-modal').classList.add('open');
  } catch (e) {
    console.warn('FitCheck import failed:', e);
    toast('Import failed — check the link or try again.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
  }
}

function renderImportModal() {
  const m = state.importMeta;
  if (!m) return;
  const price = m.source.price != null ? `${m.source.currency ? m.source.currency + ' ' : ''}${m.source.price}` : '';
  $('#import-title').textContent = m.source.name || 'Imported item';
  $('#import-sub').textContent = [m.source.host, price].filter(Boolean).join('  ·  ');
  $('#import-thumbs').innerHTML = m.images.map((img, i) =>
    `<div class="tile selectable ${m.chosen.has(i) ? 'selected' : ''}" data-action="toggle-import-img" data-idx="${i}" role="button" tabindex="0">
       <img src="${esc(img.url)}" alt="option ${i + 1}" loading="lazy" referrerpolicy="no-referrer">
       <span class="check">✓</span>
     </div>`).join('');
  $('#import-cat').innerHTML = CATS.map(c =>
    `<option value="${c.key}"${c.key === m.cat ? ' selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('');
}

async function addImported() {
  const m = state.importMeta;
  if (!m) return;
  const idxs = [...m.chosen];
  if (!idxs.length) { toast('Pick at least one image.', 'err'); return; }
  const btn = $('#import-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  let ok = 0;
  for (const i of idxs) {
    const url = m.images[i]?.url;
    if (!url) continue;
    try {
      const res = await fetch('/api/import?img=' + encodeURIComponent(url));
      if (!res.ok) throw new Error('proxy ' + res.status);
      const blob = await res.blob();
      const { dataUrl } = await resizeFile(blob, ITEM_MAX_DIM);
      const rec = {
        id: uid(), cat: m.cat, dataUrl,
        name: m.source.name || '',
        source: { name: m.source.name || '', price: m.source.price ?? null, currency: m.source.currency || '', host: m.source.host || '', url: m.pageUrl },
        createdAt: Date.now(),
      };
      await dbPut('items', rec);
      state.items.push(rec);
      ok++;
    } catch (e) { console.warn('FitCheck import add failed:', e); }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Add to wardrobe'; }
  const host = m.source.host || 'the shop';
  state.importMeta = null;
  closeModals();
  renderAll();
  toast(ok ? `Added ${ok} item${ok > 1 ? 's' : ''} from ${host}.` : "Couldn't fetch that image — try again.", ok ? '' : 'err');
}
```

- [ ] **Step 4: Add the "↗ shop" link to `tileHtml`** (line 403). Change the tile markup to include a shop anchor when `rec.source?.url` is set. Replace the existing `tileHtml` body's closing lines:

```js
function tileHtml(rec, { selected, kind }) {
  return `<div class="tile selectable ${selected ? 'selected' : ''}" data-action="select-${kind}" data-id="${rec.id}" role="button" tabindex="0">
    <img src="${rec.dataUrl}" alt="${esc(rec.name || kind)}" loading="lazy">
    <span class="check">✓</span>
    <button class="del" data-action="del-${kind}" data-id="${rec.id}" title="Delete">✕</button>
    ${rec.source?.url ? `<a class="shop" href="${esc(rec.source.url)}" target="_blank" rel="noopener" title="View at ${esc(rec.source.host || 'shop')}">↗</a>` : ''}
    ${rec.name ? `<span class="name">${esc(rec.name)}</span>` : ''}
  </div>`;
}
```

- [ ] **Step 5: Guard the shop link from the tile's select handler.** In the document `click` listener (line 674), add this as the very first line inside the handler, before `const el = e.target.closest('[data-action]');`:

```js
  if (e.target.closest('a.shop')) return;   // let the shop link open its tab, don't select/deselect the tile
```

- [ ] **Step 6: Wire the new click actions.** In the `switch (action)` block, add these cases (next to `case 'generate':`):

```js
    case 'import-url': importFromUrl(); break;
    case 'toggle-import-img': {
      const i = +el.dataset.idx;
      const ch = state.importMeta?.chosen;
      if (ch) { ch.has(i) ? ch.delete(i) : ch.add(i); renderImportModal(); }
      break;
    }
    case 'confirm-import': addImported(); break;
```

- [ ] **Step 7: Wire the category `<select>` and the Enter key.** Add a `change` listener (after the existing `input` listener near line 776):

```js
document.addEventListener('change', e => {
  if (e.target.id === 'import-cat' && state.importMeta) state.importMeta.cat = e.target.value;
});
```

And in the existing `keydown` listener (line 778), add Enter-to-import before/after the Escape check:

```js
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
  if (e.key === 'Enter' && e.target.id === 'import-url') { e.preventDefault(); importFromUrl(); }
});
```

- [ ] **Step 8: Show the local-only note + buy-back links in the viewer.** In `renderAll` (line 500), add after `renderBanner();`:

```js
  const note = $('#import-note'); if (note) note.classList.toggle('hidden', proxyAvailable());
```

In `openViewer` (line 512), append shop links for any imported items in the look. After the existing `$('#viewer-meta').innerHTML = …` assignment, add:

```js
  const shops = look.items.map(li => state.items.find(x => x.id === li.id)).filter(x => x?.source?.url)
    .map(x => `<a class="chip shop-chip" href="${esc(x.source.url)}" target="_blank" rel="noopener">↗ ${esc(x.source.host || 'shop')}</a>`).join('');
  if (shops) $('#viewer-meta').innerHTML += shops;
```

- [ ] **Step 9: Add styling** to `style.css` (append at end of file):

```css
/* ---------- shop-URL import ---------- */
.import-row { display: flex; gap: 8px; margin: 4px 0 10px; }
.import-row input {
  flex: 1; min-width: 0; padding: 9px 12px;
  background: var(--paper-3); color: var(--ink);
  border: 1px solid var(--line); border-radius: 3px;
  font-family: var(--sans); font-size: 12.5px;
}
.import-row input:focus { outline: none; border-color: var(--gold); }
.import-note { margin: 0 0 10px; }
.import-sub { color: var(--ink-soft); font-family: var(--serif); font-style: italic; font-size: 14px; margin: 0 0 14px; }
.import-thumbs { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); margin-bottom: 4px; }
.tile .shop {
  position: absolute; left: 5px; bottom: 5px; z-index: 2;
  width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; text-decoration: none; color: var(--gold-br);
  background: rgba(21,42,32,.82); border: 1px solid rgba(201,169,94,.5); border-radius: 3px;
  opacity: 0; transition: opacity .15s;
}
.tile:hover .shop { opacity: 1; }
.shop-chip { text-decoration: none; }
```

- [ ] **Step 10: Verify the UI end-to-end with a stubbed proxy** (import is deploy-only, so stub `fetch` to exercise the flow locally, mirroring how the app's prior E2E tests stubbed the Gemini endpoint). Start the dev server and drive a headless check:

```bash
cd ~/fitcheck && python3 -c "import http.server,socketserver; socketserver.ThreadingTCPServer(('',4173),http.server.SimpleHTTPRequestHandler).serve_forever()" &
```

Open `http://localhost:4173`, then in DevTools console (or a headless script) run:

```js
// stub the two proxy calls with a fake product + a real data-URL image
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const _f = window.fetch;
window.fetch = (u, o) => {
  if (String(u).includes('/api/import?url=')) return Promise.resolve(new Response(JSON.stringify({ ok:true, source:{name:'Oversized Shirt',price:39.9,currency:'GBP',host:'zara.com'}, images:[{url:'https://x/a.jpg',kind:'packshot'},{url:'https://x/b.jpg',kind:'packshot'}], suggestedCategory:'top' }), { headers:{'Content-Type':'application/json'} }));
  if (String(u).includes('/api/import?img=')) return fetch(PX);   // resolves to a real image blob
  return _f(u, o);
};
// proxyAvailable() is false on localhost, so temporarily force it for the test:
window.proxyAvailable = () => true;
document.querySelector('#import-url').value = 'https://www.zara.com/us/en/shirt-p123.html';
importFromUrl();
```

Expected: the import modal opens showing "Oversized Shirt", host + price, two thumbnails (first selected), category `👕 Tops` preselected. Click **Add to wardrobe** → a Tops item appears in the Wardrobe with a name and, on hover, a "↗" link to the product page.

Note: `window.proxyAvailable` override only works if `proxyAvailable` is referenced via the global; if it is not, instead run this on the deployed preview (Task 6) where `proxyAvailable()` is naturally true. Either path validates the flow.

- [ ] **Step 11: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: shop-URL import UI — field, preview modal, buy-back link"
```

---

### Task 6: README + live deploy smoke test

**Files:**
- Modify: `README.md`
- Modify: `.vercelignore` (exclude the test dir + docs from the deploy bundle)

**Interfaces:**
- Consumes: the deployed `/api/import` from Tasks 1–5.

- [ ] **Step 1: Keep the test dir and docs out of the deploy bundle.** Append to `.vercelignore`:

```
test/
docs/
```

(Confirm `config.js` is still listed there — it must never deploy.)

- [ ] **Step 2: Document the feature in `README.md`.** Under the "Features" list, add a bullet after the "Whole-set mode" line:

```markdown
- **Import from a link** — paste a product URL (Uniqlo, Zara, COS, Mango, or most shops) and FitCheck grabs the clothing image, name, and price automatically — no screenshot. Imported pieces keep a "↗ shop" link back to the product page.
```

- [ ] **Step 3: Run the full local test suite one last time**

Run: `cd ~/fitcheck && node --test`
Expected: PASS — all Task 1–4 tests green.

- [ ] **Step 4: Commit and deploy** (git push triggers the git-connected auto-deploy; or deploy explicitly)

```bash
git add README.md .vercelignore
git commit -m "docs: document shop-URL import; keep test/ and docs/ out of deploy"
git push
# explicit alt: cd ~/fitcheck && npx vercel --prod --yes
```

- [ ] **Step 5: Smoke-test the live deploy** (import is free — no Gemini billing — so a real product URL is safe to test). Wait ~60s for the deploy, then:

```bash
# homepage + endpoint reachable
curl -s -o /dev/null -w '%{http_code}\n' https://fitcheck.andypandy.org/
# missing-param → 400 JSON
curl -s https://fitcheck.andypandy.org/api/import
# a real product URL → expect { ok:true, images:[…], source:{…} }  (swap in a live product link)
curl -s "https://fitcheck.andypandy.org/api/import?url=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" 'https://www.uniqlo.com/us/en/products/E479225-000')" | head -c 600
# SSRF guard holds on the live edge
curl -s "https://fitcheck.andypandy.org/api/import?img=http://169.254.169.254/latest" 
```

Expected: homepage `200`; bare endpoint `{"ok":false,"reason":"missing-param"}`; the product URL returns `{"ok":true,...}` with at least one absolute image URL (if a given shop returns `{ok:false}`, that shop is a pure-SPA/bot-blocked case — the generic path couldn't see structured data; note it and rely on manual upload for that shop); the metadata host is unchanged; the SSRF probe returns `{"ok":false,"reason":"blocked-host"}`.

- [ ] **Step 6: Verify the Vercel build still treats the project as static + Edge** (the new `package.json` shouldn't trigger a framework build). Confirm the homepage and `app.js` still load and `/api/generate` still works (try one generation in the UI, or `curl -sI https://fitcheck.andypandy.org/app.js` → `200`). If the deploy regressed (build error from `package.json`), the rollback is: remove `package.json`, rename `test/import.test.js` to keep tests runnable via `node --experimental-default-type=module --test test/`, and redeploy. This is unlikely (no build script, no framework preset) but is the documented escape hatch.

- [ ] **Step 7: Final commit** (only if Steps 5–6 required any fixup; otherwise the feature is already committed and deployed).

---

## Self-Review

**Spec coverage:**
- Paste URL → auto-grab image/name/price → Tasks 2 (extract) + 4 (handler) + 5 (UI). ✓
- Same-origin image proxy to avoid canvas taint → Task 4 `proxyImage` + Task 5 Step 3 (`?img=` → blob → `resizeFile`). ✓
- Adapter ladder (Uniqlo → Inditex → generic → manual paste) → Task 2 (generic) + Task 3 (per-host refine) + Task 5 friendly fallback toast. ✓
- Preview card (name, price, gallery, category dropdown) → Task 5 Steps 1, 3. ✓
- Buy-back "↗ shop" link on tile + lookbook → Task 5 Steps 4, 8. ✓
- Deploy-only / local note → Task 5 Steps 3, 8 (`proxyAvailable()` gate + `#import-note`). ✓
- SSRF guard + size cap → Task 1 (`guardUrl`) + Task 4 (`MAX_IMG`, content-type checks). ✓
- Open-proxy flagged not fixed → Global Constraints. ✓
- Testing: adapter units, SSRF, category guess, fallback → Tasks 1–4 tests; canvas same-origin + live → Task 5 Step 10, Task 6 Step 5. ✓

**Placeholder scan:** No TBD/TODO. The per-host CDN rewrites (Task 3) are non-destructive by construction (unmatched pattern → unchanged URL), and the plan flags verifying the exact param against a live page — this is intentional tuning latitude, not a placeholder, and the feature is correct without it (generic path still returns the image).

**Type consistency:** `guardUrl`→`{ok,url,reason}`, `extractProduct`→`{name,price,currency,images,breadcrumb}`, `refineForHost` preserves that shape, handler emits `{ok,source,images,suggestedCategory}`, client `state.importMeta = {pageUrl,source,images,cat,chosen}`, item gains `source:{name,price,currency,host,url}`. Names consistent across tasks. ✓
