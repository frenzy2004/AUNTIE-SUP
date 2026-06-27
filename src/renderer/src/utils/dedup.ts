// Claim deduplication. Normalize text + Jaccard on token sets ≥ 0.4 within a
// rolling 3-minute window. Figure-aware: dollar amounts are kept as tokens so
// "$99" and "$199" don't collapse.

const WINDOW_MS = 3 * 60 * 1000;
const SIM_THRESHOLD = 0.4;

function normalize(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9$% ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(t: string): Set<string> {
  return new Set(normalize(t).split(' ').filter(x => x.length >= 3 || /[$%0-9]/.test(x)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export class ClaimDeduper {
  private seen: Array<{ tokens: Set<string>; at: number }> = [];

  isDuplicate(text: string): boolean {
    const now = Date.now();
    this.seen = this.seen.filter(s => now - s.at < WINDOW_MS);
    const t = tokens(text);
    return this.seen.some(s => jaccard(s.tokens, t) >= SIM_THRESHOLD);
  }

  add(text: string): void {
    this.seen.push({ tokens: tokens(text), at: Date.now() });
  }
}
