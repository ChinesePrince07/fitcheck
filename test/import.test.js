import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardUrl, extractProduct, guessCategory, refineForHost, guardedFetch, extractYupooStore } from '../api/import.js';
import handler from '../api/import.js';

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
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:7f00:1]/x',
    'http://[::ffff:169.254.169.254]/x',
  ]) {
    assert.equal(guardUrl(u).ok, false, u);
  }
});

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
  assert.equal(guessCategory('Cargo Shorts'), 'bottom');
  assert.equal(guessCategory('Short Sleeve Shirt'), 'top');
  assert.equal(guessCategory('Leather Chelsea Boots'), 'shoes');
  assert.equal(guessCategory('Wool Overcoat'), 'outer');
  assert.equal(guessCategory('Ribbed Beanie'), 'hat');
  assert.equal(guessCategory('Automatic Dive Watch'), 'watch');
  assert.equal(guessCategory('Gold Pendant Necklace'), 'necklace');
  assert.equal(guessCategory('Silver Cuff Bracelet'), 'bracelet');
  assert.equal(guessCategory('Silk Striped Tie'), 'tie');
  assert.equal(guessCategory('Navy Necktie'), 'tie');
  assert.equal(guessCategory('Tie-Dye Hoodie'), 'top');   // not a tie
  assert.equal(guessCategory('Leather Belt'), 'belt');
  assert.equal(guessCategory('Scented Candle'), 'other');
});

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

test('guardedFetch throws when a redirect points at a private host', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } });
  try {
    await assert.rejects(() => guardedFetch('https://shop.com/x', {}), /blocked-redirect/);
  } finally { globalThis.fetch = orig; }
});

test('guardedFetch follows an allowed redirect to its final response', async () => {
  const orig = globalThis.fetch; let n = 0;
  globalThis.fetch = async () => (n++ === 0)
    ? new Response(null, { status: 301, headers: { location: 'https://cdn.other.com/final' } })
    : new Response('ok', { status: 200 });
  try {
    const res = await guardedFetch('https://shop.com/x', {});
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  } finally { globalThis.fetch = orig; }
});

test('handler returns friendly 200 when the HTML body read fails', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => { throw new Error('body read aborted'); },
  });
  try {
    const res = await handler(new Request('https://site/api/import?url=' + encodeURIComponent('https://shop.com/p/1')));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
  } finally { globalThis.fetch = orig; }
});

const YUPOO_CATEGORY = `<div class="categories__children">
  <a class="album__main" title="P690 - [B+] Andrè Linen Shirt" href="/albums/244986668?uid=1&isSubCate=false&referrercate=5016303">
    <div class="album__imgwrap">
      <img alt="" data-type="photo" class="album__absolute album__img autocover" data-src="https://photo.yupoo.com/aristide/b6829c553a/medium.jpg">
      <div class="text_overflow album__photonumber">28</div>
    </div>
  </a>
  <a class="album__main" title="P450 - Cargo Trousers" href="/albums/244582907?uid=1&isSubCate=false&referrercate=5016303">
    <div class="album__imgwrap">
      <img alt="" data-type="photo" class="album__absolute album__img autocover" data-src="https://photo.yupoo.com/aristide/b70e762b79/small.jpg">
    </div>
  </a>
</div>`;

test('extractYupooStore parses every album card into a product', () => {
  const items = extractYupooStore(YUPOO_CATEGORY, 'https://aristide.x.yupoo.com/categories/5016303');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'P690 - [B+] Andrè Linen Shirt');
  assert.equal(items[0].albumUrl, 'https://aristide.x.yupoo.com/albums/244986668?uid=1&isSubCate=false&referrercate=5016303');
  assert.equal(items[0].image, 'https://photo.yupoo.com/aristide/b6829c553a/big.jpg');   // medium -> big
  assert.equal(items[0].category, 'top');                                                // "Shirt"
  assert.equal(items[1].image, 'https://photo.yupoo.com/aristide/b70e762b79/big.jpg');   // small -> big
  assert.equal(items[1].category, 'bottom');                                             // "Trousers"
});
