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
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:7f00:1]/x',
    'http://[::ffff:169.254.169.254]/x',
  ]) {
    assert.equal(guardUrl(u).ok, false, u);
  }
});
