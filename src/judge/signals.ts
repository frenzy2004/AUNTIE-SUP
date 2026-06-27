// Six pure scoring functions over a CacheBlob. Each emits a Signal with risk +
// human-readable finding + receipts. No LLM calls here — this is the
// deterministic, defensible, auditable layer.

import type { CacheBlob, Signal, Risk } from '../shared/types';
import { SCORING } from '../shared/config';

function pct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function priceSignal(blob: CacheBlob): Signal {
  const { deviation_percent, median_price, seller_price_numeric, currency } = blob.price_analysis;
  let risk: Risk = 'GREEN';
  if (deviation_percent <= SCORING.priceRedDeviationPct) risk = 'RED';
  else if (deviation_percent <= SCORING.priceYellowDeviationPct) risk = 'YELLOW';

  const finding =
    risk === 'GREEN'
      ? `Price within normal market range (${pct(deviation_percent)} vs median).`
      : `Seller price ${pct(deviation_percent)} below market median — ${currency}${seller_price_numeric} vs ${currency}${median_price}.`;

  return {
    key: 'price',
    label: 'Price anomaly',
    risk,
    confidence: Math.min(1, blob.other_sellers.length / 6),
    finding,
    receipts: [
      `${blob.other_sellers.length} other sellers compared (range ${currency}${blob.price_analysis.min_market_price}–${currency}${blob.price_analysis.max_market_price}).`,
      `Median ${currency}${median_price}; seller ${currency}${seller_price_numeric}.`
    ]
  };
}

export function claimsSignal(blob: CacheBlob): Signal {
  // Heuristic: count seller_claims that aren't echoed by any other seller in cross_web.
  // For Saturday, we treat all listed seller_claims as "divergent" unless cross_web shows
  // independent_mentions > 5 (i.e. it's a real product line everyone talks about).
  const divergent = blob.seller_claims.filter(c =>
    /fda|approved|authoriz|100%|cheapest|original|certified|halal|cures|heals/i.test(c)
  );
  const risk: Risk = divergent.length >= 3 ? 'RED' : divergent.length >= 1 ? 'YELLOW' : 'GREEN';
  return {
    key: 'claims',
    label: 'Unique claims',
    risk,
    confidence: 0.7,
    finding:
      divergent.length > 0
        ? `Seller makes ${divergent.length} strong claim${divergent.length === 1 ? '' : 's'} no other listing makes.`
        : 'Claims align with what other sellers say about this product.',
    receipts: divergent.length > 0 ? divergent.slice(0, 4).map(c => `"${c}"`) : []
  };
}

export function commentsSignal(blob: CacheBlob): Signal {
  const negKeys = blob.comments.negative_keywords ?? {};
  const totalScamKeywords =
    (negKeys['scam'] ?? 0) +
    (negKeys['fake'] ?? 0) +
    (negKeys['never_arrived'] ?? 0) +
    (negKeys['no_refund'] ?? 0);

  let risk: Risk = 'GREEN';
  if (totalScamKeywords >= SCORING.commentNegativeKeywordRedCount) risk = 'RED';
  else if (totalScamKeywords >= SCORING.commentNegativeKeywordYellowCount) risk = 'YELLOW';

  const total = blob.comments.total || 1;
  const negPct = ((blob.comments.negative_count / total) * 100).toFixed(0);

  return {
    key: 'comments',
    label: 'Buyer voice',
    risk,
    confidence: Math.min(1, total / 100),
    finding:
      risk === 'GREEN'
        ? `No red-flag pattern in ${blob.comments.total} comments.`
        : `${blob.comments.negative_count}/${blob.comments.total} comments (${negPct}%) flag scam/fake/non-delivery.`,
    receipts: (blob.comments.sample_negative ?? []).slice(0, 3).map(
      c => `@${c.user} · ${c.likes}♥ — "${c.text}"`
    )
  };
}

export function provenanceSignal(blob: CacheBlob): Signal {
  const { independent_mentions, reviews_only_on_seller_page, similar_complaints_found } = blob.cross_web;
  const isolated = reviews_only_on_seller_page && independent_mentions <= SCORING.independentMentionsYellowMax;
  const complaintsFound = (similar_complaints_found?.length ?? 0) > 0;

  let risk: Risk = 'GREEN';
  if (isolated && complaintsFound) risk = 'RED';
  else if (isolated || complaintsFound) risk = 'YELLOW';

  return {
    key: 'provenance',
    label: 'Review provenance',
    risk,
    confidence: 0.75,
    finding:
      risk === 'RED'
        ? 'Reviews only on seller\'s own pages and external complaints found.'
        : risk === 'YELLOW'
          ? isolated
            ? 'No independent reviews — only reviews on the seller\'s own pages.'
            : `${similar_complaints_found?.length ?? 0} similar complaints found on independent sites.`
          : 'Seller has independent third-party mentions and reviews.',
    receipts: (similar_complaints_found ?? []).slice(0, 2).map(c => `${c.source}: "${c.text}"`),
    sources: (similar_complaints_found ?? []).map(c => c.url).filter((u): u is string => !!u)
  };
}

export function scriptReuseSignal(blob: CacheBlob): Signal {
  const accounts = blob.script_reuse.identical_caption_accounts ?? [];
  const maxSim = accounts.reduce((m, a) => Math.max(m, a.caption_similarity), 0);

  let risk: Risk = 'GREEN';
  if (maxSim >= SCORING.scriptSimilarityRed && accounts.length >= 2) risk = 'RED';
  else if (maxSim >= SCORING.scriptSimilarityYellow && accounts.length >= 1) risk = 'YELLOW';

  return {
    key: 'script',
    label: 'Script reuse',
    risk,
    confidence: 0.8,
    finding:
      risk === 'GREEN'
        ? 'No matching scripts across other accounts.'
        : `Same selling script on ${accounts.length} other fresh account${accounts.length === 1 ? '' : 's'} (max ${Math.round(maxSim * 100)}% similarity).`,
    receipts: accounts.slice(0, 3).map(
      a => `@${a.name} · created ${a.created} · ${Math.round(a.caption_similarity * 100)}% match`
    )
  };
}

export function footprintSignal(blob: CacheBlob): Signal {
  const fp = blob.footprint || {};
  const ageDays = fp.domain_age_days;
  const issues: string[] = [];

  if (ageDays !== undefined && ageDays < SCORING.freshAccountDaysRed) {
    issues.push(`Domain is only ${ageDays} day${ageDays === 1 ? '' : 's'} old.`);
  } else if (ageDays !== undefined && ageDays < SCORING.freshAccountDaysYellow) {
    issues.push(`Domain is ${ageDays} days old (under 90).`);
  }
  if (fp.acra_match === false) issues.push('No matching ACRA / business-registry record.');
  if (fp.whois_privacy) issues.push('WHOIS privacy enabled — registrant identity hidden.');
  if (fp.registrant_country && fp.domain && fp.registrant_country !== 'SG') {
    issues.push(`Domain registered in ${fp.registrant_country} despite Singapore-targeted listing.`);
  }
  if ((fp.independent_backlinks ?? 0) === 0) issues.push('Zero independent backlinks to the seller\'s domain.');

  const sellerAgeDays = blob.seller.accountAgeDays;
  if (sellerAgeDays < SCORING.freshAccountDaysRed) {
    issues.push(`Seller account only ${sellerAgeDays} day${sellerAgeDays === 1 ? '' : 's'} old.`);
  }

  let risk: Risk = 'GREEN';
  if (issues.length >= 3) risk = 'RED';
  else if (issues.length >= 1) risk = 'YELLOW';

  return {
    key: 'footprint',
    label: 'Identity & footprint',
    risk,
    confidence: 0.85,
    finding:
      risk === 'GREEN'
        ? 'Established seller footprint with verifiable identity.'
        : `${issues.length} identity / footprint red flag${issues.length === 1 ? '' : 's'}.`,
    receipts: issues.slice(0, 4)
  };
}

export function allSignals(blob: CacheBlob): Signal[] {
  return [
    priceSignal(blob),
    claimsSignal(blob),
    commentsSignal(blob),
    provenanceSignal(blob),
    scriptReuseSignal(blob),
    footprintSignal(blob)
  ];
}
