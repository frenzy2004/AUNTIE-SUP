# Passive Intent-Aware Trust Layer Build Spec

## Requirements Summary

Build AUNTIE from a reactive snip analyzer into a passive trust co-pilot for live/social commerce. The prototype should still rely on explicit user-controlled capture surfaces, but the product experience should feel passive: AUNTIE listens for risky commerce claims, nudges the user only when the risk is actionable, lets the user state shopping intent, and turns a snip into an evidence-backed trust verdict.

Target challenge framing:

> AUNTIE is a passive trust layer for live commerce. It watches claims, price cues, seller cues, and checkout pressure; then verifies the shopping moment against web evidence before the consumer commits.

## Current Codebase Anchors

- Overlay shell, app state, snip-result handling, listen toggle, and demo trigger are in `src/renderer/src/App.tsx`.
- Product identification is in `src/renderer/src/see/identify.ts`.
- Live evidence and verdict generation are in `src/renderer/src/judge/liveJudge.ts`.
- Claim keyword detection and GPT claim extraction are in `src/renderer/src/listen/extractClaims.ts`.
- Risk claim bullets are rendered in `src/renderer/src/components/ClaimsBullets.tsx`.
- Verdict feed, receipts, sources, better-deal CTA, and agent JSON are in `src/renderer/src/components/RiskFeed.tsx`.
- Shared verdict, signal, product, seller, claim, and settings types are in `src/shared/types.ts`.
- Keyword policy is in `src/shared/policy.ts`.
- Electron capture/listen IPC lives across `src/main/index.ts` and `src/preload/index.ts`.

## Product Principles

1. Be quiet by default; interrupt only on actionable trust risk.
2. Explain risk through receipts, not accusations.
3. Tie every verdict to buyer intent.
4. Keep capture user-controlled and visibly active.
5. Optimize for one polished end-to-end demo over broad automation.

## Decision Drivers

1. Judging fit: visible multimodal sponsor-tech use and strong fraud/trust relevance.
2. Demo reliability: deterministic enough to prove functionality under time pressure.
3. Product taste: passive, calm, low-noise UI that feels consumer-safe.

## Scope For Next Build

### In Scope

- Intent selector with 5 buyer intents:
  - Authenticity
  - Best price
  - Health/safety
  - Warranty
  - Seller trust
- Passive claim watch state while listening:
  - Detect risky phrases through existing keyword pre-filter.
  - Show a compact nudge when a meaningful claim appears.
  - Offer "Verify with snip" as the primary action.
- Intent-aware verdict copy:
  - Add one short "For your goal..." summary above verdict signals.
  - Reweight or reorder signal emphasis based on selected intent.
- Trust nudge / passive status UI:
  - Small status strip in the overlay body when claims are detected.
  - No modal, no marketing copy.
- Demo scenario hardening:
  - One reliable live-commerce story path: claim detected -> snip -> product identified -> web evidence -> verdict with receipts.
- Export/agent JSON should include buyer intent and recommendation rationale.

### Out Of Scope For This Iteration

- Fully automatic screen OCR.
- Browser extension.
- Persistent personal shopping memory.
- Background always-on recording.
- Marketplace account integration.
- Payment or checkout blocking.

## Proposed Data Model

Add to `src/shared/types.ts`:

```ts
export type BuyerIntent =
  | 'authenticity'
  | 'best_price'
  | 'health_safety'
  | 'warranty'
  | 'seller_trust';

export interface IntentProfile {
  intent: BuyerIntent;
  label: string;
  prioritySignals: SignalKey[];
  summaryVerb: string;
}
```

Extend `VerdictResult`:

```ts
intent?: BuyerIntent;
intentSummary?: string;
nextActions?: Array<{
  label: string;
  kind: 'ask_seller' | 'compare' | 'avoid' | 'verify' | 'open_source';
  url?: string;
}>;
```

Extend `AgentVerdict`:

```ts
buyer_intent?: BuyerIntent;
intent_summary?: string;
next_actions?: string[];
```

## UX Spec

### Default Overlay

Current empty state remains, but add a compact intent selector above or below actions.

Recommended layout:

- Header
- Action buttons
- Intent segmented chips
- Passive nudge area
- Feed body

Intent copy should be short:

- Authentic
- Price
- Safety
- Warranty
- Seller

### Listening / Passive Watch

When listening is active and keyword hits appear:

- Existing `ClaimsBullets` continues to show claim bullets.
- Add a `TrustNudge` component above the body:
  - "Risky claim detected"
  - one-line claim summary
  - category badge
  - button: "Verify"

The nudge should only appear for `RED` and `YELLOW` claims, not puffery.

### Snip Flow

When user clicks Snip product or Verify:

- Existing snip flow runs.
- Pending state says:
  - `identifying`: "Reading product and visible claims..."
  - `judging`: "Checking seller, price, and claims..."
- No-match and error states stay visible as currently fixed.

### Verdict Feed

At the top of each `RiskFeed` result, before stats:

```text
For authenticity: seller is not confirmed as authorized, and price is far below verified listings.
```

Then keep:

- Risk signals count
- Trust score
- Verdict
- Better deal CTA
- Receipts
- Sources

Signal ordering should prioritize intent-specific signals before generic risk ordering.

Intent priority mapping:

- Authenticity: `provenance`, `claims`, `footprint`, `price`
- Best price: `price`, `provenance`, `footprint`, `claims`
- Health/safety: `claims`, `provenance`, `comments`, `footprint`
- Warranty: `provenance`, `footprint`, `price`, `claims`
- Seller trust: `footprint`, `comments`, `script`, `provenance`

## Implementation Steps

### Step 1: Shared Intent Types And Policy

Files:

- `src/shared/types.ts`
- `src/shared/policy.ts` or new `src/shared/intents.ts`

Tasks:

- Add `BuyerIntent` and intent profile types.
- Add `INTENT_PROFILES` mapping from buyer intent to priority signals and display labels.
- Extend `VerdictResult` and `AgentVerdict` with optional intent fields.

Acceptance:

- TypeScript build passes.
- Existing verdicts without intent still render.

### Step 2: Intent Selector Component

Files:

- Add `src/renderer/src/components/IntentSelector.tsx`
- Edit `src/renderer/src/App.tsx`
- Edit `src/renderer/src/theme.css`

Tasks:

- Add `buyerIntent` state in `App`.
- Render segmented chip selector near the action bar.
- Use stable dimensions so chip text does not shift layout.
- Default intent: `authenticity`.

Acceptance:

- User can switch intent without opening settings.
- Selected intent is visibly active.
- Mobile-width overlay still fits without text overflow.

### Step 3: Passive Trust Nudge

Files:

- Add `src/renderer/src/components/TrustNudge.tsx`
- Edit `src/renderer/src/App.tsx`
- Edit `src/renderer/src/theme.css`

Tasks:

- Track latest actionable claim bullet in `App`.
- Render a compact nudge when a RED/YELLOW claim is pending or recently resolved.
- Nudge includes claim category, short quote, and `Verify` button.
- `Verify` calls `window.auntie.startSnip()`.
- Auto-clear nudge after successful verdict or when user starts a new snip.

Acceptance:

- With listening enabled, a risky claim creates a visible nudge.
- Puffery does not create a nudge.
- Verify button starts the existing snip flow.

### Step 4: Pass Intent Into Judge

Files:

- `src/renderer/src/App.tsx`
- `src/renderer/src/judge/liveJudge.ts`
- `src/shared/types.ts`

Tasks:

- Update `runLiveJudge` options to accept `intent`.
- Include intent in the reasoning prompt.
- Ask GPT to produce a concise `intentSummary`.
- Add deterministic fallback summary if GPT omits it.
- Return `intent`, `intentSummary`, and `nextActions`.

Acceptance:

- Existing demo trigger still works.
- Snip verdicts include selected intent.
- If GPT omits intent summary, UI still shows a fallback.

### Step 5: Intent-Aware RiskFeed

Files:

- `src/renderer/src/components/RiskFeed.tsx`
- `src/renderer/src/theme.css`

Tasks:

- Render `intentSummary` above stats.
- Sort signals using intent priority first, then risk severity.
- Add next action buttons below BEAT CTA when available.
- Include intent fields in agent JSON export.

Acceptance:

- Changing selected intent changes verdict emphasis/order in rendered result.
- Agent JSON includes `buyer_intent`, `intent_summary`, and `next_actions`.
- Sources still open externally.

### Step 6: Demo Scenario Hardening

Files:

- `src/renderer/src/App.tsx`
- Maybe `src/shared/config.ts`
- Maybe `src/shared/policy.ts`

Tasks:

- Add one deterministic demo shortcut/state that simulates a risky claim before running the current Dyson demo.
- Demo path should show:
  - claim bullet,
  - passive nudge,
  - selected intent,
  - verdict,
  - receipts,
  - better deal.
- Keep real API path intact.

Acceptance:

- `Alt+Shift+D` or a dev-only button can run a complete story without relying on livestream audio timing.
- Real snip/listen flows remain available.

### Step 7: Verification

Commands:

- `npm test`
- `npm run build`

Rendered validation:

- Load overlay with mocked Electron bridge.
- Verify empty state.
- Verify intent selector changes state.
- Verify risky claim creates nudge.
- Verify Verify button triggers snip handler.
- Verify no-match state is visible and no shimmer remains.
- Verify mocked verdict renders intent summary and reordered signals.

Manual Electron validation:

- `npm run dev`
- Start listening.
- Trigger claim text or speak claim.
- Snip product.
- Confirm verdict appears.

## Test Plan

### Unit / Pure Logic

- Intent priority sort function returns expected signal ordering.
- Fallback intent summary returns useful copy for each intent.
- Claim-to-nudge selection ignores GREEN/puffery and prefers RED over YELLOW.

### Component / Browser

- `IntentSelector` selected chip state.
- `TrustNudge` visible/hidden states.
- `RiskFeed` renders summary, next actions, receipts, and sources.

### Integration

- Snip result with unknown product renders no-match state.
- Snip result with API error renders error state.
- Snip result with mocked product and judge output renders verdict with buyer intent.

### Demo QA

- First viewport contains brand, actions, intent selector, and nudge/feed without overlap.
- No framework overlay.
- No relevant console errors.
- Screenshot evidence for:
  - passive nudge,
  - verdict with intent summary,
  - expanded receipts.

## Risks And Mitigations

### Risk: Passive UX feels noisy

Mitigation:

- Only show nudge for RED/YELLOW claim categories.
- Do not interrupt with modal.
- Keep the pill/overlay calm unless user expands.

### Risk: Intent feels fake if it only changes labels

Mitigation:

- Use intent to reorder signal emphasis and generate summary/next actions.
- Include intent in agent JSON.

### Risk: Demo depends on live APIs

Mitigation:

- Keep real API path, but add deterministic demo path for stage reliability.
- Mock browser validation around core UI states.

### Risk: Privacy concerns from passive listening

Mitigation:

- Keep listening explicitly toggled.
- Show visible listening indicator.
- Do not persist transcript.
- Phrase as user-controlled passive watch, not always-on surveillance.

### Risk: Legal overclaiming

Mitigation:

- Use evidence language: "risk signal", "unverified", "not found", "price anomaly".
- Avoid "definitely scam" or "guaranteed safe".

## Acceptance Criteria

- User can select a buyer intent before or during shopping.
- Listening detects a risky commercial claim and displays a passive nudge.
- Nudge can start the snip verification flow.
- Snip verification produces either a visible terminal state or an evidence-backed verdict.
- Verdict includes intent-aware summary.
- Verdict signals are ordered according to selected intent and risk.
- Receipts and sources remain visible and clickable.
- Agent JSON includes buyer intent and next-action fields.
- `npm test` and `npm run build` pass.
- Browser validation captures screenshots for nudge and verdict states.

## Recommended Implementation Order

1. Intent types and selector.
2. Trust nudge.
3. Intent-aware result model and judge prompt.
4. RiskFeed rendering and sorting.
5. Demo hardening.
6. Tests and browser QA.

This order gives visible product value early and avoids touching the live judge prompt until the UI has a stable contract.
