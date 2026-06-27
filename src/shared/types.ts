// Core data shapes shared between main, preload, renderer, and the offline scrape script.

export type Risk = 'GREEN' | 'YELLOW' | 'RED';
export type Verdict = 'TRUST' | 'CAUTION' | 'AVOID';
export type BuyerIntent =
  | 'authenticity'
  | 'best_price'
  | 'health_safety'
  | 'warranty'
  | 'seller_trust';

export type ClaimCategory =
  | 'medical'
  | 'certification'
  | 'authenticity'
  | 'price'
  | 'scarcity'
  | 'offplatform'
  | 'puffery';

export interface Claim {
  id: string;
  text: string;
  category: ClaimCategory;
  timestamp: number;
  severity: 'low' | 'medium' | 'high';
}

export type SignalKey =
  | 'price'
  | 'claims'
  | 'comments'
  | 'provenance'
  | 'script'
  | 'footprint';

export interface IntentProfile {
  intent: BuyerIntent;
  label: string;
  shortLabel: string;
  modeLabel: string;
  watches: string[];
  bestFor: string;
  buyerQuestion: string;
  prioritySignals: SignalKey[];
}

export interface Signal {
  key: SignalKey;
  label: string;
  risk: Risk;
  confidence: number; // 0..1
  finding: string;    // one-line headline
  receipts: string[]; // bullet-point evidence chunks
  sources?: string[]; // optional source URLs
}

export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  signals: Signal[];
  product: ProductIdentity;
  seller: SellerSummary;
  beat?: BetterDeal;
  intent?: BuyerIntent;
  intentSummary?: string;
  triggerClaim?: TriggerClaim;
  nextActions?: NextAction[];
  generatedAt: number;
}

export interface ProductIdentity {
  name: string;
  brand: string;
  category: string;
  imageFingerprint?: string;
  visiblePrice?: string;
  visibleClaims?: string[];
}

export interface SellerSummary {
  handle: string;
  platform: string;
  accountAgeDays: number;
  followerCount: number;
  totalPosts: number;
  bio?: string;
}

export interface BetterDeal {
  product: string;
  price: string;
  seller: string;
  url: string;
  verified: boolean;
  savingsVsSeller?: string;
}

export interface NextAction {
  label: string;
  kind: 'ask_seller' | 'compare' | 'avoid' | 'verify' | 'open_source';
  url?: string;
}

export interface TriggerClaim {
  text: string;
  category: ClaimCategory;
  risk: Risk;
}

// What the offline scrape script writes to data/cache/<slug>.json.
export interface CacheBlob {
  schemaVersion: 1;
  scrapedAt: string;
  source: { url: string; platform: 'TikTok' | 'Shopee' | 'Instagram' | 'Other' };
  product: ProductIdentity;
  seller: SellerSummary;
  seller_claims: string[];
  price_analysis: {
    seller_price_numeric: number;
    market_prices: number[];
    median_price: number;
    deviation_percent: number;
    min_market_price: number;
    max_market_price: number;
    currency: string;
  };
  other_sellers: Array<{ name: string; price: string; verified: boolean; reviews: number; url?: string }>;
  comments: {
    total: number;
    sample_negative: Array<{ user: string; text: string; likes: number }>;
    sample_positive: Array<{ user: string; text: string; likes: number }>;
    negative_count: number;
    positive_count: number;
    neutral_count: number;
    negative_keywords: Record<string, number>;
  };
  cross_web: {
    independent_mentions: number;
    reviews_only_on_seller_page: boolean;
    brand_authorized_reseller_list?: string;
    similar_complaints_found: Array<{ source: string; text: string; url?: string }>;
  };
  script_reuse: {
    identical_caption_accounts: Array<{ name: string; created: string; caption_similarity: number }>;
    shared_caption_excerpt?: string;
  };
  footprint: {
    domain?: string;
    domain_age_days?: number;
    registrar?: string;
    registrant_country?: string;
    ssl_issuer?: string;
    acra_match?: boolean;
    whois_privacy?: boolean;
    independent_backlinks?: number;
  };
  // Optional pre-baked verified-seller redirect for BEAT.
  beat?: BetterDeal;
}

// Settings persisted via electron-store.
export interface AuntieSettings {
  openaiKey?: string;
  apifyToken?: string;
  exaKey?: string;
}

// The agent-bridge view of a verdict — what an LLM shopping agent would consume.
export interface AgentVerdict {
  verdict: Verdict;
  confidence: number;
  buyer_intent?: BuyerIntent;
  intent_summary?: string;
  trigger_claim?: TriggerClaim;
  product: ProductIdentity;
  seller_handle: string;
  reasons: Array<{ signal: SignalKey; risk: Risk; finding: string }>;
  recommendation: 'PROCEED' | 'REVIEW' | 'ABORT';
  next_actions?: string[];
  better_deal_url?: string;
}
