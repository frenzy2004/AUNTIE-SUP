// Optional GPT-4o pass that rewrites our deterministic per-signal findings into
// more natural, evidence-rich prose for the verdict card receipts.
// JUDGE works without this — it's an enrichment layer, not a dependency.

import OpenAI from 'openai';
import type { Signal } from '../shared/types';
import { MODELS } from '../shared/config';

export interface ReasonInput {
  signals: Signal[];
  productName: string;
  sellerHandle: string;
}

export async function enrichReceipts(input: ReasonInput, openaiKey: string): Promise<Signal[]> {
  if (!openaiKey) return input.signals;
  // dangerouslyAllowBrowser is required when this runs in the renderer (the
  // cache-driven demo path calls enrichReceipts from App.tsx). Without it the
  // SDK throws a browser-guard error that reason.ts swallows — so the GPT-4o
  // receipt-rewrite pass would silently never fire. Matches identify.ts / liveJudge.ts.
  const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });

  const prompt = [
    'You are AUNTIE, a SEA auntie who watches livestream haul videos and protects shoppers.',
    'You are NEVER preachy. You ARE direct, specific, numerical.',
    `Product: ${input.productName}`,
    `Seller: ${input.sellerHandle}`,
    'For each signal below, rewrite the `finding` field as ONE short, punchy sentence that quotes a specific number or fact from the receipts. Do not invent numbers. Do not soften.',
    '',
    'Signals:',
    JSON.stringify(input.signals.map(s => ({ key: s.key, risk: s.risk, finding: s.finding, receipts: s.receipts })), null, 2),
    '',
    'Respond as JSON: { "findings": [ { "key": "...", "finding": "..." } ] }.'
  ].join('\n');

  try {
    const res = await client.chat.completions.create({
      model: MODELS.reasoning,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return input.signals;
    const parsed = JSON.parse(content) as { findings?: Array<{ key: string; finding: string }> };
    const byKey = new Map((parsed.findings ?? []).map(f => [f.key, f.finding]));
    return input.signals.map(s => ({ ...s, finding: byKey.get(s.key) ?? s.finding }));
  } catch (err) {
    // If the network/API call fails, fall back to our deterministic findings.
    console.warn('[reason] enrichment failed; using deterministic findings.', err);
    return input.signals;
  }
}
