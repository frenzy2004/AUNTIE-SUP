import { describe, it, expect } from 'vitest';
import { fuse } from '../score';
import type { Signal, SignalKey, Risk } from '../../shared/types';

function sig(key: SignalKey, risk: Risk, confidence = 0.8): Signal {
  return { key, label: key, risk, confidence, finding: '', receipts: [] };
}

describe('judge.score.fuse', () => {
  it('returns TRUST when all signals are GREEN', () => {
    const signals: Signal[] = [
      sig('price', 'GREEN'),
      sig('claims', 'GREEN'),
      sig('comments', 'GREEN'),
      sig('provenance', 'GREEN'),
      sig('script', 'GREEN'),
      sig('footprint', 'GREEN')
    ];
    expect(fuse(signals).verdict).toBe('TRUST');
  });

  it('returns CAUTION on a single RED', () => {
    const signals: Signal[] = [
      sig('price', 'RED'),
      sig('claims', 'GREEN'),
      sig('comments', 'GREEN'),
      sig('provenance', 'GREEN'),
      sig('script', 'GREEN'),
      sig('footprint', 'GREEN')
    ];
    expect(fuse(signals).verdict).toBe('CAUTION');
  });

  it('returns CAUTION on 2 YELLOWs with no RED', () => {
    const signals: Signal[] = [
      sig('price', 'YELLOW'),
      sig('claims', 'YELLOW'),
      sig('comments', 'GREEN'),
      sig('provenance', 'GREEN'),
      sig('script', 'GREEN'),
      sig('footprint', 'GREEN')
    ];
    expect(fuse(signals).verdict).toBe('CAUTION');
  });

  it('returns AVOID on 2 REDs', () => {
    const signals: Signal[] = [
      sig('price', 'RED'),
      sig('claims', 'GREEN'),
      sig('comments', 'RED'),
      sig('provenance', 'GREEN'),
      sig('script', 'GREEN'),
      sig('footprint', 'GREEN')
    ];
    expect(fuse(signals).verdict).toBe('AVOID');
  });

  it('AVOID confidence climbs with more RED signals', () => {
    const twoReds: Signal[] = [
      sig('price', 'RED'),
      sig('comments', 'RED'),
      sig('claims', 'GREEN'),
      sig('provenance', 'GREEN'),
      sig('script', 'GREEN'),
      sig('footprint', 'GREEN')
    ];
    const fiveReds: Signal[] = [
      sig('price', 'RED'),
      sig('comments', 'RED'),
      sig('claims', 'RED'),
      sig('provenance', 'RED'),
      sig('script', 'RED'),
      sig('footprint', 'GREEN')
    ];
    const a = fuse(twoReds);
    const b = fuse(fiveReds);
    expect(b.verdict).toBe('AVOID');
    expect(b.confidence).toBeGreaterThanOrEqual(a.confidence);
  });
});
