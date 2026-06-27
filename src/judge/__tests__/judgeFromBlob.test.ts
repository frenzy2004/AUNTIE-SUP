import { describe, expect, it } from 'vitest';
import type { CacheBlob } from '../../shared/types';
import { judgeFromBlob } from '../judgeFromBlob';

// A brutal, demo-calibrated blob (mirrors data/cache/dyson-... values so the
// deterministic scorer trips multiple REDs → AVOID). Hermetic: no file IO, no API.
const AVOID_BLOB: CacheBlob = {
  schemaVersion: 1,
  scrapedAt: '2026-06-27T00:00:00.000Z',
  source: { url: 'https://tiktok.test/x', platform: 'TikTok' },
  product: { name: 'Dyson Airwrap Complete Long', brand: 'Dyson', category: 'Hair Styling', visiblePrice: 'S$299' },
  seller: { handle: 'BeautyDeals_SG', platform: 'TikTok Shop', accountAgeDays: 6, followerCount: 342, totalPosts: 8 },
  seller_claims: ['100% Original Dyson', 'Cheapest in Singapore today only', 'FDA approved technology'],
  price_analysis: {
    seller_price_numeric: 299,
    market_prices: [699, 699, 649, 659, 679, 689, 655, 669, 695],
    median_price: 679,
    deviation_percent: -55.9,
    min_market_price: 649,
    max_market_price: 699,
    currency: 'S$'
  },
  other_sellers: [
    { name: 'Dyson Official Store', price: 'S$679', verified: true, reviews: 12400, url: 'https://shopee.sg/dyson' }
  ],
  comments: {
    total: 240,
    sample_negative: [
      { user: 'maria', text: 'never arrived, no reply', likes: 45 },
      { user: 'tan', text: 'FAKE box looks different', likes: 89 },
      { user: 'jane', text: 'Confirm scam la. I kena already', likes: 67 }
    ],
    sample_positive: [],
    negative_count: 31,
    positive_count: 48,
    neutral_count: 161,
    negative_keywords: { never_arrived: 8, fake: 12, scam: 7, broke: 4, not_original: 6, no_refund: 5 }
  },
  cross_web: {
    independent_mentions: 0,
    reviews_only_on_seller_page: true,
    similar_complaints_found: [{ source: 'HardwareZone', text: 'too cheap to be real', url: 'https://forums.test/x' }]
  },
  script_reuse: {
    identical_caption_accounts: [
      { name: 'BeautyDeals_MY', created: '2026-06-08', caption_similarity: 0.94 },
      { name: 'TechDeals_SG', created: '2026-06-10', caption_similarity: 0.91 }
    ],
    shared_caption_excerpt: 'CHEAPEST 100% ORIGINAL'
  },
  footprint: { domain: 'beautydeals-sg.com', domain_age_days: 6, whois_privacy: true, acra_match: false, independent_backlinks: 0 }
};

describe('judge.judgeFromBlob', () => {
  it('produces an AVOID with all six signals from a brutal cache blob', async () => {
    const result = await judgeFromBlob(AVOID_BLOB, { enrich: false });
    expect(result.verdict).toBe('AVOID');
    const keys = result.signals.map(s => s.key);
    expect(keys).toEqual(expect.arrayContaining(['price', 'claims', 'comments', 'provenance', 'script', 'footprint']));
    expect(keys.length).toBe(6);
    // The two signals the live path hardcodes GREEN are real here.
    expect(result.signals.find(s => s.key === 'comments')!.risk).toBe('RED');
    expect(result.signals.find(s => s.key === 'script')!.risk).toBe('RED');
  });

  it('respects enrich:false and never calls OpenAI (no key needed)', async () => {
    const result = await judgeFromBlob(AVOID_BLOB, { enrich: false });
    // Deterministic findings are present and non-empty for risk-bearing signals.
    const comments = result.signals.find(s => s.key === 'comments')!;
    expect(comments.finding.length).toBeGreaterThan(0);
    expect(comments.receipts.length).toBeGreaterThan(0);
    expect(result.intent).toBe('authenticity'); // default intent
    expect(result.intentSummary).toContain('For authenticity');
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('synthesizes a BEAT from other_sellers when no pre-baked beat is present', async () => {
    const result = await judgeFromBlob(AVOID_BLOB, { enrich: false });
    expect(result.beat).toBeDefined();
    expect(result.beat!.seller).toBe('Dyson Official Store');
    expect(result.beat!.url).toBe('https://shopee.sg/dyson');
    expect(result.beat!.verified).toBe(true);
    // Honest price-inversion framing (verified 679 > scammer 299).
    expect(result.beat!.savingsVsSeller).toContain('Pay S$380 more');
  });
});
