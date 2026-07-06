# FitCheck 👔

See how clothes look on you before you buy them.

**Live at [fitcheck.andypandy.org](https://fitcheck.andypandy.org).**

I kept ordering things online that looked great on the model and landed badly on me, so I built this to put the clothes on a photo of *me* first. It uses AI image generation to show the fit before I commit to buying.

![The FitCheck app](assets/hero.png)

## What it does

Upload a photo of yourself and photos of the clothes you're considering (screenshots from a shop's site work fine). Pick a top, some trousers, maybe a watch, and FitCheck generates a photorealistic image of you wearing that combination.

![A generated try-on](assets/try-on.png)

*(That's the demo image, not me — but you get the idea.)*

## Features

- **Mix and match** — select several tops, bottoms, or shoes and it renders every combination as its own look, so you can compare them. It shows the number of looks and the rough cost before generating.
- **Whole-set mode** — drop in one photo of a complete outfit (a flat lay, or a look you saw somewhere) and it dresses you in the whole thing, using only the clothing from that photo.
- **Hairstyle try-on** — choose a preset (buzz, Ivy League, slicked back, and so on) or upload a reference, and preview a new cut before booking the barber.
- **Backdrops** — drop yourself into a studio, street, café, beach, runway, or park, or keep your own surroundings.
- **Lookbook** — every result is saved so you can compare your options side by side.

## The model

It uses Google's **Nano Banana Pro** (`gemini-3-pro-image`) at 1080p. In my testing it was the best at keeping your face and body consistent while changing only the clothes, which is the hard part. Each look costs roughly **$0.14** and takes about 20–40 seconds.

## Running it

It's a single HTML file, one stylesheet, and one JavaScript file — no build step and no dependencies.

```bash
cd fitcheck
python3 -m http.server 4173
# open http://localhost:4173
```

Add a Gemini API key in Settings (⚙) — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Note that the image models have no free tier, so the key needs billing enabled.

To host it (for example, to use on your phone), it deploys to Vercel with an `/api/generate` proxy that keeps your key server-side rather than in the client bundle.

## Privacy

Your photos stay in your browser (IndexedDB). The only time an image leaves your machine is the API call to Google that generates the picture — there's no server, account, or tracking. Clearing your browser data removes everything.

## Notes

- It shows the overall look, not exact fit — it won't tell you if something runs tight in the shoulders.
- Occasionally the safety filter blocks a normal photo; a different crop usually fixes it.
- Installable to your phone's home screen (it's a PWA), and iPhone HEIC photos work.
- Built with plain JavaScript, for personal use.

---

A personal project, built for fun.
