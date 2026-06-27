import { describe, expect, it } from 'vitest';
import type { CacheBlob } from '../../shared/types';
import { synthesizeBeat } from '../beat';

// Minimal valid CacheBlob; only the fields synthesizeBeat + price_analysis touch.
function blob(over: Partial<CacheBlob> = {}): CacheBlob {
  return {
    schemaVersion: 1,
    scrapedAt: '2026-06-27T00:00:00.000Z',
    source: { url: 'https://tiktok.test/x', platform: 'TikTok' },
    product: { name: 'Dyson Airwrap', brand: 'Dyson', category: 'Hair' },
    seller: { handle: 'Scammer', platform: 'TikTok Shop', accountAgeDays: 6, followerCount: 1, totalPosts: 1 },
    seller_claims: [],
    price_analysis: {
      seller_price_numeric: 299,
      market_prices: [679],
      median_price: 679,
      deviation_percent: -55.9,
      min_market_price: 649,
      max_market_price: 699,
      currency: 'S$'
    },
    other_sellers: [],
    comments: { total: 0, sample_negative: [], sample_positive: [], negative_count: 0, positive_count: 0, neutral_count: 0, negative_keywords: {} },
    cross_web: { independent_mentions: 0, reviews_only_on_seller_page: true, similar_complaints_found: [] },
    script_reuse: { identical_caption_accounts: [], shared_caption_excerpt: '' },
    footprint: {},
    ...over
  };
}

describe('judge.beat.synthesizeBeat', () => {
  it('returns a pre-baked beat unchanged when present', () => {
    const pre = {
      product: 'Dyson Airwrap', price: 'S$679', seller: 'Dyson Official',
      url: 'https://shopee.sg/dyson', verified: true, savingsVsSeller: 'real + warranty'
    };
    expect(synthesizeBeat(blob({ beat: pre }))).toEqual(pre);
  });

  it('picks the cheapest verified seller with a URL, with honest price-inversion framing', () => {
    // The scammer is S$299; verified sellers cost MORE. The deal must NOT claim
    // a fake saving — it should frame the delta as paying more for the real thing.
    const b = blob({
      other_sellers: [
        { name: 'Pricey Official', price: 'S$699', verified: true, reviews: 10, url: 'https://shop.test/699' },
        { name: 'Cheaper Official', price: 'S$649', verified: true, reviews: 5, url: 'https://shop.test/649' },
        { name: 'Unverified Shop', price: 'S$599', verified: false, reviews: 2, url: 'https://shop.test/599' }, // ignored
        { name: 'No URL Official', price: 'S$655', verified: true, reviews: 1 } // ignored (no url)
      ]
    });
    const beat = synthesizeBeat(b);
    expect(beat).toBeDefined();
    expect(beat!.seller).toBe('Cheaper Official');
    expect(beat!.price).toBe('S$649');
    expect(beat!.url).toBe('https://shop.test/649');
    expect(beat!.verified).toBe(true);
    // delta = 649 - 299 = 350 → honest "pay more" framing, never a fake saving.
    expect(beat!.savingsVsSeller).toContain('Pay S$350 more');
    expect(beat!.savingsVsSeller).toContain('warranty');
  });

  it('returns undefined when no verified seller has a clickable URL', () => {
    expect(synthesizeBeat(blob())).toBeUndefined();
    expect(synthesizeBeat(blob({
      other_sellers: [{ name: 'Only Unverified', price: 'S$599', verified: false, reviews: 1, url: 'https://shop.test' }]
    }))).toBeUndefined();
  });
});
