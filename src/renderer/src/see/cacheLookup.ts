// Fuzzy match an identified product against the pre-scraped data/cache/*.json
// blobs. The Saturday demo runs entirely off these — the data is real but
// captured offline so the demo never depends on a live scrape.

import type { CacheBlob, ProductIdentity } from '@shared/types';

// Vite glob import: pulls every cache JSON in at build time so we don't need
// fs access from the renderer.
const cacheModules = import.meta.glob<{ default: CacheBlob }>('../../../../data/cache/*.json', { eager: true });

const CACHE: CacheBlob[] = Object.values(cacheModules)
  .map(m => (m as { default: CacheBlob }).default)
  .filter((b): b is CacheBlob => !!b && !!b.product);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(t => t.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

export interface CacheMatch {
  blob: CacheBlob;
  score: number;
}

export function lookupProduct(identity: ProductIdentity, minScore = 0.35): CacheMatch | null {
  if (CACHE.length === 0) return null;
  const idTokens = tokenSet(`${identity.brand} ${identity.name}`);
  let best: CacheMatch | null = null;
  for (const blob of CACHE) {
    const blobTokens = tokenSet(`${blob.product.brand} ${blob.product.name}`);
    const score = jaccard(idTokens, blobTokens);
    if (!best || score > best.score) best = { blob, score };
  }
  if (!best || best.score < minScore) return null;
  return best;
}

export function allCachedProducts(): CacheBlob[] {
  return [...CACHE];
}
