import { describe, expect, it } from 'vitest';
import type { Risk, Signal, SignalKey } from './types';
import { buildNextActions, sortSignalsForIntent, summarizeIntentVerdict } from './intents';

function sig(key: SignalKey, risk: Risk, finding = `${key} finding`): Signal {
  return { key, label: key, risk, confidence: 0.8, finding, receipts: [] };
}

describe('shared.intents', () => {
  it('orders authenticity verdicts by provenance before raw risk severity', () => {
    const ordered = sortSignalsForIntent([
      sig('price', 'RED'),
      sig('provenance', 'YELLOW'),
      sig('claims', 'RED')
    ], 'authenticity');

    expect(ordered.map(signal => signal.key)).toEqual(['provenance', 'claims', 'price']);
  });

  it('summarizes the strongest intent-relevant risk signal', () => {
    const summary = summarizeIntentVerdict('health_safety', [
      sig('price', 'RED', 'Price is unusually low'),
      sig('claims', 'YELLOW', 'FDA claim is unverified')
    ]);

    expect(summary).toContain('For health/safety');
    expect(summary).toContain('FDA claim is unverified');
  });

  it('builds practical next actions from beat and evidence source', () => {
    const actions = buildNextActions('best_price', 'CAUTION', [
      { ...sig('price', 'YELLOW'), sources: ['https://example.test/listing'] }
    ], {
      product: 'Test product',
      price: 'S$99',
      seller: 'Verified Store',
      url: 'https://example.test/verified',
      verified: true
    });

    expect(actions.map(action => action.kind)).toContain('compare');
    expect(actions.map(action => action.kind)).toContain('open_source');
  });
});
