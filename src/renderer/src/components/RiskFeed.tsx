import React, { useState } from 'react';
import type { BuyerIntent, Signal, SignalKey, VerdictResult } from '@shared/types';
import { toAgentJson } from '@shared/agent';
import {
  DEFAULT_BUYER_INTENT,
  INTENT_PROFILES,
  buildNextActions,
  sortSignalsForIntent,
  summarizeIntentVerdict
} from '@shared/intents';
import { auntie } from '../bridge';

interface Props {
  result: VerdictResult;
  index: number; // for the timestamp offset (older verdicts get earlier "times")
  activeIntent: BuyerIntent;
}

function trustScore(signals: VerdictResult['signals']): number {
  const reds = signals.filter(s => s.risk === 'RED').length;
  const yellows = signals.filter(s => s.risk === 'YELLOW').length;
  return Math.max(1, Math.min(10, 10 - 3 * reds - 1 * yellows));
}

function certaintyLabel(conf: number): string {
  if (conf >= 0.8) return 'HIGH certainty';
  if (conf >= 0.55) return 'MED certainty';
  return 'LOW certainty';
}

function decisionCopy(result: VerdictResult, score: number) {
  if (result.verdict === 'AVOID') {
    return {
      title: 'Do not buy yet',
      copy: 'The risk signals are strong enough to pause this purchase.',
      score: `${score}/10 trust`
    };
  }
  if (result.verdict === 'CAUTION') {
    return {
      title: 'Check before buying',
      copy: 'There is enough concern to ask for proof or compare alternatives.',
      score: `${score}/10 trust`
    };
  }
  return {
    title: 'Looks reasonable',
    copy: 'The checked evidence does not show a major trust issue.',
    score: `${score}/10 trust`
  };
}

function riskLabel(risk: VerdictResult['signals'][number]['risk']) {
  if (risk === 'RED') return 'High';
  if (risk === 'YELLOW') return 'Watch';
  return 'Clear';
}

interface FocusReason {
  label: string;
  signal: Signal;
  copy: string;
}

interface FocusLens {
  title: string;
  copy: string;
  reasons: FocusReason[];
}

interface FocusAction {
  label: string;
  url?: string;
}

function signalByKey(signals: Signal[], key: SignalKey): Signal | undefined {
  return signals.find(signal => signal.key === key);
}

function fallbackSignals(signals: Signal[], used: Set<SignalKey>, count: number): Signal[] {
  return signals
    .filter(signal => !used.has(signal.key))
    .slice(0, count);
}

function compactFinding(signal: Signal): string {
  return signal.finding.replace(/\s+/g, ' ').trim();
}

function normalizedFinding(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isGenericFinding(text: string): boolean {
  const normalized = normalizedFinding(text);
  return normalized.includes('no specific claims about the product are verified') ||
    normalized.includes('not assessable from web evidence') ||
    normalized.includes('needs tiktok comments scrape') ||
    normalized.includes('would need cross account caption match');
}

function signalUsefulness(signal: Signal): number {
  let score = signal.risk === 'RED' ? 30 : signal.risk === 'YELLOW' ? 20 : 10;
  if (signal.receipts.length > 0) score += 4;
  if ((signal.sources?.length ?? 0) > 0) score += 3;
  if (!isGenericFinding(signal.finding)) score += 8;
  return score;
}

function dedupeSignals(signals: Signal[]): Signal[] {
  const byKey = new Map<SignalKey, Signal>();
  const seenFindings = new Set<string>();

  for (const signal of signals) {
    const findingKey = normalizedFinding(signal.finding);
    if (seenFindings.has(findingKey) && isGenericFinding(signal.finding)) continue;
    seenFindings.add(findingKey);

    const existing = byKey.get(signal.key);
    if (!existing || signalUsefulness(signal) > signalUsefulness(existing)) {
      byKey.set(signal.key, signal);
    }
  }

  return [...byKey.values()];
}

function buildFocusLens(
  intent: BuyerIntent,
  ordered: Signal[],
  result: VerdictResult
): FocusLens {
  const used = new Set<SignalKey>();
  const pick = (key: SignalKey): Signal | undefined => {
    const signal = signalByKey(ordered, key);
    if (signal) used.add(signal.key);
    return signal;
  };
  const from = (label: string, key: SignalKey, copy?: string): FocusReason | null => {
    const signal = pick(key);
    if (!signal) return null;
    return { label, signal, copy: copy ?? compactFinding(signal) };
  };
  const withFallback = (lens: Omit<FocusLens, 'reasons'>, reasons: Array<FocusReason | null>): FocusLens => {
    const seen = new Set<string>();
    const primary = (reasons.filter(Boolean) as FocusReason[]).filter(reason => {
      const key = `${reason.signal.key}:${normalizedFinding(reason.copy)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const extra = fallbackSignals(ordered, used, 2 - primary.length).map(signal => ({
      label: riskLabel(signal.risk),
      signal,
      copy: compactFinding(signal)
    }));
    return { ...lens, reasons: [...primary, ...extra].slice(0, 2) };
  };

  if (intent === 'best_price') {
    return withFallback(
      {
        title: 'Price sanity',
        copy: result.beat
          ? `This view compares the deal against market price and verified alternatives like ${result.beat.seller}.`
          : 'This view looks for too-good-to-be-true pricing before seller reputation.'
      },
      [
        from('Price gap', 'price'),
        from('Alternative', 'provenance', result.beat
          ? `Verified option found: ${result.beat.price} from ${result.beat.seller}.`
          : undefined)
      ]
    );
  }

  if (intent === 'health_safety') {
    return withFallback(
      {
        title: 'Safety proof',
        copy: 'This view prioritizes medical, certification, and regulated-product claims over general deal quality.'
      },
      [
        from('Claims', 'claims'),
        from('Proof', 'provenance')
      ]
    );
  }

  if (intent === 'warranty') {
    return withFallback(
      {
        title: 'Warranty and recourse',
        copy: 'This view asks whether you can get help, return the item, or prove coverage if the product fails.'
      },
      [
        from('Recourse', 'footprint'),
        from('Official path', 'provenance')
      ]
    );
  }

  if (intent === 'seller_trust') {
    return withFallback(
      {
        title: 'Seller trust',
        copy: 'This view judges the seller behavior: footprint, buyer complaints, and repeated scripts.'
      },
      [
        from('Footprint', 'footprint'),
        from('Buyer voice', 'comments'),
        from('Script', 'script')
      ]
    );
  }

  return withFallback(
    {
      title: 'Authenticity proof',
      copy: 'This view checks whether the seller has proof the product is real, not just convincing sales claims.'
    },
    [
      from('Proof trail', 'provenance'),
      from('Claims', 'claims')
    ]
  );
}

function buildFocusAction(intent: BuyerIntent, result: VerdictResult): FocusAction {
  if (intent === 'best_price') {
    return result.beat?.url
      ? { label: `Compare ${result.beat.seller}`, url: result.beat.url }
      : { label: 'Compare verified prices' };
  }
  if (intent === 'health_safety') return { label: 'Ask for safety proof' };
  if (intent === 'warranty') return { label: 'Ask warranty terms' };
  if (intent === 'seller_trust') return { label: 'Check seller history' };
  return { label: 'Ask for authenticity proof' };
}

export function RiskFeed({ result, index, activeIntent }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showJson, setShowJson] = useState(false);
  const score = trustScore(result.signals);
  const decision = decisionCopy(result, score);
  const intent = activeIntent ?? result.intent ?? DEFAULT_BUYER_INTENT;
  const intentProfile = INTENT_PROFILES[intent];
  const isOriginalIntent = result.intent === intent;
  const intentSummary = isOriginalIntent && result.intentSummary
    ? result.intentSummary
    : summarizeIntentVerdict(intent, result.signals);
  const nextActions = isOriginalIntent && result.nextActions?.length
    ? result.nextActions
    : buildNextActions(intent, result.verdict, result.signals, result.beat);
  const safeNextActions = nextActions.filter(action => action.label && action.kind);
  const primaryAction = buildFocusAction(intent, result);
  const secondaryActions = safeNextActions;

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const openBeat = () => {
    if (result.beat?.url) auntie.openExternal(result.beat.url);
  };

  const ordered = dedupeSignals(sortSignalsForIntent(result.signals, intent));
  const focusLens = buildFocusLens(intent, ordered, result);
  const riskSignalCount = ordered.filter(signal => signal.risk !== 'GREEN').length;

  return (
    <section className={`decision-card ${result.verdict}`}>
      <div className="decision-head">
        <div className="decision-mark">
          <span>{result.verdict === 'AVOID' ? '!' : result.verdict === 'CAUTION' ? '?' : '✓'}</span>
        </div>
        <div className="decision-main">
          <div className="decision-title">{decision.title}</div>
          <div className="decision-copy">{decision.copy}</div>
        </div>
        <div className="decision-score">{decision.score}</div>
      </div>

      <div className="decision-context">
        <div className="decision-product">{result.product.brand} · {result.product.name}</div>
        <div className="decision-seller">@{result.seller.handle} · {result.seller.platform}</div>
      </div>

      {result.triggerClaim && (
        <div className={`decision-trigger ${result.triggerClaim.risk}`}>
          <span>Claim heard</span>
          <strong>"{result.triggerClaim.text}"</strong>
        </div>
      )}

      <div className="decision-lens">
        <span>{focusLens.title}</span>
        <p>{focusLens.copy}</p>
      </div>

      <div className="decision-section">
        <div className="decision-section-label">Why</div>
        <div className="reason-list">
          {focusLens.reasons.map((reason, reasonIndex) => (
            <div key={`${intent}-${reason.signal.key}-${reasonIndex}`} className={`reason-item ${reason.signal.risk}`}>
              <span>{reason.label}</span>
              <p>{reason.copy}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="decision-section">
        <div className="decision-section-label">Next</div>
        <div className="next-actions">
          {primaryAction && (
            <button
              type="button"
              className="next-primary"
              onClick={() => {
                if (primaryAction.url) auntie.openExternal(primaryAction.url);
              }}
            >
              {primaryAction.label}
            </button>
          )}
          <button
            type="button"
            className="next-secondary"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
          >
            Copy report
          </button>
        </div>
      </div>

      {result.beat && result.verdict !== 'TRUST' && (
        <button className="beat-strip" onClick={openBeat} type="button">
          <span>Better option</span>
          <span>
            <strong>{result.beat.price}</strong> from {result.beat.seller}
          </span>
        </button>
      )}

      <details className="read-more">
        <summary>Read more</summary>
        <div className="read-more-meta">
          {intentSummary}
        </div>
        {secondaryActions.length > 0 && (
          <div className="read-more-actions">
            {secondaryActions.map((action, i) => (
              <button
                key={`${action.kind}-${i}`}
                type="button"
                className="next-secondary"
                onClick={() => {
                  if (action.url) auntie.openExternal(action.url);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="read-more-meta">
          {certaintyLabel(result.confidence)} · {Math.round(result.confidence * 100)}% · {riskSignalCount} risk signals
        </div>
        <div className="evidence-list">
          {ordered.map((signal, signalIndex) => {
            const key = `${result.generatedAt}-${signal.key}-${signalIndex}`;
            const isOpen = expanded.has(key);
            return (
              <div key={key} className={`evidence-row ${signal.risk}`}>
                <button type="button" onClick={() => toggle(key)}>
                  <span>{signal.label}</span>
                  <strong>{signal.finding}</strong>
                </button>
                {isOpen && signal.receipts.length > 0 && (
                  <ul>
                    {signal.receipts.map((receipt, ri) => <li key={ri}>{receipt}</li>)}
                  </ul>
                )}
                {signal.sources && signal.sources.length > 0 && (
                  <div className="evidence-sources">
                    {signal.sources.slice(0, 4).map((url, si) => (
                      <a
                        key={si}
                        href={url}
                        onClick={event => {
                          event.preventDefault();
                          auntie.openExternal(url);
                        }}
                      >
                        Source {si + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="json-toggle" onClick={() => setShowJson(v => !v)}>
          {showJson ? 'Hide agent JSON' : 'View agent JSON'}
        </button>
        {showJson && <pre className="json-view">{JSON.stringify(toAgentJson(result), null, 2)}</pre>}
      </details>
    </section>
  );
}
