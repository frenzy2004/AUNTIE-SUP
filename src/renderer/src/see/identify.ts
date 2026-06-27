// GPT-4o Vision wrapper. Takes a PNG data URL of the user's snip and returns
// a structured product identity that can be looked up against the cache.

import OpenAI from 'openai';
import type { ProductIdentity } from '@shared/types';
import { MODELS } from '@shared/config';

export async function identifyProduct(dataUrl: string, openaiKey: string): Promise<ProductIdentity | null> {
  if (!openaiKey) throw new Error('OpenAI API key required for SEE.');
  // dangerouslyAllowBrowser is required to use the OpenAI SDK from the renderer.
  // The key never leaves the user's machine and is read from electron-store.
  const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });

  const sys = [
    'You are AUNTIE Vision. You receive a screenshot snipped from a live shopping stream.',
    'Identify the single most prominent commercial product the seller is pushing in the image.',
    'Respond ONLY as JSON matching this schema:',
    '{ "name": string, "brand": string, "category": string, "visiblePrice": string|null, "visibleClaims": string[], "sellerHandle": string|null }',
    'Rules:',
    '- "name" is the specific product (e.g. "Dyson Airwrap Complete Long"), not a generic category.',
    '- "category" is short (e.g. "Hair Styling", "Skincare", "Electronics").',
    '- "visibleClaims" are any text claims visible on screen (e.g. "100% Original", "FDA approved").',
    '- If you cannot identify a product, return name="UNKNOWN".'
  ].join('\n');

  const res = await client.chat.completions.create({
    model: MODELS.vision,
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify the product the seller is selling in this screenshot.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 400
  });

  const content = res.choices[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as {
      name?: string;
      brand?: string;
      category?: string;
      visiblePrice?: string | null;
      visibleClaims?: string[];
      sellerHandle?: string | null;
    };
    if (!parsed.name || parsed.name === 'UNKNOWN') return null;
    return {
      name: parsed.name,
      brand: parsed.brand ?? 'Unknown',
      category: parsed.category ?? 'Unknown',
      visiblePrice: parsed.visiblePrice ?? undefined,
      visibleClaims: parsed.visibleClaims ?? []
    };
  } catch (err) {
    console.error('[identify] failed to parse vision response', err);
    return null;
  }
}
