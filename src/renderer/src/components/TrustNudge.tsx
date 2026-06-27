import React from 'react';
import type { BuyerIntent, ClaimCategory } from '@shared/types';
import { INTENT_PROFILES } from '@shared/intents';
import type { ClaimBullet } from './ClaimsBullets';

interface Props {
  claim: ClaimBullet;
  intent: BuyerIntent;
  onVerify: () => void;
  onDismiss: () => void;
}

const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  medical: 'Health claim',
  certification: 'Certification',
  authenticity: 'Authenticity',
  price: 'Price claim',
  scarcity: 'Urgency',
  offplatform: 'Off-platform',
  puffery: 'Puffery'
};

function summarize(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 88) return trimmed;
  return `${trimmed.slice(0, 86).replace(/\s+\S*$/, '')}...`;
}

export function TrustNudge({ claim, intent, onVerify, onDismiss }: Props) {
  const intentLabel = INTENT_PROFILES[intent].label.toLowerCase();

  return (
    <div className={`trust-nudge ${claim.risk}`}>
      <div className="trust-nudge-main">
        <div className="trust-nudge-meta">
          <span className="trust-nudge-dot" />
          <span>{CATEGORY_LABEL[claim.category]}</span>
          <span>for {intentLabel}</span>
        </div>
        <div className="trust-nudge-text">{summarize(claim.utterance)}</div>
      </div>
      <div className="trust-nudge-actions">
        <button type="button" className="trust-nudge-verify" onClick={onVerify}>
          Verify
        </button>
        <button
          type="button"
          className="trust-nudge-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss risk nudge"
        >
          x
        </button>
      </div>
    </div>
  );
}
