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

## Model & cost

Always generates with **Nano Banana Pro** (`gemini-3-pro-image`) at **4K** — the best model and highest resolution available. **~$0.24 per look**, ~30–60s each. No quality selector; it's always maxed.

Categories include a **Whole set** slot: drop in one photo of a complete outfit (a flat-lay with the shirt + pants, or someone else's fit) and it dresses you in the entire look — it uses only the clothing from that photo, never the other person's face or body.

**Hairstyle try-on** (section III): pick one of the built-in presets (buzz, Ivy League, slicked back, curtains, man bun, waves, bob, …) *or* upload a reference photo of a cut. Leave it untouched to keep your own hair. You can generate a hairstyle change on its own, no clothing required.

The generation prompt hard-locks your identity (face, bone structure, skin tone, body, pose, background) with explicit "do not beautify/alter" instructions so the model swaps only what you chose — the fix for earlier face drift.

## Tips

- Use a **full-body, front-facing, well-lit** photo of yourself — required for pants/shoes to render.
- Clean product shots (store listing photos) work great as item images.
- Safety blocks happen occasionally with people photos — a different crop usually fixes it.
- Results show *style*, not tailoring — treat them as "does this look right on me", not size guidance.
- HEIC (iPhone raw) uploads aren't supported on Linux browsers — use JPEG/PNG.

Design spec: `docs/superpowers/specs/2026-07-03-fitcheck-design.md`
