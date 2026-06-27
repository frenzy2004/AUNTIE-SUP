// Unified verdict entry point over a CacheBlob.
//
// This is the engine the demo runs on: take the offline-scraped (or
// hand-authored) evidence bundle, score it deterministically across all six
// signals (including buyer-voice + script-reuse, which the live Exa-only path
// cannot assess), optionally enrich the receipts with a GPT-4o prose pass,
// synthesize a BEAT redirect, and stamp the intent-aware summary + next
// actions so cache verdicts get the same treatment as live ones.

import type {
  BetterDeal,
  BuyerIntent,
  CacheBlob,
  NextAction,
  VerdictResult
} from '../shared/types';
import { allSignals } from './signals';
import { enrichReceipts } from './reason';
import { buildVerdictResult } from './score';
import { synthesizeBeat } from './beat';
import {
  DEFAULT_BUYER_INTENT,
  buildNextActions,
  summarizeIntentVerdict
} from '../shared/intents';

const ENRICH_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface JudgeFromBlobOpts {
  /** Run the GPT-4o receipt-rewrite pass. Defaults to true. Skipped silently if no openaiKey. */
  enrich?: boolean;
  /** Required for enrichment. Absent → deterministic findings only (still a full verdict). */
  openaiKey?: string;
  /** Buyer intent for the summary + next-actions + signal ordering. Defaults to authenticity. */
  intent?: BuyerIntent;
}

export async function judgeFromBlob(
  blob: CacheBlob,
  opts: JudgeFromBlobOpts = {}
): Promise<VerdictResult> {
  const intent = opts.intent ?? DEFAULT_BUYER_INTENT;
  const wantEnrich = opts.enrich !== false && !!opts.openaiKey;

  // 1. All six deterministic signals over the cache bundle.
  let signals = allSignals(blob);

  // 2. Optional GPT-4o prose enrichment. Falls back to deterministic findings
  //    on any failure (reason.ts already handles this).
  if (wantEnrich) {
    try {
      signals = await withTimeout(
        enrichReceipts(
          { signals, productName: blob.product.name, sellerHandle: blob.seller.handle },
          opts.openaiKey!
        ),
        ENRICH_TIMEOUT_MS,
        'Receipt enrichment'
      );
    } catch (err) {
      console.warn('[judgeFromBlob] enrichment skipped; using deterministic findings.', err);
    }
  }

  // 3. BEAT: prefer a pre-baked redirect, else synthesize from other_sellers.
  const beat: BetterDeal | undefined = blob.beat ?? synthesizeBeat(blob);

  // 4. Fuse → VerdictResult (stamps generatedAt = Date.now()).
  const result = buildVerdictResult(signals, blob.product, blob.seller, beat);

  // 5. Intent-aware decoration — deterministic, matches the live path's fallback.
  const intentSummary = summarizeIntentVerdict(intent, signals);
  const nextActions: NextAction[] = buildNextActions(intent, result.verdict, signals, beat).slice(0, 3);

  return { ...result, intent, intentSummary, nextActions };
}
