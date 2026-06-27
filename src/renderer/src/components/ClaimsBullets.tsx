import React, { useState } from 'react';
import type { ClaimCategory } from '@shared/types';

export interface ClaimBullet {
  id: string;
  utterance: string;
  category: ClaimCategory;
  risk: 'RED' | 'YELLOW' | 'GREEN';
  status: 'pending' | 'resolved';
}

interface Props {
  bullets: ClaimBullet[];
}

const VISIBLE_CAP = 8;

const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  medical: 'Medical',
  certification: 'Certification',
  authenticity: 'Authenticity',
  price: 'Price',
  scarcity: 'Scarcity',
  offplatform: 'Off-platform',
  puffery: 'Puffery'
};

// Trim utterance for a clean one-line bullet. Falls back to first ~70 chars.
function summarize(text: string): string {
  if (text.length <= 70) return text;
  return text.slice(0, 68).replace(/\s+\S*$/, '') + '…';
}

export function ClaimsBullets({ bullets }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  if (bullets.length === 0) return null;

  const total = bullets.length;
  const overflow = !collapsed && !expanded && total > VISIBLE_CAP;
  const visible = overflow ? bullets.slice(-VISIBLE_CAP) : bullets;
  const earlierCount = overflow ? total - VISIBLE_CAP : 0;

  return (
    <div className={`claims ${collapsed ? 'collapsed' : ''}`}>
      <div className="claims-head">
        <div className="claims-label">
          <span>Claims</span>
          <span className="claims-count">{total}</span>
        </div>
        <button
          type="button"
          className="claims-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand claims' : 'Collapse claims'}
          title={collapsed ? 'Expand claims' : 'Collapse claims'}
          onClick={() => setCollapsed(c => !c)}
        >
          <svg
            className="claims-toggle-chevron"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <>
          {overflow && (
            <button className="claims-more" onClick={() => setExpanded(true)}>
              +{earlierCount} earlier
            </button>
          )}
          <ul className="claims-list">
            {visible.map(b => (
              <li
                key={b.id}
                className={`claim-bullet ${b.risk} ${b.status}`}
                title={b.utterance}
              >
                <span className="claim-cat">("{CATEGORY_LABEL[b.category]}")</span>{' '}
                <span className="claim-text">{summarize(b.utterance)}</span>
                {b.status === 'pending' && <span className="claim-pending">verifying…</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
