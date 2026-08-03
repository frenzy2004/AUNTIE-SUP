import { z } from 'zod'
import {
  BuildIdSchema, CanonicalCodeSchema, ISOInstantSchema, LocalDateSchema,
  QualityReasonSchema, SenSchema, Sha256Schema, TransformVersionSchema
} from './common'

export const SourceManifestV1Schema = z.object({
  url: z.string().url(), retrievedAt: ISOInstantSchema, sha256: Sha256Schema,
  byteLength: SenSchema, rowCount: SenSchema,
  minObservedDate: LocalDateSchema.optional(), maxObservedDate: LocalDateSchema.optional(),
  etag: z.string().max(128).regex(/^(?:W\/)?"[\x21\x23-\x7E]{1,124}"$/).optional(),
  lastModified: z.string().length(29).regex(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/).optional()
}).strict().superRefine((value, context) => {
  if (value.minObservedDate && value.maxObservedDate && value.minObservedDate > value.maxObservedDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxObservedDate'], message: 'source dates must be ordered' })
  }
  if (value.lastModified) {
    const parsed = new Date(value.lastModified)
    if (Number.isNaN(parsed.getTime()) || parsed.toUTCString() !== value.lastModified) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['lastModified'], message: 'invalid IMF-fixdate' })
    }
  }
})

export const PremiseV1Schema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), displayName: z.string().min(1),
  address: z.string().min(1), premiseType: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  coordinateAccuracyMetres: z.number().finite().positive().max(30),
  verificationStatus: z.enum(['desk-verified', 'field-verified']),
  verifiedOn: LocalDateSchema, verificationExpiresOn: LocalDateSchema,
  coordinateAttribution: z.string().min(1)
}).strict()

export const ItemDefinitionV1Schema = z.object({
  code: CanonicalCodeSchema, officialName: z.string().min(1), officialUnit: z.string().min(1),
  qualifiers: z.array(z.string()), quantityMode: z.enum(['whole-units', 'hundredths'])
}).strict()

export const ObservationEvidenceV1Schema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('eligible'), observedDate: LocalDateSchema, priceSen: SenSchema.min(1) }).strict(),
  z.object({ status: z.literal('missing'), observedDate: LocalDateSchema }).strict(),
  z.object({ status: z.literal('anomalous'), observedDate: LocalDateSchema, reason: QualityReasonSchema }).strict(),
  z.object({ status: z.literal('insufficient-reference'), observedDate: LocalDateSchema }).strict()
])

export const EvidenceCellV1Schema = z.object({
  premiseCode: CanonicalCodeSchema, itemCode: CanonicalCodeSchema, officialUnit: z.string().min(1),
  observations: z.array(ObservationEvidenceV1Schema).length(2)
}).strict()

const priorLocalDate = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number)
  const prior = new Date(Date.UTC(year, month - 1, day - 1))
  return `${prior.getUTCFullYear().toString().padStart(4, '0')}-${(prior.getUTCMonth() + 1).toString().padStart(2, '0')}-${prior.getUTCDate().toString().padStart(2, '0')}`
}

const malaysiaLocalDate = (instant: string): string => {
  const date = new Date(instant)
  const malaysia = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return `${malaysia.getUTCFullYear().toString().padStart(4, '0')}-${(malaysia.getUTCMonth() + 1).toString().padStart(2, '0')}-${malaysia.getUTCDate().toString().padStart(2, '0')}`
}

export const PilotSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema, transformVersion: TransformVersionSchema,
  compiledAt: ISOInstantSchema, dataAsOfDate: LocalDateSchema,
  publicationMode: z.enum(['fixture', 'desk-demo', 'consumer-pilot']),
  timeZone: z.literal('Asia/Kuala_Lumpur'),
  sources: z.array(SourceManifestV1Schema).min(1),
  attribution: z.object({
    text: z.string().min(1),
    transactionalRecordsUrl: z.literal('https://data.gov.my/data-catalogue/pricecatcher'),
    premiseLookupUrl: z.literal('https://data.gov.my/data-catalogue/lookup_premise'),
    itemLookupUrl: z.literal('https://data.gov.my/data-catalogue/lookup_item'),
    licenseUrl: z.literal('https://creativecommons.org/licenses/by/4.0/')
  }).strict(),
  premises: z.array(PremiseV1Schema), items: z.array(ItemDefinitionV1Schema),
  evidence: z.array(EvidenceCellV1Schema)
}).strict().superRefine((value, context) => {
  const premiseCodes = new Set(value.premises.map(premise => premise.code))
  const itemCodes = new Set(value.items.map(item => item.code))
  if (premiseCodes.size !== value.premises.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['premises'], message: 'duplicate premise code' })
  if (itemCodes.size !== value.items.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'duplicate item code' })
  if (value.evidence.length !== value.premises.length * value.items.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'evidence matrix is incomplete' })
  const expectedDates = [priorLocalDate(value.dataAsOfDate), value.dataAsOfDate]
  const evidenceKeys = new Set<string>()
  const units = new Map(value.items.map(item => [item.code, item.officialUnit]))
  for (const [index, cell] of value.evidence.entries()) {
    const key = `${cell.premiseCode}:${cell.itemCode}`
    if (evidenceKeys.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index], message: 'duplicate evidence key' })
    evidenceKeys.add(key)
    if (!premiseCodes.has(cell.premiseCode) || !itemCodes.has(cell.itemCode)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index], message: 'unknown evidence code' })
    if (units.get(cell.itemCode) !== cell.officialUnit) context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index, 'officialUnit'], message: 'evidence unit mismatch' })
    if (cell.observations.map(observation => observation.observedDate).join('|') !== expectedDates.join('|')) context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index, 'observations'], message: 'evidence dates must be sorted target dates' })
  }
  for (const [index, premise] of value.premises.entries()) {
    if (premise.verificationExpiresOn < premise.verifiedOn) context.addIssue({ code: z.ZodIssueCode.custom, path: ['premises', index], message: 'verification expiry precedes verification' })
    if (value.publicationMode === 'consumer-pilot' && premise.verificationStatus !== 'field-verified') context.addIssue({ code: z.ZodIssueCode.custom, path: ['premises', index], message: 'consumer pilot requires field verification' })
  }
  if (malaysiaLocalDate(value.compiledAt) < value.dataAsOfDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['compiledAt'], message: 'compiled before data date in Malaysia' })
})

export const CurrentSnapshotPointerV1Schema = z.object({
  schemaVersion: z.literal(1), buildId: BuildIdSchema,
  snapshotUrl: z.string().regex(/^\.\/data\/builds\/[a-zA-Z0-9._-]+\/snapshot\.json$/),
  snapshotSha256: Sha256Schema
}).strict().superRefine((value, context) => {
  const encodedBuildId = value.snapshotUrl.split('/').at(-2)
  if (encodedBuildId !== value.buildId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshotUrl'], message: 'path build ID must match pointer build ID' })
  }
})

export type SourceManifestV1 = z.infer<typeof SourceManifestV1Schema>
export type PremiseV1 = z.infer<typeof PremiseV1Schema>
export type ItemDefinitionV1 = z.infer<typeof ItemDefinitionV1Schema>
export type ObservationEvidenceV1 = z.infer<typeof ObservationEvidenceV1Schema>
export type EvidenceCellV1 = z.infer<typeof EvidenceCellV1Schema>
export type PilotSnapshotV1 = z.infer<typeof PilotSnapshotV1Schema>
export type CurrentSnapshotPointerV1 = z.infer<typeof CurrentSnapshotPointerV1Schema>
