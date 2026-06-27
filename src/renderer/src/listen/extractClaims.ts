// 7-category commercial claim extractor. Lexical pre-filter first (cheap),
// only burn a GPT-4o-mini call when at least one category keyword hits.
// Puffery is the absence of keywords → correctly skipped.

import OpenAI from 'openai';
import type { Claim, ClaimCategory } from '@shared/types';
import { CLAIM_KEYWORDS } from '@shared/policy';
import { MODELS } from '@shared/config';

export function hitsAnyKeyword(text: string): ClaimCategory[] {
  const lc = text.toLowerCase();
  const hits = new Set<ClaimCategory>();
  for (const [cat, words] of Object.entries(CLAIM_KEYWORDS) as [ClaimCategory, string[]][]) {
    if (cat === 'puffery') continue;
    if (words.some(w => lc.includes(w))) hits.add(cat);
  }
  return [...hits];
}

// Coarse category → risk mapping for the bullet pre-color before GPT lands.
// Medical + off-platform are top-severity; the rest are policy-sensitive.
export function categoryToRisk(c: ClaimCategory): 'RED' | 'YELLOW' | 'GREEN' {
  if (c === 'medical' || c === 'offplatform') return 'RED';
  if (c === 'puffery') return 'GREEN';
  return 'YELLOW';
}

interface ExtractedClaim {
  text: string;
  category: ClaimCategory;
  severity: 'low' | 'medium' | 'high';
}

export async function extractClaims(utterance: string, openaiKey: string): Promise<Claim[]> {
  const categoriesHit = hitsAnyKeyword(utterance);
  if (categoriesHit.length === 0) return []; // pure puffery — no spend

  if (!openaiKey) {
    // No key? Emit a single low-confidence claim per keyword hit so the demo still shows life.
    return categoriesHit.map((cat, i) => ({
      id: `${Date.now()}-${i}`,
      text: utterance,
      category: cat,
      timestamp: Date.now(),
      severity: 'medium'
    }));
  }

  const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
  const sys = [
    'You extract risky COMMERCIAL claims from a live-shopping seller\'s speech.',
    'Categories:',
    '- medical: cures/treats/heals/FDA/clinical claims',
    '- certification: certified/halal/dermatologist-tested/authorized',
    '- authenticity: 100% original/genuine/not fake/authorized reseller',
    '- price: cheapest/lowest/% off/cheaper than market',
    '- scarcity: only N left / today only / subsidy / limited',
    '- offplatform: pay via WhatsApp / DM to order / bank transfer / Telegram',
    'IGNORE PUFFERY ("best", "amazing", "you\'ll love it") — do not emit those.',
    `Likely categories present in this utterance: ${categoriesHit.join(', ')}`,
    'Respond as JSON: { "claims": [ { "text": string, "category": string, "severity": "low"|"medium"|"high" } ] }.'
  ].join('\n');

  try {
    const res = await client.chat.completions.create({
      model: MODELS.claimExtract,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: utterance }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 400
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content) as { claims?: ExtractedClaim[] };
    return (parsed.claims ?? []).map((c, i) => ({
      id: `${Date.now()}-${i}`,
      text: c.text,
      category: c.category,
      timestamp: Date.now(),
      severity: c.severity ?? 'medium'
    }));
  } catch (err) {
    console.warn('[extractClaims] fallback to keyword hits', err);
    return categoriesHit.map((cat, i) => ({
      id: `${Date.now()}-${i}`,
      text: utterance,
      category: cat,
      timestamp: Date.now(),
      severity: 'medium'
    }));
  }
}
