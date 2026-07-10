/* Vercel Edge Function — render-vs-reality fidelity test.
   Stores pairs of images (real mirror photo + FitCheck render) plus votes in the
   same R2 bucket used by sync, under fitcheck/fidelity/. Admin actions are gated
   by SYNC_SECRET; taking the survey (?action=pairs / img / vote) is public so
   friends can vote from a bare link.

   POST ?action=upload  {id, real, render}   Bearer  store one pair (data URLs)
   POST ?action=delete  {id}                 Bearer  remove a pair
   GET  ?action=pairs                        public  [{id}] survey manifest
   GET  ?action=img&id=X&kind=real|render    public  image bytes
   POST ?action=vote    {name, answers}      public  record one respondent
   GET  ?action=results                      Bearer  all votes */

export const config = { runtime: 'edge' };

const PREFIX = 'fitcheck/fidelity/';
const MAX_RESPONDENTS = 200;          // ponytail: friend-scale spam cap, not real abuse defense
const envTrim = (n) => (globalThis.process?.env?.[n] || '').trim();
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const cleanId = (id) => /^[a-z0-9-]{1,40}$/.test(String(id || '')) ? String(id) : null;

/* One respondent's submission. Pure — tested in test/fidelity.test.js. */
export function validateVote(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.answers)) return false;
  if (!v.answers.length || v.answers.length > 20) return false;
  for (const a of v.answers) {
    if (!a || !cleanId(a.id)) return false;
    if (typeof a.correctReal !== 'boolean') return false;
    if (!['same', 'roughly', 'different'].includes(a.fit)) return false;
  }
  return true;
}

/* ---- R2 helpers (same pattern as api/sync.js) ---- */
function r2Configured() {
  return !!(envTrim('R2_ENDPOINT') && envTrim('R2_ACCESS_KEY_ID') && envTrim('R2_SECRET_ACCESS_KEY'));
}
function objectUrl(key) {
  const bucket = envTrim('R2_BUCKET_NAME') || 'afilmory-photos';
  return `${envTrim('R2_ENDPOINT').replace(/\/$/, '')}/${bucket}/${PREFIX}${key}`;
}
async function r2() {
  const { AwsClient } = await import('aws4fetch');
  return new AwsClient({ accessKeyId: envTrim('R2_ACCESS_KEY_ID'), secretAccessKey: envTrim('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
}
async function readJsonKey(aws, key) {
  const res = await aws.fetch(objectUrl(key), { method: 'GET' });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error('R2 GET ' + res.status);
  return await res.json();
}
async function writeJsonKey(aws, key, obj) {
  const res = await aws.fetch(objectUrl(key), { method: 'PUT', body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('R2 PUT ' + res.status);
}

function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1] };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  if (!r2Configured()) return json({ ok: false, error: 'storage not configured' }, 500);

  const secret = envTrim('SYNC_SECRET');
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const authed = secret && constantTimeEqual(bearer, secret);

  try {
    const aws = await r2();

    if (req.method === 'GET' && action === 'pairs') {
      const pairs = (await readJsonKey(aws, 'pairs.json')) || [];
      return json({ ok: true, pairs: pairs.map(p => ({ id: p.id })) }, 200);
    }

    if (req.method === 'GET' && action === 'img') {
      const id = cleanId(url.searchParams.get('id'));
      const kind = url.searchParams.get('kind');
      if (!id || !['real', 'render'].includes(kind)) return json({ ok: false, error: 'bad params' }, 400);
      const res = await aws.fetch(objectUrl(`${id}-${kind}.img`), { method: 'GET' });
      if (!res.ok) return json({ ok: false, error: 'not found' }, 404);
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    if (req.method === 'POST' && action === 'vote') {
      let v; try { v = await req.json(); } catch { return json({ ok: false, error: 'malformed JSON' }, 400); }
      if (!validateVote(v)) return json({ ok: false, error: 'invalid vote' }, 400);
      // ponytail: read-modify-write with no lock — 10 friends over a week won't race
      const votes = (await readJsonKey(aws, 'votes.json')) || [];
      if (votes.length >= MAX_RESPONDENTS) return json({ ok: false, error: 'survey closed' }, 429);
      votes.push({ name: String(v.name || '').slice(0, 40), ts: Date.now(), answers: v.answers.map(a => ({ id: a.id, correctReal: a.correctReal, fit: a.fit })) });
      await writeJsonKey(aws, 'votes.json', votes);
      return json({ ok: true }, 200);
    }

    /* everything below is admin */
    if (!authed) return json({ ok: false, error: 'unauthorized' }, 401);

    if (req.method === 'POST' && action === 'upload') {
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: 'malformed JSON' }, 400); }
      const id = cleanId(b.id);
      const real = dataUrlToBytes(b.real), render = dataUrlToBytes(b.render);
      if (!id || !real || !render) return json({ ok: false, error: 'need id + real + render images' }, 400);
      for (const [kind, img] of [['real', real], ['render', render]]) {
        const res = await aws.fetch(objectUrl(`${id}-${kind}.img`), { method: 'PUT', body: img.bytes, headers: { 'Content-Type': img.mime } });
        if (!res.ok) throw new Error('R2 PUT ' + res.status);
      }
      const pairs = (await readJsonKey(aws, 'pairs.json')) || [];
      if (!pairs.some(p => p.id === id)) pairs.push({ id, createdAt: Date.now() });
      await writeJsonKey(aws, 'pairs.json', pairs);
      return json({ ok: true, pairs: pairs.map(p => ({ id: p.id })) }, 200);
    }

    if (req.method === 'POST' && action === 'delete') {
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: 'malformed JSON' }, 400); }
      const id = cleanId(b.id);
      if (!id) return json({ ok: false, error: 'bad id' }, 400);
      for (const kind of ['real', 'render']) await aws.fetch(objectUrl(`${id}-${kind}.img`), { method: 'DELETE' });
      const pairs = ((await readJsonKey(aws, 'pairs.json')) || []).filter(p => p.id !== id);
      await writeJsonKey(aws, 'pairs.json', pairs);
      return json({ ok: true, pairs: pairs.map(p => ({ id: p.id })) }, 200);
    }

    if (req.method === 'POST' && action === 'clearvotes') {
      await writeJsonKey(aws, 'votes.json', []);
      return json({ ok: true }, 200);
    }

    if (req.method === 'GET' && action === 'results') {
      const votes = (await readJsonKey(aws, 'votes.json')) || [];
      const pairs = (await readJsonKey(aws, 'pairs.json')) || [];
      return json({ ok: true, votes, pairs: pairs.map(p => ({ id: p.id })) }, 200);
    }

    return json({ ok: false, error: 'unknown action' }, 400);
  } catch (e) {
    return json({ ok: false, error: 'fidelity failed: ' + (e?.message || 'error') }, 502);
  }
}
