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
  const mapped = lh.match(/^::ffff:(.+)$/i);   // IPv4-mapped IPv6 → fold to embedded IPv4 and re-check
  if (mapped) {
    const emb = mapped[1];
    if (emb.includes('.')) return isPrivateIp(emb);
    const hx = emb.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hx) {
      const hi = parseInt(hx[1], 16), lo = parseInt(hx[2], 16);
      return isPrivateIp(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
    }
  }
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
