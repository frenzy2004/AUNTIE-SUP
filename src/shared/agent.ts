// The agent-bridge view of a verdict — what an AI shopping agent consumes
// before checkout. Single source of truth (previously duplicated in RiskFeed
// and the now-removed VerdictCard).

import type { AgentVerdict, Risk, SignalKey, VerdictResult } from './types';

export function toAgentJson(r: VerdictResult): AgentVerdict {
  return {
    verdict: r.verdict,
    confidence: Number(r.confidence.toFixed(2)),
    buyer_intent: r.intent,
    intent_summary: r.intentSummary,
    trigger_claim: r.triggerClaim,
    product: r.product,
    seller_handle: r.seller.handle,
    reasons: r.signals
      .filter(s => s.risk !== 'GREEN')
      .map(s => ({ signal: s.key as SignalKey, risk: s.risk as Risk, finding: s.finding })),
    recommendation: r.verdict === 'AVOID' ? 'ABORT' : r.verdict === 'CAUTION' ? 'REVIEW' : 'PROCEED',
    next_actions: r.nextActions?.map(action => action.label),
    better_deal_url: r.beat?.url
  };
}
