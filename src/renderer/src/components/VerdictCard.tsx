import React, { useState } from 'react';
import type { VerdictResult, AgentVerdict, SignalKey, Risk } from '@shared/types';

interface Props {
  result: VerdictResult;
}

function toAgentJson(r: VerdictResult): AgentVerdict {
  return {
    verdict: r.verdict,
    confidence: Number(r.confidence.toFixed(2)),
    product: r.product,
    seller_handle: r.seller.handle,
    reasons: r.signals
      .filter(s => s.risk !== 'GREEN')
      .map(s => ({ signal: s.key as SignalKey, risk: s.risk as Risk, finding: s.finding })),
    recommendation: r.verdict === 'AVOID' ? 'ABORT' : r.verdict === 'CAUTION' ? 'REVIEW' : 'PROCEED',
    better_deal_url: r.beat?.url
  };
}

export function VerdictCard({ result }: Props) {
  const [showJson, setShowJson] = useState(false);

  const openBeat = () => {
    if (result.beat?.url) window.auntie.openExternal(result.beat.url);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span className={`badge ${result.verdict}`}>{result.verdict}</span>
        <span className="card-confidence">
          {Math.round(result.confidence * 100)}% confidence
        </span>
      </div>

      <div>
        <div className="card-product">{result.product.brand} · {result.product.name}</div>
        <div className="card-seller">
          @{result.seller.handle} · {result.seller.platform} · {result.seller.accountAgeDays}d old
        </div>
      </div>

      <div>
        {result.signals.map(s => (
          <div key={s.key} className="signal-row">
            <span className={`signal-dot ${s.risk}`} />
            <div className="signal-body">
              <div className="signal-label">{s.label}</div>
              <div className="signal-finding">{s.finding}</div>
              {s.receipts.length > 0 && (
                <ul className="signal-receipts">
                  {s.receipts.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {result.beat && result.verdict !== 'TRUST' && (
        <div className="beat" onClick={openBeat} role="button">
          <div className="beat-label">↪ Better deal</div>
          <div className="beat-line">
            {result.beat.product} — <strong>{result.beat.price}</strong>
            <span className="beat-arrow">→</span>
          </div>
          <div className="beat-sub">
            from {result.beat.seller}{result.beat.verified ? ' · verified' : ''}
            {result.beat.savingsVsSeller ? ` · ${result.beat.savingsVsSeller}` : ''}
          </div>
        </div>
      )}

      <button className="json-toggle" onClick={() => setShowJson(v => !v)}>
        {showJson ? '↑ Hide' : '⌘'} view as agent JSON
      </button>
      {showJson && (
        <pre className="json-view">{JSON.stringify(toAgentJson(result), null, 2)}</pre>
      )}
    </div>
  );
}
