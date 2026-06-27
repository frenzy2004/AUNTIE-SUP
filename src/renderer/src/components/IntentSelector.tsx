import React from 'react';
import type { BuyerIntent } from '@shared/types';
import { INTENT_PROFILES } from '@shared/intents';

interface Props {
  value: BuyerIntent;
  onChange: (intent: BuyerIntent) => void;
}

const ORDER: BuyerIntent[] = ['authenticity', 'best_price', 'health_safety', 'warranty', 'seller_trust'];

export function IntentSelector({ value, onChange }: Props) {
  return (
    <div className="intent-selector" aria-label="Buyer intent">
      {ORDER.map(intent => {
        const profile = INTENT_PROFILES[intent];
        return (
          <button
            key={intent}
            type="button"
            className={`intent-chip ${value === intent ? 'active' : ''}`}
            onClick={() => onChange(intent)}
            title={profile.label}
          >
            {profile.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
