/* Vercel serverless (Node) proxy to an OpenAI-compatible image router
   (e.g. https://vip.aipro.love/v1). Keeps the router key server-side.

   The client POSTs { model, prompt, images: [dataUrl,…], size }. A virtual
   try-on is an image EDIT — the subject photo plus the garment photos are sent
   as input images with a text prompt — so this forwards to /images/edits with
   input_fidelity=high (preserves the subject's face). Returns { dataUrl }.

   Configure with shell:
     vercel env add OPENAI_BASE_URL   production   # https://vip.aipro.love/v1
     vercel env add OPENAI_API_KEY    production   # your router key */

const BASE = (process.env.OPENAI_BASE_URL || 'https://vip.aipro.love/v1').replace(/\/+$/, '');

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
  if (!key) { res.status(500).json({ error: { message: 'Server is missing OPENAI_API_KEY — set it in the Vercel project env.' } }); return; }

  // GET ?models — list the router's models (debug). Gated by the sync secret.
  // Optional ?base=https://other-router/v1 tests the stored key against another gateway.
  if (req.method === 'GET' && 'models' in (req.query || {})) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!process.env.SYNC_SECRET || bearer !== process.env.SYNC_SECRET) { res.status(401).json({ error: { message: 'unauthorized' } }); return; }
    const override = String(req.query.base || '');
    const useBase = /^https:\/\//.test(override) ? override.replace(/\/+$/, '') : BASE;
    try {
      const r = await fetch(`${useBase}/models`, { headers: { Authorization: `Bearer ${key}` } });
      res.status(r.status).json(await r.json());
    } catch (e) { res.status(502).json({ error: { message: e?.message || 'router unreachable' } }); }
    return;
  }

  // POST ?chat — forward a raw chat-completions body to the router (debug; sync-secret gated).
  // Some gateways serve image models through /chat/completions instead of /images/edits.
  if (req.method === 'POST' && 'chat' in (req.query || {})) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!process.env.SYNC_SECRET || bearer !== process.env.SYNC_SECRET) { res.status(401).json({ error: { message: 'unauthorized' } }); return; }
    const body = await readJson(req);
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      res.status(r.status).setHeader('Content-Type', 'application/json');
      try { res.json(JSON.parse(text)); } catch { res.json({ raw: text.slice(0, 4000) }); }
    } catch (e) { res.status(502).json({ error: { message: e?.message || 'router unreachable' } }); }
    return;
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
    upstream = await fetch(`${BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
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
  const b64 = item.b64_json;
  const url = item.url;
  if (b64) { res.status(200).json({ dataUrl: `data:image/png;base64,${b64}` }); return; }
  if (url) { res.status(200).json({ dataUrl: url }); return; }   // some routers return a URL instead of base64
  res.status(502).json({ error: { message: 'Image router returned no image.' } });
}
