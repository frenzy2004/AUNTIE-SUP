# AUNTIE

**Trust-first co-pilot for SEA live commerce.** A transparent, always-on-top Electron overlay that watches a TikTok / Shopee / YouTube live shopping stream with you and, the moment a product is pushed, tells you:

1. is this seller legit?
2. what real evidence says about them on the web?
3. where to get the same thing cheaper from a verified retailer?

The Singapore-Malaysian auntie who knows the real price and smells a scam — as software.

---

## SEE → JUDGE → BEAT

- **SEE.** `Alt+Shift+S` freezes the screen and lets you drag a rectangle around the product. GPT-4o Vision identifies the exact item from the cropped PNG.
- **JUDGE.** Five parallel Exa searches gather real web evidence — keyword search restricted to SG/MY shopping domains for prices, neural search for multilingual scam-reputation (catches Bahasa *"kena tipu"*, *"tipu"*, *"palsu"* as well as English *"scam / fake"*), auto search for the brand's authorized-reseller list, neural search for independent reviews, exact-phrase claim verification. Prices are pre-extracted via currency-aware regex; scam mentions are pre-counted. The structured bundle goes to GPT-4o, which emits per-signal `Signal[]`. A deterministic fuser collapses those into a `TRUST / CAUTION / AVOID` verdict with a Trust Score (1-10).
- **BEAT.** When the verdict is anything but `TRUST`, the verdict card surfaces a "Better deal →" CTA linking to the verified retailer Exa surfaced. One click opens the safe alternative externally.

`Alt+Shift+L` toggles **LISTEN** — captures desktop audio, transcribes via OpenAI in 4-second chunks, runs a multilingual lexical pre-filter (60+ Bahasa / Singlish / Malay / English keywords across 7 risk categories), shows pending claim bullets instantly, then resolves each bullet's risk color when GPT confirms the category.

---

## Quickstart

You need:
- Node 20+ and npm (or pnpm)
- An OpenAI API key (Vision + Transcribe + Reasoning)
- An Exa API key (web evidence)

```bash
git clone https://github.com/frenzy2004/AUNTIE-SUP.git
cd AUNTIE-SUP

npm install

# Configure keys (or enter them in-app via the settings drawer)
cp .env.example .env
# fill OPENAI_API_KEY=... and EXA_API_KEY=...

npm run dev
```

The overlay anchors to the right edge of your primary display. If you don't see it, press `Alt+Shift+A` to toggle.

### Hotkeys

| Key | Action |
|---|---|
| `Alt+Shift+A` | Show / hide the overlay |
| `Alt+Shift+S` | Snip a product (drag region; `Esc` cancels) |
| `Alt+Shift+L` | Toggle LISTEN (transcript + claim bullets) |
| `Alt+Shift+D` | Demo trigger — runs the full live JUDGE on a known scam scenario without needing a snip |
| `›` button | Collapse the panel to a 64px floating pill (click pill to expand back) |

### Production build

```bash
npm run build
npm start
```

---

## File map

```
src/
├── main/index.ts             Electron main — window, hotkeys, tray, screen capture
├── preload/index.ts          contextBridge → window.auntie.*
├── shared/                   Types, policy excerpts, model IDs, scoring thresholds
└── renderer/
    ├── index.html            Overlay entry
    ├── snip.html             Snip region overlay entry
    └── src/
        ├── App.tsx
        ├── theme.css         iOS-glass + dense typography tokens
        ├── components/       RiskFeed, ClaimsBullets, TranscriptFeed, SettingsDrawer
        ├── see/              GPT-4o Vision product identification
        ├── judge/liveJudge.ts  Exa orchestration + structured GPT-4o reasoning
        ├── listen/           Desktop audio capture + transcription + claim extraction
        └── utils/dedup.ts    Jaccard-based claim deduper
```

---

## Architecture notes

- **Snip-on-frozen-screenshot.** Pressing `Alt+Shift+S` first captures the full screen, hides the overlay, then opens an opaque snip window backed by that frozen PNG. You drag on the static image; we crop from the same image. This sidesteps the YouTube "video goes blank when window loses focus" issue completely.
- **Two-stage claim extraction.** Lexical pre-filter is synchronous — keyword hits push pending bullets within ~50ms of a transcript chunk. GPT-4o claim extraction runs async and resolves each bullet to its final category color when the model returns.
- **Pre-structured Exa bundle.** Currency-aware regex extracts S$ / RM prices from price-comparable results into a typed array; scam-flavored keywords are pre-counted. GPT-4o reasons over real numbers, not raw text.
- **Honest gaps.** Without Apify, we can't actually scrape TikTok comments or do cross-account script matching. These show as explicit `"Not assessable from web evidence (would need TikTok scrape)"` rows with `GREEN` risk so they don't poison the verdict.

---

## Stack

Electron 33 · Vite 5 · React 19 · TypeScript 5 · `electron-vite` 2 · OpenAI Node SDK · `exa-js` · `electron-store`. Tests via Vitest (`npm test`).
