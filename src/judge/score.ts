// Deterministic fuser. Given six Signal verdicts, returns the overall verdict
// and a confidence score. No LLM in this layer — the rules are explicit and
// defendable in a pitch.

import type { Signal, Verdict, VerdictResult, ProductIdentity, SellerSummary, BetterDeal } from '../shared/types';
import { SCORING } from '../shared/config';

export function fuse(signals: Signal[]): { verdict: Verdict; confidence: number } {
  const reds = signals.filter(s => s.risk === 'RED').length;
  const yellows = signals.filter(s => s.risk === 'YELLOW').length;

  let verdict: Verdict;
  if (reds >= SCORING.redToAvoid) verdict = 'AVOID';
  else if (reds >= 1 || yellows >= SCORING.yellowToCaution) verdict = 'CAUTION';
  else verdict = 'TRUST';

  // Confidence: weighted mean of per-signal confidence, biased toward the
  // signals that contributed to the verdict.
  const contributing = signals.filter(s =>
    verdict === 'TRUST' ? s.risk === 'GREEN' : s.risk !== 'GREEN'
  );
  const pool = contributing.length > 0 ? contributing : signals;
  const meanConf =
    pool.reduce((sum, s) => sum + s.confidence, 0) / Math.max(1, pool.length);

  // Boost confidence when reds pile up — multiple independent red signals are
  // genuinely more compelling than one.
  const boost = verdict === 'AVOID' ? Math.min(0.15, (reds - SCORING.redToAvoid) * 0.05) : 0;
  return { verdict, confidence: Math.min(1, Math.max(0, meanConf + boost)) };
}

export function buildVerdictResult(
  signals: Signal[],
  product: ProductIdentity,
  seller: SellerSummary,
  beat?: BetterDeal
): VerdictResult {
  const { verdict, confidence } = fuse(signals);
  return {
    verdict,
    confidence,
    signals,
    product,
    seller,
    beat,
    generatedAt: Date.now()
  };
}
