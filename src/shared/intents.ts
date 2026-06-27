import type {
  BetterDeal,
  BuyerIntent,
  IntentProfile,
  NextAction,
  Signal,
  SignalKey,
  Verdict
} from './types';

export const DEFAULT_BUYER_INTENT: BuyerIntent = 'authenticity';

export const INTENT_PROFILES: Record<BuyerIntent, IntentProfile> = {
  authenticity: {
    intent: 'authenticity',
    label: 'Authenticity',
    shortLabel: 'Authentic',
    prioritySignals: ['provenance', 'claims', 'footprint', 'price']
  },
  best_price: {
    intent: 'best_price',
    label: 'Best price',
    shortLabel: 'Price',
    prioritySignals: ['price', 'provenance', 'footprint', 'claims']
  },
  health_safety: {
    intent: 'health_safety',
    label: 'Health/safety',
    shortLabel: 'Safety',
    prioritySignals: ['claims', 'provenance', 'comments', 'footprint']
  },
  warranty: {
    intent: 'warranty',
    label: 'Warranty',
    shortLabel: 'Warranty',
    prioritySignals: ['provenance', 'footprint', 'price', 'claims']
  },
  seller_trust: {
    intent: 'seller_trust',
    label: 'Seller trust',
    shortLabel: 'Seller',
    prioritySignals: ['footprint', 'comments', 'script', 'provenance']
  }
};

const RISK_WEIGHT: Record<Signal['risk'], number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2
};

function intentWeight(intent: BuyerIntent, key: SignalKey): number {
  const index = INTENT_PROFILES[intent].prioritySignals.indexOf(key);
  return index === -1 ? 99 : index;
}

export function sortSignalsForIntent(signals: Signal[], intent: BuyerIntent): Signal[] {
  return [...signals].sort((a, b) => {
    const intentDiff = intentWeight(intent, a.key) - intentWeight(intent, b.key);
    if (intentDiff !== 0) return intentDiff;
    return RISK_WEIGHT[a.risk] - RISK_WEIGHT[b.risk];
  });
}

export function summarizeIntentVerdict(intent: BuyerIntent, signals: Signal[]): string {
  const profile = INTENT_PROFILES[intent];
  const ordered = sortSignalsForIntent(signals, intent);
  const riskSignal = ordered.find(signal => signal.risk !== 'GREEN') ?? ordered[0];

  if (!riskSignal) {
    return `For ${profile.label.toLowerCase()}: AUNTIE needs more evidence before giving a useful read.`;
  }

  const finding = riskSignal.finding.replace(/\s+/g, ' ').trim();
  const ending = finding.endsWith('.') ? finding : `${finding}.`;
  if (riskSignal.risk === 'GREEN') {
    return `For ${profile.label.toLowerCase()}: the strongest checked signal is reassuring. ${ending}`;
  }
  return `For ${profile.label.toLowerCase()}: this needs review. ${ending}`;
}

export function buildNextActions(
  intent: BuyerIntent,
  verdict: Verdict,
  signals: Signal[],
  beat?: BetterDeal
): NextAction[] {
  const actions: NextAction[] = [];
  const ordered = sortSignalsForIntent(signals, intent);
  const riskSignal = ordered.find(signal => signal.risk !== 'GREEN');
  const firstSource = riskSignal?.sources?.[0];

  if (verdict === 'AVOID') {
    actions.push({ label: 'Do not pay off-platform', kind: 'avoid' });
  }

  if (beat?.url) {
    actions.push({ label: `Compare ${beat.seller}`, kind: 'compare', url: beat.url });
  }

  if (firstSource) {
    actions.push({ label: 'Open evidence', kind: 'open_source', url: firstSource });
  }

  if (actions.length < 3) {
    const labelByIntent: Record<BuyerIntent, string> = {
      authenticity: 'Ask for proof of authenticity',
      best_price: 'Compare verified prices',
      health_safety: 'Ask for certification proof',
      warranty: 'Ask about warranty coverage',
      seller_trust: 'Check seller history'
    };
    actions.push({ label: labelByIntent[intent], kind: 'ask_seller' });
  }

  return actions.slice(0, 3);
}
