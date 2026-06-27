# AUNTIE — Architecture & Build Doc
### The trust-first AI co-pilot for live/social commerce. *Your auntie who knows the real price and smells a scam.*

> **Working name: AUNTIE** (the SEA auntie who watches the live haul with you and goes *"aiyoo don't buy lah, that one S$182 at the other shop, this one confirm kena scam"*). Funny, SEA-native, and it literally describes the product. Serious-brand fallback: **Caveat**. Other funny options at the bottom.
>
> **What it is (one line):** A co-pilot that watches a shopping livestream with you and, the moment a product is pushed, tells you **(1) is this seller legit, (2) what real buyers say, (3) where to get the same thing cheaper and safer.** See → Judge → Beat.
>
> **The pitch line:** *"Microsoft, OpenAI and Amazon are building AI that helps you buy from sellers who are already trusted. Nobody's helping the 200 million people buying from a stranger on a TikTok live. Auntie is the co-pilot for them."*

---

## 0. THE LOCK (read first)

We have pivoted the concept ~6 times in this thread — each toward something better, but Saturday is in 4 days. **This is the lock.** Trust-first live-commerce co-pilot, See+Judge real, Beat pre-baked. From here the only question is *how to build it*, not *what if instead*. The best idea you build beats the perfect idea you're still refining.

---

## 1. The product: See → Judge → Beat

A pure scam-checker dead-ends ("this is 80% fake" → *now what?*). Auntie doesn't stop at the verdict — it delivers a **better outcome**, which is also what makes it a *business* and not a vitamin.

| Step | What happens | Why it matters |
|---|---|---|
| **SEE** | User snips/highlights the product on the livestream (or it's auto-detected). A vision model identifies the exact item. | Turns a passive stream into a structured product query — zero typing. |
| **JUDGE** | The crowd-evidence verdict: real market price, claims nobody else makes, buyer complaints in comments, review provenance, script reuse, domain/footprint → `TRUST / CAUTION / AVOID` with receipts. | This is the **woah** and the trust wedge no shopping tool has. |
| **BEAT** | "Same item, S$182, from a verified seller — here's the link." Price comparison + safer checkout path. | This is the **business**: the redirect earns affiliate/commission. Vitamin → painkiller → revenue. |

**The auntie metaphor does real work in the pitch:** everyone in SEA *has* an auntie who knows the real price and won't let you get cheated. Auntie is that, as software, for the moment you're about to buy from a stranger online.

---

## 2. Why this clears both gates
- **WOAH:** paste/snip a product mid-livestream → a *prosecutor's case* assembles in seconds (64% below market, 31/240 comments say "never arrived," identical script on 3 fresh accounts) → then "...and here's the real one, cheaper, safe." Judge feels it in 5 seconds.
- **POTENTIAL:** trust-first co-pilot for the fastest-growing, least-protected commerce channel on earth, with a built-in revenue model (affiliate redirect) and a bridge to agents (the same verdict ships as JSON an AI shopping agent calls). Present revenue, future infrastructure.

---

## 3. Competitor landscape (the honest three-ring map)

You're standing where three crowded categories *don't* overlap. That gap is the company — but the framing is load-bearing. **Pitch "AI shopping assistant" → you die under Microsoft. Pitch "trust-first co-pilot for live/social commerce" → you're alone.**

### Ring 1 — Agentic-checkout giants (they assume the seller is safe)
| Player | What they do | Why they're not you |
|---|---|---|
| **Microsoft Copilot Checkout** (NRF Jan 2026) | Buy inside Copilot from Shopify/Etsy/Urban Outfitters; Stripe/PayPal-powered | Formal vetted catalogs; **no trust layer, no live/social, not SEA-informal** |
| **OpenAI Instant Checkout** (Sept 2025) | Buy in ChatGPT from 1M+ Shopify merchants | Same; even warns "AI prices may be wrong, verify on merchant site" |
| **Google "Buy for Me" / Gemini** | Agent buys on your behalf | Formal merchants; no counterparty trust for strangers |
| **Amazon Rufus / Alexa+** | In-Amazon assistant, 300M users, ~$12B incremental 2025 | Amazon ecosystem only |
| **Shopify Agentic Storefronts** | Makes Shopify catalogs agent-shoppable | Infrastructure for *trusted* merchants |

> **The gap they leave (say this):** all of them help you buy from sellers who are **already trusted**. None touch the stranger on a TikTok/Shopee/IG live — which is exactly where the scams, the volume, and the SEA growth are.

### Ring 2 — Shopping / price / coupon tools (the "Beat" half — no trust, no live)
| Player | Why they're not you |
|---|---|
| **Honey (PayPal)** | Coupons on static listings; **publicly torched in 2024** for screwing users/creators on affiliate attribution → you're the *trust-first opposite* |
| **Capital One Shopping, Karma, Rakuten, Klarna** | Price/cashback on clean Western marketplaces; assume seller legit; no live/social |

### Ring 3 — Trust / scam tools (the "Judge" half — verdict, then dead-end)
| Player | Why they're not you |
|---|---|
| **ScamAdviser** | Black-box domain scores; no redirect, no outcome, no live |
| **Sardine / ADVANCE.AI / Tookitaki** | KYB/AML for **banks**, not consumers/agents at purchase time |
| **MarqVision** (YC, ~$48M) | Brand-side counterfeit takedowns, post-hoc; not a buyer co-pilot |

**The one-sentence moat:** *"Giants do agentic checkout for trusted catalogs. Coupon tools do prices with no trust. Scam tools do verdicts with no outcome. Auntie is the only one doing **trust-first verdict + a better-deal redirect, inside live/social commerce, built for SEA's messy informal sellers** — and the redirect is how we make money."*

---

## 4. Revenue model (why this is a business, not a hackathon toy)
- **Affiliate / commission on the redirect.** When Auntie routes a shopper from a sketchy seller to a cheaper, verified one, it earns a cut — exactly how Honey, Capital One Shopping, Rakuten monetize, except *trust-first and for live/social*. The verdict is the wedge; the redirect is the revenue.
- **Future B2B/API:** the same verdict engine sells to marketplaces (scam reduction), and ships as an MCP/API that **AI shopping agents** call before checkout (the agentic-commerce bridge).
- **Consumer doesn't pay → that's fine.** Like Honey, the user gets it free; you earn on the transaction you improve. This is what makes a *consumer* co-pilot viable despite "shoppers won't pay."

---

## 5. Architecture

```
LIVESTREAM (TikTok / Shopee / IG / YouTube live haul) on screen
        │
   [ SEE ]  user snips/highlights product  ──►  Vision model (Claude vision)
        │                                          → product name + attributes
        ▼
   [ JUDGE ]  fire in parallel:
        ├─ APIFY:  seller's posts+captions, the video's comments (buyer voice),
        │          OTHER sellers of same product (search mode), seller store page
        ├─ EXA:    price comparables · independent mentions/complaints ·
        │          claim verification · review provenance
        └─ HARD:   WHOIS domain age · TLS · registry match (ACRA/SSM)
                          │
                  Reasoning (OpenRouter → strong model): per-signal verdict + evidence
                          │
                  Deterministic scorer (code): fuse → TRUST / CAUTION / AVOID + confidence
        │
        ▼
   [ BEAT ]  product → comparable verified listings (Exa/marketplace search)
                          → cheapest + safest match → affiliate redirect link
        │
        ▼
   OVERLAY renders: verdict card + receipts + "better deal" CTA   (the Cluely-style co-pilot UI)
                    + JSON view (the agent bridge)
```

**Two design rules that keep it from being a hack:**
1. **Parallelize Apify + Exa** — never serialize; fire all, await all, reason once.
2. **LLM judges each claim; code computes the score** — reproducible, explainable receipts, not a vibe number.

> **Delivery vehicle, honest take:** the *real* product is a **Cluely-style desktop co-pilot** (Electron/Tauri, screen+audio capture, always-on-top overlay) for someone leaned-in watching a live haul on a laptop — that user is motivated enough to justify it (unlike the idle phone-swiper). **But do NOT burn 12 hours building Electron screen-capture.** For Saturday, the overlay is **demo-magic** (see §7).

---

## 6. The JUDGE engine — the six signals (this is the moat, not the pipeline)
Anyone can scrape+summarize. The defensible part is fusing these into a verdict that feels like a detective:

| # | Signal | Source | Why it's damning |
|---|---|---|---|
| 1 | Price anomaly | other sellers of same SKU | "64% below market median" is a number a judge *feels* |
| 2 | Claim divergence | this seller vs the crowd | a claim *nobody else makes* = strongest single tell |
| 3 | Buyer voice | comments (Apify) | real humans saying "never arrived" — the realest signal |
| 4 | Review provenance | Exa cross-web | reviews only on seller's own pages = fabricated |
| 5 | Script reuse | cross-account caption match | scam rings run identical scripts |
| 6 | Footprint/identity | WHOIS + registry + Exa | fresh domain, no registry, no independent presence |

Verdict rule: **conservative on AVOID** (≥2 RED), default ambiguous → CAUTION. A wrongly-accused legit seller kills credibility faster than a missed scam. *(Full Apify actor + Exa query detail is in doc `04_caveat_sup_build_spec.md`.)*

---

## 7. Tech stack & the build-real-vs-fake call

| Layer | Choice | Saturday status |
|---|---|---|
| Overlay shell | **Web mock** of a desktop/phone co-pilot (fake frame + livestream playing + overlay cards) | **FAKE** — do not build Electron screen-capture in 12h |
| SEE | snip a region → screenshot → **Claude vision** → product | **REAL** (nice interaction, buildable) |
| JUDGE | Apify (`clockworks/tiktok-scraper`, `…/tiktok-comments-scraper`, `apify/instagram-scraper`, `apify/website-content-crawler`) + Exa + OpenRouter reasoning + code scorer | **REAL** — the core, on 1 product / 2 sellers |
| BEAT | price comparison + cheaper-verified-seller link | **PRE-BAKED** on the planted product (concept is the pitch, one example is the demo) |
| Agent bridge | JSON view / thin MCP tool `auntie.check_seller` | REAL if time, else show the JSON |
| Frontend | tasteful overlay UI (Cleon workshop = design counts); numbers must POP | REAL |
| Cache | run Apify/Exa once, **demo off cached data** (TikTok frontends are volatile — never live-scrape on stage) | REAL |

**Why this split:** build what's *hard to believe* (the live verdict), fake what's *easy to believe* (the overlay shell, the redirect). Once the verdict is real and brutal, the judge believes the rest.

### Hour-by-hour (12h, solo/small team)
| Hours | Goal |
|---|---|
| **H0–1** | Repo + keys (Apify, Exa, OpenRouter, vision). Pick the product. Eyeball one scam + one clean seller so you *know* the evidence is there. |
| **H1–3** | Apify: pull seller posts/comments + ~10 other sellers of the product (search mode). **Cache to disk.** |
| **H3–5** | Exa: price comparables, complaints/independent mentions, claim verification, review provenance. Cache. |
| **H5–7** | Reasoning (OpenRouter): per-signal `{finding, verdict}` → deterministic scorer → TRUST/CAUTION/AVOID. Make receipts **specific + numeric**. |
| **H7–8.5** | SEE: snip→screenshot→Claude vision→product name, wired into JUDGE. |
| **H8.5–10** | Overlay UI: fake livestream frame + verdict cards assembling + the TRUST control for contrast. |
| **H10–11** | BEAT pre-baked reveal ("S$182, verified, link") + the JSON/agent toggle. Add one Bahasa/Manglish comment for SEA flavor. |
| **H11–12** | Wire demo to cached data (instant + reliable). Record 90s video. Rehearse pitch. |

---

## 8. The demo beat (90 seconds)
1. "Here's a TikTok live. This auntie's about to buy a Dyson Airwrap, S$299. Watch." → **snip the product.**
2. SEE identifies it → JUDGE assembles: PRICE 64% below market → CLAIM no one else makes → 31 buyer complaints → self-referential reviews → script on 3 fresh accounts → 6-day domain. **AVOID.** *(let it land)*
3. **BEAT:** "Same Airwrap, S$182, from a verified seller — one tap." *(this is the money moment)*
4. Snip a legit seller → **TRUST**, clean. The contrast.
5. **Toggle to JSON:** "Same verdict — a human reads the card; an AI shopping agent reads this and aborts before it buys."

---

## 9. Honest risks (say them before the judge)
1. **Demo lives or dies on one brutal example.** → pre-bake it + a backup; cache everything; never live-scrape on stage.
2. **The giants (Microsoft/OpenAI/Amazon).** → "they do trusted catalogs; we do the *untrusted stranger on a live*, with a trust layer they don't have and a channel they don't touch."
3. **Honey comparison.** → "Honey is coupons with no trust on clean listings, and it burned its users on attribution. We're trust-first, for live/social, transparent."
4. **Scope (you doubled the build).** → that's why BEAT is pre-baked and the overlay is a web mock. Protect the SEE+JUDGE core; cut ruthlessly.
5. **Crowd data is noisy/gameable.** → signal + consensus, not gospel; multi-signal fusion; improves with scale (the risk graph is the long-term moat).
6. **False positives / defamation.** → safe phrasing ("evidence suggests," "unverified," "high-risk"), never "scammer"; advisory + human-in-loop.
7. **Scraping legality/ToS.** → public data only, no login bypass, capped; jurisdiction-dependent (not legal advice). Be ready if asked.

---

## 10. The pitch (written out)
> "200 million people in Southeast Asia shop on TikTok and Shopee lives — buying from strangers, in seconds, under pressure. Microsoft, OpenAI and Amazon are all building AI to help you buy from sellers who are *already* trusted — Shopify stores, Etsy. **Nobody is helping the person buying from a stranger on a live.**
>
> Auntie is the co-pilot for that moment. You snip the product the seller is pushing, and Auntie tells you three things instantly: is this seller legit — judged by what real buyers across the web actually say; what the real market price is; and where to get the exact same thing cheaper and safer. We make money on that redirect.
>
> Today a shopper snips a product. Tomorrow their AI shopping agent calls the same verdict before it checks out — which is exactly where commerce is going: everyone's teaching agents to *pay*, nobody's giving them *judgment about who they're paying*.
>
> We start where the scams are worst and the giants won't go — Southeast Asian live commerce — and become the trust layer for the way the world is about to shop."

**Closing:** *"Everyone's building AI that helps you buy. We built the auntie who tells you not to."*

---

## 11. Name options (you asked for funny 😄)
- **AUNTIE** ⭐ — the SEA auntie who knows the real price and smells a scam. Funny, cultural, describes the product. *Lead pick.*
- **No Cap** — "cap" = lie; it's literally a cap-detector. Gen-Z, punchy.
- **Sus** — "this seller is sus." Short, memorable, maybe too generic.
- **Kiasu** — SEA "afraid to lose out"; the shopper who won't be cheated. Insider but perfect for the room.
- **Towkay** — Hokkien for "boss"; the one who knows the real deal.
- **Caveat** — serious-brand fallback (Latin "buyer beware"); use if you want gravitas over giggles.

> Pick AUNTIE for the room (a Singapore VC will *grin*), keep Caveat as the holding-company name if you ever raise.
