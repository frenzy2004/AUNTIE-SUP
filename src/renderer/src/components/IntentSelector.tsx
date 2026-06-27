import React from 'react';
import type { BuyerIntent } from '@shared/types';
import { INTENT_PROFILES } from '@shared/intents';

interface Props {
  value: BuyerIntent;
  onChange: (intent: BuyerIntent) => void;
}

const ORDER: BuyerIntent[] = ['authenticity', 'best_price', 'health_safety', 'warranty', 'seller_trust'];

export function IntentSelector({ value, onChange }: Props) {
  const profile = INTENT_PROFILES[value];

  return (
    <div className="focus-control">
      <label htmlFor="buyer-intent">Focus</label>
      <select
        id="buyer-intent"
        value={value}
        onChange={event => onChange(event.target.value as BuyerIntent)}
        title={profile.buyerQuestion}
      >
        {ORDER.map(intent => (
          <option key={intent} value={intent}>
            {INTENT_PROFILES[intent].label}
          </option>
        ))}
      </select>
      <span className="focus-question">{profile.buyerQuestion}</span>
    </div>
  );
}
