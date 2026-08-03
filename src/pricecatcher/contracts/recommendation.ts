import { z } from 'zod'
import {
  CanonicalCodeSchema, ComparisonOnlyReasonSchema, ISOInstantSchema, LocalDateSchema,
  ReasonCodeSchema, SenSchema, SignedSenSchema
} from './common'

const DATA_COPY_FAILED = Symbol('recommendation-data-copy-failed')
const DANGEROUS_OWN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_COPY_DEPTH = 64
const MAX_COPY_VALUES = 100_000
type DataCopyState = { active: WeakSet<object>; values: number }

const defineData = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true })
}

const copyUntrustedData = (value: unknown, state: DataCopyState, depth: number): unknown | typeof DATA_COPY_FAILED => {
  if (++state.values > MAX_COPY_VALUES || depth > MAX_COPY_DEPTH) return DATA_COPY_FAILED
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'function' || typeof value === 'symbol' ? DATA_COPY_FAILED : value
  }
  if (state.active.has(value)) return DATA_COPY_FAILED
  state.active.add(value)
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
      if (!lengthDescriptor || lengthDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
          !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_COPY_VALUES - state.values) {
        return DATA_COPY_FAILED
      }
      if (Object.getPrototypeOf(value) !== Array.prototype) return DATA_COPY_FAILED
      const keys = Reflect.ownKeys(value)
      if (keys.length !== lengthDescriptor.value + 1) return DATA_COPY_FAILED
      const keySet = new Set(keys)
      if (keys.some(key => typeof key !== 'string') || !keySet.has('length')) return DATA_COPY_FAILED
      const copy: unknown[] = []
      for (let index = 0; index < lengthDescriptor.value; index++) {
        const key = String(index)
        if (!keySet.has(key)) return DATA_COPY_FAILED
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return DATA_COPY_FAILED
        const nested = copyUntrustedData(descriptor.value, state, depth + 1)
        if (nested === DATA_COPY_FAILED) return DATA_COPY_FAILED
        copy.push(nested)
      }
      return copy
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) return DATA_COPY_FAILED
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string' || DANGEROUS_OWN_KEYS.has(key))) return DATA_COPY_FAILED
    const copy: Record<string, unknown> = {}
    const orderedKeys = (keys as string[]).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    for (const key of orderedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return DATA_COPY_FAILED
      const nested = copyUntrustedData(descriptor.value, state, depth + 1)
      if (nested === DATA_COPY_FAILED) return DATA_COPY_FAILED
      defineData(copy, key, nested)
    }
    return copy
  } catch {
    return DATA_COPY_FAILED
  } finally {
    state.active.delete(value)
  }
}

const captureUntrustedData = (value: unknown): unknown => {
  try {
    const copy = copyUntrustedData(value, { active: new WeakSet(), values: 0 }, 0)
    return copy === DATA_COPY_FAILED ? null : copy
  } catch { return null }
}

const RecommendationRequestBaseSchema = z.object({
  evaluatedAt: z.unknown().optional(), location: z.unknown().optional(),
  usualPremiseCode: z.unknown().optional(), basketScope: z.unknown().optional(),
  lines: z.unknown().optional(), mode: z.unknown().optional(),
  fuelEfficiencyDeciKmPerL: z.unknown().optional(), fuelPriceSenPerL: z.unknown().optional(),
  fixedTripCostByPremiseCode: z.unknown().optional(), worthwhileThresholdSen: z.unknown().optional()
}).strict()
export const RecommendationRequestSchema = z.preprocess(captureUntrustedData, RecommendationRequestBaseSchema)

const RecommendationInputBaseSchema = z.object({
  evaluatedAt: ISOInstantSchema,
  location: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMetres: z.number().finite().min(0).max(100)
  }).strict(),
  usualPremiseCode: CanonicalCodeSchema,
  basketScope: z.enum(['complete-trip', 'selected-items-only']),
  lines: z.array(z.object({
    itemCode: CanonicalCodeSchema,
    quantityHundredths: z.number().int().safe().min(1).max(9900)
  }).strict()).min(1),
  mode: z.enum(['walk', 'drive']),
  fuelEfficiencyDeciKmPerL: z.number().int().safe().min(10).max(500).optional(),
  fuelPriceSenPerL: SenSchema.min(1).max(1000).optional(),
  fixedTripCostByPremiseCode: z.record(CanonicalCodeSchema, z.discriminatedUnion('status', [
    z.object({ status: z.literal('confirmed'), amountSen: SenSchema.max(10000) }).strict(),
    z.object({ status: z.literal('unknown') }).strict()
  ])).optional(),
  worthwhileThresholdSen: SenSchema.max(10000).optional()
}).strict()
export const RecommendationInputSchema = z.preprocess(captureUntrustedData, RecommendationInputBaseSchema)

export const ComparedLineV1Schema = z.object({
  itemCode: CanonicalCodeSchema, officialUnit: z.string().min(1), quantityHundredths: z.number().int().safe().min(1).max(9900),
  observedDate: LocalDateSchema,
  usualUnitAllowanceSen: SenSchema, candidateUnitAllowanceSen: SenSchema,
  usualLineAllowanceSen: SenSchema, candidateLineAllowanceSen: SenSchema,
  usual: z.object({ priceSen: SenSchema, lineTotalSen: SenSchema, conservativeLineSen: SenSchema }).strict(),
  candidate: z.object({ priceSen: SenSchema, lineTotalSen: SenSchema, conservativeLineSen: SenSchema }).strict()
}).strict()

export const DrivingTripCostV1Schema = z.object({
  straightLineMetres: SenSchema, routeFactorBasisPoints: SenSchema.min(5000).max(30000),
  estimatedRoundTripRoadMetres: SenSchema, fuelCostSen: SenSchema,
  fixedCostSen: SenSchema.max(10000), totalTripCostSen: SenSchema
}).strict()

export const PriceComparisonV1Schema = z.object({
  usualPremiseCode: CanonicalCodeSchema, candidatePremiseCode: CanonicalCodeSchema,
  lines: z.array(ComparedLineV1Schema).min(1), usualBasketTotalSen: SenSchema,
  candidateBasketTotalSen: SenSchema, grossBasketSavingSen: SignedSenSchema,
  usualStraightLineMetres: SenSchema, candidateStraightLineMetres: SenSchema.max(5000),
  oldestObservationDate: LocalDateSchema
}).strict()

export const TripComparisonV1Schema = z.object({
  mode: z.literal('drive'), priceComparison: PriceComparisonV1Schema,
  usualEstimatedTrip: DrivingTripCostV1Schema, candidateEstimatedTrip: DrivingTripCostV1Schema,
  estimatedNetSavingSen: SignedSenSchema,
  usualConservativeBasketTotalSen: SenSchema, candidateConservativeBasketTotalSen: SenSchema,
  usualConservativeTrip: DrivingTripCostV1Schema, candidateConservativeTrip: DrivingTripCostV1Schema,
  usualConservativeNetCostSen: SenSchema, candidateConservativeNetCostSen: SenSchema,
  conservativeNetSavingSen: SignedSenSchema, worthwhileThresholdSen: SenSchema.max(10000)
}).strict()

export const CandidateExclusionReasonSchema = z.enum([
  'outside-radius', 'missing', 'stale', 'anomalous', 'insufficient-reference', 'date-mismatch'
])

export const ExclusionCountsSchema = z.object({
  pilotPremiseCount: SenSchema, inRadiusCandidateCount: SenSchema,
  completeCandidateCount: SenSchema,
  excludedByReason: z.partialRecord(CandidateExclusionReasonSchema, SenSchema)
}).strict().superRefine((value, context) => {
  const excluded = Object.values(value.excludedByReason).reduce<number>((sum, count) => sum + (count ?? 0), 0)
  const outside = value.excludedByReason['outside-radius'] ?? 0
  const inRadiusExcluded = excluded - outside
  if (excluded + value.completeCandidateCount !== value.pilotPremiseCount ||
      inRadiusExcluded + value.completeCandidateCount !== value.inRadiusCandidateCount ||
      outside + value.inRadiusCandidateCount !== value.pilotPremiseCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['excludedByReason'], message: 'candidate partition counts are inconsistent' })
  }
})

export const ReasonDetailSchema = z.object({
  reason: ReasonCodeSchema, premiseCode: CanonicalCodeSchema.optional(),
  itemCode: CanonicalCodeSchema.optional(), observedDate: LocalDateSchema.optional()
}).strict()

const CandidateStageReasonSchema = z.enum([
  'no-candidate-in-radius', 'candidate-missing', 'candidate-stale', 'candidate-anomalous',
  'candidate-insufficient-reference', 'candidate-date-mismatch', 'no-complete-candidate'
])
const InsufficientEvidenceResultSchema = z.object({
  kind: z.literal('insufficient-evidence'), primaryReason: ReasonCodeSchema,
  details: z.array(ReasonDetailSchema), exclusions: ExclusionCountsSchema.optional()
}).strict()

const comparisonOnlyReasonOrder = ['selected-items-only', 'walking-route-unverified', 'fixed-trip-cost-unknown', 'publication-not-consumer-ready'] as const

export const RecommendationResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('switch'), comparison: TripComparisonV1Schema, exclusions: ExclusionCountsSchema }).strict(),
  z.object({ kind: z.literal('no-clear-advantage'), comparison: TripComparisonV1Schema, exclusions: ExclusionCountsSchema }).strict(),
  z.object({ kind: z.literal('comparison-only'), comparison: PriceComparisonV1Schema,
    reasons: z.array(ComparisonOnlyReasonSchema).min(1), exclusions: ExclusionCountsSchema }).strict(),
  InsufficientEvidenceResultSchema
]).superRefine((value, context) => {
  if (value.kind === 'comparison-only') {
    const indices = value.reasons.map(reason => comparisonOnlyReasonOrder.indexOf(reason))
    if (new Set(value.reasons).size !== value.reasons.length || indices.some((index, i) => i > 0 && index <= indices[i - 1])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasons'], message: 'comparison-only reasons must be unique and ordered' })
    }
  }
  const candidateStage = value.kind === 'insufficient-evidence' && CandidateStageReasonSchema.safeParse(value.primaryReason).success
  if (value.kind === 'insufficient-evidence' && candidateStage && value.exclusions === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['exclusions'], message: 'required after candidate enumeration' })
  }
  if (value.kind === 'insufficient-evidence' && !candidateStage && value.exclusions !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['exclusions'], message: 'forbidden before candidate enumeration' })
  }
})

export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>
export type ComparedLineV1 = z.infer<typeof ComparedLineV1Schema>
export type DrivingTripCostV1 = z.infer<typeof DrivingTripCostV1Schema>
export type PriceComparisonV1 = z.infer<typeof PriceComparisonV1Schema>
export type TripComparisonV1 = z.infer<typeof TripComparisonV1Schema>
export type CandidateExclusionReason = z.infer<typeof CandidateExclusionReasonSchema>
export type ExclusionCounts = z.infer<typeof ExclusionCountsSchema>
export type ReasonDetail = z.infer<typeof ReasonDetailSchema>
export type RecommendationResult = z.infer<typeof RecommendationResultSchema>
