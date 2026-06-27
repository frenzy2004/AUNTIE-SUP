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

function fakeTimestamp(i: number): string {
  // Sequential 00:0X timestamps so the feed reads like a real-time stream.
  const total = i + 1;
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function RiskFeed({ result, index, activeIntent }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showJson, setShowJson] = useState(false);
  const score = trustScore(result.signals);
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

  return (
    <div className="feed">
      {/* Product + seller header */}
      <div className="feed-product">
        <div className="feed-product-row">
          <div className="feed-product-name">{result.product.brand} · {result.product.name}</div>
          <span className="feed-model-badge">GPT-4o</span>
        </div>
        <div className="feed-product-seller">
          @{result.seller.handle} · {result.seller.platform} · {result.seller.accountAgeDays}d old
        </div>
      </div>

      <div className="feed-intent">
        <div className="feed-intent-label">For {intentProfile.label}</div>
        <div className="feed-intent-copy">{intentSummary}</div>
      </div>

      {result.triggerClaim && (
        <div className={`feed-trigger ${result.triggerClaim.risk}`}>
          <div className="feed-trigger-label">Triggered by live claim</div>
          <div className="feed-trigger-copy">"{result.triggerClaim.text}"</div>
        </div>
      )}

      {/* Stats block */}
      <div className="feed-stats">
        <div className="feed-stat">
          <div className="feed-stat-label">Risk signals</div>
          <div className="feed-stat-value">
            <span className={`feed-stat-num ${result.verdict}`}>
              {result.signals.filter(s => s.risk !== 'GREEN').length}
            </span>
            <span className="feed-stat-sub">/ {result.signals.length}</span>
          </div>
        </div>
        <div className="feed-stat">
          <div className="feed-stat-label">Trust Score</div>
          <div className="feed-stat-value">
            <span className={`feed-stat-num ${result.verdict}`}>{score}</span>
            <span className="feed-stat-sub">/10</span>
          </div>
        </div>
      </div>
      <div className={`feed-verdict ${result.verdict}`}>
        {result.verdict}
        <span className="feed-verdict-conf">
          {certaintyLabel(result.confidence)} · {Math.round(result.confidence * 100)}%
        </span>
      </div>

      {/* BEAT CTA */}
      {result.beat && result.verdict !== 'TRUST' && (
        <div className="feed-beat" onClick={openBeat} role="button">
          <div className="feed-beat-label">↪ Better deal</div>
          <div className="feed-beat-line">
            <strong>{result.beat.price}</strong> from {result.beat.seller}
            <span className="feed-beat-arrow">→</span>
          </div>
        </div>
      )}

      {safeNextActions.length > 0 && (
        <div className="feed-actions">
          {safeNextActions.map((action, i) => (
            <button
              key={`${action.kind}-${i}`}
              type="button"
              className="feed-action"
              onClick={() => {
                if (action.url) auntie.openExternal(action.url);
              }}
              title={action.url ? 'Open related evidence' : action.kind.replace('_', ' ')}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Timestamped detection feed */}
      <div className="feed-list">
        {ordered.map((s, i) => {
          const ts = fakeTimestamp(i);
          const key = `${result.generatedAt}-${s.key}`;
          const isOpen = expanded.has(key);
          return (
            <div key={key} className={`feed-row ${s.risk}`} onClick={() => toggle(key)}>
              <div className="feed-row-head">
                <span className="feed-ts">{ts}</span>
                {s.label && s.label.trim() && (
                  <span className="feed-row-label">("{s.label}"):</span>
                )}
                <span className={`feed-row-finding ${s.risk !== 'GREEN' ? 'quoted' : ''}`}>
                  {s.finding}
                </span>
              </div>
              {isOpen && s.receipts.length > 0 && (
                <ul className="feed-row-receipts">
                  {s.receipts.map((r, ri) => <li key={ri}>{r}</li>)}
                </ul>
              )}
              {s.sources && s.sources.length > 0 && (
                <div className="feed-row-sources">
                  {s.sources.slice(0, 4).map((url, si) => (
                    <a
                      key={si}
                      href={url}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
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

      {/* JSON toggle (agent-bridge view) */}
      <button className="json-toggle" onClick={() => setShowJson(v => !v)}>
        {showJson ? '↑ Hide' : '⌘'} view as agent JSON
      </button>
      {showJson && <pre className="json-view">{JSON.stringify(toAgentJson(result), null, 2)}</pre>}
    </div>
  );
}
