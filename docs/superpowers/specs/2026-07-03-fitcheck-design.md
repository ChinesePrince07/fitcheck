# FitCheck — virtual try-on web app (design spec)

**Date:** 2026-07-03 · **Status:** approved by Andy (provider, design, and straight-to-build all confirmed)

## Purpose

Personal tool Andy consults before buying an outfit: upload a photo of himself plus photos of clothing/accessory items, mix and match one item per category, and generate a photorealistic image of himself wearing the combo. Success = a fully functioning local web app (deployed to Vercel later, after live testing).

## Model research verdict (2026-07-03)

Question asked: "is the best image model still nano banana?"

- **General image-edit leaderboards: no.** OpenAI `gpt-image-2` (Apr 2026) and Microsoft `mai-image-2.5` (Jun 2026) rank above the Nano Banana family on Arena.ai (June 29, 2026 snapshot) and Artificial Analysis, though the top 5 are within ~1–2% on the latter.
- **For this app: Nano Banana still wins.** (a) Only top-tier API callable directly from the browser (OpenAI/Microsoft require a server-side key → backend), (b) the strongest qualitative evidence for identity preservation in garment swaps, (c) Google's docs demo this exact use case, (d) cheaper per look.
- **Critical ID change:** preview IDs (`gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`) were **shut down June 25, 2026**. Current GA IDs:
  - `gemini-3.1-flash-image` — "Nano Banana 2" — $0.067/1K, $0.101/2K image — **default** (slightly outranks Pro on both arenas, 2× cheaper, faster)
  - `gemini-3-pro-image` — "Nano Banana Pro" — $0.134/1K–2K — settings toggle (thinking model, best identity-preservation evidence)
- **No free tier for image models** — billing must be enabled on the key. Input cost is negligible (~560 tok/image).
- Sources: arena.ai/leaderboard/image-edit · artificialanalysis.ai/image/leaderboard/editing · ai.google.dev/gemini-api/docs/{image-generation,pricing,deprecations,models}

## Architecture (approach A, approved)

Pure static client-side app, zero dependencies, no build step: `index.html` + `style.css` + `app.js`.

- Runs locally (`python3 -m http.server 4173` or `npx serve`); deploys to Vercel unchanged later.
- Generation API called browser-direct via `fetch()`; the API layer is a **provider module** (`PROVIDERS.gemini`) so GPT-Image-2-behind-a-proxy can be added later without rearchitecting.
- API key: entered once in Settings → `localStorage`. Optional `config.js` (gitignored, see `config.example.js`) can seed it. Never committed. Google documents browser-direct as prototyping-grade — fine for a personal tool; add HTTP-referrer restriction on the key when deployed.
- Privacy: images never leave the machine except to Google in generation requests.

## Data model

IndexedDB `fitcheck` v1 (images stored as resized JPEG data-URLs):

- `photos` — {id, dataUrl, w, h, createdAt} — photos of Andy (multiple allowed, one active)
- `items` — {id, cat, dataUrl, name, createdAt} — wardrobe pieces
- `looks` — {id, dataUrl, items:[{id,cat,name}], notes, model, size, ms, createdAt} — generated results

localStorage: `fitcheck.settings` {apiKey, provider, model, imageSize} · `fitcheck.activePhoto`.

Upload pipeline resizes client-side (person max 1536px, items max 1280px, JPEG q≈0.86, white fill for transparency) — keeps garment detail while staying far under the 100MB inline request cap.

## Categories (one selectable item each = mix & match)

Tops 👕 · Bottoms 👖 · Outerwear 🧥 · Hats & Beanies 🧢 · Shoes 👟 · Necklaces 📿 · Watches ⌚ · Bracelets 🔗 · Other ✨ — each with a category-specific prompt verb (e.g. watch → "place this exact watch on their wrist").

## UI flow (single page, mobile-responsive, dark editorial theme)

1. **You** — photo grid, tap to set active. Hint: full-body/front-facing/well-lit.
2. **Wardrobe** — per-category grids, multi-file upload, tap to select (toggle), two-tap delete (no blocking dialogs).
3. **Outfit bar** (sticky bottom) — selected chips, optional style-notes input, model badge, Generate (with cancel; ~10–30s expectation set).
4. **Result viewer modal** — image, item chips, Download / Regenerate / Delete. Every result auto-saves to the **Lookbook** grid (item chips + date + model) for outfit comparison; looks reopen in the same viewer.
5. **Settings modal** — API key (password field + reveal), model select, image size (1K default/2K), Test key button (lists models endpoint). Banner prompts for key when missing.

## Generation call (Path A: `generateContent` — better verified than the new Interactions API)

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
headers: x-goog-api-key, Content-Type: application/json
body: { contents:[{parts:[{text: prompt}, {inlineData:{mimeType,data}} × (person + items)]}],
        generationConfig:{ responseModalities:["IMAGE","TEXT"],
                           imageConfig:{ aspectRatio: nearest-to-person-photo, imageSize } } }
```

- Prompt: numbered image references; explicit lock on face/hair/skin/body/pose/background; per-category placement verbs; "keep each item's exact design/color/pattern"; user notes appended.
- Response: last `inlineData` part among candidate parts = final image (earlier ones can be the Pro model's interim "thinking" images).
- Defensive fallback: on 400 mentioning imageConfig/aspect/size, retry once without `imageConfig` (schema was in flux mid-2026).

## Error handling (all as human-readable toasts)

- 400 API_KEY_INVALID → "API key not valid…" · 403 → billing/leaked-key hints · 429 → quota/rate wait · 5xx → retry suggestion
- `promptFeedback.blockReason` (input blocked) and `finishReason` ∈ {IMAGE_SAFETY, PROHIBITED_CONTENT, NO_IMAGE, …} → "safety filter blocked this — try a different photo/crop"; expected occasionally with people photos, not treated as a crash.
- AbortController cancel; per-file upload failures don't kill the batch.

## Build order & verification

1. Fixtures: Node script writes solid-color PNGs (person/shirt/pants/watch/hat) → `file` confirms PNG.
2. Static shell + styles served on :4173 → HTTP 200 + desktop screenshot sane.
3. Storage + wardrobe UI → Playwright: upload, select, delete, persist across reload.
4. Provider + generate flow → Playwright with stubbed `fetch`: intercepted request body has model ID, prompt with numbered refs, 1+N inlineData parts; result modal shows image; look persisted.
5. Mobile pass → 390px screenshot.
6. Live smoke test with Andy's real key (blocked on him providing it) → real generated image; then offer Vercel deploy.

## Out of scope (YAGNI'd)

Multi-item-per-category selection, outfit randomizer, iterative refinement on results, GPT-Image-2 proxy (seam exists), accounts/multi-user, HEIC conversion.
