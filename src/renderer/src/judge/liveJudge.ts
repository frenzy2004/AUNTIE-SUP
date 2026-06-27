// Live JUDGE — accurate Exa evidence + structured GPT-4o reasoning.
//
// Flow per snip:
//   1. Identified product (from GPT-4o Vision) + optional visible seller.
//   2. Five parallel Exa searches, each tuned to its signal:
//       - PRICE       keyword + includeDomains=SG/MY shopping → real listings only
//       - RESELLER    auto search on brand's authorized list
//       - SCAM REPUTATION  neural search (semantic — catches "kena tipu" not just "scam")
//       - REVIEWS     neural search excluding the seller's own pages
//       - CLAIM       exact-phrase search on the visible claim
//   3. Pre-extract prices via currency regex BEFORE GPT — so it reasons over
//      real numbers, not snippet prose.
//   4. One GPT-4o call over the structured bundle → per-signal Signal[].
//   5. Deterministic fuser → verdict.

import Exa from 'exa-js';
import OpenAI from 'openai';
import type {
  BuyerIntent,
  NextAction,
  Signal,
  Risk,
  ProductIdentity,
  SellerSummary,
  VerdictResult,
  BetterDeal
} from '@shared/types';
import { MODELS } from '@shared/config';
import {
  DEFAULT_BUYER_INTENT,
  INTENT_PROFILES,
  buildNextActions,
  summarizeIntentVerdict
} from '@shared/intents';
import { fuse } from '@judge/score';

// Curated SG + MY shopping/retail domains. Price comparables MUST come from
// listings — not blog articles. Includes marketplace + brand-direct + chain
// retailers. Easy to extend.
const SG_MY_SHOPPING_DOMAINS = [
  // SG marketplaces
  'shopee.sg', 'lazada.sg', 'amazon.sg', 'qoo10.sg', 'carousell.sg',
  // SG chain retailers
  'fairprice.com.sg', 'best-denki.com.sg', 'courts.com.sg', 'harveynorman.com.sg',
  'tangs.com', 'megatech.com.sg', 'metro.com.sg', 'parisilk.com',
  // MY marketplaces
  'shopee.com.my', 'lazada.com.my',
  // MY chain retailers
  'lotuss.com.my', 'mydin.com.my', 'tesco.com.my', 'aeon.com.my',
  // Common brand-direct SG / MY
  'shop.dyson.com.sg', 'dyson.com.sg', 'apple.com/sg', 'samsung.com/sg', 'nestle.com.my'
];

interface ExaResultLite {
  title: string;
  url: string;
  text: string;
  publishedDate?: string;
  highlights?: string[];
  summary?: string;
}

interface PriceHit {
  url: string;
  domain: string;
  title: string;
  price: number;
  currency: 'SGD' | 'MYR';
}

interface ExaQueryBundle {
  priceComparables: ExaResultLite[];
  pricesExtracted: PriceHit[];
  marketStats: { median: number; min: number; max: number; currency: 'SGD' | 'MYR' } | null;
  authorizedResellers: ExaResultLite[];
  sellerReputation: ExaResultLite[];
  scamMentions: number;
  independentMentions: ExaResultLite[];
  claimVerification: ExaResultLite[];
}

const EXA_NUM_RESULTS = 4;

function compact(s: string, max = 600): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// Currency-aware price extraction. Pulls all prices visible in titles + text.
// SGD pattern: S$X / SGD X / $X (when context is SG)
// MYR pattern: RM X / MYR X
function extractPrices(results: ExaResultLite[]): PriceHit[] {
  const out: PriceHit[] = [];
  const sgPat = /(?:S\$|SGD|S\s*\$)\s*([0-9][\d,]*(?:\.\d{1,2})?)/gi;
  const myPat = /(?:RM|MYR)\s*([0-9][\d,]*(?:\.\d{1,2})?)/gi;
  for (const r of results) {
    const blob = `${r.title} ${r.text}`;
    const dom = domainOf(r.url);
    let m: RegExpExecArray | null;
    while ((m = sgPat.exec(blob)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (n >= 1 && n <= 100000) out.push({ url: r.url, domain: dom, title: r.title, price: n, currency: 'SGD' });
    }
    sgPat.lastIndex = 0;
    while ((m = myPat.exec(blob)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (n >= 1 && n <= 100000) out.push({ url: r.url, domain: dom, title: r.title, price: n, currency: 'MYR' });
    }
    myPat.lastIndex = 0;
  }
  return out;
}

function computeMarketStats(hits: PriceHit[]): ExaQueryBundle['marketStats'] {
  if (hits.length === 0) return null;
  // Use the dominant currency among hits.
  const sgd = hits.filter(h => h.currency === 'SGD');
  const myr = hits.filter(h => h.currency === 'MYR');
  const pool = sgd.length >= myr.length ? sgd : myr;
  const currency = sgd.length >= myr.length ? 'SGD' : 'MYR';
  if (pool.length === 0) return null;
  const prices = pool.map(p => p.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { median, min: prices[0], max: prices[prices.length - 1], currency };
}

// Count scam-flavored keywords in reputation results — both English and SEA.
function countScamMentions(results: ExaResultLite[]): number {
  const pat = /\b(scam|fake|fraud|kena tipu|kena cheat|got cheated|complaint|never arrived|don't buy|jangan beli|tipu|palsu|cuak)\b/gi;
  let n = 0;
  for (const r of results) {
    const m = `${r.title} ${r.text}`.match(pat);
    if (m) n += m.length;
  }
  return n;
}

async function runExaSearches(
  exaKey: string,
  product: ProductIdentity,
  sellerHandle?: string,
  visibleClaim?: string
): Promise<ExaQueryBundle> {
  const exa = new Exa(exaKey);
  const productQ = `${product.brand} ${product.name}`.trim();
  const brandQ = product.brand?.trim() || product.name;
  const sellerQ = sellerHandle?.trim();

  // 1. PRICE — keyword search, restricted to actual shopping sites. We want
  //    listings (with prices), not blog posts about prices.
  const priceQuery = exa.searchAndContents(productQ, {
    numResults: EXA_NUM_RESULTS + 2,
    type: 'keyword',
    includeDomains: SG_MY_SHOPPING_DOMAINS,
    text: { maxCharacters: 1200 } as any,
    summary: { query: `What is the listed price of "${productQ}" on this page?` } as any
  } as any).catch(err => { console.warn('[exa price] failed', err); return { results: [] as any[] }; });

  // 2. AUTHORIZED RESELLERS — auto search; Exa picks neural or keyword.
  const resellerQuery = exa.searchAndContents(`${brandQ} authorized retailers store list Singapore Malaysia`, {
    numResults: EXA_NUM_RESULTS,
    type: 'auto',
    text: { maxCharacters: 800 } as any
  } as any).catch(err => { console.warn('[exa reseller] failed', err); return { results: [] as any[] }; });

  // 3. SCAM REPUTATION — neural search catches "kena tipu / got cheated /
  //    package never arrived" semantically, not just literal "scam".
  const scamQ = sellerQ
    ? `${sellerQ} ${productQ} scam fake complaint`
    : `${productQ} scam fake complaint`;
  const scamQuery = exa.searchAndContents(scamQ, {
    numResults: EXA_NUM_RESULTS,
    type: 'neural',
    text: { maxCharacters: 1000 } as any
  } as any).catch(err => { console.warn('[exa scam] failed', err); return { results: [] as any[] }; });

  // 4. INDEPENDENT MENTIONS — neural search for reviews, excluding the seller
  //    pages themselves and the brand's own site (so we get THIRD-PARTY
  //    coverage: forums, blogs, review aggregators).
  const reviewQ = sellerQ ? `${sellerQ} reviews experience` : `${productQ} authentic review`;
  const reviewQuery = exa.searchAndContents(reviewQ, {
    numResults: EXA_NUM_RESULTS,
    type: 'neural',
    text: { maxCharacters: 800 } as any
  } as any).catch(err => { console.warn('[exa reviews] failed', err); return { results: [] as any[] }; });

  // 5. CLAIM VERIFICATION — exact-phrase keyword search on the visible claim
  //    if any; otherwise generic authenticity check.
  const claimQuery = visibleClaim
    ? exa.searchAndContents(`"${visibleClaim}"`, {
        numResults: EXA_NUM_RESULTS,
        type: 'keyword',
        text: { maxCharacters: 800 } as any
      } as any).catch(err => { console.warn('[exa claim] failed', err); return { results: [] as any[] }; })
    : exa.searchAndContents(`${productQ} ${product.brand} genuine official`, {
        numResults: EXA_NUM_RESULTS,
        type: 'auto',
        text: { maxCharacters: 800 } as any
      } as any).catch(err => { console.warn('[exa claim alt] failed', err); return { results: [] as any[] }; });

  const [price, resellers, reputation, mentions, claim] = await Promise.all([
    priceQuery, resellerQuery, scamQuery, reviewQuery, claimQuery
  ]);

  const toLite = (r: any): ExaResultLite => ({
    title: r.title ?? '',
    url: r.url,
    text: compact(r.text ?? ''),
    publishedDate: r.publishedDate ?? undefined,
    highlights: r.highlights,
    summary: r.summary
  });

  const lite = (r: { results?: any[] }): ExaResultLite[] => (r.results ?? []).map(toLite);

  const priceLite = lite(price);
  const pricesExtracted = extractPrices(priceLite);
  const marketStats = computeMarketStats(pricesExtracted);

  const reputationLite = lite(reputation);
  const scamMentions = countScamMentions(reputationLite);

  return {
    priceComparables: priceLite,
    pricesExtracted,
    marketStats,
    authorizedResellers: lite(resellers),
    sellerReputation: reputationLite,
    scamMentions,
    independentMentions: lite(mentions),
    claimVerification: lite(claim)
  };
}

interface ReasonOut {
  signals: Array<{
    key: 'price' | 'claims' | 'provenance' | 'footprint' | 'comments' | 'script';
    label: string;
    risk: Risk;
    finding: string;
    receipts: string[];
    confidence: number;
    sources: string[];
  }>;
  intentSummary?: string;
  nextActions?: NextAction[];
  beat?: BetterDeal;
}

function isNextActionKind(kind: unknown): kind is NextAction['kind'] {
  return kind === 'ask_seller' ||
    kind === 'compare' ||
    kind === 'avoid' ||
    kind === 'verify' ||
    kind === 'open_source';
}

function sanitizeNextActions(value: unknown): NextAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const actions = value.flatMap((action): NextAction[] => {
    if (!action || typeof action !== 'object') return [];
    const maybe = action as { label?: unknown; kind?: unknown; url?: unknown };
    if (typeof maybe.label !== 'string' || !maybe.label.trim()) return [];
    if (!isNextActionKind(maybe.kind)) return [];
    return [{
      label: maybe.label.trim(),
      kind: maybe.kind,
      url: typeof maybe.url === 'string' && /^https?:\/\//.test(maybe.url) ? maybe.url : undefined
    }];
  });
  return actions.length > 0 ? actions.slice(0, 3) : undefined;
}

async function reasonOverExa(
  openaiKey: string,
  product: ProductIdentity,
  sellerHandle: string | undefined,
  visiblePrice: string | undefined,
  bundle: ExaQueryBundle,
  intent: BuyerIntent
): Promise<ReasonOut> {
  const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
  const intentProfile = INTENT_PROFILES[intent];
  const sys = [
    'You are AUNTIE — a SEA shopping-safety auntie. You assess commerce risk from REAL web evidence.',
    'Input has been structured for you. Do NOT invent prices, URLs, or claims. Every receipt must quote a fact present in the bundle.',
    '',
    `Buyer intent: ${intentProfile.label}. Prioritize these signal categories when explaining the verdict: ${intentProfile.prioritySignals.join(', ')}.`,
    'Write `intentSummary` as one concise sentence beginning with "For <intent>:" and explain how the top evidence affects this buyer goal.',
    'Write `nextActions` as 1-3 practical buyer actions with labels only when useful. Use kinds: ask_seller, compare, avoid, verify, open_source. Include a URL only if it appears in the evidence bundle or beat.',
    '',
    'Categories you may emit (skip a category if not assessable — mark its risk GREEN with "Not assessable from web evidence (needs <X>)"):',
    '  price       — Compare visiblePrice with bundle.marketStats / bundle.pricesExtracted. RED if seller ≤ -40% vs median; YELLOW -20% to -40%; GREEN otherwise. Quote specific competitor prices + URLs in receipts.',
    '  claims      — Verify visible claims (e.g. "FDA approved", "halal certified") against bundle.claimVerification results. If no third-party source confirms the claim, mark YELLOW with the unverified claim quoted.',
    '  provenance  — Does the seller appear in bundle.authorizedResellers? If yes → GREEN. If named but NOT found → RED. If no seller info → GREEN with "no seller info".',
    '  footprint   — Use bundle.independentMentions count: 0 third-party mentions → YELLOW; complaints found in scamMentions → RED; healthy third-party presence → GREEN.',
    '  comments    — Always: "Not assessable from web evidence (would need TikTok comments scrape)". Risk GREEN.',
    '  script      — Always: "Not assessable from web evidence (would need cross-account caption match)". Risk GREEN.',
    '',
    'For each signal: REQUIRED 3-4 word Title-Case `label` (e.g. "Price anomaly"); risk RED|YELLOW|GREEN; one-line `finding` (≤140 chars) with concrete numbers/quotes; 2–4 `receipts` (each receipt must be a SPECIFIC fact + url or a quoted phrase); 1–4 `sources` (URLs from the bundle only). NEVER emit empty label, empty finding, or invented URLs.',
    '',
    'Emit a `beat` object IFF you can find a verified-seller listing for the same product at a sensible price in bundle.priceComparables: { product, price (string with currency), seller, url, verified: true, savingsVsSeller (text) }.',
    '',
    'Respond strict JSON: { "signals": [...], "intentSummary": string, "nextActions": [...], "beat": {...} | null }.'
  ].join('\n');

  const userPayload = {
    product,
    sellerHandle: sellerHandle ?? null,
    visiblePrice: visiblePrice ?? null,
    buyerIntent: intent,
    prioritySignals: intentProfile.prioritySignals,
    bundle
  };

  const res = await client.chat.completions.create({
    model: MODELS.reasoning,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(userPayload) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 1600
  });

  const content = res.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content);
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      intentSummary: typeof parsed.intentSummary === 'string' ? parsed.intentSummary : undefined,
      nextActions: sanitizeNextActions(parsed.nextActions),
      beat: parsed.beat ?? undefined
    };
  } catch (err) {
    console.error('[liveJudge] failed to parse GPT response', err, content);
    return { signals: [] };
  }
}

export async function runLiveJudge(opts: {
  product: ProductIdentity;
  sellerHandle?: string;
  intent?: BuyerIntent;
  openaiKey: string;
  exaKey: string;
}): Promise<VerdictResult> {
  const { product, sellerHandle, openaiKey, exaKey } = opts;
  const intent = opts.intent ?? DEFAULT_BUYER_INTENT;
  const visibleClaim = product.visibleClaims?.[0];
  const bundle = await runExaSearches(exaKey, product, sellerHandle, visibleClaim);
  const reasoned = await reasonOverExa(openaiKey, product, sellerHandle, product.visiblePrice, bundle, intent);

  const labels: Record<string, string> = {
    price: 'Price anomaly',
    claims: 'Verifiable claims',
    provenance: 'Authorized reseller',
    footprint: 'Independent footprint',
    comments: 'Buyer voice',
    script: 'Script reuse'
  };

  const signals: Signal[] = reasoned.signals.map(s => {
    const lbl = (s.label ?? '').trim();
    return {
      key: s.key,
      label: lbl || labels[s.key] || (s.key ? s.key.charAt(0).toUpperCase() + s.key.slice(1) : 'Signal'),
      risk: s.risk,
      confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
      finding: s.finding,
      receipts: Array.isArray(s.receipts) ? s.receipts : [],
      sources: Array.isArray(s.sources) ? s.sources : []
    };
  });

  const seller: SellerSummary = {
    handle: sellerHandle || 'unknown',
    platform: 'web',
    accountAgeDays: 0,
    followerCount: 0,
    totalPosts: 0
  };

  const { verdict, confidence } = fuse(signals);
  const intentSummary = reasoned.intentSummary?.trim() || summarizeIntentVerdict(intent, signals);
  const nextActions = reasoned.nextActions?.length
    ? reasoned.nextActions.slice(0, 3)
    : buildNextActions(intent, verdict, signals, reasoned.beat);

  return {
    verdict,
    confidence,
    signals,
    product,
    seller,
    intent,
    intentSummary,
    nextActions,
    beat: reasoned.beat,
    generatedAt: Date.now()
  };
}
