# LLM Council Transcript — 2026-07-11

## Original question
"Brainstorm more features, argue which will actually be useful for the masses and has financial potential" (FitCheck)

## Framed question
FitCheck (fitcheck.andypandy.org) is a working virtual try-on web app built by a solo developer, Andy. Current features: photograph yourself once; wardrobe of owned garments (auto-categorized by AI vision into 15 categories); paste any shop URL to import a product; bulk-import entire Yupoo reseller stores (~2,600 items catalogued in drawers); mix-and-match outfit generation (subject photo + garments composited photo-realistically by GPT Image 2 / Gemini image models, ~$0.03–0.12 per look, 40–50s latency, server-side keys so the owner pays); hair styles, backdrops, style notes; cross-device sync; dark/light editorial UI; iOS wrapper app.

Constraints established by prior multi-agent feasibility analysis (July 2026):
- Two blockers for any paid/public product: counterfeit catalog (Yupoo replicas) and grey-market API proxy (no DPA; strangers' face photos can't lawfully transit it). Both fixable.
- Consumer willingness-to-pay for try-on subscriptions ≈ 0; "unlimited" plans are a margin trap; owner pays per generation.
- No accounts/auth/billing; no traffic/audience.
- Competitors: Alta ($11M, avatar closet styling), Google (selfie try-on + Photos auto-closet June 2026), Whering (10M users), Doji, single-item try-on extensions. Unoccupied wedge: photo-real try-on of a candidate purchase WITH owned items, injected at point of sale via extension, affiliate-monetized.
- Andy's stated direction: digital closet + outfit suggestions + "try on with my wardrobe" while shopping; endgame = embedded on brand sites.

THE QUESTION: Brainstorm NEW features. Argue which are useful for the masses and which have real financial potential — who uses them, why they'd pay / what monetization they unlock, what they cost a solo developer.

## Anonymization map (peer review round)
A = The Outsider · B = The Executor · C = The First Principles Thinker · D = The Contrarian · E = The Expansionist

---

## The Contrarian (Response D)

The feature brainstorm is a decoy. FitCheck has zero users, zero distribution, and a prior analysis that already concluded willingness-to-pay is zero. No feature fixes that. Three flaws everyone's avoiding:

**1. Photo-real try-on can't answer the only question shoppers pay for: "will it fit?"** GPT Image drapes any garment flawlessly on any body — it's a fantasy renderer that hallucinates a perfect fit every time. That makes it actively worse than useless as a purchase-decision tool, and it means the affiliate wedge monetizes flattery, not information. Returns won't drop; disappointed buyers will blame the app.

**2. The "unoccupied wedge" is unoccupied because it's structurally broken.** The extension needs your wardrobe digitized first — a 50-garment photography chore the masses will never do, while Google auto-builds closets from Photos for free. Add 40–50s latency (impulse-shopping death), apparel affiliate rates of ~4–8% against $0.03–0.12 per generation with free users spamming looks, retailers' DOM breaking your injection weekly, and Chrome Web Store review risk. That's negative unit economics wrapped in a maintenance treadmill.

**3. Strangers' faces are a liability, not a feature.** Public launch means auth, billing, moderation, consent verification (people WILL upload photos of exes and classmates), CSAM screening, app-store scrutiny of biometric data. That's months of solo-dev work producing zero user-visible value.

What survives scrutiny: features that need no strangers. "Pack for this trip," "what haven't I worn," resale-listing photo generation from wardrobe items — useful, cheap, keep it a personal tool or a $5 one-time toy. The honest financial-potential answer is: none, unless Andy pivots to selling the try-on pipeline B2B to small boutiques — and Shopify will eat that too.

## The First Principles Thinker (Response C)

You're asking the wrong question. "What features should FitCheck have?" assumes features are the bottleneck. They aren't. Strip it down: FitCheck has zero users, zero distribution, and a cost structure where every free generation burns Andy's money. Adding features to a product nobody visits is decorating an empty store.

Rebuild from the ground up. What is try-on *for*? Reducing purchase uncertainty — "will this look right on me, with what I already own?" Who has money riding on that uncertainty? Not the shopper (WTP ≈ 0, established). The retailer: returns run 20–40% in apparel, largely from exactly this doubt. So the only unit-economics-positive event in this entire product is: *a generation that converts a hesitating shopper into a purchase someone pays Andy for.* Every feature should be judged by distance from that event.

That kills most brainstormable features instantly. Outfit calendars, weather suggestions, packing lists, social sharing, closet analytics — all increase per-user cost, zero revenue path, and Google/Whering will bundle them free. Digitizing a wardrobe is a chore the masses won't do; Google Photos will auto-do it. Don't compete on the closet.

What survives: one feature, really. **The purchase-moment verdict.** Browser extension, "Try with my wardrobe" on any product page, returns one composite image plus a blunt pairing answer ("goes with 6 things you own / duplicates your grey hoodie"). Affiliate link out. Build cost for a solo dev: extension shell + auth + Stripe-free affiliate signup, maybe 4–6 weeks; run cost is the existing $0.03–0.12, recouped at ~3–8% affiliate commission on a single conversion per ~30 generations.

Everything else is a feature request from Andy-the-user, not Andy-the-business. Ship the wedge; let the closet stay a demo.

## The Expansionist (Response E)

Everyone's staring at the shopper. The shoppers won't pay — your own analysis says WTP ≈ 0. But Andy has accidentally built two things sellers and creators will pay for, and he's treating them as plumbing.

**1. Seller photo studio (repackaged, not rebuilt).** The Yupoo bulk-importer plus generation pipeline is, verbatim, a product-photography replacement. Depop, Vinted, Poshmark, and Shopify boutique sellers pay $30–100 per model shot today or settle for ghost mannequins. Andy's cost: $0.12/look. Sell credits at $0.50–1/shot, Stripe checkout, done. Sellers are businesses — they buy tools, they don't need "subscriptions for fun." This is 90% built; it's a landing page and a credits table away. First revenue in weeks, not quarters.

**2. Creator lookbooks.** Influencers in the LTK/ShopMy economy buy hauls, shoot, return. Let them generate themselves wearing any importable product, affiliate links attached. They pay per generation *and* they're a distribution engine — every lookbook is an ad for FitCheck. Creators bring the audience Andy doesn't have.

**3. The consumer extension is still right — but it's a data play, not an affiliate play.** "Try on with my wardrobe" at point of sale produces the rarest signal in retail: what someone owns plus what they're considering, at the moment of purchase. Affiliate pennies fund it; the wardrobe-intent graph is what brands eventually pay real money for. That's the embedded-widget endgame Andy already named — the extension is the wedge that collects the moat.

**4. Cheap viral upside:** shared profiles ("try it on my partner before I buy the gift"). Near-zero build, natural K-factor, seasonal spikes.

Sequence: seller studio for cashflow now, creators for growth, extension for the moat. The consumer app everyone's fighting over is the least valuable layer of this stack.

## The Outsider (Response A)

Okay, dumb question first: when I generate a try-on and it looks great, is that because the shirt suits me, or because the AI is programmed to make everything look great? If every image flatters, the app is a mirror that lies, and my sister would learn that after three returns and delete it. So my #1 feature: **honest fit signals** — pull the size chart, ask my measurements once, and stamp the image "this runs small, size up." That's what actually prevents a bad purchase, and it's mostly scraping plus a text overlay, cheap to build. Trust is the product; the pretty picture is packaging.

#2: **"Ask my friends" link.** Nobody decides on clothes alone. Generate a look, send it to the group chat, friends tap 🔥 or 🗑 without installing anything. Costs a share page and a vote counter — a weekend of work — and it's your only realistic growth engine, because zero people are searching "virtual try-on app."

#3: **Occasion mode.** "Wedding in June, here's my closet, what do I actually need to buy?" That's the one moment normal people spend real money on clothes with urgency, and every suggested purchase is an affiliate link. This is where the money is — not subscriptions, which your own analysis says nobody pays for.

Kill or hide: hair styles, backdrops, style notes, 15 garment categories, 2,600-item reseller drawers. I don't know what a Yupoo is and neither does anyone I know — to an outsider it reads as "warehouse of fake clothes," which poisons trust in feature #1. And the 40-second wait: don't fix it with engineering, fix it with expectation — "we'll text you when your look is ready" beats a spinner.

Would my dad use this? No. Would my sister, the night before a wedding, with a group-chat vote? Yes. Build for her.

## The Executor (Response B)

Monday morning: open a direct OpenAI account and sign up for Skimlinks/Sovrn. Both take a day and unblock everything else. Auth via Clerk or Supabase: three days. That's week one, and it's prerequisite, not optional.

The only feature worth building next is the browser extension: "Try this on with my wardrobe" injected on Zara/Uniqlo/ASOS product pages. Andy already has the hard parts — URL-to-garment import and the compositing pipeline. The extension is a content script that scrapes the product image and calls his existing API. Two to three weeks solo, three retailers hardcoded first, no universal scraper. Who uses it: anyone hesitating at checkout. Monetization: affiliate rewrite of the buy link — 5–10% of a $60 cart is $3–6, which pays for 30–100 generations. Free tier capped at 5 renders/day; the unit economics close without subscriptions, which matters because willingness-to-pay is zero.

Second feature, cheap and additive: "complete this outfit" — after a try-on, suggest one owned item plus one purchasable gap-filler with an affiliate link. It's a text-model call, fractions of a cent, one week of work, and it doubles affiliate surface area.

Third: shareable look permalinks. Two days. Zero marginal cost, and it's the only acquisition channel a solo dev with no audience can afford.

Skip: daily outfit suggestions (retention feature for users he doesn't have yet), social/feeds (needs moderation he can't staff), avatar stylist chat (Alta's turf, no first step that isn't six months), brand embed SDK (endgame requires sales calls — nothing to do Monday). Also skip iOS polish until the extension proves anyone clicks.

Sequence: legit API + auth → extension MVP → affiliate links → share links. Eight weeks, under $200/month burn until traffic exists.

---

# Peer reviews (advisors saw responses anonymized as A–E)

## Reviewer 1
**1. Strongest: E.** It's the only response that finds someone who already pays for the job FitCheck does (sellers replacing $30–100 model shots), and it quietly neutralizes D's best objection — the renderer's flattery is a fatal flaw for purchase decisions but a *feature* in marketing photography. B is the best execution plan, but B and C both bet everything on the extension wedge that D credibly wounds (latency, wardrobe-digitization chore, negative affiliate math).

**2. Biggest blind spot: A.** Its #1 feature — "honest fit signals" — is built on top of an image D correctly identifies as a fantasy renderer. Stamping "runs small" on a picture that hallucinates perfect drape doesn't create trust; it creates contradiction. A also never touches cost, distribution, or who pays. E's blind spot is second: Poshmark/Vinted/Depop policies require photos of the actual item; AI model shots risk bans, and the flagship customers are counterfeit resellers — legal exposure nobody prices in.

**3. All five missed:** validation before building. Every plan rests on untestable-by-argument assumptions — renders influence real purchases, sellers accept AI shots, affiliate conversion covers generation cost. Each is testable in a week for under $100 (buy 3 garments, compare render vs. mirror; DM 20 Depop sellers). Nobody proposed a single experiment or kill criterion.

## Reviewer 2
**1. Strongest: E.** The brief's binding constraint is WTP ≈ 0, and E is the only response that escapes it by changing the payer — sellers and creators buy tools today, the assets are 90% built, and the sequencing (cashflow → growth → moat) is coherent. B is the best pure execution plan, but it only operationalizes the wedge the prompt handed everyone.

**2. Biggest blind spot: C.** It bets the entire business on one event — the purchase-moment verdict — yet never stress-tests whether that verdict can be honest. D's two objections land squarely on C's single wager: the renderer flatters every fit, and the extension presupposes a digitized wardrobe the masses won't build. C is all-in on a wedge it never inspects. (E's seller studio has a related miss: resale platforms require photos of the actual item; AI model shots invite disputes and bans.)

**3. What all five missed:** Nobody proposed testing the load-bearing assumption. Andy owns the wardrobe — photograph real outfits, generate the same combinations, and measure whether renders match reality. One week, near-zero cost, and it settles the A/B/C/E vs. D dispute before anyone spends six weeks building an extension. Evidence first, roadmap second.

## Reviewer 3
1. **Strongest: E.** It's the only response that names buyers with willingness-to-pay above zero — sellers and creators buy tools; the brief establishes consumers don't. The seller studio repackages already-shipped code into revenue in weeks, and it correctly demotes the consumer app to the least valuable layer. B is the best execution plan, but it's a plan for the consensus wedge, not a re-examination of it.

2. **Biggest blind spot: B.** It sequences eight weeks of build with zero demand validation, and never engages D's two killers: the renderer hallucinates perfect fit (so the extension monetizes flattery), and the extension is useless until a user photographs 50 garments. B confuses "buildable by Monday" with "wanted." (E has a smaller one worth flagging: Vinted/Poshmark/eBay require photos of the actual item — AI model shots risk bans and disputes.)

3. **All five missed:** affiliate networks are actively hostile to link-rewriting browser extensions post-Honey — the consensus monetization channel may be contractually closed; check Skimlinks/Sovrn extension policies before building anything. And nobody proposed the cheapest test: a fake-door demo on one retailer shown to 20 real shoppers before a single week of build.

## Reviewer 4
1. **Strongest: B.** It's the only response that converts strategy into a costed, sequenced build plan (legit API + auth → extension → affiliate → share links, 8 weeks, <$200/mo) while agreeing with C's wedge logic. C has the sharpest single insight — judge every feature by distance from a paid conversion event — but B operationalizes it and adds the "complete this outfit" affiliate multiplier C ignores.

2. **Biggest blind spot: E.** The seller-studio pitch quietly rebuilds the product's biggest liability into its core: the Yupoo importer is a counterfeit-reseller catalog, so "repackage it for Depop/Vinted sellers" means generating model shots of grey-market goods — platform-ban and legal exposure, not cashflow. E also hand-waves the "wardrobe-intent data moat" without any buyer, scale, or privacy path. D's critique (fantasy renderer, wardrobe-digitization chore) directly undercuts E's creator play too, and E never engages it.

3. **All five missed:** validation before building. Nobody proposed testing demand cheaply — e.g., a fake-door landing page, 20 manual try-ons for real shoppers, or measuring whether AI composites actually change purchase decisions/returns. Every plan (extension, seller studio, fit signals) assumes the render is persuasive and accurate enough to act on; D asserts it isn't. That's an empirical question answerable in a week for ~$20, and it should precede any 6-week build.

## Reviewer 5
**1. Strongest: B.** It's the only response that converts strategy into a costed, sequenced plan (legit API → auth → extension → affiliate, eight weeks, <$200/mo) while sharing C's correct thesis that the purchase-moment extension is the sole unit-economics-positive feature. C states the principle better; B makes it executable. A deserves credit for pre-answering D's "fantasy renderer" objection with honest fit signals — the one feature that makes the wedge trustworthy.

**2. Biggest blind spot: E.** Its "90% built" seller studio sells AI-generated model shots into resale marketplaces (Vinted, Poshmark, Depop) whose entire trust model is photos of the *actual item* — condition, flaws, authenticity. Platforms restrict or ban generated listing photos, and the feature inherits the counterfeit-catalog taint the brief says must be removed. The "first revenue in weeks" claim collapses on policy, not tech.

**3. What all five missed:** Affiliate link-rewriting by a browser extension is the Honey model — currently under FTC scrutiny and class actions for attribution hijacking, and affiliate networks routinely reject or claw back extension traffic. B, C, and E all rest their monetization on this rail without naming the risk. The council should stress-test whether the affiliate channel is even open to extensions before sequencing anything on it.

---

# Chairman's synthesis

## Where the Council Agrees

Five advisors, working independently, converged hard on four points:

1. **Consumer subscriptions are dead.** All five accepted WTP ≈ 0 and nobody proposed charging shoppers. Any plan that ends in "then users pay monthly" is off the table.
2. **The browser extension at point of sale is the real estate that matters.** B, C, and E all landed on "try this on with my wardrobe, injected on the product page" — B as the build plan, C as the *only* surviving feature, E as the data moat. Even A's occasion mode is the same insight (money moves at the moment of intended purchase, not while browsing your closet).
3. **Kill the closet-management surface.** Outfit calendars, weather suggestions, closet analytics, social feeds, 15 garment categories — A, B, C, and D all put these on the chopping block, for the same reason: Google and Whering will bundle them free, and they add cost with no revenue path.
4. **The Yupoo/reseller machinery is a liability in a consumer product.** A called it "warehouse of fake clothes" trust-poison; D called it legal exposure; even E, who wants to monetize it, wants it repackaged out of sight.

Four-to-five advisor convergence from independent starts is the strongest signal the council produces. Treat these as settled.

## Where the Council Clashes

**The 3–2 split: Expansionist (E) vs. Executor (B).** Reviewers 1, 2, and 3 crowned E for the one move nobody else made — changing the *payer*. Sellers already spend $30–100 per model shot; E repackages 90%-built plumbing into revenue in weeks. Reviewers 4 and 5 crowned B for being the only advisor who converted strategy into a costed, sequenced, solo-executable plan. The disagreement is really about what's scarce: Reviewers 1–3 think it's *revenue* (E finds it fastest); Reviewers 4–5 think it's *execution focus* (B protects it best). Both are reasonable because both constraints genuinely bind a solo dev with no cashflow.

But note: the E-majority reviewers themselves flagged E's fatal caveat (Reviewers 1 and 3: Poshmark/Vinted/Depop *require photos of the actual item* — AI model shots risk bans, and the flagship customers are counterfeit resellers). The B-minority reviewers made that the centerpiece. So the "majority" for E is softer than 3–2 looks.

**The Contrarian's kill-shot: is the render honest?** D says photo-real try-on is a fantasy renderer that flatters every body, so it can't answer "will it fit?" — the only question worth paying for. C bet everything on the purchase-moment verdict without stress-testing this (Reviewer 2's point). A is the only advisor who pre-answered it: bolt data-driven fit signals (size charts + measurements, "runs small, size up") onto the image. E sidesteps it: in *marketing* photography, flattery is the feature. Both counters work — but only in their respective lanes.

## Blind Spots the Council Caught

- **A's internal contradiction** (Reviewer 1): stamping "honest fit signals" on an image that always flatters creates dissonance, not trust — unless the signal comes from size-chart *data*, independent of the render. That's the fix, and it's also the differentiation Google doesn't have.
- **B's build-first blindness** (Reviewer 3): eight costed weeks, zero demand validation. "Buildable by Monday" is not "wanted by anyone."
- **E's platform-policy hole** (Reviewers 1, 3, 4, 5 — the most-caught blind spot in the review round): the seller studio sells AI model shots into marketplaces whose entire trust model is actual-item photos, with counterfeit-catalog taint on top. "First revenue in weeks" collapses on a policy page.
- **What all five missed — validation before building.** Every reviewer independently said it: nobody proposed a single experiment or kill criterion, when every load-bearing assumption is testable in a week for under $100.
- **The affiliate-channel legality panic — adjudicated.** Reviewers 3 and 5 feared the Honey precedent closes the channel. Verified context says otherwise: Chrome's June 2025 policy explicitly *permits* affiliate extensions when disclosed and user-initiated; the Honey suits were dismissed (lesson: never strip an existing tag, only attach on genuine user-clicked conversion); and Phia raised $35.5M doing exactly this in January 2026. The channel is open. What remains is a day-one gate, not a blocker: confirm Skimlinks/Sovrn accept a new extension partner.

## The Recommendation

**Build the point-of-sale extension as the product, with A's honest-fit layer as its spine — B's sequence, C's discipline. Demote E's seller studio to a side experiment scoped to Shopify boutiques only. Skip everything else.**

Specifically:

**Build (in order):**
1. **Legit API account + auth + Skimlinks/Sovrn application** — B's week one, prerequisite, not optional.
2. **The extension: "Try this on with my wardrobe" on 3 hardcoded retailers**, returning one composite *plus* C's blunt pairing verdict ("goes with 6 things you own / duplicates your grey hoodie") *plus* A's data-driven fit stamp ("runs small — size up"). The fit stamp is what answers D: the image sells the look, the data tells the truth, and the combination is something neither Google (no fit data, no purchase-moment injection) nor Alta (no point-of-sale presence) ships. Affiliate attach only on user-clicked buy — the Phia-legal, Honey-safe pattern.
3. **"Complete this outfit"** — B's one-week affiliate-surface doubler.
4. **Shareable look permalinks / group-chat vote** — A and B converged on this as the only free acquisition channel.

**Skip:** seller studio on Poshmark/Vinted/Depop (policy-broken), creator lookbooks (FTC/authenticity minefield, and creators demand real-garment fidelity most of all), avatar chat, social feeds, daily outfits, iOS polish, brand SDK, wardrobe-intent "data moat" talk (no buyer, no scale, real privacy exposure — Reviewer 4 is right that it rebuilds the liability as the pitch).

**Why against the 3–2 majority for E:** the majority's own reviews contain E's death sentence. A revenue plan whose first customers are marketplaces that ban the product and whose flagship users sell counterfeits isn't cashflow, it's a ban-and-liability speedrun. The one sliver that survives — Shopify boutiques photographing their *own legitimate* stock on AI models — is worth a landing page and 20 cold DMs, not the front of the queue.

And per every reviewer: **validation gates the build.** The 8-week extension plan starts only after the fidelity test below passes and one retailer's affiliate network confirms extension traffic is accepted. If renders don't survive contact with reality, D wins the whole argument, and FitCheck stays what it honestly is today — a delightful personal tool.

## The One Thing to Do First

**Run the render-vs-reality test this week, at near-zero cost, with the wardrobe Andy already owns:** photograph yourself in 5 real outfits in a mirror, generate the identical combinations in FitCheck, put the pairs side by side, and show them blind to 10 people with two questions — "which is real?" and "would the render have correctly predicted how this fits?" Every advisor's plan — A's trust layer, B's extension, C's verdict, E's studio — sits on the single untested assumption that the render resembles the reality. Fifty dollars and five days settles the council's central dispute before a line of extension code gets written.
