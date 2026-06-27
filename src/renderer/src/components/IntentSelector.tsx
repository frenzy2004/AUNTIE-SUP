import React from 'react';
import type { BuyerIntent } from '@shared/types';
import { INTENT_PROFILES } from '@shared/intents';

interface Props {
  value: BuyerIntent;
  onChange: (intent: BuyerIntent) => void;
}

const ORDER: BuyerIntent[] = ['authenticity', 'best_price', 'health_safety', 'warranty', 'seller_trust'];

export function IntentSelector({ value, onChange }: Props) {
  const activeIndex = ORDER.indexOf(value);
  const profile = INTENT_PROFILES[value];
  const previous = ORDER[(activeIndex - 1 + ORDER.length) % ORDER.length];
  const next = ORDER[(activeIndex + 1) % ORDER.length];

  const selectIntent = (direction: -1 | 1) => {
    const index = (activeIndex + direction + ORDER.length) % ORDER.length;
    onChange(ORDER[index]);
  };

  return (
    <div
      className="focus-control"
      role="group"
      aria-label="Buyer focus"
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault();
          selectIntent(-1);
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault();
          selectIntent(1);
        }
      }}
      tabIndex={0}
    >
      <label>Focus</label>
      <div className="focus-barrel" aria-live="polite">
        <button
          type="button"
          className="focus-spin"
          onClick={() => selectIntent(-1)}
          aria-label="Previous focus"
        >
          ^
        </button>
        <div className="focus-wheel" key={value}>
          <button type="button" className="focus-option prev" onClick={() => onChange(previous)}>
            {INTENT_PROFILES[previous].label}
          </button>
          <button type="button" className="focus-option active">
            {profile.label}
          </button>
          <button type="button" className="focus-option next" onClick={() => onChange(next)}>
            {INTENT_PROFILES[next].label}
          </button>
        </div>
        <button
          type="button"
          className="focus-spin"
          onClick={() => selectIntent(1)}
          aria-label="Next focus"
        >
          v
        </button>
      </div>
      <span
        className="focus-question"
        title={`${profile.buyerQuestion} Watches ${profile.watches.join(', ')}.`}
      >
        {profile.watches.join(' / ')}
      </span>
    </div>
  );
}
