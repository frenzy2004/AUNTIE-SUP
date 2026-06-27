/**
 * AUNTIE — offline scrape script.
 *
 *   pnpm scrape -- --url <tiktok-video-url> [--product "Dyson Airwrap"] [--brand Dyson] [--out <slug>]
 *
 * Reads OPENAI_API_KEY, APIFY_API_TOKEN, EXA_API_KEY from .env.
 *
 * Calls:
 *   - Apify clockworks/tiktok-scraper for the video + seller profile
 *   - Apify clockworks/tiktok-comments-scraper for buyer comments
 *   - Exa for cross-web price comparables, complaints, authorized-reseller checks
 *   - whois-json for the seller's external domain (if surfaced)
 *
 * Emits a CacheBlob to data/cache/<slug>.json. Run before the demo. The Electron
 * app reads from these blobs at runtime — Apify/Exa are NOT hit during the live
 * demo, only here.
 */

import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApifyClient } from 'apify-client';
import Exa from 'exa-js';
import whois from 'whois-json';
import type { CacheBlob } from '../src/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

interface Args {
  url: string;
  product?: string;
  brand?: string;
  out?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--url') args.url = argv[++i];
    else if (k === '--product') args.product = argv[++i];
    else if (k === '--brand') args.brand = argv[++i];
    else if (k === '--out') args.out = argv[++i];
  }
  if (!args.url) {
    console.error('Usage: pnpm scrape -- --url <tiktok-video-url> [--product "..."] [--brand "..."] [--out slug]');
    process.exit(1);
  }
  return args as Args;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function parsePrice(text: string): number | null {
  const m = text.match(/(?:S?\$|SGD|RM|MYR)\s*([0-9][0-9,.]*)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

function jaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length >= 4));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length >= 4));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}

async function main() {
  const args = parseArgs();
  const apifyToken = process.env.APIFY_API_TOKEN;
  const exaKey = process.env.EXA_API_KEY;
  if (!apifyToken) throw new Error('Set APIFY_API_TOKEN in .env');
  if (!exaKey) throw new Error('Set EXA_API_KEY in .env');

  const apify = new ApifyClient({ token: apifyToken });
  const exa = new Exa(exaKey);

  // ─── 1. TikTok video + seller profile ─────────────────────────────────
  console.log('[1/4] Apify: scraping TikTok video & seller...');
  const tiktokRun = await apify.actor('clockworks/tiktok-scraper').call({
    postURLs: [args.url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false
  });
  const { items: videoItems } = await apify.dataset(tiktokRun.defaultDatasetId).listItems();
  const video = (videoItems[0] ?? {}) as any;
  const sellerHandle: string = video.authorMeta?.name ?? video.authorMeta?.nickName ?? 'unknown';
  const sellerBio: string = video.authorMeta?.signature ?? '';
  const followers: number = video.authorMeta?.fans ?? 0;
  const totalPosts: number = video.authorMeta?.video ?? 0;

  // ─── 2. Comments ──────────────────────────────────────────────────────
  console.log('[2/4] Apify: scraping comments...');
  const commentsRun = await apify.actor('clockworks/tiktok-comments-scraper').call({
    postURLs: [args.url],
    commentsPerPost: 200
  });
  const { items: rawComments } = await apify.dataset(commentsRun.defaultDatasetId).listItems();
  const comments = rawComments.map(c => ({
    user: ((c as any).user?.uniqueId as string) ?? ((c as any).userName as string) ?? 'anon',
    text: ((c as any).text as string) ?? '',
    likes: ((c as any).diggCount as number) ?? 0
  }));
  const NEG = /\b(scam|fake|not original|never arrived|broke|broken|refund|don'?t buy|kena|tipu)\b/i;
  const POS = /\b(love|great|recommend|good|amazing|fast delivery)\b/i;
  const negative = comments.filter(c => NEG.test(c.text)).sort((a, b) => b.likes - a.likes);
  const positive = comments.filter(c => POS.test(c.text)).sort((a, b) => b.likes - a.likes);
  const neutralCount = comments.length - negative.length - positive.length;

  const negKeywords = {
    never_arrived: comments.filter(c => /never arrived/i.test(c.text)).length,
    fake: comments.filter(c => /\bfake\b/i.test(c.text)).length,
    scam: comments.filter(c => /\bscam\b/i.test(c.text)).length,
    broke: comments.filter(c => /\bbroke(n)?\b/i.test(c.text)).length,
    not_original: comments.filter(c => /not original/i.test(c.text)).length,
    no_refund: comments.filter(c => /no refund/i.test(c.text)).length
  };

  // ─── 3. Exa: price comparables + complaints + authorized resellers ────
  console.log('[3/4] Exa: gathering cross-web evidence...');
  const productName = args.product ?? video.text?.slice(0, 80) ?? 'unknown product';
  const brand = args.brand ?? '';
  const [priceResults, complaintsResults, brandResults] = await Promise.all([
    exa.search(`${productName} price Singapore retail`, { numResults: 10 }),
    exa.search(`${sellerHandle} scam OR fake OR complaint`, { numResults: 6 }),
    brand ? exa.search(`${brand} authorized reseller Singapore`, { numResults: 5 }) : Promise.resolve({ results: [] as any[] })
  ]);

  const marketPrices: number[] = [];
  const otherSellers: CacheBlob['other_sellers'] = [];
  for (const r of priceResults.results) {
    const p = parsePrice(`${r.title ?? ''} ${r.text ?? ''}`);
    if (p && p > 10) {
      marketPrices.push(p);
      otherSellers.push({
        name: r.title ?? 'Listing',
        price: `S$${p}`,
        verified: false,
        reviews: 0,
        url: r.url
      });
    }
  }
  const sellerPrice = parsePrice(video.text ?? '') ?? 0;
  const med = median(marketPrices);
  const deviationPct = med > 0 ? ((sellerPrice - med) / med) * 100 : 0;

  const similarComplaints = complaintsResults.results.map(r => ({
    source: new URL(r.url).hostname.replace(/^www\./, ''),
    text: (r.title ?? r.text ?? '').slice(0, 200),
    url: r.url
  }));

  const independentMentions = brandResults.results.length;
  const authorizedMatch = brandResults.results.some(r =>
    (r.text ?? '').toLowerCase().includes(sellerHandle.toLowerCase())
  );

  // ─── 4. Script reuse: search for the seller's own caption phrase ──────
  let identicalAccounts: CacheBlob['script_reuse']['identical_caption_accounts'] = [];
  const captionExcerpt = (video.text ?? '').slice(0, 120);
  if (captionExcerpt.length > 30) {
    const reuseResults = await exa.search(`"${captionExcerpt.slice(0, 60)}"`, { numResults: 8 });
    identicalAccounts = reuseResults.results
      .filter(r => !r.url.includes(sellerHandle))
      .slice(0, 5)
      .map(r => ({
        name: new URL(r.url).hostname.replace(/^www\./, ''),
        created: r.publishedDate ?? 'unknown',
        caption_similarity: jaccard(captionExcerpt, r.text ?? '')
      }))
      .filter(a => a.caption_similarity >= 0.3);
  }

  // ─── 5. WHOIS for any seller domain we surface from the bio ───────────
  let footprint: CacheBlob['footprint'] = {};
  const domainMatch = sellerBio.match(/([a-z0-9-]+\.(com|sg|my|co|net|shop))/i);
  if (domainMatch) {
    const domain = domainMatch[1].toLowerCase();
    try {
      const w = (await whois(domain)) as Record<string, string>;
      const created = w['creationDate'] || w['created'] || w['registered'];
      const ageDays = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000) : undefined;
      footprint = {
        domain,
        domain_age_days: ageDays,
        registrar: w['registrar'],
        registrant_country: w['registrantCountry'] || w['country'],
        whois_privacy: /privacy/i.test(JSON.stringify(w))
      };
    } catch {
      footprint = { domain };
    }
  }

  // ─── 6. Compose the CacheBlob ─────────────────────────────────────────
  const slug = args.out ?? `${slugify(productName)}-${slugify(sellerHandle)}`;
  const blob: CacheBlob = {
    schemaVersion: 1,
    scrapedAt: new Date().toISOString(),
    source: { url: args.url, platform: 'TikTok' },
    product: {
      name: productName,
      brand: brand || 'Unknown',
      category: 'Unknown'
    },
    seller: {
      handle: sellerHandle,
      platform: 'TikTok Shop',
      accountAgeDays: video.authorMeta?.createTime
        ? Math.floor((Date.now() - new Date(video.authorMeta.createTime * 1000).getTime()) / 86_400_000)
        : 0,
      followerCount: followers,
      totalPosts,
      bio: sellerBio
    },
    seller_claims: [],
    price_analysis: {
      seller_price_numeric: sellerPrice,
      market_prices: marketPrices,
      median_price: med,
      deviation_percent: Number(deviationPct.toFixed(1)),
      min_market_price: marketPrices.length ? Math.min(...marketPrices) : 0,
      max_market_price: marketPrices.length ? Math.max(...marketPrices) : 0,
      currency: 'S$'
    },
    other_sellers: otherSellers,
    comments: {
      total: comments.length,
      sample_negative: negative.slice(0, 10),
      sample_positive: positive.slice(0, 5),
      negative_count: negative.length,
      positive_count: positive.length,
      neutral_count: neutralCount,
      negative_keywords: negKeywords
    },
    cross_web: {
      independent_mentions: independentMentions,
      reviews_only_on_seller_page: independentMentions === 0,
      brand_authorized_reseller_list: authorizedMatch
        ? `${sellerHandle} appears in authorized reseller search results`
        : `${sellerHandle} NOT found in ${brand || 'brand'} authorized reseller search results`,
      similar_complaints_found: similarComplaints
    },
    script_reuse: {
      identical_caption_accounts: identicalAccounts,
      shared_caption_excerpt: captionExcerpt
    },
    footprint
  };

  // ─── Write ────────────────────────────────────────────────────────────
  const outDir = join(REPO_ROOT, 'data', 'cache');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${slug}.json`);
  await writeFile(outPath, JSON.stringify(blob, null, 2), 'utf8');

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('\n[done] →', outPath);
  console.log('   product:', blob.product.name);
  console.log('   seller:', `@${blob.seller.handle}`, `(${blob.seller.followerCount} followers, ${blob.seller.accountAgeDays}d old)`);
  console.log('   comments:', `${blob.comments.total} total · ${blob.comments.negative_count} negative · ${blob.comments.positive_count} positive`);
  console.log('   price:', `${blob.price_analysis.currency}${blob.price_analysis.seller_price_numeric} vs median ${blob.price_analysis.currency}${blob.price_analysis.median_price} (${blob.price_analysis.deviation_percent}%)`);
  console.log('   script reuse:', `${identicalAccounts.length} other sites match`);
  console.log('   footprint:', JSON.stringify(blob.footprint));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
