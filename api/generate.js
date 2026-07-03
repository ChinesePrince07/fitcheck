/* Vercel Edge Function — server-side proxy so the Gemini API key is never sent
   to the browser. The client POSTs { model, body } (the generateContent body,
   no key); this injects GEMINI_API_KEY (a Vercel env var) and streams Google's
   response straight back — streaming avoids the serverless response-size cap on
   the large 4K image. Configure the key with: vercel env add GEMINI_API_KEY */

export const config = { runtime: 'edge' };

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: { message: 'POST only' } }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: { message: 'Server is missing GEMINI_API_KEY. Add it in the Vercel project settings.' } }, 500);

  let payload;
  try { payload = await req.json(); } catch { return json({ error: { message: 'Malformed request JSON.' } }, 400); }

  const { model, body } = payload || {};
  if (typeof model !== 'string' || !/^gemini-[a-z0-9.\-]+$/i.test(model)) return json({ error: { message: 'Invalid or missing model.' } }, 400);
  if (!body || typeof body !== 'object') return json({ error: { message: 'Missing request body.' } }, 400);

  let upstream;
  try {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: { message: 'Upstream request failed: ' + (e?.message || 'network error') } }, 502);
  }

  // stream Google's response (status + body) straight through to the client
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
