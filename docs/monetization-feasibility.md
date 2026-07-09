# FitCheck Monetization Feasibility Report

*Prepared by a multi-agent analysis (drafting agent + adversarial red-team pass + revision agent), grounded in the actual FitCheck codebase at `~/fitcheck`. Context: app built 2026-07-03; this report revised 2026-07-10. Written for a solo builder. No hype, real numbers, every claim caveated to what the code actually proves — and where the code cannot prove a number, it says so instead of inventing one.*

---

## 1. Executive Summary — the honest baseline, then the one conditional bet

**Read this first, because the recommendation changed after the red-team pass.**

The honest, evidence-backed baseline conclusion is: **FitCheck is an excellent private/portfolio tool built on a commodity capability, a counterfeit catalog, and a grey-market model proxy. Its default state should be "fix the two things that make personal use illegal, then keep using it yourself, and build no monetization at all."** Everything past that is a *conditional* bet, and the condition is the one number that appears nowhere in the first draft: **traffic you already have or will commit months to building.**

Three facts dominate and they compound:

1. **The default catalog is counterfeit luxury.** ~2,600 items across 14 drawers bulk-scraped from the "Aristide" Yupoo reseller (`extractYupooStore`, import.js:240–256) — fakes of Loro Piana, Zegna, Hermès, Ralph Lauren. This is not a moderation problem; it is a legal gate that makes every monetization path *actively illegal* until the catalog is replaced (§4).

2. **The core engine runs through a grey-market Chinese model proxy** — `hk.lanyiapi.com` (openai-image.js:11), an unofficial OpenAI/Gemini reseller. This is a **co-equal second blocker the first draft missed entirely.** It means: your upstream access can be ToS-banned overnight (product dies with it); you have no pricing SLA (API-price volatility is *acute here, not hypothetical*); and every subject **face photo** is shipped to an unidentified intermediary you cannot sign a DPA or SCCs with — an **unlawful GDPR Chapter V cross-border transfer that no consent checkbox cures**, plus China PIPL/data-security exposure. You cannot legally take a paying or EU user through this path, catalog or not (§4B).

3. **Affiliate revenue is a pure function of traffic, and the app has none.** No distribution, no moat (the engines are the same general-purpose models any competitor and Google itself call), CAC nowhere in the plan, and the recommended path refers users into a buy-flow Google and Amazon give away free. The report's own §5/§10 say this plainly; the first draft then buried it under a "6.5 / RECOMMENDED FIRST" action plan that acquires zero traffic. **Stack the honest facts and affiliate expected value ≈ its build cost.**

**The corrected recommendation is a fork on one gating question, asked BEFORE any build:**

> **Do you already have, or will you commit multiple months to building, a real traffic source (an audience, an SEO surface, a social following)?**

- **If NO (the likely honest answer):** Do legal hygiene only — (a) cap the open-relay endpoints this week, (b) delete the replica catalog, (c) because strangers can upload faces, either replace the grey-market router or keep the app single-user and geofence the EU/Illinois. **Then build no monetization.** Keep it as the genuinely good personal/portfolio tool it is. Affiliate's EV is roughly its own build cost, and you'd be adding an anti-abuse and compliance program you don't have and the numbers don't fund.

- **If YES (you already run a traffic source):** Affiliate "shop this look" is the *only* path where the mandatory catalog fix and the revenue mechanism are the same work — the buy-link layer already ships (`tileHtml` app.js:455; viewer shop-chips render from `source.url` around app.js:685). But it is still gated on fixing **both** blockers (catalog *and* router, for any EU/paying user), on **normalizing feed imagery** (the swap is a product downgrade, §4/§8), on **abuse controls with real cost-to-attacker** (§3), and on modeling revenue **net of return-driven commission clawbacks** (§4). Even executed perfectly the ceiling is **low-thousands/month**, not a venture outcome.

**This week, regardless of the fork:** (1) cap the open relay — but understand a per-IP/session counter is a *speed bump*, not a patch (§3); (2) delete the replica catalog; (3) decide the router (self-host or a directly-contracted OpenAI/Google/Azure/Vertex account with a signed DPA) before anyone but you uploads a face. Skip auth, billing, credits, and consent UI until traffic proves repeat demand — and understand that for a consumer-pays model no amount of build fixes the core arithmetic: **consumer willingness-to-pay ≈ 0, and no CAC is low enough to acquire users who won't pay** (§7).

---

## 2. What FitCheck actually is today — and the honest gap to a product

**What it is:** a genuinely good single-user virtual try-on toy dressed as a wardrobe app. Zero-build vanilla JS (index.html + app.js, ~1,394 lines + style.css) on Vercel with four serverless/edge functions. Also wrapped as a tab in the owner's personal iOS app. The try-on core is real and works: subject photo + garment photos POSTed as edit-input images (with `input_fidelity: 'high'`, openai-image.js:41) to GPT Image 2 at quality `'low'` (GPT_QUALITY, app.js:65) via an OpenAI-compatible router (`hk.lanyiapi.com`), falling back to Nano Banana Pro (`gemini-3-pro-image`) on any router error. Mix-and-match takes a cartesian product across categories, caps at `MAX_LOOKS_PER_RUN=20` (app.js:133), renders at concurrency 3 (app.js:1150).

**On the mix-and-match feature, corrected:** "generate every outfit permutation from MY closet" is a *nice personal-tool feature*, not a strategic moat. The first draft called it "the one thing worth preserving." It carries **no defensive weight** — it's a weekend feature for Google Shopping Try-On or Amazon to ship on top of distribution they already own — and by the cost analysis in §3 the 20-look fan-out is *also the single largest cost driver.* So it simultaneously fails to defend and actively worsens unit economics. Keep it because you enjoy it, not because it protects anything.

**What it is NOT — the gap to a commercial product:**

| Commercial substrate | Status today |
|---|---|
| Accounts / auth | **None.** No server-side user store anywhere. |
| Per-user data isolation | **None.** All data in local IndexedDB (app.js:186–215). |
| "Sync" | **One shared JSON blob** (`fitcheck/library.json`, hardcoded object key sync.js:16) behind **one shared bearer secret** (`SYNC_SECRET`, sync.js:98–100). Everyone with the secret reads/writes the **same single wardrobe.** This is cross-device sync for one person — *not* a user system. |
| Billing / credits | **None.** The only cost surface is a cosmetic `~$X.XX` string on the Generate button (app.js:643). Nothing is metered, ledgered, or charged. |
| Cost controls | **None.** Both generate endpoints are open relays — no auth, no rate limit, no per-user cap, no origin check. Anyone with the URL spends the owner's money at will (import.js:4 literally calls this the "open-relay class"). |
| Face-photo consent / moderation / privacy | **None.** Subject photos go from IndexedDB straight to a third-party HK grey-market router at generation (app.js:1118). Unmanaged biometric (US **BIPA**, §3), GDPR **cross-border-transfer** (§4B), CSAM/NCII (§3) exposure the moment a stranger uploads a face. |
| Model-access legitimacy | **Grey-market.** Core engine proxied through an unofficial reseller. See §4B. |
| Catalog legitimacy | **Counterfeit.** See §4. |

**Who pays: the owner, 100%.** All keys are server-side Vercel env vars; end users need no key. You can't shift that cost with "bring your own key" either — the **primary** GPT-router path has no client-key branch (openai-image.js); only the Gemini *fallback* has a dev-only local-key escape hatch (app.js:971). BYO-key on the primary engine is net-new work.

**The honest one-liner:** FitCheck is an excellent personal/hobby tool with a working try-on core and *zero* commercial substrate. Turning it into a business means building that entire substrate **and** clearing two independent legal gates (catalog, router) first — before a single line of the substrate is worth writing.

---

## 3. Unit economics — the cost number is unverified, and that quietly breaks the margin tables

**Blunt correction up front: `COST_PER_LOOK ≈ $0.03` (app.js:134) is a cosmetic, un-metered display constant, and this report will not pretend it is measured.** Its own code comment says "GPT Image 2 @ low (approx, incl. input photos)" — but the structure of the call says the real number is very likely **2–4× higher**, and I could not meter it here (the keys are server-side and metering spends real money). **Before publishing any pricing, meter one real end-to-end look** — subject + 2 garments, quality `low`, through the actual router, counting input-image tokens and the moderation call — and re-derive everything below from that number. Until then, treat §3's tables as a *sensitivity analysis*, not a P&L.

**Why $0.03 is almost certainly understated (structural, from the code):**
- A try-on is a **multi-image EDIT**, not a text-to-image generation. Subject photo + one-or-more garment photos are sent as **input images**, billed as input tokens *on top of* the output-image cost. High-res user uploads tokenize expensively; multiple garment inputs stack.
- The code hardcodes **`input_fidelity: 'high'`** (openai-image.js:41) to hold the subject's face. High input fidelity is the *expensive* input mode — it re-tokenizes each reference image at high detail, adding a large per-image input-token surcharge across all 2–4 input images. The `'low'` in the $0.03 estimate applies only to the **output** tier, not the (high-fidelity) inputs.
- Anchoring to OpenAI's published image tiers, a `low` square **output** is roughly $0.01–0.02, but high-fidelity **inputs** across 3 images plausibly add several cents, so a single look lands nearer **$0.05–0.12 blended** — before the extras below.
- **Extras that all push up, none down:** regenerations, any medium/high output tier, the Nano Banana fallback, an unknown reseller markup with no SLA, and a mandatory pre-dispatch vision-moderation call (and see §3's moderation subsection — real moderation is far more than one cheap call).

**Defensible planning band: ~$0.08–0.12 blended per look, meter to confirm.** Every table below is shown across `$0.03 / $0.08 / $0.12` so you can see how fast "safe" margins evaporate.

**The mix-and-match fan-out is the dominant cost driver, not a feature.** One "generate every permutation" tap fires up to 20 looks. At the planning band that's **$1.60–$2.40 of spend in a single tap** ($0.60 even at the optimistic $0.03). A $9/month user's entire credit budget is ~1.5 such runs.

**Stripe:** 2.9% + $0.30 per charge; net on $9 ≈ $8.44, on $5 ≈ $4.56, on $19 ≈ $18.15. But see the disputes subsection — for an AI-image product Stripe risk is a **cliff, not a linear fee.**

### Pricing verdicts, re-derived across the cost band

| Tier | Net after Stripe | Break-even looks/mo @ $0.03 / $0.08 / $0.12 | Gross margin at cap @ $0.03 / $0.08 / $0.12 | Verdict |
|---|---|---|---|---|
| **$5/mo Unlimited** | ~$4.56 | 152 / 57 / 38 | negative tail, uncapped | **DO NOT SHIP.** One engaged user break-evens in 2–3 mix-and-match runs; open relay drives it negative. |
| **$9/mo Unlimited** | ~$8.44 | 281 / 105 / 70 | same failure, higher cliff | **DO NOT SHIP.** |
| **$9/mo — 30 credits** | ~$8.44 | metered at 30 (cost $0.90 / $2.40 / $3.60) | **89% / 72% / 57%** | **"Safe floor" is only safe at low cost.** At $0.12 blended, margin is 57%, not 89%. |
| **$19/mo — 100 credits** | ~$18.15 | metered at 100 (cost $3.00 / $8.00 / $12.00) | **83% / 56% / 34%** | **Margin collapses with real cost.** At $0.12 the per-credit price ($0.18) is barely above cost; a modest metering error or a price move puts it **underwater**. |
| **B2B widget** ($99/mo + $0.10/look) | base covers overhead | profitable from look one only if $0.10 > blended cost | **thin-to-negative at $0.12** | Best-margin *in theory*, but $0.10/look is **below** the high end of the cost band — reprice to $0.20–0.30/look, and it is blocked anyway by the counterfeit catalog and grey-market router. |

**Overage pricing bug in the first draft, fixed:** the draft proposed selling overage at "$0.15/look (5× cost)" — but that assumes cost = $0.03. At a $0.12 blended cost, $0.15 overage is **1.25× cost (17% margin)**, and at $0.15 cost it sells at break-even. Rule: **price overage at 5× the *measured* blended cost, floored at $0.20/look**, and re-check whenever the router price moves.

**What actually works: credits, never unlimited — but only after you meter.** $9/30 and $19/100 with a metered, server-enforced ledger and 5×-measured-cost overage are the only structures where revenue ≥ cost by construction — *at a known cost.* The non-negotiable precondition is unchanged and now doubled: both endpoints need per-user auth + a hard server-side credit cap before you charge a dollar, **and** you must know the real cost per look before you set a credit price at all.

### Free trials and the open relay are speed bumps, not patches

The first draft treated "3 looks per verified account" and "anonymous per-IP/session cap" as solved. They are not:
- **"Verified account" = email**, which is free and infinite (plus-addressing, disposable domains). 3 free looks × unlimited accounts = the same open-relay loss with a signup step. At $0.12/look that's $0.36 of your money per throwaway account, unbounded.
- **Anonymous per-IP/session caps** are defeated by IP rotation (mobile carriers, VPNs, cheap proxies) and by clearing cookies. A single motivated person who notices the open relay still drains your balance.
- **What actually gates spend** is a real *cost-to-attacker*: Cloudflare Turnstile / a proof-of-work challenge at minimum, card-on-file for trials. Every one of these adds verification **friction and CAC** — a cost the plan must own, not wish away. Ship the per-IP cap this week because it's cheap and better than nothing, but label it honestly as a bleed a single troll can reopen, and put Turnstile in front of the generate call before any public launch.

### Moderation is a program with legal duties, not a $0.002 API call

The first draft priced moderation as "a cheap vision-moderation call (~$0.001–0.002/look)." That trivializes the single largest legal-cost surface of a face-upload + clothing-generation tool. A generic "is this unsafe" call does **not** cover:

- **CSAM detection and reporting.** Under 18 U.S.C. §2258A you have a legal duty to report child sexual abuse material to NCMEC once you have actual knowledge. Generating body/clothing renders from an uploaded minor's photo is a live, foreseeable risk. This needs **hash-matching (PhotoDNA-class) plus a reporting pipeline**, not a vibe check — and it is **non-optional the moment strangers can upload.**
- **NCII / "nudify" defense.** A "put this garment on this person" tool trivially becomes a non-consensual-imagery generator (upload an ex, a coworker, a celebrity; prompt toward revealing garments). This is *the* most predictable abuse vector for this exact product, and it now carries direct statutory exposure (state NCII laws + the federal TAKE IT DOWN Act, 2025, with its notice-and-removal duties). You need a **real-person-consent gate** and **hard blocks on undress/minor prompts**, plus a **human-review escalation path**.
- **Cost/liability here is orders of magnitude above $0.002/look** and is mostly *your time*, which is the one asset a solo builder cannot buy back.

**If you cannot staff or afford this program, do not let strangers upload faces at all** — which is an argument for keeping FitCheck exactly what it already is: single-user.

### US biometric law (BIPA) is a bigger near-term bomb than GDPR

The first draft named only GDPR and budgeted the whole privacy layer at "4–5 days." For a US-facing face app the sharper risk is **Illinois BIPA**: **$1,000 per negligent / $5,000 per reckless-or-intentional violation, per image, per person**, a private right of action with **no proof-of-harm required** (Rosenbach), and a settlement history in the nine figures (Meta $650M, Google $100M-Illinois, TikTok $92M, plus the Clearview actions). **Texas CUBI** (AG-enforced, up to $25k/violation) and **Washington** add more. A face-upload tool with no written consent and no retention/destruction schedule is a textbook class-action target. Required before any face is processed: **written informed consent + a per-subject retention/destruction schedule**, and **geofence Illinois/Texas/EU** if you can't comply. Note: consent does **not** cure the illegal cross-border transfer at the router (§4B) — that's a separate, un-consent-able defect. "4–5 days" for all of this is fantasy; scope it as weeks and a standing process, or don't collect strangers' faces.

### Support and data-subject requests are an unpriced, mandatory cost line

Once strangers upload faces, you inherit **legally-mandated** work with statutory deadlines: GDPR/CCPA **data-subject access and deletion requests** carry 30–45-day response clocks and cannot be ignored, on top of the predictable "my face looks wrong / refund me / delete everything" volume. None of it is automatable away, and at low volume the DSAR handling alone can **exceed the affiliate revenue the plan projects.** Add a support/DSAR line to any monetized plan — another reason the honest default is single-user.

### Disputes are a step-function to account death, not a $15 fee

Chargebacks on subjective, sometimes-distorted AI-image credits (the engine runs at quality `low`, §2) are structurally elevated: buyers dispute "it didn't work / not as described," and a chargeback **bypasses any "credits are non-refundable" policy.** Cross the card networks' **~0.75% (Visa VDMP) / 1% (Mastercard)** dispute-ratio thresholds and Stripe enrolls you in a monitoring program, then terminates and **MATCH-lists** you (§4/§10 — that's ~5 years of industry-wide payment-processing exile). Model disputes as an **existential ratio**, not a per-unit cost: require quality-acceptance *before* credits are consumed, offer generous proactive refunds (cheaper than a dispute), and watch the ratio like the compliance metric it is.

---

## 4. Blocker #1 — the replica catalog, and its true (criminal, personal, permanent) ceiling

**The default catalog is counterfeit luxury** — ~2,600 items bulk-scraped from the "Aristide" Yupoo reseller (`extractYupooStore`, import.js:240–256), fakes of Loro Piana, Zegna, Hermès, Ralph Lauren. (The 2,600/14 figures are runtime data; the code proves only the import safety caps of 3,000/6,000 at app.js:871/945 and 15 fixed try-on categories.) This is a **legal gate on the whole business**, and the first draft *understated its ceiling.* The real ceiling is criminal, personal, and permanent:

- **Affiliate networks — hard-blocked, every one.** Amazon Associates' anti-counterfeiting policy is baked into the Operating Agreement (replicas → suspension/termination **with funds withheld**, possible law-enforcement referral). Skimlinks refuses counterfeit sites; Sovrn bans merchant trademarks without written consent. No network monetizes fake LP/Zegna/Hermès.
- **Direct legal liability is CRIMINAL, not merely civil.** Trafficking in counterfeit goods can be prosecuted under **18 U.S.C. §2320 (up to 10 years' imprisonment + fines)**, and a try-on-then-buy storefront *strengthens* contributory/inducement claims. Civil Lanham Act exposure includes **statutory damages up to $2,000,000 per mark for willful counterfeiting** (15 U.S.C. §1117(c)). The scraped Yupoo images add independent copyright/DMCA exposure.
- **Host-level de-platforming, not one link.** Brand-protection vendors (Corsearch, MarkMonitor, Red Points) auto-scan and issue takedowns to your **registrar and host**. Vercel's ToS bans IP infringement, so a takedown **nukes the entire deployment**, not a single buy button.
- **Payments: MATCH-list personal unbankability.** Apple rejects apps facilitating counterfeit/IP infringement (FitCheck is wrapped as an iOS tab). Stripe lists counterfeit and IP-infringing sales as **Prohibited Businesses**; termination for a prohibited business lands you on the card networks' **MATCH/TMF blacklist** — which blocks you from obtaining **any** new payment processor, industry-wide, for **~5 years.**
- **No liability shield.** A solo builder with **no LLC** has no corporate veil, so all of the above — criminal exposure, statutory damages, MATCH-listing — **reaches personal assets.**
- **Brand partnerships / white-label — dead on arrival.** You'd be pitching try-on to the exact brands you're counterfeiting; their anti-counterfeit legal teams are your opponents, not prospects. Any white-label client inherits your liability; due diligence kills the deal.

**"Shop this look" is NOT close-to-done just because the links render.** The plumbing is built; every link targets a counterfeit Yupoo album with no affiliate program. The blocker is **catalog legitimacy, not engineering.**

**The fix — and the honest admission that the fix is also a product downgrade.** Delete the Aristide items and the Yupoo default source (`refreshCatalog` app.js:911–957); sign up AWIN/ShareASale + Amazon Associates; populate drawers from real advertiser feeds; render affiliate deep-links on the existing buy buttons. Your generic OpenGraph/JSON-LD importer (`extractProduct`, import.js) already works on genuine retailer pages, so "paste a Zara/Nordstrom URL → try it on → buy" becomes the legit front door, and licensed feed assets *also* fix the image-copyright exposure. **But be honest about two hidden costs the first draft hid behind "near-drop-in":**
1. **It degrades render quality.** Affiliate/retailer feed images are **on-model, styled, watermarked, inconsistent-background** — not the clean flat-lay garment inputs try-on quality depends on. Swapping to legit feeds makes the renders *worse* at the exact moment you're asking users to click "buy." Budget **real engineering to normalize feed imagery** into try-on-usable garment shots (background removal, garment isolation, dewatermarking-by-selection) — this is not a drop-in.
2. **It deletes the only differentiation.** The report itself calls the curated luxury (replica) catalog "the single sharpest edge" (§5). Strip it and you're left with a generic try-on tool over the same commodity Zara/Amazon SKUs everyone already sees — **no traffic reason to exist.** This is a further argument for personal-tool, not business.

> ⚠️ Avoid building on **Collective Voice / ShopStyle (rewardStyle)** — deactivating links **March 31 2026**, final payout July 19 2026. LTK survives but is invite/creator-gated. Build on **AWIN/ShareASale + Amazon**, optionally Skimlinks for zero-approval auto-linking.

---

## 4B. Blocker #2 — the grey-market model proxy (the first draft's biggest miss)

**The core engine runs through `hk.lanyiapi.com`** (default `OPENAI_BASE_URL`, openai-image.js:11) — an unofficial Chinese OpenAI/Gemini **reseller-proxy**, not a neutral "OpenAI-compatible router." The first draft treated this as a §8 line item ("disclose or relocate the HK sub-processor"). It is a **co-equal headline blocker** sitting right next to the counterfeit catalog, for four independent reasons:

1. **Overnight-kill ToS risk.** Reselling model access through an unofficial proxy violates OpenAI/Google usage policy. The **upstream account can be banned at any time**, and when it is, FitCheck has no product — the primary engine goes dark. The Nano Banana (Gemini) fallback is *not* a hedge here: it's the same class of dependency on the other of the same two vendors.
2. **No pricing SLA — price volatility is acute, not hypothetical.** You are not a direct customer, so you have zero contractual price protection. The "GPU/API price volatility" a monetization report must address is *worse* through a reseller: the markup and the availability can change with no notice, and your margins (§3) move with them.
3. **Un-fixable GDPR cross-border transfer.** Every subject **face photo** is shipped to an unidentified intermediary of unknown corporate identity in HK/mainland-adjacent infrastructure. You **cannot sign a DPA or SCCs** with a grey-market reseller, so this is an **unlawful GDPR Chapter V (Arts. 44–49) transfer on day one** — and consent (Art. 49 derogation) is not a lawful basis for *systematic* transfers of *biometric* data. Add **China PIPL / Data Security Law** exposure for routing biometric data into mainland-adjacent infra. No consent UI cures this.
4. **You cannot build a durable, compliant paid business on a dependency that can rug-pull, get banned, or reprice with no notice** and that you cannot contract with.

**The fix (a prerequisite to *any* monetization or EU/paying user, and it's real work):** move the face-data path to a party you can contract with — a **directly-contracted OpenAI / Google account, or an enterprise tier (Azure OpenAI / Google Vertex) with a signed DPA and named sub-processors** — **or self-host** an open image-edit model (e.g., an open inpainting/IP-Adapter-class model on your own GPU). Self-hosting is the only option that *simultaneously* fixes this transfer problem, removes the reseller price/ban risk, and gives you the **self-hostable fallback** the provider-policy risk (§6) demands. Until the face path runs through a contractable party, **the app cannot legally take a paying or EU user regardless of the catalog.**

---

## 5. Competitive landscape — commodity capability, no moat

**Honest verdict: on the thing FitCheck does — diffusion "put this garment on this person" — it is already outcompeted, because that capability is a commodity.** FitCheck's engines (GPT Image 2 via a reseller, Nano Banana Pro) are the *same general-purpose models any competitor can call.* There is **zero model-layer moat.**

| Competitor | Type | Why it out-positions FitCheck |
|---|---|---|
| **Google Shopping Try-On (+ Doppl)** | Platform, B2C at scale | Distribution *is* the moat — try-on one tap away for hundreds of millions of shoppers inside the buy flow. Doppl folds into Search/Shopping **April 30 2026**. Free to users. |
| **Amazon Virtual Try-On** | Platform, B2C | Enormous captive audience tied to checkout. Free. (Narrow: shoes/eyewear/limited tees; iOS US/Canada.) |
| **Doji** | B2C consumer app | Closest direct analog — photoreal avatar + social feed + planned checkout. **$14M seed** (Thrive, Seven Seven Six), ex-Apple/DeepMind founders. Owns its diffusion stack. |
| **FASHN.ai** | B2B dev platform | Sells the exact function at **$0.075/img → <$0.04 at volume** — directly commoditizes what FitCheck hand-rolls (and undercuts FitCheck's own likely blended cost, §3). |
| **Perfect Corp / YouCam** | B2B platform + APIs | **705+ brands, 1.1B downloads**, 9 modular fashion APIs. Enterprise-trusted. |
| **Zeekit / Walmart** | Retailer-owned B2C | 270k+ items, at-scale, tied to checkout. Free to shoppers. |
| Veesual, Botika, Revery.ai, Vue.ai, Reactive Reality, Snap AR, Aimirr | B2B / platform | Enterprise/AR niches; all free-at-scale or price-competing on the commodity. |

**A solo app that owner-pays ~$0.08–0.12/look server-side, at owner-observed ~40–50s latency (not code-verified; the code proves only a >60s/300s budget + Fluid Compute, vercel.json), with no auth, no billing, no cost caps, and no moderation, cannot win the head-on "generic try-on tool" game.** The economics are upside down (you pay for every stranger's generation) and the incumbents are free and better-distributed.

**Where a solo builder can *still* differentiate (narrow, real, and all dead-ends for monetization):**
1. **Curated niche catalogs the giants legally/strategically won't serve** — gray-market, vintage, thrift, subculture. This is the single sharpest *technical* edge and a **monetization dead-end**: no affiliate/brand/white-label deal attaches to counterfeit or gray-market goods. Its ceiling is legal, not technical. Personal/community tool only.
2. **Personal wardrobe + mix-and-match combinatorics** — a nicer primitive for a styling tool than "try this one product," but (per §2) commoditizable and cost-multiplying, not defensible.
3. **Speed and taste** — a solo builder ships an opinionated, private, no-account-wall tool faster than any enterprise. That's a **portfolio/personal-use win, not a market win.**

**Why it's squeezed:** the only viable wedge (curated-niche catalog + personal mix-and-match) is pinched between Doji (funded, social, own stack) and Google (free, in the buy-flow), and the wedge's catalog is exactly the part that's illegal to monetize. Absent a legitimate catalog *and* a contractable engine *and* distribution, the honest positioning is **excellent personal/hobby project, not a competitor.**

---

## 6. Market reality — which pitch claims survive scrutiny (plus the provider-risk row)

| Pitch claim | Verdict | What's actually true | Source |
|---|---|---|---|
| "Apparel returns are 30–40%" | **Overstated** | Overall e-comm returns ~**16.9%** (2024), ~**19.3%** of online sales (2025). Apparel is worst: ~**22%** US online apparel. The 25–40% band is real only at the top end (bracketing; ~50% seasonal peaks). Steady-state online apparel is **~20–30%**. | NRF/Happy Returns 2024–25; Statista 34373 |
| "Try-on converts 2–3× higher" | **Overstated** | Defensible lifts are small: McKinsey **~18%**, Shopify 2024 **~27%** (**~1.2–1.3×**). The 1.8–3.2× / "10× luxury" numbers are vendor reports (Perfect Corp, DressX, Fittingbox) with heavy selection bias. Honest expectation: **+20–40% (1.2–1.4×).** | McKinsey 2024 & Shopify 2024; vendor reports flagged self-interested |
| "Try-on meaningfully cuts returns" | **Unclear** | Directionally plausible but almost entirely vendor-sourced/unaudited. Strongest in eyewear/beauty (objective fit/shade), **weakest in generative apparel — an unrealistic AI render can *increase* returns.** No independent peer-reviewed study confirms 30–40%; credible range **single-digit-to-~15%.** | Fittingbox/Photta; ASOS/Deloitte second-hand — no primary independent study found |
| **"The engines are a stable dependency"** | **False — top risk** | The whole product is **one provider price or policy change from unviable.** A 2× image-price move takes the $9/30 tier from ~72% to ~43% margin (§3). Worse: OpenAI/Google are **already cautious about editing/generating images of real people** (impersonation, NCII). If either tightens face-editing policy, **FitCheck has no product** — and there is **no self-hosted fallback in the stack** (both engines are the same two vendors, §4B). | OpenAI/Google usage-policy trajectory; code has no non-vendor engine |

**TAM, honestly:** analyst top-lines converge on ~**$9–15B (2024–25) → ~$38–48B (2030) at ~25% CAGR** (Grand View $9.17B→$46.42B; Mordor $15.18B→$48.1B; Market.us $12.5B→$48.8B). **This is a category-inflating vanity metric.** It bundles all AR/VR/AI try-on across beauty, eyewear, jewelry, footwear, apparel + hardware + services, weighted toward the *mature* beauty/eyewear segments. The serviceable slice for merchant-paid **apparel** try-on SaaS is low single-digit billions; the standalone **generative-image apparel** niche (FitCheck's actual category) is **hundreds of millions** — one to two orders of magnitude below the headline.

**Who pays, in reality: merchants, not consumers.** Every deployed model is B2B SaaS — retailers license try-on and give it to shoppers free. **Consumer direct willingness-to-pay is effectively ZERO.** Durable WTP sits with eyewear/beauty merchants; apparel-merchant WTP is real but weaker. **FitCheck's core bind:** the only payer is merchants — but the counterfeit catalog *and* the grey-market router foreclose every merchant/brand/affiliate/white-label deal, and no consumer-pays path exists.

---

## 7. Per-path scorecard — re-anchored so the scores match the prose

The first draft's scores read rosier than its own analysis. Re-anchored below, with an explicit "what this score assumes" so the table can't be skimmed more optimistically than the text supports.

| Path | Score (was) | What this score assumes | Verdict |
|---|---|---|---|
| **Affiliate "shop this look"** | **4.0** (was 6.5) | You **already have or will build real traffic**; you fix **both** blockers (catalog + router); you normalize feed imagery; you model revenue **net of return clawbacks**; you accept a **low-thousands/mo** ceiling. Without pre-existing traffic the score is **~1** and EV ≈ build cost. | **CONDITIONAL — only if you already run a traffic source.** The only path where the mandatory legal fix and the revenue mechanism overlap, but it acquires zero traffic on its own and the plan contains no acquisition mechanism. |
| **B2C SaaS (credit-based)** | **1.5** (was 3.5) | Consumer WTP ≈ 0 and any positive CAC makes LTV:CAC catastrophic **by arithmetic** — you cannot pay to acquire users who won't pay, and organic acquisition is the same traffic problem that sinks affiliate. Requires the full substrate + both blockers cleared + BIPA/moderation program. | **STRUCTURALLY IMPOSSIBLE**, not "revisit later." Building the credit/billing engine is money-losing regardless of execution quality. |
| **B2B embeddable widget** | **2.0** (was 2.5) | Max build (multi-tenancy on a one-shared-library codebase, per-tenant keys/quota/billing, tenant-scoped catalog) for FASHN/Perfect Corp/Revery's exact commoditized turf, no moat, no distribution — and still can't ship until catalog + router are clean. | **TRAP.** |
| **White-label for brands** | **1.0** (was 1.5) | Slowest (6–18mo enterprise procurement), XL clean-room rebuild, and the demo **counterfeits the exact brands you'd pitch** — adversarial before line one. | **DEAD ON ARRIVAL.** |

**Time-to-revenue and build effort are unchanged from the first draft** (affiliate: weeks / L, mostly the forced catalog swap; B2C: months / XL; B2B: very slow / XL+; white-label: slowest / XL) — but see §8 for why even those XL estimates are optimistic.

---

## 8. Recommended path + staged roadmap — the fork, then honest estimates

**The recommendation is the §1 fork, restated:** if you don't already have traffic, do legal hygiene and stop; if you do, run the affiliate path with both blockers fixed and the product-downgrade work budgeted. Everything below is the *if-you-go-paid* substrate — worth building **only** after traffic proves repeat demand, and with the estimates corrected upward.

**Estimates corrected: the first draft under-costed a vanilla-JS app with no build system and zero tests.** (There are two small unit tests, `test/sync.test.js` and `test/import.test.js` — for the merge and the importer, *not* for anything money-handling.)

- **One managed backend — Supabase** (Postgres + Auth + Storage + Row-Level Security) as a single dependency. RLS makes "data belongs to a person" true at the DB layer. **~2–3 wk** (was 1.5–2).
- **Auth gate on BOTH generate endpoints** — verify the session JWT at the top of `generate.js` and `openai-image.js`, 401 otherwise. Closes the open-relay hole. **~2 days** (was 1).
- **Credit ledger + atomic per-look reserve-then-settle** — **this is the genuinely hard, must-test piece, not a 3–4 day job.** It's effectively a distributed transaction spanning your DB and a **flaky, uncontractable HK proxy that can fail or time out *after* cost is committed**; getting idempotency, partial-failure refunds, and race conditions right in a codebase with **zero money-path tests** is a **~2 week** job with a real test harness written first. If you skip the tests you will ship a billing engine with silent money bugs.
- **Stripe Checkout + signed webhook → ledger grant** (hosted pages keep you out of PCI scope) — **~1 wk** (was 3–4 days), plus dispute-ratio monitoring (§3).
- **Consent + moderation + privacy PROGRAM** (not a 4–5 day layer): BIPA/CUBI written consent + per-subject retention/destruction schedule; CSAM hash-matching + NCMEC pipeline; NCII/undress + minor prompt blocks; human-review path; DSAR access/delete endpoints with 30–45-day SLAs; geofence Illinois/Texas/EU if you can't comply. **Weeks, and a standing operational commitment** (§3).
- **Router replacement** — self-host or a directly-contracted/enterprise account with a signed DPA (§4B). **Prerequisite to any EU/paying user; size it before promising a launch date.**
- **Cost caps** — per-user daily cap + per-user concurrency limit + global kill-switch env var. `MAX_LOOKS_PER_RUN=20` caps one run, not a day. **~1–2 days.**

**Phases (only if the traffic thesis holds and you're going paid):**
1. **Substrate** — every user signs in, gets a private server-backed wardrobe; IndexedDB drops to offline cache; shared R2 blob + `SYNC_SECRET` retired; both endpoints reject unauthenticated calls. *(~3 wk.)*
2. **Router + metering + billing** — replace the grey-market router; generations debit credits (measured cost, §3); Stripe credit packs; per-user + global caps; dispute-ratio monitoring; live balance UI. *(~3–4 wk incl. the ledger + its tests + router migration.)*
3. **Trust & safety program** — the full §3 moderation/BIPA/DSAR program so a stranger (incl. EU/Illinois) can upload a face without biometric/CSAM/NCII liability. *(weeks + ongoing.)*
4. **Catalog legitimacy + pick ONE go-to-market** — retire the Yupoo scraper as default; **normalize feed imagery** (real work, §4); B2C ships after Phase 3; affiliate adds deep-links + FTC disclosure; B2B/white-label adds net-new multi-tenancy. *(L for B2C/affiliate ~2 wk+ normalization; XL if B2B.)*

> For the affiliate path you do Phase 4's catalog swap **first** and skip Phases 1–3 — but you still cannot take an EU/paying user until the router (Phase 2's front half) is fixed. Phases 1–3 only earn their cost if affiliate demand justifies a B2C paywall, which §7 says it structurally won't.

---

## 9. Next 30 days — legal hygiene now; monetization only if you have traffic

**Week 1 — stop the bleed, kill both illegal spines (do this regardless of the fork; it's what makes personal use legal)**
1. **Add an anonymous per-IP/session generation cap** at the top of `generate.js` and `openai-image.js`. Ship it because it's cheap — but label it a **speed bump**, not a fix (§3), and plan Turnstile/proof-of-work before any public exposure. **Day 1–2.**
2. **Delete the ~2,600 Aristide items and remove the Yupoo scraper as default** (`extractYupooStore` import.js:240–256; `refreshCatalog` app.js:911–957). Keep the generic OG/JSON-LD importer (`extractProduct`). **Day 2–3.** Removes the criminal-counterfeiting + DMCA exposure.
3. **Decide the router.** Self-host or stand up a directly-contracted/enterprise OpenAI/Google account with a signed DPA (§4B). Until this is done, **nobody but you should upload a face**, and the EU/Illinois must be geofenced. **Day 3–5 to decide + start.**

**Week 2 — only if you already have traffic; otherwise stop here and just keep using the tool**
4. **Sign up AWIN + ShareASale** ($1 refundable deposit, SMB-friendly feed builder) and **Amazon Associates** — but know Amazon's two gotchas that gut it for a no-traffic tool: it **closes accounts with fewer than 3 qualifying sales in the first 180 days** (a zero-distribution tool likely gets auto-deactivated before it earns), and its **cookie is only 24 hours** (vs 30–90 days on AWIN/ShareASale merchants), which savages conversion on a browse-and-try flow. **Treat Amazon as breadth-only backup, not a revenue leg.** Optionally Skimlinks for zero-approval auto-linking.
5. **Populate drawers from real advertiser feeds** *and budget the feed-image normalization work* (§4) — on-model/watermarked feed images degrade renders until normalized.

**Week 3 — wire the money (still traffic-gated)**
6. **Store the merchant product URL per item; render the affiliate deep-link on the existing buy button** (`tileHtml` app.js:455; viewer shop-chips ~app.js:685). Wrap at click time.
7. **Add FTC affiliate disclosure** (mandatory) and **model commissions net of returns/clawbacks** — most programs pay on *net* sales and **claw back** commissions on returned items, and `low`-quality renders both suppress buy-through and *increase* return-driven clawbacks (§6). Booked revenue is partly phantom; plan for it.

**Week 4 — validate on LEADING metrics, don't build more**
8. **Measure the two things observable this early: organic-session growth and affiliate click-through** — **not** settled revenue, which won't be real yet (approvals take weeks, feeds longer, SEO months, commissions have a 30–60 day lock/hold). **Do NOT** start auth, billing, credits, or the Supabase migration this month.

---

## 10. Blunt reasons this fails — and when to walk away

**Structural reasons it may never be a business:**
- **Two independent legal gates, either fatal alone.** A counterfeit catalog (criminal §2320 exposure, host-level takedown, MATCH-list, personal liability with no LLC) *and* a grey-market model proxy (ToS-ban risk, no price SLA, un-consent-able cross-border transfer of biometric data). Both must die before a dollar is legal.
- **Try-on is a commodity with zero model moat**, and both engines are the same two vendors — one price or policy change (e.g., restricting face edits of real people) takes the product to **zero**, with no self-hosted fallback in the stack.
- **Consumer WTP ≈ 0** and any positive CAC makes consumer-pays **arithmetically impossible**, not merely weak. The only real payer is merchants, and both blockers foreclose the merchant path.
- **No distribution.** Affiliate revenue is a pure function of traffic you don't have, referring into flows the giants give away free. **CAC and traffic are the binding constraints, and nothing in the plan produces either.**
- **The hidden-cost surface is large and mandatory:** a CSAM/NCII moderation program, BIPA/CUBI consent + retention, DSAR handling with statutory deadlines, dispute-ratio compliance — any one of which can exceed the affiliate revenue the plan projects.
- **Realistic ceiling is side-income at best**, and only *with* pre-existing traffic. Absent that, EV ≈ build cost, i.e. a loss of your time.

**When to walk away (set these triggers now):**
- **You have no audience and no appetite to build one.** This is not a failure trigger — it's the **default answer**, and it says: keep FitCheck as the personal/portfolio tool it's good at, do the §9 Week-1 hygiene, and build no monetization.
- **You stop using it yourself.** Its one durable value is as a personal tool; if it's not in your own weekly rotation, no market case will save it.
- **Leading metrics flat at 8–12 weeks.** If organic sessions aren't growing and affiliate click-through is ~0, the traffic thesis is falsified *early* — stop, even though settled revenue is still inside its 30–60 day hold. **Judge settled revenue on a 6-month horizon** (to match SEO ramp + commission lock), not the first-draft's 60–90 days, which would fire "fail" on pure ramp-lag noise.
- **Dispute ratio approaching ~0.5%.** Pull back before the 0.75–1% Stripe termination/MATCH cliff.
- **You're about to build auth + Stripe + ledger before traffic exists.** That's the structurally-impossible B2C trap — a billing engine to charge for a commodity nobody pays for. Stop.
- **Any temptation to keep "just a little" of the replica catalog, or to leave the grey-market router in place "for now."** Either one reintroduces the full ladder — criminal counterfeiting / MATCH-list on the catalog side, un-consent-able biometric transfer + overnight-ban risk on the router side. It's all-out on both, or the business is illegal.

**The one honest sentence to keep:** FitCheck is a genuinely good personal tool built on a commodity capability, a counterfeit catalog, and a grey-market proxy; the correct default is to fix the catalog and the router *only* so you can keep using it legally yourself, geofence the EU/Illinois if anyone else can ever upload a face, and spend **zero** build-weeks chasing affiliate revenue unless you already own the traffic — because without traffic, an anti-abuse stack, and a compliance program the numbers don't fund, its expected value is roughly the cost of building it.
