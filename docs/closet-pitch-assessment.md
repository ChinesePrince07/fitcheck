# The Closet Pitch — Assessment

*Companion to `monetization-feasibility.md`. That report scored the four generic paths for FitCheck-as-it-is; this one assesses Andy's own pitch: a digital closet of everything you own + AI outfit suggestions + a "try on with my wardrobe" button at the point of purchase (site, app, and ideally embedded next to add-to-cart), monetized by persuaded purchases. Research current as of July 2026; sources in the research annex below.*

---

## 1. The verdict up front

**The exact slot is open. The race for it is not.**

The pitch's precise wedge — *generative try-on of a candidate purchase composed with clothes you already own, injected at any retailer's point of sale without permission, paid by affiliate commission* — has **no verified occupant as of July 2026**. That is the good news, and it is real: even the try-on extensions that already exist (Stylar, Fitly, TryThisFit and co.) are all single-item; one of TryThisFit's own testimonials describes a user manually cross-referencing "how a new top looks with the jeans I already have" across separate generations. The unmet need is stated by the incumbents' own customers.

The bad news is that the slot is the visible convergence point of three funded fronts:

| Player | What they have | What they lack | Threat level |
|---|---|---|---|
| **Alta** ($11M seed, Menlo; LVMH-backed Algaé on the cap table; 270K outfits/day) | Closet + **"style new candidate items with owned pieces"** try-on — the pitch's core capability, shipping today. Entering retail via permissioned B2B embeds (Public School deal, Feb 2026). | The extension channel; photo-realism (renders on an avatar, not your actual photo). | **Highest.** Their funding announcements state this pitch's vision *verbatim* as roadmap. |
| **Google** | Both halves, separately: selfie try-on in Search/Shopping (Dec 2025) and **Photos "Wardrobe"** auto-building closets from your camera roll at the OS level (rolling out from June 2026). | The connection between them — one product decision away. | **Structural.** Can't be outspent; can only be outrun on ground they won't touch (uninvited injection on merchant sites). |
| **Whering** (10M users; $7M July 2026 round led by eBay Ventures + Google AI Futures Fund) | The closets — 10M of them — and money explicitly earmarked for virtual try-on. | The try-on itself; the shopping-moment surface. | High. They'd bolt the feature onto an existing user base. |

Estimated window before an incumbent ships the equivalent: **12–18 months** (estimate, unverified). A solo builder does not win this as a venture race. The honest question is not "is the idea good" (it is) but "what game is worth playing from here" — see §6.

---

## 2. What the pitch gets right

1. **It answers the actual purchase question.** Every incumbent try-on shows the item on you in isolation. The buy decision is "does this go with what I own." Wardrobe context is the differentiator, and the closet is the moat — 50 photographed garments is a switching cost no single-item tool has.
2. **Distribution is the product.** The feasibility report's core kill-shot on affiliate was *no traffic*. An extension (and iOS share-sheet) **is** the acquisition mechanism — Honey didn't have an audience either; the button was the growth loop. This is the one version of affiliate the report's logic doesn't kill.
3. **The revenue model matches the value moment.** "This will persuade people to buy" is literally what affiliate pays for. Merchant pays on conversion; user pays nothing; commission funds the generation cost.
4. **Value-before-closet onboarding is available.** The killer answer doesn't need an 80-item closet — favorite jeans + shoes + watch (5 items, 5 minutes) is enough for the first "oh, that jacket *does* work with my stuff" moment on a real product page. Style DNA's 35-second-selfie onboarding proves value-first beats catalog-first.

## 3. What the pitch gets wrong

1. **The LV hero scenario earns $0.** Louis Vuitton has no affiliate program. Neither does Hermès. Luxury pays nothing, controls imagery obsessively, and treats AI renders of its garments as a brand-integrity violation. Luxury is the pitch's best *demo* and worst *business*. The money is mid/premium multi-brand retail: SSENSE (5–7.5%), Hugo Boss (8–15%), Zappos (7–10%), Nordstrom/Farfetch/Mytheresa via Skimlinks/Sovrn — minus the sub-network's 25–30% cut. Realistic blend: **~4–10% on mid-market baskets ⇒ a few dollars per persuaded purchase.**
2. **"Integrated on the shopping sites of the big brands" is closed off, not just slow.** There is no precedent of a luxury house allowing third-party try-on at its point of sale — every precedent is brand-controlled (Gucci×Snap, L'Oréal ModiFace×ChatGPT). And LVMH's venture arm already invested in Alta: the group has picked its horse. The permissionless extension isn't the fallback; it's the only version of the endgame available to an outsider.
3. **"Suggestions on what to wear" is a different product.** Closet + daily outfit suggestions is Whering/Acloset/Style DNA territory — crowded, weak monetization, and the churn graveyard (Save Your Wardrobe raised $3.5M+ and abandoned the consumer closet entirely, pivoting to B2B aftercare). It's a retention layer to add *after* the wedge works, not the lead.

## 4. Cold start — the existential risk

Fashion-app 90-day retention averages ~28% (directional, secondary source); the consensus #1 kill reason for closet apps is cataloging as "a second job." And from June 2026, **Google Photos auto-builds closets from photos users already have, for free, at the OS level.** Competing on cataloging is dead on arrival.

Mitigations, in the order they've been proven to work: (1) lead with the extension button, not the closet — the try-on moment is itself the onboarding hook; (2) 5-items-in-5-minutes minimum viable closet; (3) email order-receipt import (Indyx's most-praised feature) so the closet stays current with zero effort; (4) bulk AI tagging — already built in FitCheck (the vision classifier); (5) later, camera-roll scanning — but by then Google ships it free, so never make it the moat.

## 5. How the feasibility report's blockers map onto this pitch

| Blocker (from the main report) | Applies here? | Notes |
|---|---|---|
| Counterfeit catalog | **Mostly no** — the pitch's "catalog" is the user's own wardrobe + real shop pages they're already browsing. The Aristide drawers stay a personal feature, walled off from any public product. | The one residual: generating imagery of branded goods at all is a merchant-ToS/brand-IP irritant no court has ruled on. Untested, not cleared. |
| Grey-market router (hk.lanyiapi.com) | **Full force, and then some.** Strangers' face photos are the product. No DPA, unlawful EU transfer, BIPA exposure, upstream can die overnight. | **Hard prerequisite:** direct OpenAI/Google/Azure account with a signed DPA before any non-Andy face is uploaded. Non-negotiable. |
| Unverified $0.03/look COGS | Applies. A wardrobe-context render is a *multi-image* edit (subject + candidate + N owned items) — the expensive kind. Assume $0.06–0.12 until metered. | Still fine per-conversion (a few $ commission vs. cents of COGS) but free-browsing users generating 30 looks per shopping session is the margin leak. Per-session caps from day one. |
| No traffic / CAC | **Answered in kind, not eliminated.** The extension is the loop, but installs still need a spark — the 2026 playbook is creator-led (Phia: TikTok + founder celebrity → 1.5M users, $35.5M A), not SEO. | Chrome's June 2025 affiliate policy (post-Honey) is actually *favorable*: disclosure + explicit user action + genuine benefit — a user-clicked "Try on → Buy" complies naturally. Never touch an existing affiliate tag (the Honey lawsuits' lesson). |
| No accounts/billing/moderation | Applies fully — plus NCII/CSAM moderation duties the moment strangers upload photos. | Same foundation work as the main report's §8. |

## 6. The three games actually available, and the recommendation

**Game A — venture race.** Raise, hire, sprint against Alta/Whering/Google for the slot. *Not available to a solo side-project by definition; requires deciding to found a company.* The research says the slot justifies it for someone — the question is whether Andy wants that life.

**Game B — lean wedge with optionality.** Build only the differentiated sliver the giants are worst-placed to copy: **photo-real composition on the user's actual photo (not an avatar), with owned items, on arbitrary merchant pages (uninvited).** That is — verbatim — the capability FitCheck already has, minus the extension and accounts. Ship it small: legit API path with DPA → accounts + per-user storage → 5-item closet onboarding → Chrome extension + iOS share-sheet → Skimlinks/Sovrn links with compliant disclosure. Prove the magic moment retains a few hundred users. The realistic upsides are: it works and grows creator-led (then Game A becomes fundable *with evidence*), or it becomes the demo that gets acqui-hired by exactly the players above, or it stays the best portfolio piece Andy owns. The realistic downside is bounded: weeks of build, cents per generation, and the same legal hygiene the personal app needs anyway.

**Game C — stay personal.** The main report's default. Fix the relay caps and keep the best-in-class personal tool. Zero additional risk, zero upside.

**Recommendation: B, entered through the gates in order — and with the exit criteria written down before starting.** The gates: (1) legit model API with DPA *first* (it also de-risks personal use); (2) accounts + isolation; (3) extension MVP with the 5-item onboarding; (4) affiliate links last, only once there are users worth monetizing. Budget expectation honestly: this is a *speed-race entry ticket*, not a revenue plan — commission revenue at solo scale is beer money until distribution compounds. Walk-away trigger: if after ~8–12 weeks of the extension being installable the magic moment isn't producing organic installs (users showing it to friends unprompted), the window thesis is wrong for a solo builder and Game C was the right answer all along.

---

## Research annex

Full sourced landscape (digital-closet apps, the intersection question, extension playbook & post-Honey policy, cold-start evidence, luxury angle) — see the research report embedded in the session that produced this doc. Key sources: Tech.eu & WWD (Whering, July 2026), TechCrunch (Alta $11M, June 2025; Doji $14M; Phia $35.5M, Jan 2026; Google selfie try-on, Dec 2025), texfash (Google Photos Wardrobe, June 2026), startupnews.fyi (Alta × Public School, Feb 2026), Chrome for Developers (affiliate-ads policy, enforced June 10 2025), Bloomberg Law (Honey consolidated class action dismissed Nov 2025, amended complaint pending), Skimlinks/Sovrn fashion program rates, Affiverse (LV has no affiliate program), Indyx, Acloset, Style DNA case study (~$3M/yr), Tracxn (Save Your Wardrobe pivot), LVMH La Maison des Startups.
