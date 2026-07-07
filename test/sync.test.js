import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLibrary, validateLibrary, constantTimeEqual } from '../api/sync.js';
import syncHandler from '../api/sync.js';

test('constantTimeEqual', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);   // length mismatch
  assert.equal(constantTimeEqual('', ''), true);
});

test('validateLibrary accepts arrays/empty, rejects wrong shapes', () => {
  assert.equal(validateLibrary({ catalog: [], items: [], deleted: [] }), true);
  assert.equal(validateLibrary({}), true);
  assert.equal(validateLibrary({ catalog: 'x' }), false);
  assert.equal(validateLibrary(null), false);
  assert.equal(validateLibrary(42), false);
});

test('mergeLibrary unions by id, drops tombstoned, incoming wins', () => {
  const stored = { catalog: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], items: [{ id: 'x' }], deleted: ['b'] };
  const incoming = { catalog: [{ id: 'a', name: 'A2' }, { id: 'c', name: 'C' }], items: [{ id: 'y' }], deleted: ['x'] };
  const m = mergeLibrary(stored, incoming, 123);
  assert.equal(m.updatedAt, 123);
  assert.deepEqual([...m.deleted].sort(), ['b', 'x']);
  assert.deepEqual(m.catalog.map(c => c.id).sort(), ['a', 'c']);         // b tombstoned out
  assert.equal(m.catalog.find(c => c.id === 'a').name, 'A2');            // incoming wins
  assert.deepEqual(m.items.map(i => i.id), ['y']);                       // x tombstoned out
});

test('mergeLibrary keeps the newest version — a stale device cannot clobber a rename', () => {
  const stored = { catalog: [{ id: 'a', drawer: 'Summer', updatedAt: 200 }], items: [], deleted: [] };   // PC renamed
  const phoneStale = { catalog: [{ id: 'a', drawer: '', updatedAt: 100 }], items: [], deleted: [] };      // phone's old copy
  const m = mergeLibrary(stored, phoneStale, 1);
  assert.equal(m.catalog.find(c => c.id === 'a').drawer, 'Summer');   // newer (200) survives
});

test('mergeLibrary lets a genuinely newer incoming edit win', () => {
  const stored = { catalog: [{ id: 'a', drawer: '', updatedAt: 100 }], items: [], deleted: [] };
  const incoming = { catalog: [{ id: 'a', drawer: 'Winter', updatedAt: 300 }], items: [], deleted: [] };
  const m = mergeLibrary(stored, incoming, 1);
  assert.equal(m.catalog.find(c => c.id === 'a').drawer, 'Winter');
});

test('mergeLibrary falls back to createdAt when updatedAt is absent (old entries)', () => {
  const stored = { catalog: [{ id: 'a', drawer: 'Renamed', updatedAt: 500, createdAt: 10 }], items: [], deleted: [] };
  const incoming = { catalog: [{ id: 'a', drawer: '', createdAt: 10 }], items: [], deleted: [] };   // no updatedAt -> stamp 10
  const m = mergeLibrary(stored, incoming, 1);
  assert.equal(m.catalog.find(c => c.id === 'a').drawer, 'Renamed');
});

test('mergeLibrary handles a null stored (first push)', () => {
  const m = mergeLibrary(null, { catalog: [{ id: 'a' }], items: [], deleted: [] }, 1);
  assert.deepEqual(m.catalog.map(c => c.id), ['a']);
  assert.deepEqual(m.items, []);
  assert.deepEqual(m.deleted, []);
});

test('handler rejects missing/wrong bearer with 401', async () => {
  globalThis.process.env.SYNC_SECRET = 'topsecret';
  let res = await syncHandler(new Request('https://s/api/sync'));
  assert.equal(res.status, 401);
  res = await syncHandler(new Request('https://s/api/sync', { headers: { authorization: 'Bearer nope' } }));
  assert.equal(res.status, 401);
});

test('handler with correct secret but no R2 config returns 500', async () => {
  globalThis.process.env.SYNC_SECRET = 'topsecret';
  for (const k of ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete globalThis.process.env[k];
  const res = await syncHandler(new Request('https://s/api/sync', { headers: { authorization: 'Bearer topsecret' } }));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /not configured/);
});

test('handler with empty SYNC_SECRET never authorizes (even empty bearer)', async () => {
  globalThis.process.env.SYNC_SECRET = '';
  const res = await syncHandler(new Request('https://s/api/sync', { headers: { authorization: 'Bearer ' } }));
  assert.equal(res.status, 401);
});
