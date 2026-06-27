// Curated TikTok Shop + Shopee policy excerpts, mapped by claim category.
// Used by the LISTEN claim extractor and the JUDGE reasoner to ground verdicts
// in named platform rules rather than abstract "this seems sketchy" judgments.

import type { ClaimCategory } from './types';

export interface PolicyExcerpt {
  platform: 'TikTok Shop' | 'Shopee' | 'Both';
  reference: string;     // e.g. "TikTok Shop Content Policy — Exaggerated Effect"
  excerpt: string;       // 1-3 sentence summary in our own words
}

export const POLICY_BY_CATEGORY: Record<ClaimCategory, PolicyExcerpt[]> = {
  medical: [
    {
      platform: 'TikTok Shop',
      reference: 'TikTok Shop Content Policy — Unsubstantiated Health Claims',
      excerpt:
        'Sellers may not claim that a product cures, treats, prevents, or diagnoses a disease, ' +
        'or guarantees a medical outcome, without supporting evidence and required regulatory approvals.'
    },
    {
      platform: 'Shopee',
      reference: 'Shopee Prohibited & Restricted Items — Health Products',
      excerpt:
        'Therapeutic claims are restricted; products implying medical efficacy must show valid certification ' +
        'from the local regulator (HSA/SG, BPOM/ID, NPRA/MY).'
    }
  ],
  certification: [
    {
      platform: 'TikTok Shop',
      reference: 'TikTok Shop Content Policy — False Certifications',
      excerpt:
        'Sellers must not claim regulatory approval (FDA, HSA, halal, dermatologist-tested, ISO) ' +
        'without verifiable documentation. Misrepresenting certification status is a takedown trigger.'
    }
  ],
  authenticity: [
    {
      platform: 'Both',
      reference: 'TikTok Shop & Shopee — Intellectual Property / Authenticity',
      excerpt:
        'Selling counterfeit goods or falsely representing authorized-reseller status is prohibited and ' +
        'subject to immediate listing removal and account suspension.'
    }
  ],
  price: [
    {
      platform: 'TikTok Shop',
      reference: 'TikTok Shop Content Policy — Unsupported Price Comparisons',
      excerpt:
        'Claims like "cheapest" or "X% below market" require substantiated comparison data. ' +
        'Inconsistent or fabricated reference prices violate platform pricing-integrity rules.'
    }
  ],
  scarcity: [
    {
      platform: 'TikTok Shop',
      reference: 'TikTok Shop Content Policy — High-Pressure Selling Tactics',
      excerpt:
        'Fabricated scarcity ("only N left," "5 minutes left"), false government-subsidy claims, ' +
        'and other coercive urgency patterns are flagged as deceptive sales tactics.'
    }
  ],
  offplatform: [
    {
      platform: 'Both',
      reference: 'TikTok Shop & Shopee — Off-Platform Solicitation',
      excerpt:
        'Directing buyers to pay or transact off-platform (WhatsApp transfer, DM, bank transfer, Telegram) ' +
        'bypasses buyer protection and is a top-severity violation on both platforms.'
    }
  ],
  puffery: [
    {
      platform: 'Both',
      reference: 'Not a policy violation',
      excerpt:
        'Subjective opinion ("best," "amazing," "you\'ll love it") with no factual assertion. ' +
        'Allowed by both platforms. AUNTIE does not flag puffery.'
    }
  ]
};

// Keyword sets per category — cheap lexical pre-filter before spending a
// GPT-4o token on claim extraction. Includes SEA-language vocabulary
// (Bahasa Malay/Indonesian, Singlish, basic Mandarin transliteration) so
// the live ticker actually fires on real SEA livestreams, not just English.
export const CLAIM_KEYWORDS: Record<ClaimCategory, string[]> = {
  medical: [
    // English
    'fda', 'approved', 'clinically', 'cures', 'heals', 'treats', 'prevents',
    'doctor', 'dermatologist', 'medical', 'medicinal', 'therapeutic', 'cure',
    // Bahasa / SEA
    'ubat', 'doktor', 'rawat', 'sembuh', 'klinik', 'kesihatan', 'pakar',
    'diluluskan', 'kkm', 'npra', 'bpom', 'hsa'
  ],
  certification: [
    // English
    'certified', 'halal', 'organic', 'iso', 'genuine', 'authentic', 'authorized',
    'official', 'dermatologist tested', 'lab tested', 'haccp', 'gmp', 'sirim',
    // Bahasa / SEA
    'asli', 'tulen', 'rasmi', 'jakim', 'disahkan', 'pengesahan', 'lulus',
    'diperakui', 'bersertifikat', 'tanda halal'
  ],
  authenticity: [
    // English
    '100%', 'original', 'genuine', 'authentic', 'real', 'not fake', 'no fake',
    'authorized reseller', 'authorized dealer', 'directly from',
    // Bahasa / SEA
    'asli', 'tulen', 'bukan tiruan', 'bukan palsu', 'tidak palsu',
    'dari kilang', 'kilang langsung', 'sah', 'ori'
  ],
  price: [
    // English
    'cheapest', 'lowest', 'discount', 'off', 'compare', 'market price', 'retail',
    'rrp', 'wholesale', 'below market', 'cheaper than',
    // Bahasa / SEA
    'termurah', 'paling murah', 'murah', 'diskaun', 'diskon', 'potongan',
    'jimat', 'harga borong', 'rm ', 'mati harga', 'pasar'
  ],
  scarcity: [
    // English
    'only', 'left', 'limited', 'selling out', 'last chance', 'today only',
    'ending soon', 'flash sale', 'while stocks last', 'hurry', 'subsidy', 'subsidized',
    // Bahasa / SEA
    'habis', 'tinggal', 'sahaja', 'sekarang sahaja', 'sahaja hari ini',
    'buruan', 'stok terhad', 'terhad', 'cepat', 'sebelum habis', 'rebut',
    'last call', 'subsidi'
  ],
  offplatform: [
    // English
    'whatsapp', 'wa', 'dm', 'direct message', 'bank transfer', 'paynow',
    'pay me directly', 'telegram', 'cash', 'off app', 'off platform', 'wechat',
    // Bahasa / SEA / informal
    'wassap', 'wasap', 'maybank', 'cimb', 'duitnow', 'tng', 'touch n go',
    'tunai', 'cod', 'transfer terus', 'hubungi saya', 'message saya', 'pm saya'
  ],
  puffery: []
};
