/* Vercel Edge Function — cross-device clothing-library sync.
   Stores ONE gated JSON document at fitcheck/library.json in the afilmory-photos
   Cloudflare R2 bucket (S3-compatible, signed with aws4fetch). Metadata only —
   no image bytes ever touch the backend.

   GET  /api/sync            -> the stored library (or an empty one)
   POST /api/sync  {library} -> merge the client's library with the stored one,
                                persist the merge, return it

   Every request needs `Authorization: Bearer <SYNC_SECRET>`. R2 creds and the
   secret are server-side env vars. The object key is hardcoded, so a bucket-wide
   R2 credential still can't reach or overwrite the blog's photos. */

export const config = { runtime: 'edge' };

const KEY = 'fitcheck/library.json';
const envTrim = (n) => (globalThis.process?.env?.[n] || '').trim();
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/* Constant-time string compare (length is allowed to leak, as is standard). */
export function constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function validateLibrary(o) {
  if (!o || typeof o !== 'object') return false;
  for (const k of ['catalog', 'items', 'deleted']) if (o[k] != null && !Array.isArray(o[k])) return false;
  return true;
}

function normalize(o) {
  o = o || {};
  return {
    catalog: Array.isArray(o.catalog) ? o.catalog : [],
    items: Array.isArray(o.items) ? o.items : [],
    deleted: Array.isArray(o.deleted) ? o.deleted : [],
  };
}

/* Merge two libraries: union records by id, drop anything tombstoned in either,
   incoming wins on id collisions. Tombstone lists are unioned. Pure + tested. */
export function mergeLibrary(stored, incoming, now) {
  const s = normalize(stored), i = normalize(incoming);
  const deleted = [...new Set([...s.deleted, ...i.deleted])];
  const del = new Set(deleted);
  const union = (a, b) => {
    const m = new Map();
    for (const r of a) if (r && r.id && !del.has(r.id)) m.set(r.id, r);
    for (const r of b) if (r && r.id && !del.has(r.id)) m.set(r.id, r);   // incoming wins
    return [...m.values()];
  };
  return { v: 1, updatedAt: now, catalog: union(s.catalog, i.catalog), items: union(s.items, i.items), deleted };
}

/* ---- R2 (S3-compatible), aws4fetch imported lazily so tests/other paths don't need it ---- */

function r2Configured() {
  return !!(envTrim('R2_ENDPOINT') && envTrim('R2_ACCESS_KEY_ID') && envTrim('R2_SECRET_ACCESS_KEY'));
}
function objectUrl() {
  const bucket = envTrim('R2_BUCKET_NAME') || 'afilmory-photos';
  return `${envTrim('R2_ENDPOINT').replace(/\/$/, '')}/${bucket}/${KEY}`;
}
async function r2() {
  const { AwsClient } = await import('aws4fetch');
  return new AwsClient({ accessKeyId: envTrim('R2_ACCESS_KEY_ID'), secretAccessKey: envTrim('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
}
async function readLibrary() {
  const aws = await r2();
  const res = await aws.fetch(objectUrl(), { method: 'GET' });
  if (res.status === 404 || res.status === 403) return null;   // absent (R2 may 403 a missing key)
  if (!res.ok) throw new Error('R2 GET ' + res.status);
  return await res.json();
}
async function writeLibrary(lib) {
  const aws = await r2();
  const res = await aws.fetch(objectUrl(), { method: 'PUT', body: JSON.stringify(lib), headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('R2 PUT ' + res.status);
}

export default async function handler(req) {
  const secret = envTrim('SYNC_SECRET');
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !constantTimeEqual(bearer, secret)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!r2Configured()) return json({ ok: false, error: 'Sync storage not configured' }, 500);

  try {
    if (req.method === 'GET') {
      const lib = await readLibrary();
      return json(lib || { v: 1, empty: true, catalog: [], items: [], deleted: [] }, 200);
    }
    if (req.method === 'POST') {
      let incoming;
      try { incoming = await req.json(); } catch { return json({ ok: false, error: 'malformed JSON' }, 400); }
      if (!validateLibrary(incoming)) return json({ ok: false, error: 'invalid library' }, 400);
      const stored = await readLibrary();
      const merged = mergeLibrary(stored, incoming, Date.now());
      await writeLibrary(merged);
      return json({ ok: true, library: merged }, 200);
    }
    return json({ ok: false, error: 'method not allowed' }, 405);
  } catch (e) {
    return json({ ok: false, error: 'sync failed: ' + (e?.message || 'error') }, 502);
  }
}
