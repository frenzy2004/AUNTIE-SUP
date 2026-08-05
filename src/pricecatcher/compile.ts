import type { z } from 'zod'
import {
  AuditCellSchema, CompilePilotInputSchema, CompilerAuditV1Schema,
  CollectQualityReviewInputSchema,
  EligibleLowCellSchema, NormalizedSourceSliceV1Schema,
  PrivateItemReviewSchema, PrivateMicrozoneSchema, PrivatePremiseReviewSchema,
  PrivateQualityReviewsFileV1Schema, QualityReviewBasisFileV1Schema,
  QualityReviewCollectionAuditV1Schema,
  RawItemRowSchema, RawPremiseRowSchema, RawTransactionRowSchema,
  type CompilePilotInput, type CompilerAuditV1, type NormalizedSourceSliceV1,
  type QualityReviewBasisFileV1, type QualityReviewBasisV1,
  type QualityReviewCollectionAuditV1
} from './contracts/compiler'
import { CoverageCandidateReportV1Schema, DistanceFeasibilityReportV1Schema } from './contracts/feasibility'
import { LocalDateSchema, type LocalDate } from './contracts/common'
import { PilotSnapshotV1Schema, type PilotSnapshotV1 } from './contracts/snapshot'
import { addLocalDates, malaysiaDateAt } from './dates'
import { haversineMetres } from './distance'
import { canonicalizeCode, compareCanonicalCodes } from './ids'
import { parsePriceSen } from './money'
import {
  buildReferenceStats, classifyTargetCell, collapseObservationRows,
  type ConsolidatedCell, type InvalidPriceObservation, type NormalizedObservation,
  type ParsedObservation, type ReferenceStats
} from './quality'
import { isReviewSourceAllowedByHostPolicy } from './review-source-policy'

const normalizeReviewString = (value: string, label: string): string => {
  if (typeof value !== 'string') throw new RangeError(`${label} must be a string`)
  const normalized = value.normalize('NFC')
  if (/\p{Cc}/u.test(normalized)) throw new RangeError(`${label} must not contain control characters`)
  const display = normalized.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
    .replace(/\p{White_Space}+/gu, ' ')
  if (display.length === 0) throw new RangeError(`${label} must not be empty`)
  return display
}

export const normalizeReviewTextDisplay = (value: string): string => normalizeReviewString(value, 'review text')
export const normalizeReviewTextKey = (value: string): string => normalizeReviewTextDisplay(value).toLowerCase()
export const normalizeQualifierDisplay = (value: string): string => normalizeReviewString(value, 'qualifier')
export const normalizeQualifierKey = (value: string): string => normalizeQualifierDisplay(value).toLowerCase()

export const normalizeLookupToken = (value: string): string => normalizeReviewString(value, 'lookup token').toLowerCase()

const ALLOWED_SINGLE_OPERATOR_TYPES = new Set([
  'hypermarket', 'kedai runcit', 'kedai serbaneka', 'pasar mini', 'pasar raya / supermarket'
])

export const isAllowedSingleOperator = (premiseType: string): boolean =>
  ALLOWED_SINGLE_OPERATOR_TYPES.has(normalizeLookupToken(premiseType))

type AuditCell = z.infer<typeof AuditCellSchema>
type EligibleLowCell = z.infer<typeof EligibleLowCellSchema>
type PrivatePremise = z.infer<typeof PrivatePremiseReviewSchema>
type PrivateItem = z.infer<typeof PrivateItemReviewSchema>
type PrivateMicrozone = z.infer<typeof PrivateMicrozoneSchema>

interface SourcedObservation extends NormalizedObservation {
  sourceManifestIndex: number
  rowNumber: number
}

interface SourcedInvalidObservation extends InvalidPriceObservation {
  sourceManifestIndex: number
  rowNumber: number
}

type SourcedParsedObservation = SourcedObservation | SourcedInvalidObservation

interface PremiseLookup {
  code: string
  name: string
  address: string
  premiseType: string
  state: string
  district: string
}

interface ItemLookup {
  code: string
  name: string
  unit: string
  itemGroup: string
  itemCategory: string
}

interface ParsedCore {
  input: CompilePilotInput
  premises: PrivatePremise[]
  items: PrivateItem[]
  microzones: PrivateMicrozone[]
  premiseLookups: PremiseLookup[]
  itemLookups: ItemLookup[]
  referenceRows: SourcedObservation[]
  pilotRows: SourcedObservation[]
  rejectedReferenceRows: SourcedInvalidObservation[]
  rejectedPilotRows: SourcedInvalidObservation[]
  ingestionSummary: NormalizedSourceSliceV1['ingestionSummary']
}

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const rowRef = (row: { sourceManifestIndex: number, rowNumber: number }) => ({
  sourceManifestIndex: row.sourceManifestIndex, rowNumber: row.rowNumber
})
const compareRowRefs = (left: ReturnType<typeof rowRef>, right: ReturnType<typeof rowRef>): number =>
  left.sourceManifestIndex - right.sourceManifestIndex || left.rowNumber - right.rowNumber
const cellKey = (row: { observedDate: string, premiseCode: string, itemCode: string }): string =>
  JSON.stringify([row.observedDate, row.premiseCode, row.itemCode])
const observationKey = (row: { observedDate: string, premiseCode: string, itemCode: string, officialUnit: string }): string =>
  JSON.stringify([row.observedDate, row.premiseCode, row.itemCode, row.officialUnit])

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, nested]) => [key, canonicalValue(nested)]))
  }
  return value
}

export const canonicalizeCompilerJson = (value: unknown): string => `${JSON.stringify(canonicalValue(value), null, 2)}\n`
const canonicalKey = (value: unknown): string => JSON.stringify(canonicalValue(value))
const sortedCanonical = <T>(values: readonly T[]): T[] => [...values].sort((left, right) => compareText(canonicalKey(left), canonicalKey(right)))
const requireCanonicalSetEquality = (left: readonly unknown[], right: readonly unknown[], message: string): void => {
  const leftKeys = sortedCanonical(left).map(canonicalKey)
  const rightKeys = sortedCanonical(right).map(canonicalKey)
  if (leftKeys.length !== new Set(leftKeys).size || rightKeys.length !== new Set(rightKeys).size || leftKeys.join('\n') !== rightKeys.join('\n')) {
    throw new RangeError(message)
  }
}

const countCode = (counts: Record<string, number>, code: string): void => { counts[code] = (counts[code] ?? 0) + 1 }

const requireUniqueCodes = <T extends { code: string }>(values: T[], label: string): void => {
  if (new Set(values.map(value => value.code)).size !== values.length) throw new RangeError(`${label} codes must be unique`)
}

const lookupFields = (value: PremiseLookup): string[] => [
  value.name, value.address, value.premiseType, value.state, value.district
].map(normalizeLookupToken)
const normalizeOptionalLookupToken = (value: string): string => {
  const normalized = value.normalize('NFC')
  if (/\p{Cc}/u.test(normalized)) throw new RangeError('optional lookup token must not contain control characters')
  return /^\p{White_Space}*$/u.test(normalized) ? '' : normalizeLookupToken(normalized)
}
const itemLookupFields = (value: ItemLookup): string[] => [
  normalizeLookupToken(value.name), normalizeLookupToken(value.unit),
  normalizeOptionalLookupToken(value.itemGroup), normalizeOptionalLookupToken(value.itemCategory)
]

const collapseLookups = <T extends { code: string }>(values: T[], fields: (value: T) => string[], label: string): T[] => {
  const groups = new Map<string, T[]>()
  for (const value of values) groups.set(value.code, [...(groups.get(value.code) ?? []), value])
  const result: T[] = []
  for (const [code, rows] of groups) {
    const expected = fields(rows[0]!).join('\u0000')
    if (rows.some(row => fields(row).join('\u0000') !== expected)) throw new RangeError(`conflicting ${label} lookup rows for code ${code}`)
    result.push([...rows].sort((left, right) => compareText(canonicalKey(left), canonicalKey(right)))[0]!)
  }
  return result.sort((left, right) => compareCanonicalCodes(left.code, right.code))
}

const parsePremiseLookups = (values: unknown[]): PremiseLookup[] => collapseLookups(values.map(value => {
  const raw = RawPremiseRowSchema.parse(value)
  const code = canonicalizeCode(raw.premise_code)
  if (code === null) throw new RangeError('premise lookup has invalid code')
  for (const field of ['premise', 'address', 'premise_type', 'state', 'district'] as const) {
    if (typeof raw[field] !== 'string' || raw[field].length === 0) throw new RangeError(`premise lookup ${field} must be non-empty text`)
  }
  return {
    code, name: raw.premise as string, address: raw.address as string,
    premiseType: raw.premise_type as string, state: raw.state as string, district: raw.district as string
  }
}), lookupFields, 'premise')

const parseItemLookups = (values: unknown[]): ItemLookup[] => collapseLookups(values.map(value => {
  const raw = RawItemRowSchema.parse(value)
  const code = canonicalizeCode(raw.item_code)
  if (code === null) throw new RangeError('item lookup has invalid code')
  for (const field of ['item', 'unit'] as const) {
    if (typeof raw[field] !== 'string' || raw[field].length === 0) throw new RangeError(`item lookup ${field} must be non-empty text`)
  }
  const itemGroup = raw.item_group === undefined ? '' : raw.item_group
  const itemCategory = raw.item_category === undefined ? '' : raw.item_category
  if (typeof itemGroup !== 'string' || typeof itemCategory !== 'string') throw new RangeError('item lookup group/category must be text')
  return { code, name: raw.item as string, unit: raw.unit as string, itemGroup, itemCategory }
}), itemLookupFields, 'item')

const validatePrivateContent = (
  input: CompilePilotInput,
  premises: PrivatePremise[],
  items: PrivateItem[],
  microzones: PrivateMicrozone[],
  premiseLookups: PremiseLookup[],
  itemLookups: ItemLookup[]
): void => {
  requireUniqueCodes(premises, 'premise')
  requireUniqueCodes(items, 'item')
  if (new Set(microzones.map(zone => zone.id)).size !== microzones.length) throw new RangeError('microzone IDs must be unique')
  const compileDate = malaysiaDateAt(input.compiledAt)
  const premiseMap = new Map(premiseLookups.map(row => [row.code, row]))
  const itemMap = new Map(itemLookups.map(row => [row.code, row]))
  const assignments = new Map<string, number>()
  const approvedPremiseCodes = new Set(premises.map(premise => premise.code))
  for (const zone of microzones) {
    if (zone.premiseCodes.some(code => !approvedPremiseCodes.has(code)) || zone.premiseCodes.filter(code => approvedPremiseCodes.has(code)).length < 3) {
      throw new RangeError(`microzone ${zone.id} must contain at least three approved premises and no extraneous codes`)
    }
    for (const code of zone.premiseCodes) assignments.set(code, (assignments.get(code) ?? 0) + 1)
  }
  if (premises.some(premise => assignments.get(premise.code) !== 1)) throw new RangeError('every approved premise must belong to exactly one microzone')

  for (const premise of premises) {
    const lookup = premiseMap.get(premise.code)
    if (!lookup) throw new RangeError(`approved premise ${premise.code} is absent from lookup`)
    if ([premise.officialName, premise.address, premise.premiseType].map(normalizeLookupToken).join('\u0000') !==
      [lookup.name, lookup.address, lookup.premiseType].map(normalizeLookupToken).join('\u0000')) {
      throw new RangeError(`approved premise ${premise.code} drifts from official lookup`)
    }
    if (premise.verifiedOn > compileDate || premise.verificationExpiresOn < compileDate) throw new RangeError(`premise ${premise.code} is future-dated or expired`)
    const observedKeys = premise.reviews.map(review => normalizeReviewTextKey(review.observedName))
    if (new Set(observedKeys).size !== 1 || observedKeys[0] !== normalizeReviewTextKey(premise.displayName)) throw new RangeError(`premise ${premise.code} review names disagree`)
    for (const review of premise.reviews) {
      if (review.reviewedOn > compileDate) throw new RangeError(`premise ${premise.code} review is future-dated`)
      if (review.sources.some(source => source.accessedOn > review.reviewedOn)) throw new RangeError(`premise ${premise.code} source postdates review`)
      if (new Set(review.sources.map(source => source.url)).size !== review.sources.length) throw new RangeError(`premise ${premise.code} review URLs must be distinct`)
      if (review.sources.some(source => !isReviewSourceAllowedByHostPolicy({
        source, publicationMode: input.publicationMode, policy: input.reviewHostPolicy
      }))) throw new RangeError(`premise ${premise.code} uses a forbidden review host`)
      if (review.closureSignal === 'closed') throw new RangeError(`premise ${premise.code} has a closure signal`)
      if (input.publicationMode === 'desk-demo') {
        if (!review.sources.some(source => source.attributionCode === 'kpdn-official-record') ||
            !review.sources.some(source => ['official-retailer-locator', 'openstreetmap-contributors'].includes(source.attributionCode))) {
          throw new RangeError(`premise ${premise.code} lacks independent official and coordinate sources`)
        }
      }
      if (haversineMetres({ latitude: review.entranceLatitude, longitude: review.entranceLongitude }, premise) > 30) {
        throw new RangeError(`premise ${premise.code} entrance is outside reconciliation radius`)
      }
    }
    if (haversineMetres(
      { latitude: premise.reviews[0]!.entranceLatitude, longitude: premise.reviews[0]!.entranceLongitude },
      { latitude: premise.reviews[1]!.entranceLatitude, longitude: premise.reviews[1]!.entranceLongitude }
    ) > 30) throw new RangeError(`premise ${premise.code} reviewer entrances disagree`)
    const zone = microzones.find(candidate => candidate.premiseCodes.includes(premise.code))!
    if (premise.latitude > zone.bounds.north || premise.latitude < zone.bounds.south ||
        premise.longitude > zone.bounds.east || premise.longitude < zone.bounds.west) {
      throw new RangeError(`premise ${premise.code} lies outside its microzone`)
    }
  }

  for (const item of items) {
    const lookup = itemMap.get(item.code)
    if (!lookup) throw new RangeError(`approved item ${item.code} is absent from lookup`)
    if ([item.officialName, item.officialUnit].map(normalizeLookupToken).join('\u0000') !==
      [lookup.name, lookup.unit].map(normalizeLookupToken).join('\u0000')) throw new RangeError(`approved item ${item.code} drifts from official lookup`)
    const expectedQualifiers = item.qualifiers.map(normalizeQualifierKey).sort()
    if (new Set(expectedQualifiers).size !== expectedQualifiers.length) throw new RangeError(`item ${item.code} has duplicate qualifiers`)
    for (const review of item.reviews) {
      if (review.reviewedOn > compileDate) throw new RangeError(`item ${item.code} review is future-dated`)
      const reviewQualifiers = review.qualifiers.map(normalizeQualifierKey).sort()
      if (new Set(reviewQualifiers).size !== reviewQualifiers.length || reviewQualifiers.join('\u0000') !== expectedQualifiers.join('\u0000') || review.quantityMode !== item.quantityMode) {
        throw new RangeError(`item ${item.code} review semantics disagree`)
      }
    }
  }
}

const validateSourceContext = (input: CompilePilotInput): void => {
  const compileDate = malaysiaDateAt(input.compiledAt)
  if (input.throughDate > compileDate) throw new RangeError('throughDate must not exceed the Malaysia compile date')
  const canonicalSources = [...input.sourceLock.sources].sort((left, right) => {
    const rank = (source: typeof left): number => source.role === 'transactions' ? 0 : source.role === 'premise-lookup' ? 1 : 2
    return rank(left) - rank(right) || (left.role === 'transactions' && right.role === 'transactions'
      ? compareText(left.yearMonth, right.yearMonth)
      : 0)
  })
  if (canonicalSources.some((source, index) => canonicalKey(source) !== canonicalKey(input.sourceLock.sources[index]))) {
    throw new RangeError('source lock sources must use canonical role and month order')
  }
  const compiledEpoch = Date.parse(input.compiledAt)
  if (input.sourceLock.sources.some(source => Date.parse(source.manifest.retrievedAt) > compiledEpoch)) {
    throw new RangeError('source retrieval must not postdate compilation')
  }
}

const parseCore = (rawInput: unknown): ParsedCore => {
  const input = CompilePilotInputSchema.parse(rawInput)
  validateSourceContext(input)
  const compileDate = malaysiaDateAt(input.compiledAt)
  const premiseLookups = parsePremiseLookups(input.premiseLookups)
  const itemLookups = parseItemLookups(input.itemLookups)
  const premises = input.content.premises.map(value => PrivatePremiseReviewSchema.parse(value))
    .sort((left, right) => compareCanonicalCodes(left.code, right.code))
  const items = input.content.items.map(value => PrivateItemReviewSchema.parse(value))
    .sort((left, right) => compareCanonicalCodes(left.code, right.code))
  const microzones = input.content.microzones.map(value => PrivateMicrozoneSchema.parse(value))
    .sort((left, right) => compareText(left.id, right.id))
  if (premises.length === 0 || items.length === 0 || microzones.length === 0 || microzones.length > 2) throw new RangeError('approved content must be non-empty and bounded')
  validatePrivateContent(input, premises, items, microzones, premiseLookups, itemLookups)

  const premiseLookupMap = new Map(premiseLookups.map(row => [row.code, row]))
  const itemLookupMap = new Map(itemLookups.map(row => [row.code, row]))
  const premiseCodes = new Set(premises.map(row => row.code))
  const itemCodes = new Set(items.map(row => row.code))
  const seenSourceRows = new Set<string>()
  const unknownItemCodes: Record<string, number> = {}
  const unknownPremiseCodes: Record<string, number> = {}
  let parsedRowCount = 0
  let invalidRowCount = 0
  let afterThroughRowCount = 0
  let futureRowCount = 0
  const referenceRows: SourcedObservation[] = []
  const pilotRows: SourcedObservation[] = []
  const rejectedReferenceRows: SourcedInvalidObservation[] = []
  const rejectedPilotRows: SourcedInvalidObservation[] = []

  for (const candidate of input.transactions) {
    const raw = RawTransactionRowSchema.parse(candidate)
    const manifestSource = input.sourceLock.sources[raw.sourceManifestIndex]
    if (!manifestSource || manifestSource.role !== 'transactions') throw new RangeError('transaction provenance must reference a transaction manifest')
    if (raw.rowNumber > manifestSource.manifest.rowCount) throw new RangeError('transaction provenance row exceeds manifest row count')
    const provenanceKey = `${raw.sourceManifestIndex}:${raw.rowNumber}`
    if (seenSourceRows.has(provenanceKey)) throw new RangeError('duplicate transaction source-row provenance')
    seenSourceRows.add(provenanceKey)
    const dateResult = LocalDateSchema.safeParse(raw.date)
    const premiseCode = canonicalizeCode(raw.premise_code)
    const itemCode = canonicalizeCode(raw.item_code)
    if (dateResult.success && manifestSource.yearMonth !== dateResult.data.slice(0, 7)) {
      throw new RangeError('transaction provenance month mismatch')
    }
    if (!dateResult.success || premiseCode === null || itemCode === null) {
      invalidRowCount += 1
      continue
    }
    const observedDate = dateResult.data
    parsedRowCount += 1
    if (!premiseLookupMap.has(premiseCode)) countCode(unknownPremiseCodes, premiseCode)
    if (!itemLookupMap.has(itemCode)) countCode(unknownItemCodes, itemCode)
    const priceSen = parsePriceSen(raw.price)
    if (priceSen === null) invalidRowCount += 1
    if (observedDate > compileDate) { futureRowCount += 1; continue }
    if (observedDate > input.throughDate) { afterThroughRowCount += 1; continue }
    const premiseLookup = premiseLookupMap.get(premiseCode)
    const itemLookup = itemLookupMap.get(itemCode)
    if (!premiseLookup || !itemLookup) continue
    if (normalizeLookupToken(premiseLookup.state) !== 'selangor' || !isAllowedSingleOperator(premiseLookup.premiseType) || !itemCodes.has(itemCode)) continue
    const shared = {
      observedDate, premiseCode, itemCode, officialUnit: itemLookup.unit,
      sourceManifestIndex: raw.sourceManifestIndex, rowNumber: raw.rowNumber
    }
    if (priceSen === null) {
      const invalid = { ...shared, status: 'invalid-price' as const, rawPriceValue: String(raw.price) }
      rejectedReferenceRows.push(invalid)
      if (premiseCodes.has(premiseCode)) rejectedPilotRows.push(invalid)
      continue
    }
    const observation = { ...shared, priceSen }
    referenceRows.push(observation)
    if (premiseCodes.has(premiseCode)) pilotRows.push(observation)
  }

  return {
    input, premises, items, microzones, premiseLookups, itemLookups,
    referenceRows, pilotRows, rejectedReferenceRows, rejectedPilotRows,
    ingestionSummary: {
      inputRowCount: input.transactions.length, parsedRowCount, invalidRowCount,
      afterThroughRowCount, futureRowCount,
      unknownItemCodes: Object.fromEntries(Object.entries(unknownItemCodes).sort(([left], [right]) => compareCanonicalCodes(left, right))),
      unknownPremiseCodes: Object.fromEntries(Object.entries(unknownPremiseCodes).sort(([left], [right]) => compareCanonicalCodes(left, right)))
    }
  }
}

const withoutProvenance = (row: SourcedParsedObservation): ParsedObservation => {
  if ('priceSen' in row) return {
    observedDate: row.observedDate, premiseCode: row.premiseCode, itemCode: row.itemCode,
    officialUnit: row.officialUnit, priceSen: row.priceSen
  }
  return {
    observedDate: row.observedDate, premiseCode: row.premiseCode, itemCode: row.itemCode,
    officialUnit: row.officialUnit, status: 'invalid-price', rawPriceValue: row.rawPriceValue
  }
}

const sourceRowsFor = (rows: readonly SourcedParsedObservation[], key: string) => rows
  .filter(row => observationKey(row) === key).map(rowRef).sort(compareRowRefs)

const MAX_INVALID_RAW_PRICE_LENGTH = 64

const encodeInvalidPriceClasses = (rows: readonly SourcedInvalidObservation[]): SourcedInvalidObservation[] => {
  const rawValuesByCell = new Map<string, Set<string>>()
  for (const row of rows) {
    const values = rawValuesByCell.get(observationKey(row)) ?? new Set<string>()
    values.add(row.rawPriceValue)
    rawValuesByCell.set(observationKey(row), values)
  }
  const encodedByCell = new Map<string, Map<string, string>>()
  for (const [key, rawValueSet] of rawValuesByCell) {
    const rawValues = [...rawValueSet].sort(compareText)
    const encoded = new Map<string, string>()
    const occupied = new Set(rawValues.filter(value => value.length <= MAX_INVALID_RAW_PRICE_LENGTH))
    for (const value of occupied) encoded.set(value, value)
    const longValuesByPrefix = new Map<string, string[]>()
    for (const value of rawValues.filter(candidate => candidate.length > MAX_INVALID_RAW_PRICE_LENGTH)) {
      const prefix = value.slice(0, MAX_INVALID_RAW_PRICE_LENGTH)
      longValuesByPrefix.set(prefix, [...(longValuesByPrefix.get(prefix) ?? []), value])
    }
    for (const [prefix, collidingValues] of [...longValuesByPrefix.entries()].sort(([left], [right]) => compareText(left, right))) {
      if (collidingValues.length === 1 && !occupied.has(prefix)) {
        encoded.set(collidingValues[0]!, prefix)
        occupied.add(prefix)
        continue
      }
      let ordinal = 0
      for (const value of collidingValues.sort(compareText)) {
        let candidate: string
        do {
          const suffix = `~${ordinal.toString(36)}`
          if (suffix.length >= MAX_INVALID_RAW_PRICE_LENGTH) throw new RangeError('too many colliding invalid-price classes')
          candidate = `${prefix.slice(0, MAX_INVALID_RAW_PRICE_LENGTH - suffix.length)}${suffix}`
          ordinal += 1
        } while (occupied.has(candidate))
        encoded.set(value, candidate)
        occupied.add(candidate)
      }
    }
    encodedByCell.set(key, encoded)
  }
  return rows.map(row => ({
    ...row,
    rawPriceValue: encodedByCell.get(observationKey(row))!.get(row.rawPriceValue)!
  }))
}

const auditCellFor = (
  cell: ConsolidatedCell,
  stats: ReferenceStats,
  rows: readonly SourcedParsedObservation[]
): AuditCell | null => {
  const sourceRows = sourceRowsFor(rows, observationKey(cell))
  if (cell.status === 'invalid-price') return {
    premiseCode: cell.premiseCode, itemCode: cell.itemCode, observedDate: cell.observedDate,
    sourceRows, reason: 'invalid-price', rawPriceValues: cell.rawPriceValues, validPricesSen: cell.validPricesSen
  }
  if (cell.status === 'conflicting-duplicate') return {
    premiseCode: cell.premiseCode, itemCode: cell.itemCode, observedDate: cell.observedDate,
    sourceRows, reason: 'conflicting-duplicate', pricesSen: cell.pricesSen
  }
  const classified = classifyTargetCell(cell, stats)
  if (classified.status === 'eligible') return null
  if (classified.status === 'insufficient-reference') return {
    premiseCode: cell.premiseCode, itemCode: cell.itemCode, observedDate: cell.observedDate,
    sourceRows, reason: 'insufficient-reference', priceSen: cell.priceSen,
    distinctReferencePremises: stats.distinctPremises
  }
  if (stats.status !== 'ready' || !['outside-ratio-bound', 'robust-scale-outlier'].includes(classified.reason)) {
    throw new RangeError('value anomaly requires ready reference statistics and a value reason')
  }
  return {
    premiseCode: cell.premiseCode, itemCode: cell.itemCode, observedDate: cell.observedDate,
    sourceRows, reason: classified.reason as 'outside-ratio-bound' | 'robust-scale-outlier',
    priceSen: cell.priceSen, referenceMedianSen: stats.medianSen
  } as AuditCell
}

const validateDeskReports = (core: ParsedCore, dataAsOfDate: LocalDate): void => {
  const { input, premises, items } = core
  if (input.publicationMode !== 'desk-demo') return
  const coverage = CoverageCandidateReportV1Schema.parse(input.content.coverageReport)
  const feasibility = DistanceFeasibilityReportV1Schema.parse(input.content.feasibilityReport)
  if (!coverage.passesCoverageCandidateGate || !feasibility.passesDeskDemoGate || coverage.scope !== 'selected-content') throw new RangeError('desk reports must pass both selected-content gates')
  if (coverage.transformVersion !== input.transformVersion || feasibility.transformVersion !== input.transformVersion || coverage.transformVersion !== feasibility.transformVersion) throw new RangeError('desk report transform mismatch')
  if (coverage.throughDate !== input.throughDate || feasibility.throughDate !== input.throughDate ||
      coverage.sourceLockSha256 !== input.sourceLockSha256 || feasibility.sourceLockSha256 !== input.sourceLockSha256) throw new RangeError('desk report lock context mismatch')
  if (feasibility.coverageReportSha256 !== input.contentDigests.coverageReport ||
      feasibility.microzonesSha256 !== input.contentDigests.microzones ||
      feasibility.premisesSha256 !== input.contentDigests.premises || feasibility.itemsSha256 !== input.contentDigests.items) throw new RangeError('desk report digest binding mismatch')
  if (!coverage.selectedContentDigests || coverage.selectedContentDigests.premises !== input.contentDigests.premises ||
      coverage.selectedContentDigests.items !== input.contentDigests.items) throw new RangeError('coverage report content digest mismatch')
  if (coverage.dataAsOfDate !== dataAsOfDate || feasibility.dataAsOfDate !== dataAsOfDate) throw new RangeError('desk report data date differs from compiler horizon')
  if (feasibility.finalPremiseCodes.join('|') !== premises.map(row => row.code).join('|') ||
      feasibility.finalItemCodes.join('|') !== items.map(row => row.code).join('|')) throw new RangeError('desk report curated code set mismatch')
  if (input.sourceLock.analysisStartDate > addLocalDates(dataAsOfDate, -59)) throw new RangeError('feasibility lock does not cover the derived horizon')
}

const validateRetainedUniverseRows = (input: {
  core: ParsedCore
  dataAsOfDate: LocalDate
  referenceRows: readonly SourcedObservation[]
  pilotRows: readonly SourcedObservation[]
  rejectedReferenceRows: readonly SourcedInvalidObservation[]
  rejectedPilotRows: readonly SourcedInvalidObservation[]
}): void => {
  const premiseLookups = new Map(input.core.premiseLookups.map(row => [row.code, row]))
  const itemLookups = new Map(input.core.itemLookups.map(row => [row.code, row]))
  const curatedPremiseCodes = new Set(input.core.premises.map(row => row.code))
  const curatedItemCodes = new Set(input.core.items.map(row => row.code))
  const validateRow = (row: SourcedParsedObservation, pilot: boolean): void => {
    const premiseLookup = premiseLookups.get(row.premiseCode)
    const itemLookup = itemLookups.get(row.itemCode)
    if (!premiseLookup || !itemLookup) throw new RangeError('normalized row is absent from authoritative lookups')
    if (row.officialUnit !== itemLookup.unit) throw new RangeError('normalized row official unit differs from authoritative lookup')
    if (!curatedItemCodes.has(row.itemCode)) throw new RangeError('normalized row item is absent from curated content')
    if (normalizeLookupToken(premiseLookup.state) !== 'selangor' || !isAllowedSingleOperator(premiseLookup.premiseType)) {
      throw new RangeError('normalized row premise is outside the eligible reference universe')
    }
    if (pilot && !curatedPremiseCodes.has(row.premiseCode)) {
      throw new RangeError('normalized pilot row premise is absent from curated content')
    }
  }
  input.referenceRows.forEach(row => validateRow(row, false))
  input.rejectedReferenceRows.forEach(row => validateRow(row, false))
  input.pilotRows.forEach(row => validateRow(row, true))
  input.rejectedPilotRows.forEach(row => validateRow(row, true))

  const overlapDate = addLocalDates(input.dataAsOfDate, -1)
  const overlapKeys = (rows: readonly SourcedParsedObservation[], reference: boolean): string[] => rows
    .filter(row => row.observedDate === overlapDate && (!reference || curatedPremiseCodes.has(row.premiseCode)))
    .map(canonicalKey)
    .sort(compareText)
  if (overlapKeys(input.referenceRows, true).join('\n') !== overlapKeys(input.pilotRows, false).join('\n') ||
      overlapKeys(input.rejectedReferenceRows, true).join('\n') !== overlapKeys(input.rejectedPilotRows, false).join('\n')) {
    throw new RangeError('curated reference and pilot rows must overlap exactly on H-1')
  }
}

const materialize = (
  core: ParsedCore,
  reviewMode: 'final' | 'collection' = 'final'
): { snapshot: PilotSnapshotV1, audit: CompilerAuditV1, normalizedSlice: NormalizedSourceSliceV1 } => {
  const { input } = core
  validateSourceContext(input)
  const compileDate = malaysiaDateAt(input.compiledAt)
  const validPilotDates = core.pilotRows.map(row => row.observedDate).filter(date => date <= input.throughDate && date <= compileDate).sort()
  const dataAsOfDate = validPilotDates.at(-1)
  if (!dataAsOfDate) throw new RangeError('compiler requires at least one valid pilot row')
  if (dataAsOfDate > input.throughDate || dataAsOfDate > compileDate) throw new RangeError('derived data date exceeds cutoff')
  validateDeskReports(core, dataAsOfDate)
  const targetDates: [LocalDate, LocalDate] = [addLocalDates(dataAsOfDate, -1), dataAsOfDate]
  const referenceStart = addLocalDates(dataAsOfDate, -31)
  const referenceEnd = addLocalDates(dataAsOfDate, -1)
  const trimmedReferenceRows = core.referenceRows.filter(row => row.observedDate >= referenceStart && row.observedDate <= referenceEnd)
  const trimmedRejectedReferenceRows = core.rejectedReferenceRows.filter(row => row.observedDate >= referenceStart && row.observedDate <= referenceEnd)
  const trimmedPilotRows = core.pilotRows.filter(row => targetDates.includes(row.observedDate))
  const trimmedRejectedPilotRows = core.rejectedPilotRows.filter(row => targetDates.includes(row.observedDate))
  validateRetainedUniverseRows({
    core, dataAsOfDate,
    referenceRows: trimmedReferenceRows, pilotRows: trimmedPilotRows,
    rejectedReferenceRows: trimmedRejectedReferenceRows, rejectedPilotRows: trimmedRejectedPilotRows
  })
  const boundedRejectedRows = encodeInvalidPriceClasses([
    ...trimmedRejectedReferenceRows, ...trimmedRejectedPilotRows
  ])
  const boundedRejectedReferenceRows = boundedRejectedRows.slice(0, trimmedRejectedReferenceRows.length)
  const boundedRejectedPilotRows = boundedRejectedRows.slice(trimmedRejectedReferenceRows.length)
  const referenceCollapsed = collapseObservationRows([
    ...trimmedReferenceRows.map(withoutProvenance), ...boundedRejectedReferenceRows.map(withoutProvenance)
  ])
  const targetSourceRows: SourcedParsedObservation[] = [...trimmedPilotRows, ...boundedRejectedPilotRows]
  const targetCollapsed = collapseObservationRows(targetSourceRows.map(withoutProvenance))
  const targetCellMap = new Map(targetCollapsed.cells.map(cell => [cellKey(cell), cell]))
  const referenceStats = new Map<string, ReferenceStats>()
  for (const item of core.items) for (const targetDate of targetDates) {
    referenceStats.set(`${item.code}:${targetDate}`, buildReferenceStats(referenceCollapsed.cells, item.code, targetDate))
  }
  const evidence: PilotSnapshotV1['evidence'] = []
  const rejectedCells: AuditCell[] = []
  const eligibleLowCells: EligibleLowCell[] = []
  const evidenceStatusCounts = { eligible: 0, missing: 0, anomalous: 0, insufficientReference: 0 }
  for (const premise of core.premises) {
    for (const item of core.items) {
      const observations: PilotSnapshotV1['evidence'][number]['observations'] = []
      for (const targetDate of targetDates) {
        const key = JSON.stringify([targetDate, premise.code, item.code])
        const targetCell = targetCellMap.get(key)
        if (!targetCell) {
          observations.push({ status: 'missing', observedDate: targetDate })
          evidenceStatusCounts.missing += 1
          continue
        }
        const stats = referenceStats.get(`${item.code}:${targetDate}`)!
        const classified = classifyTargetCell(targetCell, stats)
        observations.push(classified)
        if (classified.status === 'eligible') evidenceStatusCounts.eligible += 1
        else if (classified.status === 'anomalous') evidenceStatusCounts.anomalous += 1
        else evidenceStatusCounts.insufficientReference += 1
        const rejected = auditCellFor(targetCell, stats, targetSourceRows)
        if (rejected) rejectedCells.push(rejected)
        if (classified.status === 'eligible' && stats.status === 'ready' && classified.priceSen * 2 < stats.medianSen) {
          eligibleLowCells.push({
            premiseCode: premise.code, itemCode: item.code, observedDate: targetDate,
            priceSen: classified.priceSen, referenceMedianSen: stats.medianSen,
            sourceRows: sourceRowsFor(targetSourceRows, observationKey(targetCell))
          })
        }
      }
      evidence.push({ premiseCode: premise.code, itemCode: item.code, officialUnit: item.officialUnit, observations })
    }
  }
  const buildId = `${input.publicationMode}-${dataAsOfDate}-${input.effectiveInputSha256.slice(0, 16)}`
  const snapshot = PilotSnapshotV1Schema.parse({
    schemaVersion: 1, buildId, transformVersion: input.transformVersion,
    compiledAt: input.compiledAt, dataAsOfDate, publicationMode: input.publicationMode,
    timeZone: 'Asia/Kuala_Lumpur', sources: input.sourceLock.sources.map(source => source.manifest),
    attribution: {
      text: 'PriceCatcher data transformed by AUNTIE Saves.',
      transactionalRecordsUrl: 'https://data.gov.my/data-catalogue/pricecatcher',
      premiseLookupUrl: 'https://data.gov.my/data-catalogue/lookup_premise',
      itemLookupUrl: 'https://data.gov.my/data-catalogue/lookup_item',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
    },
    premises: core.premises.map(({ reviews: _reviews, ...premise }) => premise),
    items: core.items.map(({ reviews: _reviews, semanticStatus: _semanticStatus, ...item }) => ({
      ...item, qualifiers: item.qualifiers.map(normalizeQualifierDisplay).sort((left, right) => compareText(normalizeQualifierKey(left), normalizeQualifierKey(right)))
    })), evidence
  })

  const qualityFlags: QualityReviewBasisV1[] = [
    ...rejectedCells.map(cell => ({ flag: 'rejected-cell' as const, cell })),
    ...eligibleLowCells.map(cell => ({ flag: 'eligible-below-half-median' as const, cell }))
  ]
  let basis: QualityReviewBasisFileV1 | undefined
  let qualityReviewDispositionCount = 0
  let unreviewedQualityFlags = [...qualityFlags]
  if (reviewMode === 'final') {
    basis = QualityReviewBasisFileV1Schema.parse(input.content.qualityReviewBasis)
    if (basis.transformVersion !== input.transformVersion || basis.compiledAt !== input.compiledAt ||
        basis.throughDate !== input.throughDate || basis.sourceLockSha256 !== input.sourceLockSha256 ||
        basis.reviewInputSha256 !== input.reviewInputSha256 || basis.publicationMode !== input.publicationMode ||
        basis.inputDigests.microzones !== input.contentDigests.microzones || basis.inputDigests.premises !== input.contentDigests.premises ||
        basis.inputDigests.items !== input.contentDigests.items || basis.inputDigests.coverageReport !== input.contentDigests.coverageReport ||
        basis.inputDigests.feasibilityReport !== input.contentDigests.feasibilityReport) throw new RangeError('quality review basis context mismatch')
    requireCanonicalSetEquality(basis.qualityFlags, qualityFlags, 'quality review basis flags differ from reconstructed flags')
    const qualityReviews = PrivateQualityReviewsFileV1Schema.parse(input.content.qualityReviews)
    if (qualityReviews.qualityReviewBasisSha256 !== input.contentDigests.qualityReviewBasis) throw new RangeError('quality review wrapper basis digest mismatch')
    const compileLocalDate = malaysiaDateAt(input.compiledAt)
    if (qualityReviews.qualityReviews.some(review => review.reviewedOn > compileLocalDate || review.reviews.some(pass => pass.reviewedOn > compileLocalDate))) throw new RangeError('quality review is future-dated')
    requireCanonicalSetEquality(qualityReviews.qualityReviews.map(review => review.reviewBasis), qualityFlags, 'quality review dispositions do not cover the current flags')
    const dispositionKeys = new Set(qualityReviews.qualityReviews.map(review => canonicalKey(review.reviewBasis)))
    unreviewedQualityFlags = qualityFlags.filter(flag => !dispositionKeys.has(canonicalKey(flag)))
    qualityReviewDispositionCount = qualityReviews.qualityReviews.length
  }
  const retainedByProvenance = new Map<string, SourcedParsedObservation>()
  for (const row of [...trimmedReferenceRows, ...boundedRejectedReferenceRows, ...trimmedPilotRows, ...boundedRejectedPilotRows]) {
    retainedByProvenance.set(`${row.sourceManifestIndex}:${row.rowNumber}`, row)
  }
  const retainedUnique = [...retainedByProvenance.values()]
  const retainedCollapsed = collapseObservationRows(retainedUnique.map(withoutProvenance))
  const matrixCellCount = core.premises.length * core.items.length * 2
  const completePairs = core.premises.flatMap(premise => targetDates.map(targetDate =>
    core.items.every(item => evidence.find(cell => cell.premiseCode === premise.code && cell.itemCode === item.code)!
      .observations.some(observation => observation.observedDate === targetDate && observation.status === 'eligible'))
  )).filter(Boolean).length
  const audit = CompilerAuditV1Schema.parse({
    schemaVersion: 1, buildId, transformVersion: input.transformVersion, compiledAt: input.compiledAt,
    throughDate: input.throughDate, sourceWindow: input.sourceLock.window, sourceLockSha256: input.sourceLockSha256,
    publicationMode: input.publicationMode, targetDates,
    inputRowCount: core.ingestionSummary.inputRowCount, parsedRowCount: core.ingestionSummary.parsedRowCount,
    referenceRowCount: trimmedReferenceRows.length, pilotRowCount: trimmedPilotRows.length,
    publicEligibleRowCount: evidenceStatusCounts.eligible,
    unknownItemCodes: core.ingestionSummary.unknownItemCodes, unknownPremiseCodes: core.ingestionSummary.unknownPremiseCodes,
    invalidRowCount: core.ingestionSummary.invalidRowCount, afterThroughRowCount: core.ingestionSummary.afterThroughRowCount,
    futureRowCount: core.ingestionSummary.futureRowCount, exactDuplicateCount: retainedCollapsed.exactDuplicateCount,
    conflictingCellCount: retainedCollapsed.conflictingCellCount, evidenceStatusCounts,
    eligibleLineRateBasisPoints: matrixCellCount === 0 ? 0 : Math.floor(evidenceStatusCounts.eligible * 10_000 / matrixCellCount),
    completeBasketRateBasisPoints: core.premises.length === 0 ? 0 : Math.floor(completePairs * 10_000 / (core.premises.length * 2)),
    degenerateReferenceItemCodes: core.items.filter(item => targetDates.some(date => referenceStats.get(`${item.code}:${date}`)?.status === 'insufficient-reference')).map(item => item.code),
    rejectedCells: sortedCanonical(rejectedCells), eligibleLowCellsBelowHalfMedian: sortedCanonical(eligibleLowCells),
    qualityReviewDispositionCount,
    qualityFlags: sortedCanonical(qualityFlags), unreviewedQualityFlags: sortedCanonical(unreviewedQualityFlags)
  })
  if (Object.values(evidenceStatusCounts).reduce((sum, count) => sum + count, 0) !== matrixCellCount) throw new RangeError('evidence status counts do not cover the matrix')
  validateCompilerAuditAgainstSnapshot(snapshot, audit)

  const normalizedSlice = NormalizedSourceSliceV1Schema.parse({
    schemaVersion: 1, buildId, sourceLock: input.sourceLock, sourceLockSha256: input.sourceLockSha256,
    transformVersion: input.transformVersion, compiledAt: input.compiledAt, throughDate: input.throughDate,
    sourceWindow: input.sourceLock.window, publicationMode: input.publicationMode,
    effectiveInputSha256: input.effectiveInputSha256, reviewHostPolicySha256: input.reviewHostPolicySha256,
    contentDigests: input.contentDigests, ingestionSummary: core.ingestionSummary,
    premiseLookups: core.premiseLookups, itemLookups: core.itemLookups,
    referenceRows: trimmedReferenceRows.sort(compareSourcedRows), pilotRows: trimmedPilotRows.sort(compareSourcedRows),
    rejectedReferenceRows: boundedRejectedReferenceRows.sort(compareSourcedRows).map(({ status: _status, ...row }) => ({
      ...row, reason: 'invalid-price' as const
    })),
    rejectedPilotRows: boundedRejectedPilotRows.sort(compareSourcedRows).map(({ status: _status, ...row }) => ({
      ...row, reason: 'invalid-price' as const
    }))
  })
  validateSourceRowProvenance({ sourceLock: input.sourceLock, normalizedSlice, audit, qualityBasis: basis })
  return { snapshot, audit, normalizedSlice }
}

const compareSourcedRows = (left: SourcedParsedObservation, right: SourcedParsedObservation): number =>
  compareText(left.observedDate, right.observedDate) || compareCanonicalCodes(left.premiseCode, right.premiseCode) ||
  compareCanonicalCodes(left.itemCode, right.itemCode) || left.sourceManifestIndex - right.sourceManifestIndex || left.rowNumber - right.rowNumber

export function validateSourceRowProvenance(input: {
  sourceLock: CompilePilotInput['sourceLock']
  normalizedSlice: NormalizedSourceSliceV1
  audit: CompilerAuditV1 | Omit<CompilerAuditV1, 'buildId'>
  qualityBasis?: z.infer<typeof QualityReviewBasisFileV1Schema>
}): void {
  const rowArrays = [
    input.normalizedSlice.referenceRows, input.normalizedSlice.pilotRows,
    input.normalizedSlice.rejectedReferenceRows, input.normalizedSlice.rejectedPilotRows
  ] as const
  for (const rowArray of rowArrays) {
    const provenance = rowArray.map(row => `${row.sourceManifestIndex}:${row.rowNumber}`)
    if (new Set(provenance).size !== provenance.length) {
      throw new RangeError('source-row provenance must be unique within each normalized slice array')
    }
  }
  const rows = rowArrays.flat()
  const identities = new Map<string, string>()
  const fullIdentities = new Map<string, string>()
  const retainedRows = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    const source = input.sourceLock.sources[row.sourceManifestIndex]
    if (!source || source.role !== 'transactions' || source.yearMonth !== row.observedDate.slice(0, 7) || row.rowNumber > source.manifest.rowCount) {
      throw new RangeError('normalized row has invalid source provenance')
    }
    const provenance = `${row.sourceManifestIndex}:${row.rowNumber}`
    const identity = cellKey(row)
    const fullIdentity = canonicalKey('priceSen' in row
      ? { kind: 'value', ...row }
      : { kind: 'invalid-price', ...row })
    if (identities.has(provenance) && identities.get(provenance) !== identity) throw new RangeError('source provenance maps to conflicting row identities')
    if (fullIdentities.has(provenance) && fullIdentities.get(provenance) !== fullIdentity) throw new RangeError('source provenance maps to conflicting normalized row values')
    identities.set(provenance, identity)
    fullIdentities.set(provenance, fullIdentity)
    if (!retainedRows.has(provenance)) retainedRows.set(provenance, row)
  }
  const validateCell = (cell: AuditCell | EligibleLowCell): void => {
    const refs = cell.sourceRows.map(ref => `${ref.sourceManifestIndex}:${ref.rowNumber}`)
    if (new Set(refs).size !== refs.length) throw new RangeError('quality evidence repeats a source-row reference')
    for (const ref of refs) if (identities.get(ref) !== cellKey(cell)) throw new RangeError('quality evidence source row is missing or mismatched')
    const expectedRefs = [...identities.entries()].filter(([, identity]) => identity === cellKey(cell)).map(([ref]) => ref).sort()
    if ([...refs].sort().join('|') !== expectedRefs.join('|')) throw new RangeError('quality evidence does not bind every retained source row for its cell')
    const resolved = refs.map(ref => retainedRows.get(ref)!)
    const validPrices = [...new Set(resolved.flatMap(row => 'priceSen' in row ? [row.priceSen] : []))].sort((left, right) => left - right)
    if ('reason' in cell && cell.reason === 'invalid-price') {
      const rawPrices = [...new Set(resolved.flatMap(row => 'rawPriceValue' in row ? [row.rawPriceValue] : []))].sort()
      if (canonicalKey(validPrices) !== canonicalKey(cell.validPricesSen) || canonicalKey(rawPrices) !== canonicalKey(cell.rawPriceValues)) {
        throw new RangeError('invalid-price audit values differ from retained source rows')
      }
    } else if ('reason' in cell && cell.reason === 'conflicting-duplicate') {
      if (resolved.some(row => !('priceSen' in row)) || canonicalKey(validPrices) !== canonicalKey(cell.pricesSen)) {
        throw new RangeError('conflict audit prices differ from retained source rows')
      }
    } else {
      if (resolved.some(row => !('priceSen' in row)) || validPrices.length !== 1 || validPrices[0] !== cell.priceSen) {
        throw new RangeError('quality evidence price differs from retained source rows')
      }
    }
  }
  input.audit.rejectedCells.forEach(validateCell)
  input.audit.eligibleLowCellsBelowHalfMedian.forEach(validateCell)
  input.audit.qualityFlags.forEach(flag => validateCell(flag.cell))
  input.qualityBasis?.qualityFlags.forEach(flag => validateCell(flag.cell))
}

export function validateCompilerAuditAgainstSnapshot(snapshotValue: unknown, auditValue: unknown): void {
  const snapshot = PilotSnapshotV1Schema.parse(snapshotValue)
  const audit = CompilerAuditV1Schema.parse(auditValue)
  if (audit.buildId !== snapshot.buildId || audit.transformVersion !== snapshot.transformVersion ||
      audit.compiledAt !== snapshot.compiledAt || audit.publicationMode !== snapshot.publicationMode) {
    throw new RangeError('audit identity differs from snapshot identity')
  }
  const targetDates = [addLocalDates(snapshot.dataAsOfDate, -1), snapshot.dataAsOfDate]
  if (audit.targetDates.join('|') !== targetDates.join('|')) throw new RangeError('audit target dates differ from snapshot')
  const expectedCounts = { eligible: 0, missing: 0, anomalous: 0, insufficientReference: 0 }
  for (const cell of snapshot.evidence) for (const observation of cell.observations) {
    if (observation.status === 'eligible') expectedCounts.eligible += 1
    else if (observation.status === 'missing') expectedCounts.missing += 1
    else if (observation.status === 'anomalous') expectedCounts.anomalous += 1
    else expectedCounts.insufficientReference += 1
  }
  if (canonicalKey(expectedCounts) !== canonicalKey(audit.evidenceStatusCounts)) throw new RangeError('audit status counts differ from snapshot matrix')
  const matrixCellCount = snapshot.premises.length * snapshot.items.length * 2
  if (Object.values(expectedCounts).reduce((sum, count) => sum + count, 0) !== matrixCellCount ||
      audit.publicEligibleRowCount !== expectedCounts.eligible) throw new RangeError('audit matrix denominator differs from snapshot')
  const expectedEligibleRate = matrixCellCount === 0 ? 0 : Math.floor(expectedCounts.eligible * 10_000 / matrixCellCount)
  if (audit.eligibleLineRateBasisPoints !== expectedEligibleRate) throw new RangeError('audit eligible-line rate differs from snapshot')
  const completePairs = snapshot.premises.flatMap(premise => targetDates.map(targetDate =>
    snapshot.items.every(item => snapshot.evidence.find(cell => cell.premiseCode === premise.code && cell.itemCode === item.code)!
      .observations.some(observation => observation.observedDate === targetDate && observation.status === 'eligible'))
  )).filter(Boolean).length
  const premiseTargetPairCount = snapshot.premises.length * 2
  const expectedCompleteRate = premiseTargetPairCount === 0 ? 0 : Math.floor(completePairs * 10_000 / premiseTargetPairCount)
  if (audit.completeBasketRateBasisPoints !== expectedCompleteRate) throw new RangeError('audit complete-basket rate differs from snapshot')
}

export function compilePilot(input: unknown): {
  snapshot: PilotSnapshotV1
  audit: CompilerAuditV1
  normalizedSlice: NormalizedSourceSliceV1
} {
  return materialize(parseCore(input))
}

const ZERO_SHA256 = '0'.repeat(64)

export function collectQualityReviewBasis(inputValue: unknown): {
  audit: QualityReviewCollectionAuditV1
  basis: QualityReviewBasisFileV1
} {
  const input = CollectQualityReviewInputSchema.parse(inputValue)
  const compileInput: CompilePilotInput = CompilePilotInputSchema.parse({
    transformVersion: input.transformVersion,
    compiledAt: input.compiledAt,
    throughDate: input.throughDate,
    publicationMode: input.publicationMode,
    effectiveInputSha256: ZERO_SHA256,
    reviewInputSha256: input.reviewInputSha256,
    contentDigests: {
      ...input.inputDigests,
      qualityReviews: ZERO_SHA256,
      qualityReviewBasis: ZERO_SHA256,
      reviewProvenance: ZERO_SHA256
    },
    sourceLock: input.sourceLock,
    sourceLockSha256: input.sourceLockSha256,
    reviewHostPolicy: input.reviewHostPolicy,
    reviewHostPolicySha256: input.reviewHostPolicySha256,
    transactions: input.transactions,
    premiseLookups: input.premiseLookups,
    itemLookups: input.itemLookups,
    content: {
      ...input.content,
      qualityReviews: {},
      qualityReviewBasis: {}
    }
  })
  const compiled = materialize(parseCore(compileInput), 'collection')
  const { buildId: _buildId, ...auditWithoutBuildId } = compiled.audit
  const audit = QualityReviewCollectionAuditV1Schema.parse({
    ...auditWithoutBuildId,
    reviewInputSha256: input.reviewInputSha256
  })
  const basis = QualityReviewBasisFileV1Schema.parse({
    schemaVersion: 1,
    transformVersion: input.transformVersion,
    compiledAt: input.compiledAt,
    throughDate: input.throughDate,
    sourceLockSha256: input.sourceLockSha256,
    reviewInputSha256: input.reviewInputSha256,
    publicationMode: input.publicationMode,
    inputDigests: input.inputDigests,
    qualityFlags: compiled.audit.qualityFlags
  })
  validateSourceRowProvenance({ sourceLock: input.sourceLock, normalizedSlice: compiled.normalizedSlice, audit, qualityBasis: basis })
  return { audit, basis }
}

export interface VerifiedCompilerDigests {
  sourceLockSha256: string
  effectiveInputSha256: string
  reviewInputSha256: string
  reviewHostPolicySha256?: string
  contentDigests: CompilePilotInput['contentDigests']
}

export type ParsedCompilerContent = CompilePilotInput['content'] & {
  reviewHostPolicy?: CompilePilotInput['reviewHostPolicy']
}

export function compilePilotFromNormalizedSlice(input: {
  slice: unknown
  parsedContent: ParsedCompilerContent
  parsedCoverageReport?: unknown
  parsedFeasibilityReport?: unknown
  verifiedDigests: VerifiedCompilerDigests
}): { snapshot: PilotSnapshotV1, audit: CompilerAuditV1, normalizedSlice: NormalizedSourceSliceV1 } {
  const slice = NormalizedSourceSliceV1Schema.parse(input.slice)
  if (input.verifiedDigests.sourceLockSha256 !== slice.sourceLockSha256 ||
      input.verifiedDigests.effectiveInputSha256 !== slice.effectiveInputSha256 ||
      input.verifiedDigests.reviewHostPolicySha256 !== slice.reviewHostPolicySha256 ||
      canonicalKey(input.verifiedDigests.contentDigests) !== canonicalKey(slice.contentDigests)) {
    throw new RangeError('verified digest record differs from normalized slice')
  }
  const compileInput = CompilePilotInputSchema.parse({
    transformVersion: slice.transformVersion,
    compiledAt: slice.compiledAt,
    throughDate: slice.throughDate,
    publicationMode: slice.publicationMode,
    effectiveInputSha256: input.verifiedDigests.effectiveInputSha256,
    reviewInputSha256: input.verifiedDigests.reviewInputSha256,
    contentDigests: input.verifiedDigests.contentDigests,
    sourceLock: slice.sourceLock,
    sourceLockSha256: input.verifiedDigests.sourceLockSha256,
    reviewHostPolicy: input.parsedContent.reviewHostPolicy,
    reviewHostPolicySha256: input.verifiedDigests.reviewHostPolicySha256,
    transactions: [],
    premiseLookups: slice.premiseLookups.map(row => ({
      premise_code: row.code, premise: row.name, address: row.address,
      premise_type: row.premiseType, state: row.state, district: row.district
    })),
    itemLookups: slice.itemLookups.map(row => ({
      item_code: row.code, item: row.name, unit: row.unit,
      item_group: row.itemGroup, item_category: row.itemCategory
    })),
    content: {
      microzones: input.parsedContent.microzones,
      premises: input.parsedContent.premises,
      items: input.parsedContent.items,
      qualityReviews: input.parsedContent.qualityReviews,
      qualityReviewBasis: input.parsedContent.qualityReviewBasis,
      coverageReport: input.parsedCoverageReport,
      feasibilityReport: input.parsedFeasibilityReport
    }
  })
  const premises = compileInput.content.premises.map(value => PrivatePremiseReviewSchema.parse(value))
    .sort((left, right) => compareCanonicalCodes(left.code, right.code))
  const items = compileInput.content.items.map(value => PrivateItemReviewSchema.parse(value))
    .sort((left, right) => compareCanonicalCodes(left.code, right.code))
  const microzones = compileInput.content.microzones.map(value => PrivateMicrozoneSchema.parse(value))
    .sort((left, right) => compareText(left.id, right.id))
  validatePrivateContent(compileInput, premises, items, microzones, slice.premiseLookups, slice.itemLookups)
  const core: ParsedCore = {
    input: compileInput,
    premises,
    items,
    microzones,
    premiseLookups: slice.premiseLookups,
    itemLookups: slice.itemLookups,
    referenceRows: slice.referenceRows,
    pilotRows: slice.pilotRows,
    rejectedReferenceRows: slice.rejectedReferenceRows.map(({ reason: _reason, ...row }) => ({
      ...row, status: 'invalid-price' as const
    })),
    rejectedPilotRows: slice.rejectedPilotRows.map(({ reason: _reason, ...row }) => ({
      ...row, status: 'invalid-price' as const
    })),
    ingestionSummary: slice.ingestionSummary
  }
  const reproduced = materialize(core)
  if (canonicalKey(reproduced.normalizedSlice) !== canonicalKey(slice)) throw new RangeError('normalized slice does not reproduce its derived identity and rows')
  return reproduced
}
