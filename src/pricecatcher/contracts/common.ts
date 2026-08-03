import { z } from 'zod'
import { PRICECATCHER_TRANSFORM_VERSION } from '../version'

const isValidLocalDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const LocalDateSchema = z.string().refine(isValidLocalDate, 'invalid local date')
export const ISOInstantSchema = z.string().datetime({ offset: true })
  .refine(value => value.endsWith('Z'), 'UTC instant must end in Z')
export const SenSchema = z.number().int().safe().nonnegative()
export const SignedSenSchema = z.number().int().safe()
const CANONICAL_CODE_PATTERN = /^(0|[1-9]\d*)$/
const MAX_CANONICAL_CODE = '9007199254740991'
const isCanonicalCode = (value: string): boolean =>
  value.length <= MAX_CANONICAL_CODE.length &&
  CANONICAL_CODE_PATTERN.test(value) &&
  (value.length < MAX_CANONICAL_CODE.length || value <= MAX_CANONICAL_CODE)
export const CanonicalCodeSchema = z.string()
  .refine(isCanonicalCode, 'invalid canonical code or unsupported safe-integer range')
export const BuildIdSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/)
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const TransformVersionSchema = z.literal(PRICECATCHER_TRANSFORM_VERSION)

export const QualityReasonSchema = z.enum([
  'invalid-price',
  'conflicting-duplicate',
  'outside-ratio-bound',
  'robust-scale-outlier'
])

export const ReasonCodeSchema = z.enum([
  'snapshot-load-failed', 'snapshot-schema-unsupported', 'snapshot-integrity-failed',
  'snapshot-stale', 'clock-invalid', 'location-missing', 'location-imprecise',
  'input-invalid', 'basket-empty', 'item-not-in-pilot', 'usual-premise-not-in-pilot',
  'baseline-missing', 'baseline-stale', 'baseline-anomalous',
  'baseline-insufficient-reference', 'no-candidate-in-radius', 'candidate-missing',
  'candidate-stale', 'candidate-anomalous', 'candidate-insufficient-reference',
  'candidate-date-mismatch', 'no-complete-candidate'
])

export const ComparisonOnlyReasonSchema = z.enum([
  'selected-items-only',
  'walking-route-unverified',
  'fixed-trip-cost-unknown',
  'publication-not-consumer-ready'
])

export type LocalDate = z.infer<typeof LocalDateSchema>
export type ISOInstant = z.infer<typeof ISOInstantSchema>
export type Sen = z.infer<typeof SenSchema>
export type BuildId = z.infer<typeof BuildIdSchema>
export type QualityReason = z.infer<typeof QualityReasonSchema>
export type ReasonCode = z.infer<typeof ReasonCodeSchema>
