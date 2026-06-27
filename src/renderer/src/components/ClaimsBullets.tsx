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
  if (bullets.length === 0) return null;

  const total = bullets.length;
  const overflow = !expanded && total > VISIBLE_CAP;
  const visible = overflow ? bullets.slice(-VISIBLE_CAP) : bullets;
  const earlierCount = overflow ? total - VISIBLE_CAP : 0;

  return (
    <div className="claims">
      <div className="claims-label">
        <span>Claims</span>
        <span className="claims-count">{total}</span>
      </div>
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
    </div>
  );
}
