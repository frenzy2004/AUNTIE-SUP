// Model IDs, scoring thresholds, and runtime knobs. One place to tune.

export const MODELS = {
  reasoning: 'gpt-4o',
  vision: 'gpt-4o',
  transcribe: 'gpt-4o-transcribe',
  claimExtract: 'gpt-4o-mini'
} as const;

export const SCORING = {
  // JUDGE deterministic fuser thresholds.
  redToAvoid: 2,            // 2+ RED signals → AVOID
  yellowToCaution: 2,       // 2+ YELLOW (with 0 RED) → CAUTION
  // Per-signal numeric thresholds.
  priceRedDeviationPct: -40,    // seller price <= -40% vs market median → RED
  priceYellowDeviationPct: -20, // -40% < dev <= -20% → YELLOW
  freshAccountDaysRed: 30,
  freshAccountDaysYellow: 90,
  scriptSimilarityRed: 0.85,
  scriptSimilarityYellow: 0.65,
  commentNegativeKeywordRedCount: 5,  // 5+ comments containing scam/fake/never-arrived
  commentNegativeKeywordYellowCount: 2,
  independentMentionsYellowMax: 2
} as const;

export const HOTKEYS = {
  toggleOverlay: 'Alt+Shift+A',
  snipProduct: 'Alt+Shift+S',
  toggleListen: 'Alt+Shift+L',
  // Stage safety net + dev shortcut: forces the demo verdict to render from
  // the first cached blob, bypassing GPT-4o Vision entirely. Useful when
  // wifi/OpenAI is flaky during the pitch.
  demoTrigger: 'Alt+Shift+D'
} as const;

export const WINDOW = {
  width: 380,
  marginRight: 24,
  // Collapsed pill pose — small floating chip in the top-right corner.
  pillSize: 64,
  pillMarginTop: 24
} as const;
