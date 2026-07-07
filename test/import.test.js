import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardUrl, extractProduct, guessCategory } from '../api/import.js';

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
  assert.equal(guessCategory('Leather Chelsea Boots'), 'shoes');
  assert.equal(guessCategory('Wool Overcoat'), 'outer');
  assert.equal(guessCategory('Ribbed Beanie'), 'hat');
  assert.equal(guessCategory('Automatic Dive Watch'), 'watch');
  assert.equal(guessCategory('Gold Pendant Necklace'), 'necklace');
  assert.equal(guessCategory('Silver Cuff Bracelet'), 'bracelet');
  assert.equal(guessCategory('Scented Candle'), 'other');
});
