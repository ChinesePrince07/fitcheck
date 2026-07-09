/* Vercel serverless (Node) proxy to an OpenAI-compatible image router.
   Keeps the router key server-side. Client POSTs { model, prompt, images:[dataUrl], size, quality }.

   A virtual try-on is an image EDIT: the subject photo + garment photos are sent
   as input images with a prompt → /images/edits with input_fidelity=high (holds
   the subject's face). Returns { dataUrl }.

   Env: OPENAI_BASE_URL (e.g. https://hk.lanyiapi.com/v1), OPENAI_API_KEY.
   Needs a >60s budget — the project has Fluid Compute on + maxDuration 300 (vercel.json). */

const BASE = (process.env.OPENAI_BASE_URL || 'https://hk.lanyiapi.com/v1').replace(/\/+$/, '');

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
  const mime = m ? m[1] : 'image/jpeg';
  const b64 = m ? m[2] : String(dataUrl || '');
  return new Blob([Buffer.from(b64, 'base64')], { type: mime });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { /* fall through */ } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

export default async function handler(req, res) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(500).json({ error: { message: 'Server is missing OPENAI_API_KEY.' } }); return; }

  // TEMP benchmark: from this function (iad1), time each lanyiapi region. Sync-secret gated; remove after.
  if (req.method === 'GET' && 'bench' in (req.query || {})) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!process.env.SYNC_SECRET || bearer !== process.env.SYNC_SECRET) { res.status(401).json({ error: { message: 'unauthorized' } }); return; }
    const hosts = ['https://us.lanyiapi.com/v1', 'https://hk.lanyiapi.com/v1', 'https://lanyiapi.com/v1'];
    const out = {};
    for (const h of hosts) {
      const samples = [];
      for (let i = 0; i < 4; i++) {
        const t = Date.now();
        try { await fetch(`${h}/models`, { headers: { Authorization: `Bearer ${key}` } }); samples.push(Date.now() - t); }
        catch { samples.push(-1); }
      }
      const ok = samples.filter(x => x >= 0).sort((a, b) => a - b);
      out[h] = { samples, median_ms: ok.length ? ok[Math.floor(ok.length / 2)] : null };
    }
    res.status(200).json(out); return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'POST only' } }); return; }

  const { model, prompt, images, size, quality } = await readJson(req);
  if (!prompt || !Array.isArray(images) || !images.length) {
    res.status(400).json({ error: { message: 'Missing prompt or images.' } }); return;
  }

  const form = new FormData();
  form.append('model', model || 'gpt-image-2');
  form.append('prompt', String(prompt));
  form.append('input_fidelity', 'high');   // keep the subject's face/identity
  form.append('n', '1');
  if (quality) form.append('quality', String(quality));   // low | medium | high
  if (size) form.append('size', String(size));
  images.forEach((d, i) => form.append('image[]', dataUrlToBlob(d), `image-${i}.png`));

  let upstream;
  try {
    upstream = await fetch(`${BASE}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } catch (e) {
    res.status(502).json({ error: { message: 'Image router unreachable: ' + (e?.message || 'network error') } }); return;
  }

  let json;
  try { json = await upstream.json(); } catch { json = {}; }
  if (!upstream.ok) {
    const msg = json?.error?.message || `Image router error ${upstream.status}`;
    res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({ error: { message: msg } });
    return;
  }
  const item = json?.data?.[0] || {};
  if (item.b64_json) { res.status(200).json({ dataUrl: `data:image/png;base64,${item.b64_json}` }); return; }
  if (item.url) { res.status(200).json({ dataUrl: item.url }); return; }
  res.status(502).json({ error: { message: 'Image router returned no image.' } });
}
