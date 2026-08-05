import { z } from 'zod'
import { addLocalDates } from '../dates'
import { compareCanonicalCodes } from '../ids'
import { ReviewHostPolicyV1Schema } from '../review-source-policy'
import {
  BuildIdSchema, CanonicalCodeSchema, ISOInstantSchema, LocalDateSchema,
  SenSchema, Sha256Schema, TransformVersionSchema
} from './common'
import { ExtendedSourceLockV1Schema, SourceLockV1Schema } from './source-lock'

export const RawTransactionRowSchema = z.object({
  date: z.unknown(), premise_code: z.unknown(), item_code: z.unknown(), price: z.unknown(),
  sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1)
}).passthrough()

export const RawPremiseRowSchema = z.object({
  premise_code: z.unknown(), premise: z.unknown(), address: z.unknown(),
  premise_type: z.unknown(), state: z.unknown(), district: z.unknown()
}).passthrough()

export const RawItemRowSchema = z.object({
  item_code: z.unknown(), item: z.unknown(), unit: z.unknown(),
  item_group: z.unknown().optional(), item_category: z.unknown().optional()
}).passthrough()

export type RawTransactionRow = z.infer<typeof RawTransactionRowSchema>
export type RawPremiseRow = z.infer<typeof RawPremiseRowSchema>
export type RawItemRow = z.infer<typeof RawItemRowSchema>

export const ReviewerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/)
export const ReviewReasonCodeSchema = z.enum([
  'name-match', 'address-match', 'entrance-match', 'no-closure-signal',
  'definition-specific', 'qualifier-agreement', 'quantity-mode-agreement',
  'quality-exclusion-confirmed', 'low-price-eligibility-confirmed',
  'name-mismatch', 'address-mismatch', 'coordinate-conflict', 'closure-signal',
  'restricted-source', 'insufficient-sources', 'insufficient-evidence',
  'definition-too-broad', 'qualifier-disagreement', 'quantity-mode-disagreement',
  'microzone-conflict'
])
export const APPROVED_PREMISE_REASON_CODES = [
  'name-match', 'address-match', 'entrance-match', 'no-closure-signal'
] as const
export const APPROVED_ITEM_REASON_CODES = [
  'definition-specific', 'qualifier-agreement', 'quantity-mode-agreement'
] as const
export const PREMISE_QUARANTINE_REASON_CODES = [
  'name-mismatch', 'address-mismatch', 'coordinate-conflict', 'closure-signal',
  'restricted-source', 'insufficient-sources', 'insufficient-evidence', 'microzone-conflict'
] as const
export const ITEM_QUARANTINE_REASON_CODES = [
  'insufficient-evidence', 'definition-too-broad', 'qualifier-disagreement', 'quantity-mode-disagreement'
] as const
export const RedistributionCodeSchema = z.enum(['cc-by-4.0', 'odbl-1.0', 'official-use-permitted', 'synthetic-cc0'])
export const AttributionCodeSchema = z.enum([
  'kpdn-official-record', 'official-retailer-locator', 'openstreetmap-contributors', 'synthetic-fixture'
])

const decodeReviewQueryKey = (rawKey: string): string | undefined => {
  let key = rawKey.replace(/\+/g, ' ')
  try {
    for (let pass = 0; pass < 5; pass += 1) {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    }
  } catch { return undefined }
  if (/%[0-9a-f]{2}/i.test(key) || !/^[A-Za-z0-9._~-]{1,64}$/.test(key)) return undefined
  return key.toLowerCase()
}

export const ReviewHttpsUrlSchema = z.string().url().regex(
  /^https:\/\/(?![^/?#]*@)[^/?#\s]+(?:[/?#][^\s]*)?$/i,
  'review sources must be credential-free HTTPS URLs'
).refine(value => !/\s/u.test(value), 'review source must contain no whitespace')
  .refine(value => !value.includes('#'), 'review source fragments are forbidden')
  .refine(value => {
    const query = value.split('?', 2)[1]
    if (!query) return true
    return query.split('&').every(part => {
      const rawKey = part.split('=', 1)[0] ?? ''
      const key = decodeReviewQueryKey(rawKey)
      if (key === undefined) return false
      return !/(?:^|[_-])(api[_-]?)?key$|token$|secret$|signature$|sig$|credential$|password$|auth$/i.test(key)
    })
  }, 'review source query contains a sensitive credential key')

export const ReviewSourceSchema = z.object({
  url: ReviewHttpsUrlSchema, accessedOn: LocalDateSchema,
  redistribution: RedistributionCodeSchema, attributionCode: AttributionCodeSchema
}).strict().superRefine((value, context) => {
  const allowedRedistribution = {
    'kpdn-official-record': 'cc-by-4.0',
    'official-retailer-locator': 'official-use-permitted',
    'openstreetmap-contributors': 'odbl-1.0',
    'synthetic-fixture': 'synthetic-cc0'
  } as const
  if (value.redistribution !== allowedRedistribution[value.attributionCode]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['redistribution'], message: 'must match attribution code' })
  }
})

const PrivatePremisePassSchema = z.object({
  reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema, observedName: z.string().min(1),
  entranceLatitude: z.number().min(-90).max(90), entranceLongitude: z.number().min(-180).max(180),
  coordinateAccuracyMetres: z.number().positive().max(30),
  closureSignal: z.enum(['none', 'open', 'closed']), sources: z.array(ReviewSourceSchema).min(2)
}).strict()

const canonicalSortReviewerPasses = <T extends { reviewerId: string }>(reviews: T[]): T[] =>
  [...reviews].sort((left, right) => left.reviewerId < right.reviewerId ? -1 : left.reviewerId > right.reviewerId ? 1 : 0)

export const PrivatePremiseReviewSchema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), displayName: z.string().min(1),
  address: z.string().min(1), premiseType: z.string().min(1),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  coordinateAccuracyMetres: z.number().positive().max(30),
  verificationStatus: z.enum(['desk-verified', 'field-verified']),
  verifiedOn: LocalDateSchema, verificationExpiresOn: LocalDateSchema,
  reviews: z.array(PrivatePremisePassSchema).length(2), coordinateAttribution: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (new Set(value.reviews.map(review => review.reviewerId)).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviews'], message: 'premise reviews require two distinct reviewers' })
  }
  const later = [...value.reviews.map(review => review.reviewedOn)].sort().at(-1)
  if (value.verifiedOn !== later) context.addIssue({ code: z.ZodIssueCode.custom, path: ['verifiedOn'], message: 'must equal the later review date' })
  if (value.verificationExpiresOn !== addLocalDates(value.verifiedOn, 90)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['verificationExpiresOn'], message: 'must be exactly 90 dates after verification' })
  }
}).transform(value => ({ ...value, reviews: canonicalSortReviewerPasses(value.reviews) }))

const PrivateItemPassSchema = z.object({
  reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema, status: z.literal('approved'),
  qualifiers: z.array(z.string()), quantityMode: z.enum(['whole-units', 'hundredths']),
  reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
}).strict()

export const PrivateItemReviewSchema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), officialUnit: z.string().min(1),
  qualifiers: z.array(z.string()), quantityMode: z.enum(['whole-units', 'hundredths']),
  reviews: z.array(PrivateItemPassSchema).length(2), semanticStatus: z.literal('approved')
}).strict().superRefine((value, context) => {
  if (new Set(value.reviews.map(review => review.reviewerId)).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviews'], message: 'item reviews require two distinct reviewers' })
  }
}).transform(value => ({ ...value, reviews: canonicalSortReviewerPasses(value.reviews) }))

export const PrivateMicrozoneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1),
  bounds: z.object({
    north: z.number().min(-90).max(90), south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180), west: z.number().min(-180).max(180)
  }).strict(), premiseCodes: z.array(CanonicalCodeSchema).min(3)
}).strict().superRefine((value, context) => {
  if (value.bounds.north <= value.bounds.south || value.bounds.east <= value.bounds.west) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bounds'], message: 'microzone bounds must have positive area' })
  }
  if (new Set(value.premiseCodes).size !== value.premiseCodes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['premiseCodes'], message: 'premise codes must be unique' })
  }
})

const SourceRowRefSchema = z.object({ sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1) }).strict()
const AuditCellBaseSchema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema, observedDate: LocalDateSchema,
  sourceRows: z.array(SourceRowRefSchema).min(1)
})

export const AuditCellSchema = z.discriminatedUnion('reason', [
  AuditCellBaseSchema.extend({
    reason: z.literal('invalid-price'), rawPriceValues: z.array(z.string().max(64)).min(1),
    validPricesSen: z.array(SenSchema)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('conflicting-duplicate'), pricesSen: z.array(SenSchema.min(1)).min(2)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('outside-ratio-bound'), priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('robust-scale-outlier'), priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1)
  }).strict(),
  AuditCellBaseSchema.extend({
    reason: z.literal('insufficient-reference'), priceSen: SenSchema.min(1), distinctReferencePremises: SenSchema
  }).strict()
])

export const EligibleLowCellSchema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  observedDate: LocalDateSchema, priceSen: SenSchema.min(1), referenceMedianSen: SenSchema.min(1),
  sourceRows: z.array(SourceRowRefSchema).min(1)
}).strict()

export const QualityReviewBasisV1Schema = z.discriminatedUnion('flag', [
  z.object({ flag: z.literal('rejected-cell'), cell: AuditCellSchema }).strict(),
  z.object({ flag: z.literal('eligible-below-half-median'), cell: EligibleLowCellSchema }).strict()
])

const QualityDispositionPassSchema = z.object({
  reviewerId: ReviewerIdSchema, reviewedOn: LocalDateSchema,
  disposition: z.enum(['confirmed-exclusion', 'confirmed-eligible']),
  reasonCodes: z.array(ReviewReasonCodeSchema).min(1)
}).strict()

export const QualityReviewDispositionSchema = z.object({
  reviewBasis: QualityReviewBasisV1Schema,
  disposition: z.enum(['confirmed-exclusion', 'confirmed-eligible']),
  reviewedOn: LocalDateSchema, reviews: z.array(QualityDispositionPassSchema).length(2)
}).strict().superRefine((value, context) => {
  if (new Set(value.reviews.map(review => review.reviewerId)).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviews'], message: 'quality reviews require two distinct reviewers' })
  }
  if (value.reviews.some(review => review.disposition !== value.disposition)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviews'], message: 'nested dispositions must agree' })
  }
  const expected = value.reviewBasis.flag === 'rejected-cell' ? 'confirmed-exclusion' : 'confirmed-eligible'
  if (value.disposition !== expected) context.addIssue({ code: z.ZodIssueCode.custom, path: ['disposition'], message: 'disposition does not match review-basis kind' })
  const later = [...value.reviews.map(review => review.reviewedOn)].sort().at(-1)
  if (value.reviewedOn !== later) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewedOn'], message: 'must equal the later nested review date' })
}).transform(value => ({ ...value, reviews: canonicalSortReviewerPasses(value.reviews) }))

export const QualityReviewBasisFileV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema, reviewInputSha256: Sha256Schema,
  publicationMode: z.enum(['fixture', 'desk-demo']),
  inputDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict(), qualityFlags: z.array(QualityReviewBasisV1Schema)
}).strict()

export const PrivateMicrozonesFileV1Schema = z.object({
  schemaVersion: z.literal(1), microzones: z.array(PrivateMicrozoneSchema).min(1).max(2)
}).strict()
export const PrivatePremisesFileV1Schema = z.object({
  schemaVersion: z.literal(1), premises: z.array(PrivatePremiseReviewSchema).min(1)
}).strict()
export const PrivateItemsFileV1Schema = z.object({
  schemaVersion: z.literal(1), items: z.array(PrivateItemReviewSchema).min(1)
}).strict()
export const PrivateQualityReviewsFileV1Schema = z.object({
  schemaVersion: z.literal(1), qualityReviewBasisSha256: Sha256Schema,
  qualityReviews: z.array(QualityReviewDispositionSchema)
}).strict()

const CountMapSchema = z.record(CanonicalCodeSchema, SenSchema)
const EvidenceStatusCountsSchema = z.object({
  eligible: SenSchema, missing: SenSchema, anomalous: SenSchema, insufficientReference: SenSchema
}).strict()

const CompilerAuditV1BaseSchema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, throughDate: LocalDateSchema,
  sourceWindow: z.enum(['public', 'feasibility']), sourceLockSha256: Sha256Schema,
  publicationMode: z.enum(['fixture', 'desk-demo']), targetDates: z.array(LocalDateSchema).length(2),
  inputRowCount: SenSchema, parsedRowCount: SenSchema, referenceRowCount: SenSchema,
  pilotRowCount: SenSchema, publicEligibleRowCount: SenSchema,
  unknownItemCodes: CountMapSchema, unknownPremiseCodes: CountMapSchema,
  invalidRowCount: SenSchema, afterThroughRowCount: SenSchema, futureRowCount: SenSchema,
  exactDuplicateCount: SenSchema, conflictingCellCount: SenSchema,
  evidenceStatusCounts: EvidenceStatusCountsSchema,
  eligibleLineRateBasisPoints: SenSchema.max(10_000), completeBasketRateBasisPoints: SenSchema.max(10_000),
  degenerateReferenceItemCodes: z.array(CanonicalCodeSchema), rejectedCells: z.array(AuditCellSchema),
  eligibleLowCellsBelowHalfMedian: z.array(EligibleLowCellSchema), qualityReviewDispositionCount: SenSchema,
  qualityFlags: z.array(QualityReviewBasisV1Schema), unreviewedQualityFlags: z.array(QualityReviewBasisV1Schema)
}).strict()

const refineAuditCounts = (value: { publicEligibleRowCount: number, evidenceStatusCounts: { eligible: number } }, context: z.RefinementCtx): void => {
  if (value.publicEligibleRowCount !== value.evidenceStatusCounts.eligible) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicEligibleRowCount'], message: 'must equal eligible evidence count' })
  }
  const counts = value.evidenceStatusCounts as { eligible: number, missing?: number, anomalous?: number, insufficientReference?: number }
  const total = counts.eligible + (counts.missing ?? 0) + (counts.anomalous ?? 0) + (counts.insufficientReference ?? 0)
  const withRate = value as typeof value & { eligibleLineRateBasisPoints?: number }
  const expectedRate = total === 0 ? 0 : Math.floor(counts.eligible * 10_000 / total)
  if (withRate.eligibleLineRateBasisPoints !== undefined && withRate.eligibleLineRateBasisPoints !== expectedRate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['eligibleLineRateBasisPoints'], message: 'must equal the rate derived from evidence status counts' })
  }
  const audit = value as typeof value & {
    rejectedCells?: z.infer<typeof AuditCellSchema>[]
    eligibleLowCellsBelowHalfMedian?: z.infer<typeof EligibleLowCellSchema>[]
    qualityFlags?: z.infer<typeof QualityReviewBasisV1Schema>[]
    unreviewedQualityFlags?: z.infer<typeof QualityReviewBasisV1Schema>[]
    qualityReviewDispositionCount?: number
  }
  if (audit.rejectedCells && audit.eligibleLowCellsBelowHalfMedian && audit.qualityFlags && audit.unreviewedQualityFlags && audit.qualityReviewDispositionCount !== undefined) {
    const key = (candidate: unknown): string => JSON.stringify(candidate)
    const expectedFlags = [
      ...audit.rejectedCells.map(cell => ({ flag: 'rejected-cell', cell })),
      ...audit.eligibleLowCellsBelowHalfMedian.map(cell => ({ flag: 'eligible-below-half-median', cell }))
    ].map(key).sort()
    const actualFlags = audit.qualityFlags.map(key).sort()
    const unreviewed = audit.unreviewedQualityFlags.map(key)
    if (new Set(actualFlags).size !== actualFlags.length || expectedFlags.join('|') !== actualFlags.join('|')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['qualityFlags'], message: 'must exactly combine rejected and eligible-low evidence' })
    }
    if (new Set(unreviewed).size !== unreviewed.length || unreviewed.some(flag => !actualFlags.includes(flag)) ||
        audit.qualityReviewDispositionCount + unreviewed.length !== actualFlags.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['unreviewedQualityFlags'], message: 'must be the unreconciled subset of quality flags' })
    }
  }
}

export const CompilerAuditV1Schema = CompilerAuditV1BaseSchema.superRefine(refineAuditCounts)

export const NormalizedObservationSchema = z.object({
  observedDate: LocalDateSchema, premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  officialUnit: z.string().min(1), priceSen: SenSchema.min(1),
  sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1)
}).strict()

export const RejectedSourceRowSchema = z.object({
  observedDate: LocalDateSchema, premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema,
  officialUnit: z.string().min(1), rawPriceValue: z.string().max(64), reason: z.literal('invalid-price'),
  sourceManifestIndex: SenSchema, rowNumber: SenSchema.min(1)
}).strict()

const PremiseLookupSchema = z.object({
  code: CanonicalCodeSchema, name: z.string(), address: z.string(), premiseType: z.string(),
  state: z.string(), district: z.string()
}).strict()
const ItemLookupSchema = z.object({
  code: CanonicalCodeSchema, name: z.string(), unit: z.string(), itemGroup: z.string(), itemCategory: z.string()
}).strict()
const ActiveSourceLockSchema = z.union([SourceLockV1Schema, ExtendedSourceLockV1Schema])

const codesAreSortedUnique = (values: string[]): boolean => values.every((value, index) =>
  index === 0 || compareCanonicalCodes(values[index - 1]!, value) < 0
)

export const NormalizedSourceSliceV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, sourceLock: ActiveSourceLockSchema,
  sourceLockSha256: Sha256Schema, transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema,
  throughDate: LocalDateSchema, sourceWindow: z.enum(['public', 'feasibility']),
  publicationMode: z.enum(['fixture', 'desk-demo']), effectiveInputSha256: Sha256Schema,
  reviewHostPolicySha256: Sha256Schema.optional(),
  contentDigests: z.object({
    microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
    qualityReviews: Sha256Schema, qualityReviewBasis: Sha256Schema, reviewProvenance: Sha256Schema,
    coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
  }).strict(),
  ingestionSummary: z.object({
    inputRowCount: SenSchema, parsedRowCount: SenSchema, invalidRowCount: SenSchema,
    afterThroughRowCount: SenSchema, futureRowCount: SenSchema,
    unknownItemCodes: CountMapSchema, unknownPremiseCodes: CountMapSchema
  }).strict(),
  premiseLookups: z.array(PremiseLookupSchema), itemLookups: z.array(ItemLookupSchema),
  referenceRows: z.array(NormalizedObservationSchema), pilotRows: z.array(NormalizedObservationSchema),
  rejectedReferenceRows: z.array(RejectedSourceRowSchema), rejectedPilotRows: z.array(RejectedSourceRowSchema)
}).strict().superRefine((value, context) => {
  if (value.sourceLock.throughDate !== value.throughDate || value.sourceLock.window !== value.sourceWindow) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLock'], message: 'slice source-lock context mismatch' })
  }
  if (!codesAreSortedUnique(value.premiseLookups.map(row => row.code))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['premiseLookups'], message: 'lookup codes must be sorted and unique' })
  }
  if (!codesAreSortedUnique(value.itemLookups.map(row => row.code))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['itemLookups'], message: 'lookup codes must be sorted and unique' })
  }
  for (const field of ['referenceRows', 'pilotRows', 'rejectedReferenceRows', 'rejectedPilotRows'] as const) {
    const provenance = value[field].map(row => `${row.sourceManifestIndex}:${row.rowNumber}`)
    if (new Set(provenance).size !== provenance.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'source-row provenance must be unique within each normalized slice array'
      })
    }
  }
  if (value.publicationMode === 'fixture' && (value.sourceWindow !== 'public' || value.sourceLock.sourceKind !== 'synthetic-fixture' || value.reviewHostPolicySha256 !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicationMode'], message: 'fixture slices require a synthetic public lock and forbid host policy' })
  }
  if (value.publicationMode === 'desk-demo' && (value.sourceWindow !== 'feasibility' || value.sourceLock.sourceKind !== 'official' || value.reviewHostPolicySha256 === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicationMode'], message: 'desk slices require an official feasibility lock and host policy digest' })
  }
})

const ContentDigestsSchema = z.object({
  microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
  qualityReviews: Sha256Schema, qualityReviewBasis: Sha256Schema, reviewProvenance: Sha256Schema,
  coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
}).strict()

const CompileContentSchema = z.object({
  microzones: z.array(z.unknown()), premises: z.array(z.unknown()), items: z.array(z.unknown()),
  qualityReviews: z.unknown(), qualityReviewBasis: z.unknown(),
  coverageReport: z.unknown().optional(), feasibilityReport: z.unknown().optional()
}).strict()

const refineModeAndReports = (value: {
  publicationMode: 'fixture' | 'desk-demo'
  throughDate: string
  sourceLock: z.infer<typeof ActiveSourceLockSchema>
  content: { coverageReport?: unknown, feasibilityReport?: unknown }
  digests: { coverageReport?: string, feasibilityReport?: string }
  reviewHostPolicy?: unknown
  reviewHostPolicySha256?: string
}, context: z.RefinementCtx): void => {
  if (value.throughDate !== value.sourceLock.throughDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['throughDate'], message: 'must match source lock' })
  }
  const coveragePair = [value.content.coverageReport !== undefined, value.digests.coverageReport !== undefined]
  const feasibilityPair = [value.content.feasibilityReport !== undefined, value.digests.feasibilityReport !== undefined]
  const hasAllGateFields = coveragePair.every(Boolean) && feasibilityPair.every(Boolean)
  const hasAnyGateField = coveragePair.some(Boolean) || feasibilityPair.some(Boolean)
  if (coveragePair[0] !== coveragePair[1]) context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'coverageReport'], message: 'report and digest must appear together' })
  if (feasibilityPair[0] !== feasibilityPair[1]) context.addIssue({ code: z.ZodIssueCode.custom, path: ['content', 'feasibilityReport'], message: 'report and digest must appear together' })
  if (value.publicationMode === 'fixture') {
    if (value.sourceLock.window !== 'public') context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLock'], message: 'fixture requires exact public source lock' })
    if (value.sourceLock.sourceKind !== 'synthetic-fixture') context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLock'], message: 'fixture requires synthetic source kind' })
    if (hasAnyGateField) context.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'fixture forbids desk reports' })
    if (value.reviewHostPolicy !== undefined || value.reviewHostPolicySha256 !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewHostPolicy'], message: 'fixture forbids retailer policy' })
  } else {
    if (value.sourceLock.window !== 'feasibility') context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLock'], message: 'desk demo requires feasibility source lock' })
    if (value.sourceLock.sourceKind !== 'official') context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceLock'], message: 'desk demo requires official source kind' })
    if (!hasAllGateFields) context.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'desk demo requires both reports and digests' })
    if (value.reviewHostPolicy === undefined || value.reviewHostPolicySha256 === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewHostPolicy'], message: 'desk demo requires retailer policy and digest' })
  }
}

export const CompilePilotInputSchema = z.object({
  transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema, throughDate: LocalDateSchema,
  publicationMode: z.enum(['fixture', 'desk-demo']), effectiveInputSha256: Sha256Schema,
  reviewInputSha256: Sha256Schema, contentDigests: ContentDigestsSchema,
  sourceLock: ActiveSourceLockSchema, sourceLockSha256: Sha256Schema,
  reviewHostPolicy: ReviewHostPolicyV1Schema.optional(), reviewHostPolicySha256: Sha256Schema.optional(),
  transactions: z.array(z.unknown()), premiseLookups: z.array(z.unknown()), itemLookups: z.array(z.unknown()),
  content: CompileContentSchema
}).strict().superRefine((value, context) => refineModeAndReports({
  ...value, digests: value.contentDigests
}, context))

export type CompilePilotInput = z.infer<typeof CompilePilotInputSchema>

const CollectionInputDigestsSchema = z.object({
  microzones: Sha256Schema, premises: Sha256Schema, items: Sha256Schema,
  coverageReport: Sha256Schema.optional(), feasibilityReport: Sha256Schema.optional()
}).strict()
const CollectionContentSchema = z.object({
  microzones: z.array(z.unknown()), premises: z.array(z.unknown()), items: z.array(z.unknown()),
  coverageReport: z.unknown().optional(), feasibilityReport: z.unknown().optional()
}).strict()

export const CollectQualityReviewInputSchema = z.object({
  transformVersion: TransformVersionSchema, compiledAt: ISOInstantSchema, throughDate: LocalDateSchema,
  publicationMode: z.enum(['fixture', 'desk-demo']), reviewInputSha256: Sha256Schema,
  sourceLock: ActiveSourceLockSchema, sourceLockSha256: Sha256Schema,
  reviewHostPolicy: ReviewHostPolicyV1Schema.optional(), reviewHostPolicySha256: Sha256Schema.optional(),
  inputDigests: CollectionInputDigestsSchema,
  transactions: z.array(z.unknown()), premiseLookups: z.array(z.unknown()), itemLookups: z.array(z.unknown()),
  content: CollectionContentSchema
}).strict().superRefine((value, context) => refineModeAndReports({
  ...value, digests: value.inputDigests
}, context))

export const QualityReviewCollectionAuditV1Schema = CompilerAuditV1BaseSchema.omit({ buildId: true }).extend({
  reviewInputSha256: Sha256Schema
}).strict().superRefine(refineAuditCounts)

export type CompilerAuditV1 = z.infer<typeof CompilerAuditV1Schema>
export type NormalizedSourceSliceV1 = z.infer<typeof NormalizedSourceSliceV1Schema>
export type QualityReviewBasisV1 = z.infer<typeof QualityReviewBasisV1Schema>
export type QualityReviewBasisFileV1 = z.infer<typeof QualityReviewBasisFileV1Schema>
export type CollectQualityReviewInput = z.infer<typeof CollectQualityReviewInputSchema>
export type QualityReviewCollectionAuditV1 = z.infer<typeof QualityReviewCollectionAuditV1Schema>
