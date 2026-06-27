// BEAT synthesis — derive a "better deal" redirect from a CacheBlob's
// other_sellers when no pre-baked `beat` is present.
//
// IMPORTANT — the price-inversion trap: in a scam scenario the seller is the
// CHEAPEST listing. The verified alternative costs MORE (e.g. S$299 scam vs
// S$679 official). So we must NOT emit a fake "−S$X savings" — that would be a
// lie. Instead we frame it honestly: you pay a little more for the real product
// plus a local warranty. The value is trust + recourse, not a discount.

import type { BetterDeal, CacheBlob } from '../shared/types';

// Parse a leading price out of a string like "S$679", "RM 199.90", "SGD 1200".
// Mirrors the currency-aware regex in scripts/scrape.ts so cache + scrape agree.
export function parsePrice(text: string): number | null {
  const m = text.match(/(?:S?\$|SGD|RM|MYR)\s*([0-9][0-9,.]*)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

export function synthesizeBeat(blob: CacheBlob): BetterDeal | undefined {
  // A pre-baked beat always wins (the scrape script or a hand-authored demo
  // blob may pin the exact redirect it wants to show).
  if (blob.beat) return blob.beat;

  // Otherwise, prefer the cheapest VERIFIED seller that has a clickable URL.
  const candidates = blob.other_sellers
    .filter(s => s.verified && s.url && /^https?:\/\//i.test(s.url))
    .map(s => ({ s, price: parsePrice(s.price) }))
    .filter((c): c is { s: typeof c.s; price: number } => c.price !== null);

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => a.price - b.price);
  const pick = candidates[0];

  // Honest framing: the scammer undercuts the real price, so the verified
  // listing is more expensive — the buyer is paying for the genuine article +
  // warranty, not "saving" money. Compute the delta against the seller's price.
  const sellerPrice = blob.price_analysis.seller_price_numeric;
  let savingsVsSeller: string | undefined;
  if (sellerPrice > 0) {
    const delta = pick.price - sellerPrice;
    const currency = blob.price_analysis.currency || 'S$';
    if (delta > 0) {
      savingsVsSeller = `Pay ${currency}${delta} more for the real product + local warranty`;
    } else if (delta < 0) {
      // Rare: verified seller is actually cheaper — a genuine saving.
      savingsVsSeller = `Save ${currency}${Math.abs(delta)} vs the seller, with warranty`;
    }
  }

  return {
    product: blob.product.name,
    price: pick.s.price,
    seller: pick.s.name,
    url: pick.s.url!,
    verified: true,
    savingsVsSeller
  };
}
