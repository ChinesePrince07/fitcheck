# FitCheck 👔🍌

*Try the outfit on your actual body before your wallet finds out.*

I kept buying clothes online that looked unreal on some 6'2" model with the metabolism of a hummingbird, and then they'd show up and hang off me like a damp bin bag. So I built a little thing that puts the clothes on **me** first — using the AI image model that's been quietly eating everyone's lunch — so now I can be disappointed for free, in advance, from the comfort of my own home.

![The FitCheck app](assets/hero.png)

## the pitch

Upload a photo of yourself. Upload photos of clothes you're eyeing (screenshots straight off the shop's website work great). Tap a shirt, tap some trousers, throw a watch on if you're feeling fancy, and FitCheck spits out a photoreal picture of *you* actually wearing the combo. It's a dressing room that doesn't judge you, doesn't have a queue, and doesn't have that one cursed light that makes everyone look grey and unwell.

![A generated try-on](assets/try-on.png)

*(that's the demo guy, not me — but you get it. he's modelling a shirt and trousers he has never once paid for.)*

## things it does that i'm weirdly proud of

- **Mix & match, commitment-issues edition.** Select two tops, three bottoms, whatever you like, and it renders *every* combination as its own look so you can compare them side by side. Six outfits in one click. It even tells you the damage before you commit, so nobody's card gets a nasty surprise.
- **Whole-set mode.** Saw a full fit on somebody cooler than you? Drop in one photo and it dresses you in the entire look — just the clothes, we leave their face out of it, we're not monsters.
- **Hairstyle try-on.** Because sometimes it isn't the outfit, it's the hair. Pick a preset (buzz, Ivy League, slicked back, man bun, the whole barbershop) or upload a cut you're eyeing, and see it on your own head *before* someone with scissors makes it a permanent life decision.
- **A lookbook**, so you can line up all your maybes, admire them at length, and then buy absolutely none of them.

## is it "nano banana"

Yeah, basically. It runs on Google's **Nano Banana Pro** (`gemini-3-pro-image`) at full 4K, because I have no chill. Out of everything I tried, it's the best at keeping your actual face *your actual face* while swapping the clothes — which, plot twist, is the entire hard part of this whole idea. Each look runs about **24 cents** and takes ~30–60 seconds, which is still cheaper and considerably faster than shipping things back.

## running it

It's one HTML file, one stylesheet, and one JS file. No build step, no framework, no `node_modules` folder the size of a small moon.

```bash
cd fitcheck
python3 -m http.server 4173
# then open http://localhost:4173
```

Pop your Gemini API key into the ⚙ Settings (grab one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Heads up: the image models have no free tier, so flip billing on or it'll just politely refuse to do anything.

Want it on your phone in the shop? It deploys to Vercel, and there's a little `/api/generate` proxy so your key lives server-side instead of getting bundled into a public webpage where any goblin could nick it.

## where do my photos go

Nowhere. They live in your own browser (IndexedDB), and the *only* time an image leaves your machine is the single API call to Google that actually makes the picture. No server, no account, no newsletter, no "we've updated our privacy policy." Clear your browser data and it's like the whole thing never happened.

## the fine print

- It shows you **vibes, not tailoring.** It will not warn you that the medium is a touch tight in the shoulders — use your own two eyes for that part.
- Every so often the safety filter clutches its pearls at a perfectly normal photo. A different crop usually calms it down.
- Built with vanilla JavaScript and sheer stubbornness. Reviewed by nobody. Deployed on hope.

---

*Made because I have a shopping problem and my coding agent has a "sure, I'll build that" problem.* 🍌
