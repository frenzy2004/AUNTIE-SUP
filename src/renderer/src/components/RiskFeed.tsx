import React, { useState } from 'react';
import type { BuyerIntent, VerdictResult } from '@shared/types';
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
  const primaryAction = safeNextActions[0];
  const secondaryActions = safeNextActions.slice(1);

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

  const ordered = sortSignalsForIntent(result.signals, intent);
  const keySignals = ordered
    .filter(signal => signal.risk !== 'GREEN')
    .slice(0, 2);
  const visibleSignals = keySignals.length > 0 ? keySignals : ordered.slice(0, 2);

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
        <span>{intentProfile.label}</span>
        <p>{intentProfile.buyerQuestion}</p>
      </div>

      <div className="decision-section">
        <div className="decision-section-label">Why</div>
        <div className="reason-list">
          {visibleSignals.map(signal => (
            <div key={signal.key} className={`reason-item ${signal.risk}`}>
              <span>{riskLabel(signal.risk)}</span>
              <p>{signal.finding}</p>
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
          {certaintyLabel(result.confidence)} · {Math.round(result.confidence * 100)}% · {result.signals.filter(s => s.risk !== 'GREEN').length} risk signals
        </div>
        <div className="evidence-list">
          {ordered.map(signal => {
            const key = `${result.generatedAt}-${signal.key}`;
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
