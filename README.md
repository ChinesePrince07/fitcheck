# FitCheck 👗

Personal virtual try-on: upload a photo of yourself + photos of clothes/accessories you're eyeing, mix and match one item per category, and generate a photorealistic image of you wearing the combo — so you can check the fit *before* you buy.

Static app, zero dependencies, no build step. Everything stays in your browser (IndexedDB) except the generation request to Google.

## Run

```bash
cd ~/fitcheck && python3 -m http.server 4173
# → http://localhost:4173
```

(or `npx serve -l 4173`)

## Setup

1. Get a Gemini API key: https://aistudio.google.com/apikey
   ⚠️ Image models have **no free tier** — the key's project needs billing enabled.
2. Open the app → ⚙ Settings → paste key → Test key → Save.
   (The key is stored in this browser's localStorage — never in the code or git.)

## Models & cost per look

| Model | Setting | Cost |
|---|---|---|
| Nano Banana 2 (`gemini-3.1-flash-image`) | default | ~$0.067 (1K) / ~$0.101 (2K) |
| Nano Banana Pro (`gemini-3-pro-image`) | settings toggle | ~$0.134 (1K/2K) |

## Tips

- Use a **full-body, front-facing, well-lit** photo of yourself — required for pants/shoes to render.
- Clean product shots (store listing photos) work great as item images.
- Safety blocks happen occasionally with people photos — a different crop usually fixes it.
- Results show *style*, not tailoring — treat them as "does this look right on me", not size guidance.
- HEIC (iPhone raw) uploads aren't supported on Linux browsers — use JPEG/PNG.

Design spec: `docs/superpowers/specs/2026-07-03-fitcheck-design.md`
