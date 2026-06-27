import React from 'react';
import type { BuyerIntent } from '@shared/types';
import { INTENT_PROFILES } from '@shared/intents';

interface Props {
  intent: BuyerIntent;
  listening: boolean;
}

export function IntentBrief({ intent, listening }: Props) {
  const profile = INTENT_PROFILES[intent];

  return (
    <div className="intent-brief">
      <div className="intent-brief-head">
        <span className={`intent-brief-state ${listening ? 'live' : ''}`} />
        <span>{profile.modeLabel}</span>
      </div>
      <div className="intent-brief-question">{profile.buyerQuestion}</div>
      <div className="intent-brief-meta">
        <span>Watching: {profile.watches.join(', ')}</span>
        <span>Best for: {profile.bestFor}</span>
      </div>
    </div>
  );
}
