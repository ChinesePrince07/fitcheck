# FitCheck — Import Clothing from Shop URLs

**Date:** 2026-07-07
**Status:** Approved design, ready for implementation plan

## Problem

Today, adding a garment to FitCheck means screenshotting a product image from a
shop's website and uploading the file by hand. That is the main friction in the
"see it before I buy it" loop. We want to paste a product-page URL and have
FitCheck fetch the clothing image, name, and price automatically.

## Goal

Paste a product URL (Uniqlo, Zara, COS, Mango, or any shop best-effort) and get a
ready-to-use wardrobe item — clean product image, product name, and price — with
one confirmation step, no manual screenshot.

Non-goals (explicitly out of scope for this spec):

- Browser extension / "Try in FitCheck" button on shop pages.
- In-app catalog browsing or search.
- Affiliate monetization (we keep the source URL, but do not build affiliate
  link rewriting or tracking).
- Taobao / Tmall (heavy anti-bot, login walls) — deferred.
- Headless-browser rendering for pure-SPA shops — deferred until a favorite shop
  actually needs it.

## Approach

A server-side **fetch ladder**: tuned adapters for the shops the user buys from,
a generic scraper as fallback, and a graceful manual-paste path when both fail.
No headless browser — the target shops server-render enough structured data.

## Key constraint driving the design

FitCheck resizes every input image on a `<canvas>` (the identity-lock pipeline
downscales the person photo and normalizes garment images). A cross-origin image
drawn to a canvas **taints** it, and `canvas.toDataURL()` throws a
`SecurityError`. Therefore the grabbed image cannot be pointed at the shop's CDN
directly — it must be streamed back through FitCheck's own origin so it is
same-origin. This is why the import endpoint has an image-proxy mode, not just a
metadata mode.

## Architecture

### New backend file: `api/import.js`

A Vercel Edge Function (`export const config = { runtime: 'edge' }`), sibling to
the existing `api/generate.js`. Two modes selected by query param:

**Mode 1 — metadata:** `GET /api/import?url=<encoded product URL>`

1. Validate `url` is http/https and not a private/localhost host.
2. Fetch the page HTML with browser-like request headers (realistic
   `User-Agent`, `Accept`, `Accept-Language`) so shops don't serve a bot page.
3. Run the adapter ladder (below) to extract structured data.
4. Return normalized JSON.

Response shape:

```json
{
  "ok": true,
  "source": { "name": "Oversized Shirt", "price": 39.9, "currency": "GBP", "host": "zara.com" },
  "images": [ { "url": "https://.../front.jpg", "kind": "packshot" },
              { "url": "https://.../back.jpg",  "kind": "packshot" },
              { "url": "https://.../model.jpg", "kind": "model" } ],
  "suggestedCategory": "tops"
}
```

On failure: `{ "ok": false, "reason": "blocked" | "not-found" | "no-data" }`.

**Mode 2 — image proxy:** `GET /api/import?img=<encoded image URL>`

1. Validate `img` is http/https and not a private/localhost host (SSRF guard).
2. Fetch the image bytes with browser-like headers (and a `Referer` of the
   image's own origin, since some shop CDNs hotlink-protect).
3. Enforce a response size cap (~10 MB) and an image content-type.
4. Stream the bytes back with the upstream `Content-Type`, same-origin.

The client only ever draws images that came back through mode 2, so the resize
canvas is never tainted.

### Adapter ladder (inside metadata mode)

A small ordered set of extractors. Each takes the URL + fetched HTML and returns
either normalized data or `null` (meaning "not me / couldn't parse"), wrapped in
try/catch so one adapter's failure drops to the next rung:

1. **Uniqlo adapter** — host matches `uniqlo`. Derive the product id from the URL
   and call Uniqlo's product JSON endpoint; map images (packshots + gallery),
   name, and price.
2. **Inditex adapter** — host matches `zara`, `cos`, or `mango`. Use their
   product JSON / embedded state to pull the clean packshot gallery, name, price.
3. **Generic adapter** — parse the HTML we already fetched: OpenGraph
   (`og:image`, `og:title`, `og:price:amount`/`product:price:amount`) plus any
   `<script type="application/ld+json">` block containing a schema.org `Product`
   (`name`, `image` array, `offers.price`/`priceCurrency`). Works best-effort on
   any shop.
4. **None matched / all failed** — return `{ ok: false }`; the client shows the
   manual-paste fallback.

Adapters are isolated so an undocumented shop API changing shape breaks only that
rung and drops to the generic scraper, not the whole feature.

### Category auto-detect

From the product name and/or breadcrumb text, keyword-match into FitCheck's
existing categories (whole-set, tops, bottoms, outerwear, hats, shoes,
necklaces, watches, bracelets, other). Examples: "tee/shirt/top" → tops;
"jean/trouser/pant/short/skirt" → bottoms; "sneaker/boot/loafer" → shoes;
"coat/jacket/blazer" → outerwear. This is only a *suggested* default; the user
confirms or changes it in the preview card.

## UX flow

1. The Wardrobe section gains an **"Import from link"** control (a URL paste
   field + button), available for all categories including whole-set.
2. User pastes a product URL and submits. The client calls `/api/import?url=`.
3. A **preview card** appears showing: product name, price, a row of gallery
   thumbnails, and a category dropdown pre-set to `suggestedCategory`.
4. User selects one or more images and confirms the category, then adds them.
5. For each chosen image the client calls `/api/import?img=` to get a same-origin
   blob, runs it through the existing `fileToImage` → resize → IndexedDB item
   pipeline (identical to a manual upload from that point on).
6. Each stored item retains `source: { name, price, url }`.

### Buy-back link (free byproduct)

Because each imported item stores `source.url`, the item tile and the lookbook
entry can show a small "↗ shop" link back to the product page. No extra fetching
or affiliate machinery — just render the stored URL when present. (Respect the
existing "no filenames anywhere" rule: show the product *name*, never a file
name.)

## Error handling & edge cases

- **Local dev has no `/api`.** Import depends on the proxy, and running the app
  from `python3 -m http.server` has no serverless function. Import is therefore
  **deploy-only**, mirroring how generation already routes to the proxy only when
  not on localhost. Locally, the import field shows a note: "Import runs on the
  hosted site." No crash.
- **Bot-block / non-200 / empty extraction.** Never a hard error — the preview
  card shows "Couldn't read that link — paste the image instead," leaving the
  normal file upload available.
- **Partial data.** Missing price or name is fine; render what we have. Missing
  images means treat as a failed extraction (fall back to manual paste).
- **Adapter drift.** Undocumented shop endpoints change; the try/catch + generic
  fallback keep the feature working (degraded to og:image) rather than breaking.

## Security

The import endpoint is a **public, unauthenticated fetch relay**: `?url=` fetches
an arbitrary web page through the user's Vercel, and `?img=` proxies an arbitrary
image. Mitigations built in:

- **SSRF guard** on both modes: allow only `http`/`https`; reject `localhost`,
  `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, and IPv6
  loopback/link-local, so the relay cannot reach internal network resources.
- **Size cap** (~10 MB) and image content-type check on `?img=` to prevent using
  it as a bandwidth amplifier or to fetch non-image payloads.

Residual risk: a stranger can still use the endpoint as a generic web/image
proxy (bandwidth on the user's Vercel account). This is the **same class** of
open-proxy issue as the already-parked `/api/generate` item, which the user
consciously deferred. This spec flags it and ships without a token gate unless
the user asks for one; a shared-secret header or per-IP rate limit is the natural
future fix for both endpoints together.

## Testing

- **Adapter unit checks:** feed saved sample HTML / JSON payloads from Uniqlo,
  Zara, COS, Mango, and a generic og:image page; assert each yields the expected
  normalized `{ source, images, suggestedCategory }`.
- **SSRF guard:** assert `?img=`/`?url=` reject localhost and private-range hosts
  and non-http(s) schemes.
- **Canvas same-origin:** confirm an image fetched via `?img=` draws to canvas
  and `toDataURL()` succeeds (no taint), end-to-end into a wardrobe item.
- **Fallback:** a URL that yields no data surfaces the manual-paste card, not an
  error.
- **Category guess:** a handful of product names map to the expected category.

## Files touched

- `api/import.js` — new Edge Function (metadata + image-proxy modes, adapters,
  SSRF guard).
- `app.js` — import control, preview card, category guess, wire chosen images
  through the existing resize/store pipeline, render `source` buy-back links.
- `index.html` — the "Import from link" field/button markup in the Wardrobe
  section.
- `style.css` — preview card + buy-back link styling (old-money theme).
- `README.md` — document URL import.
