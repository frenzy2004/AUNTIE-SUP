import { z } from 'zod'
import { CanonicalCodeSchema, LocalDateSchema, SenSchema, Sha256Schema } from './common'

const BasisPointsSchema = SenSchema.max(10_000)
const ReportTransformVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
export const CoverageFailureReasonV1Schema = z.enum([
  'insufficient-near-daily-premises', 'insufficient-high-coverage-items'
])
export const DistanceFailureReasonV1Schema = z.enum([
  'selected-coverage-gate-failed', 'invalid-final-premise-count', 'invalid-final-item-count',
  'invalid-microzone-count', 'microzone-premise-count-below-three',
  'baseline-alternative-rate-below-7000'
])

const addDays = (value: string, offset: number): string => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`
}
const exactDates = (date: string, count: number): string[] => Array.from({ length: count }, (_, index) => addDays(date, index - count + 1))
const orderedUnique = (values: string[]): boolean => values.every((value, index) => index === 0 || values[index - 1] < value)
const issuesForDateSet = (values: string[], expected: string[], context: z.RefinementCtx, path: PropertyKey[]) => {
  if (values.length !== expected.length || values.some((value, index) => value !== expected[index])) context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'date range does not match its bound data date' })
}
const orderedFailureReasons = <T extends readonly string[]>(values: string[], options: T): boolean => values.every((value, index) => index === 0 || options.indexOf(values[index - 1]) < options.indexOf(value))

export const CoverageCandidateReportV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: ReportTransformVersionSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema,
  scope: z.enum(['candidate-universe', 'selected-content']),
  selectedContentDigests: z.object({ premises: Sha256Schema, items: Sha256Schema }).strict().optional(),
  dataAsOfDate: LocalDateSchema, calibrationDates: z.array(LocalDateSchema).length(14),
  premises: z.array(z.object({ premiseCode: CanonicalCodeSchema,
    officialName: z.string().min(1), address: z.string().min(1), premiseType: z.string().min(1),
    state: z.string().min(1), district: z.string().min(1), distinctPresenceDates: SenSchema.max(14),
    dateCoverageBasisPoints: BasisPointsSchema, completeItemCellCoverageBasisPoints: BasisPointsSchema,
    nearDaily: z.boolean() }).strict()),
  items: z.array(z.object({ itemCode: CanonicalCodeSchema, officialName: z.string().min(1),
    officialUnit: z.string().min(1), itemGroup: z.string().min(1), itemCategory: z.string().min(1),
    coveredDates: SenSchema.max(14),
    qualifyingPremiseCoverageDates: SenSchema.max(14), qualifyingDateRateBasisPoints: BasisPointsSchema,
    meanPremiseCoverageBasisPoints: BasisPointsSchema, highCoverage: z.boolean() }).strict()),
  passesCoverageCandidateGate: z.boolean(), failureReasons: z.array(CoverageFailureReasonV1Schema)
}).strict().superRefine((value, context) => {
  issuesForDateSet(value.calibrationDates, exactDates(value.dataAsOfDate, 14), context, ['calibrationDates'])
  if (value.dataAsOfDate > value.throughDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataAsOfDate'], message: 'data date exceeds source lock' })
  if (value.scope === 'selected-content' && !value.selectedContentDigests) context.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedContentDigests'], message: 'selected reports require digests' })
  if (value.scope === 'candidate-universe' && value.selectedContentDigests) context.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedContentDigests'], message: 'candidate reports forbid selected digests' })
  if (!orderedUnique(value.premises.map(row => row.premiseCode))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['premises'], message: 'premise codes must be sorted and unique' })
  if (!orderedUnique(value.items.map(row => row.itemCode))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'item codes must be sorted and unique' })
  if (!orderedFailureReasons(value.failureReasons, CoverageFailureReasonV1Schema.options)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['failureReasons'], message: 'failure reasons must be unique and ordered' })
  if (value.passesCoverageCandidateGate !== (value.failureReasons.length === 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['failureReasons'], message: 'gate and failure reasons are inconsistent' })
})

export const DistanceFeasibilityReportV1Schema = z.object({
  schemaVersion: z.literal(1), transformVersion: ReportTransformVersionSchema,
  throughDate: LocalDateSchema, sourceLockSha256: Sha256Schema,
  dataAsOfDate: LocalDateSchema, coverageReportSha256: Sha256Schema,
  microzonesSha256: Sha256Schema, premisesSha256: Sha256Schema, itemsSha256: Sha256Schema,
  referenceAndTargetDates: z.array(LocalDateSchema).length(60), targetDates: z.array(LocalDateSchema).length(30),
  finalPremiseCodes: z.array(CanonicalCodeSchema),
  finalItemCodes: z.array(CanonicalCodeSchema),
  microzones: z.array(z.object({
    microzoneId: z.string().regex(/^[a-z0-9-]+$/), premiseCount: SenSchema,
    baselines: z.array(z.object({ premiseCode: CanonicalCodeSchema,
      completeAlternativeDates: SenSchema.max(30), completeAlternativeDateBasisPoints: BasisPointsSchema }).strict()),
    minimumBaselineAlternativeDateBasisPoints: BasisPointsSchema, passes: z.boolean()
  }).strict()).max(2),
  passesDeskDemoGate: z.boolean(), failureReasons: z.array(DistanceFailureReasonV1Schema)
}).strict().superRefine((value, context) => {
  const reference = exactDates(value.dataAsOfDate, 60)
  issuesForDateSet(value.referenceAndTargetDates, reference, context, ['referenceAndTargetDates'])
  issuesForDateSet(value.targetDates, reference.slice(-30), context, ['targetDates'])
  if (value.dataAsOfDate > value.throughDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataAsOfDate'], message: 'data date exceeds source lock' })
  if (!orderedUnique(value.finalPremiseCodes)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['finalPremiseCodes'], message: 'premise codes must be sorted and unique' })
  if (!orderedUnique(value.finalItemCodes)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['finalItemCodes'], message: 'item codes must be sorted and unique' })
  if (!orderedFailureReasons(value.failureReasons, DistanceFailureReasonV1Schema.options)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['failureReasons'], message: 'failure reasons must be unique and ordered' })
  for (const [index, zone] of value.microzones.entries()) {
    const codes = zone.baselines.map(baseline => baseline.premiseCode)
    const minimum = codes.length === 0 ? 0 : Math.min(...zone.baselines.map(baseline => baseline.completeAlternativeDateBasisPoints))
    if (!orderedUnique(codes) || zone.premiseCount !== codes.length || zone.minimumBaselineAlternativeDateBasisPoints !== minimum || zone.passes !== (codes.length >= 3 && minimum >= 7000)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['microzones', index], message: 'microzone baselines are inconsistent' })
  }
  if (value.passesDeskDemoGate) {
    if (value.failureReasons.length !== 0 || value.microzones.length < 1 || value.finalPremiseCodes.length < 10 || value.finalPremiseCodes.length > 15 || value.finalItemCodes.length < 5 || value.finalItemCodes.length > 10 || value.microzones.some(zone => !zone.passes)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['passesDeskDemoGate'], message: 'passing desk gate lacks required evidence' })
  } else if (value.failureReasons.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['failureReasons'], message: 'failing desk gate requires a reason' })
})

export type CoverageCandidateReportV1 = z.infer<typeof CoverageCandidateReportV1Schema>
export type DistanceFeasibilityReportV1 = z.infer<typeof DistanceFeasibilityReportV1Schema>
