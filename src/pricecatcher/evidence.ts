import { addLocalDates, malaysiaDateAt } from './dates'
import { haversineMetres } from './distance'
import { canonicalizeCode, compareCanonicalCodes } from './ids'
import { checkedAdd } from './money'
import { CanonicalCodeSchema, ISOInstantSchema, type ISOInstant, type LocalDate, type ReasonCode, type Sen } from './contracts/common'
import {
  RecommendationInputSchema,
  type ExclusionCounts, type RecommendationInput, type RecommendationRequest, type ReasonDetail
} from './contracts/recommendation'
import type { EvidenceCellV1, ObservationEvidenceV1, PilotSnapshotV1 } from './contracts/snapshot'

const FAILURE_ORDER = ['anomalous', 'insufficient-reference', 'stale', 'missing', 'date-mismatch'] as const
const EXCLUSION_ORDER = ['outside-radius', ...FAILURE_ORDER] as const
const MAX_MERGED_QUANTITY_HUNDREDTHS = 9_900
const RECOMMENDATION_REQUEST_KEYS = [
  'evaluatedAt', 'location', 'usualPremiseCode', 'basketScope', 'lines', 'mode',
  'fuelEfficiencyDeciKmPerL', 'fuelPriceSenPerL', 'fixedTripCostByPremiseCode', 'worthwhileThresholdSen'
] as const
type FailureBucket = typeof FAILURE_ORDER[number]
type ComparisonOnlyReason = 'selected-items-only' | 'walking-route-unverified' | 'fixed-trip-cost-unknown' | 'publication-not-consumer-ready'

export interface EvidencePreflightInput {
  evaluatedAt: ISOInstant
  location: RecommendationInput['location']
  usualPremiseCode: string
  lines: RecommendationInput['lines']
  mode: RecommendationInput['mode']
}

export type BasketDiscoveryInput = Omit<EvidencePreflightInput, 'mode'>

export interface CompletePremiseEvidence {
  premiseCode: string
  straightLineMetres: number
  lines: Array<{ itemCode: string; officialUnit: string; quantityHundredths: number; observedDate: LocalDate; priceSen: Sen }>
}

export interface PreflightEvidence {
  baselineReady: boolean
  completeCandidatePremiseCodes: string[]
  excludedByReason: ExclusionCounts['excludedByReason']
}

export interface BasketDiscoveryPreflight extends PreflightEvidence {
  label: 'complete for these items within 5 km discovery—choose a travel mode to apply its radius'
}

export interface UsualAndGeometryPreflight {
  usualPremiseReady: boolean
  usualHasRecentPilotData: boolean
  coordinateViablePremiseCount: number
  label: 'within 5 km'
}

export type EvidenceEvaluation =
  | { kind: 'ready'; evaluatedDate: LocalDate; usual: CompletePremiseEvidence; candidates: CompletePremiseEvidence[]; exclusions: ExclusionCounts; comparisonOnlyReasons: ComparisonOnlyReason[] }
  | { kind: 'insufficient-evidence'; primaryReason: ReasonCode; details: ReasonDetail[]; exclusions?: ExclusionCounts }

type SelectedObservation = ObservationEvidenceV1
type CandidateAssessment = { complete?: CompletePremiseEvidence; bucket?: FailureBucket; details: ReasonDetail[] }

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const defineData = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true })
}
const readPlainDataRecord = (value: unknown): Record<string, unknown> | null => {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null
    const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value)
    const descriptorKeys = Reflect.ownKeys(descriptors)
    if (descriptorKeys.some(key => typeof key !== 'string')) return null
    const copy: Record<string, unknown> = {}
    for (const key of descriptorKeys as string[]) {
      const descriptor = descriptors[key]
      if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) return null
      defineData(copy, key, descriptor.value)
    }
    return copy
  } catch { return null }
}
const readAllowedPlainData = (value: unknown, allowedKeys: readonly string[]): Record<string, unknown> | null => {
  const copy = readPlainDataRecord(value)
  return copy && Object.keys(copy).every(key => allowedKeys.includes(key)) ? copy : null
}
const readExactPlainData = (value: unknown, keys: readonly string[]): Record<string, unknown> | null => {
  const copy = readPlainDataRecord(value)
  return copy && Object.keys(copy).length === keys.length && keys.every(key => hasOwn(copy, key)) ? copy : null
}
const maximumSatisfiableRawLineCount = (itemCount: number): number =>
  itemCount > Math.floor(Number.MAX_SAFE_INTEGER / MAX_MERGED_QUANTITY_HUNDREDTHS)
    ? Number.MAX_SAFE_INTEGER
    : itemCount * MAX_MERGED_QUANTITY_HUNDREDTHS
const readDensePlainArray = (value: unknown, maximumLength: number): unknown[] | null => {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (!lengthDescriptor || lengthDescriptor.enumerable || !hasOwn(lengthDescriptor, 'value') || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return null
    if (lengthDescriptor.value > maximumLength) return null
    const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value)
    const descriptorKeys = Reflect.ownKeys(descriptors)
    if (descriptorKeys.length !== lengthDescriptor.value + 1 || descriptorKeys.some(key => typeof key !== 'string')) return null
    const snapshotLength = descriptors.length
    if (!snapshotLength || snapshotLength.enumerable || !hasOwn(snapshotLength, 'value') || snapshotLength.value !== lengthDescriptor.value) return null
    const copy: unknown[] = []
    for (let index = 0; index < lengthDescriptor.value; index++) {
      const descriptor = descriptors[String(index)]
      if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) return null
      copy.push(descriptor.value)
    }
    return copy
  } catch { return null }
}
const parseCanonicalPreflightCode = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null
  try { return CanonicalCodeSchema.parse(value) } catch { return null }
}
const detailReason = (scope: 'baseline' | 'candidate', bucket: FailureBucket): ReasonCode =>
  bucket === 'date-mismatch' ? 'candidate-date-mismatch' : `${scope}-${bucket}` as ReasonCode
const detailBucket = (detail: ReasonDetail): FailureBucket => {
  if (detail.reason.endsWith('anomalous')) return 'anomalous'
  if (detail.reason.endsWith('insufficient-reference')) return 'insufficient-reference'
  if (detail.reason.endsWith('stale')) return 'stale'
  if (detail.reason.endsWith('missing')) return 'missing'
  return 'date-mismatch'
}

const sortDetails = (details: ReasonDetail[]): ReasonDetail[] => [...details].sort((left, right) =>
  FAILURE_ORDER.indexOf(detailBucket(left)) - FAILURE_ORDER.indexOf(detailBucket(right)) ||
  compareCanonicalCodes(left.premiseCode ?? '0', right.premiseCode ?? '0') ||
  compareCanonicalCodes(left.itemCode ?? '0', right.itemCode ?? '0') ||
  (left.observedDate ?? '').localeCompare(right.observedDate ?? '')
)

const selectedObservation = (cell: EvidenceCellV1): SelectedObservation => {
  const rows = [...cell.observations].sort((left, right) => right.observedDate.localeCompare(left.observedDate))
  return rows.find(row => row.status !== 'missing') ?? rows[0]!
}

const emptyPreflight = (): PreflightEvidence => ({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })

const withinFreshTargetDates = (date: LocalDate, evaluatedDate: LocalDate): boolean => date === evaluatedDate || date === addLocalDates(evaluatedDate, -1)

const freezeRecommendationInput = (input: RecommendationInput): RecommendationInput => {
  Object.freeze(input.location)
  for (const line of input.lines) Object.freeze(line)
  Object.freeze(input.lines)
  if (input.fixedTripCostByPremiseCode) {
    for (const entry of Object.values(input.fixedTripCostByPremiseCode)) Object.freeze(entry)
    Object.freeze(input.fixedTripCostByPremiseCode)
  }
  return Object.freeze(input)
}

const captureStrictRecommendationInput = (
  shell: Record<string, unknown>,
  location: Record<string, unknown>,
  rawLines: readonly unknown[]
): RecommendationInput | null => {
  const lines: Record<string, unknown>[] = []
  for (const rawLine of rawLines) {
    const line = readExactPlainData(rawLine, ['itemCode', 'quantityHundredths'])
    if (!line) return null
    lines.push(line)
  }

  const captured: Record<string, unknown> = {}
  for (const key of Object.keys(shell)) defineData(captured, key, shell[key])
  captured.location = location
  captured.lines = lines
  if (hasOwn(shell, 'fixedTripCostByPremiseCode') && shell.fixedTripCostByPremiseCode !== undefined) {
    const sourceCosts = readPlainDataRecord(shell.fixedTripCostByPremiseCode)
    if (!sourceCosts) return null
    const costs: Record<string, unknown> = {}
    for (const premiseCode of Object.keys(sourceCosts)) {
      const entry = readAllowedPlainData(sourceCosts[premiseCode], ['status', 'amountSen'])
      if (!entry) return null
      defineData(costs, premiseCode, entry)
    }
    captured.fixedTripCostByPremiseCode = costs
  }

  const strict = RecommendationInputSchema.safeParse(captured)
  return strict.success ? freezeRecommendationInput(strict.data) : null
}

const commonPreflight = (snapshot: PilotSnapshotV1, value: unknown): { input?: RecommendationInput; reason?: ReasonCode; evaluatedDate?: LocalDate } => {
  const shell = readAllowedPlainData(value, RECOMMENDATION_REQUEST_KEYS)
  if (!shell) return { reason: 'input-invalid' }
  if (!ISOInstantSchema.safeParse(shell.evaluatedAt).success) return { reason: 'input-invalid' }
  const evaluatedAt = shell.evaluatedAt as ISOInstant
  const evaluatedDate = malaysiaDateAt(evaluatedAt)
  if (new Date(evaluatedAt).getTime() < new Date(snapshot.compiledAt).getTime() - 300_000 || evaluatedDate < snapshot.dataAsOfDate) return { reason: 'clock-invalid' }
  if (snapshot.dataAsOfDate !== evaluatedDate && snapshot.dataAsOfDate !== addLocalDates(evaluatedDate, -1)) return { reason: 'snapshot-stale' }
  if (!hasOwn(shell, 'location') || shell.location === undefined) return { reason: 'location-missing' }
  const location = readExactPlainData(shell.location, ['latitude', 'longitude', 'accuracyMetres'])
  if (!location) return { reason: 'input-invalid' }
  const { latitude, longitude, accuracyMetres } = location
  if (![latitude, longitude, accuracyMetres].every(item => typeof item === 'number' && Number.isFinite(item)) ||
      (latitude as number) < -90 || (latitude as number) > 90 || (longitude as number) < -180 || (longitude as number) > 180 || (accuracyMetres as number) < 0) return { reason: 'input-invalid' }
  if ((accuracyMetres as number) > 100) return { reason: 'location-imprecise' }
  if (!hasOwn(shell, 'lines')) return { reason: 'basket-empty' }
  try { if (!Array.isArray(shell.lines)) return { reason: 'basket-empty' } } catch { return { reason: 'input-invalid' } }
  const rawLines = readDensePlainArray(shell.lines, maximumSatisfiableRawLineCount(snapshot.items.length))
  if (!rawLines) return { reason: 'input-invalid' }
  if (rawLines.length === 0) return { reason: 'basket-empty' }
  const input = captureStrictRecommendationInput(shell, location, rawLines)
  return input ? { input, evaluatedDate } : { reason: 'input-invalid' }
}

/** Normalizes the public request shell without throwing public refusal reasons. */
export function normalizeRecommendationRequest(request: unknown): RecommendationInput | null {
  const shell = readAllowedPlainData(request, RECOMMENDATION_REQUEST_KEYS)
  if (!shell) return null
  const location = readExactPlainData(shell.location, ['latitude', 'longitude', 'accuracyMetres'])
  if (!location) return null
  let isArray: boolean
  try { isArray = Array.isArray(shell.lines) } catch { return null }
  if (!isArray) return null
  const rawLines = readDensePlainArray(shell.lines, Number.MAX_SAFE_INTEGER)
  return rawLines ? captureStrictRecommendationInput(shell, location, rawLines) : null
}

export function mergeBasketLines(snapshot: PilotSnapshotV1, lines: readonly RecommendationInput['lines'][number][]): RecommendationInput['lines'] {
  const quantities = new Map<string, number>()
  for (const line of lines) {
    const itemCode = canonicalizeCode(line.itemCode)
    if (itemCode === null || !Number.isSafeInteger(line.quantityHundredths) || line.quantityHundredths < 1) throw new RangeError('invalid basket line')
    if (!snapshot.items.some(item => item.code === itemCode)) throw new RangeError('item not in pilot')
    quantities.set(itemCode, checkedAdd(quantities.get(itemCode) ?? 0, line.quantityHundredths))
  }
  return [...quantities.entries()].sort(([left], [right]) => compareCanonicalCodes(left, right)).map(([itemCode, quantityHundredths]) => {
    const item = snapshot.items.find(candidate => candidate.code === itemCode)!
    if (quantityHundredths > MAX_MERGED_QUANTITY_HUNDREDTHS || (item.quantityMode === 'whole-units' && quantityHundredths % 100 !== 0)) throw new RangeError('invalid basket quantity')
    return { itemCode, quantityHundredths }
  })
}

const cellFor = (snapshot: PilotSnapshotV1, premiseCode: string, itemCode: string): EvidenceCellV1 => snapshot.evidence.find(cell => cell.premiseCode === premiseCode && cell.itemCode === itemCode)!

const baselineFor = (snapshot: PilotSnapshotV1, input: BasketDiscoveryInput, evaluatedDate: LocalDate): { complete?: CompletePremiseEvidence; details: ReasonDetail[] } => {
  const premise = snapshot.premises.find(candidate => candidate.code === input.usualPremiseCode)!
  const details: ReasonDetail[] = []
  const lines: CompletePremiseEvidence['lines'] = []
  for (const line of input.lines) {
    const row = selectedObservation(cellFor(snapshot, premise.code, line.itemCode))
    if (row.status !== 'eligible') {
      const bucket: FailureBucket = row.status === 'missing' ? 'missing' : row.status
      details.push({ reason: detailReason('baseline', bucket), premiseCode: premise.code, itemCode: line.itemCode, observedDate: row.observedDate })
    } else if (!withinFreshTargetDates(row.observedDate, snapshot.dataAsOfDate)) {
      details.push({ reason: 'baseline-stale', premiseCode: premise.code, itemCode: line.itemCode, observedDate: row.observedDate })
    } else lines.push({ itemCode: line.itemCode, officialUnit: cellFor(snapshot, premise.code, line.itemCode).officialUnit, quantityHundredths: line.quantityHundredths, observedDate: row.observedDate, priceSen: row.priceSen })
  }
  return details.length > 0 ? { details: sortDetails(details) } : { complete: { premiseCode: premise.code, straightLineMetres: haversineMetres(input.location, premise), lines: lines.sort((left, right) => compareCanonicalCodes(left.itemCode, right.itemCode)) }, details: [] }
}

const assessCandidate = (snapshot: PilotSnapshotV1, usual: CompletePremiseEvidence, premiseCode: string, input: BasketDiscoveryInput, evaluatedDate: LocalDate): CandidateAssessment => {
  const premise = snapshot.premises.find(candidate => candidate.code === premiseCode)!
  const details: ReasonDetail[] = []
  const lines: CompletePremiseEvidence['lines'] = []
  for (const usualLine of usual.lines) {
    const cell = cellFor(snapshot, premiseCode, usualLine.itemCode)
    const row = selectedObservation(cell)
    if (row.status !== 'eligible') {
      const bucket: FailureBucket = row.status === 'missing' ? 'missing' : row.status
      details.push({ reason: detailReason('candidate', bucket), premiseCode, itemCode: usualLine.itemCode, observedDate: row.observedDate })
      continue
    }
    if (!withinFreshTargetDates(row.observedDate, snapshot.dataAsOfDate)) {
      details.push({ reason: 'candidate-stale', premiseCode, itemCode: usualLine.itemCode, observedDate: row.observedDate })
      continue
    }
    if (row.observedDate !== usualLine.observedDate) {
      details.push({ reason: 'candidate-date-mismatch', premiseCode, itemCode: usualLine.itemCode, observedDate: row.observedDate })
      continue
    }
    lines.push({ itemCode: usualLine.itemCode, officialUnit: cell.officialUnit, quantityHundredths: usualLine.quantityHundredths, observedDate: row.observedDate, priceSen: row.priceSen })
  }
  const ordered = sortDetails(details)
  if (ordered.length > 0) return { bucket: detailBucket(ordered[0]!), details: ordered }
  return { complete: { premiseCode, straightLineMetres: haversineMetres(input.location, premise), lines: lines.sort((left, right) => compareCanonicalCodes(left.itemCode, right.itemCode)) }, details: [] }
}

const enumerateCandidates = (snapshot: PilotSnapshotV1, input: BasketDiscoveryInput, evaluatedDate: LocalDate, radius: number): { usual?: CompletePremiseEvidence; baselineDetails: ReasonDetail[]; candidates: CompletePremiseEvidence[]; details: ReasonDetail[]; exclusions?: ExclusionCounts } => {
  const baseline = baselineFor(snapshot, input, evaluatedDate)
  if (!baseline.complete) return { baselineDetails: baseline.details, candidates: [], details: [] }
  const excludedByReason: ExclusionCounts['excludedByReason'] = {}
  const candidates: CompletePremiseEvidence[] = []
  const details: ReasonDetail[] = []
  let inRadiusCandidateCount = 0
  for (const premise of snapshot.premises.filter(candidate => candidate.code !== input.usualPremiseCode)) {
    if (haversineMetres(input.location, premise) > radius) {
      excludedByReason['outside-radius'] = (excludedByReason['outside-radius'] ?? 0) + 1
      continue
    }
    inRadiusCandidateCount++
    const assessment = assessCandidate(snapshot, baseline.complete, premise.code, input, evaluatedDate)
    details.push(...assessment.details)
    if (assessment.complete) candidates.push(assessment.complete)
    else if (assessment.bucket) excludedByReason[assessment.bucket] = (excludedByReason[assessment.bucket] ?? 0) + 1
  }
  const orderedExcludedByReason: ExclusionCounts['excludedByReason'] = {}
  for (const reason of EXCLUSION_ORDER) {
    const count = excludedByReason[reason]
    if (count !== undefined) orderedExcludedByReason[reason] = count
  }
  return {
    usual: baseline.complete, baselineDetails: [], candidates: candidates.sort((left, right) => compareCanonicalCodes(left.premiseCode, right.premiseCode)), details: sortDetails(details),
    exclusions: { pilotPremiseCount: snapshot.premises.length - 1, inRadiusCandidateCount, completeCandidateCount: candidates.length, excludedByReason: orderedExcludedByReason }
  }
}

const preflightInput = (snapshot: PilotSnapshotV1, input: BasketDiscoveryInput, radius: number): PreflightEvidence => {
  const date = malaysiaDateAt(input.evaluatedAt)
  const enumerated = enumerateCandidates(snapshot, input, date, radius)
  return { baselineReady: enumerated.usual !== undefined, completeCandidatePremiseCodes: enumerated.candidates.map(candidate => candidate.premiseCode), excludedByReason: enumerated.exclusions?.excludedByReason ?? {} }
}

const normalizePreflightInput = (snapshot: PilotSnapshotV1, value: unknown, requireMode: boolean): { input: BasketDiscoveryInput; mode?: RecommendationInput['mode']; evaluatedDate: LocalDate } | null => {
  try {
    const keys = requireMode ? ['evaluatedAt', 'location', 'usualPremiseCode', 'lines', 'mode'] : ['evaluatedAt', 'location', 'usualPremiseCode', 'lines']
    const data = readExactPlainData(value, keys)
    if (!data || !ISOInstantSchema.safeParse(data.evaluatedAt).success) return null
    const location = readExactPlainData(data.location, ['latitude', 'longitude', 'accuracyMetres'])
    if (!location) return null
    const evaluatedAt = data.evaluatedAt as ISOInstant
    const evaluatedDate = malaysiaDateAt(evaluatedAt)
    if (new Date(evaluatedAt).getTime() < new Date(snapshot.compiledAt).getTime() - 300_000 || evaluatedDate < snapshot.dataAsOfDate ||
        (snapshot.dataAsOfDate !== evaluatedDate && snapshot.dataAsOfDate !== addLocalDates(evaluatedDate, -1))) return null
    const { latitude, longitude, accuracyMetres } = location
    if (![latitude, longitude, accuracyMetres].every(item => typeof item === 'number' && Number.isFinite(item)) ||
        (latitude as number) < -90 || (latitude as number) > 90 || (longitude as number) < -180 || (longitude as number) > 180 ||
        (accuracyMetres as number) < 0 || (accuracyMetres as number) > 100) return null
    const usualPremiseCode = parseCanonicalPreflightCode(data.usualPremiseCode)
    const basketLines = readDensePlainArray(data.lines, maximumSatisfiableRawLineCount(snapshot.items.length))
    if (usualPremiseCode === null || !snapshot.premises.some(premise => premise.code === usualPremiseCode) || !basketLines || basketLines.length === 0) return null
    if (requireMode && data.mode !== 'walk' && data.mode !== 'drive') return null
    const rawLines: Array<{ itemCode: string; quantityHundredths: number }> = []
    for (const rawLine of basketLines) {
      const line = readExactPlainData(rawLine, ['itemCode', 'quantityHundredths'])
      if (!line) return null
      const itemCode = parseCanonicalPreflightCode(line.itemCode)
      if (itemCode === null || typeof line.quantityHundredths !== 'number' || !Number.isSafeInteger(line.quantityHundredths) || line.quantityHundredths < 1 || !snapshot.items.some(item => item.code === itemCode)) return null
      rawLines.push({ itemCode, quantityHundredths: line.quantityHundredths })
    }
    const lines = mergeBasketLines(snapshot, rawLines)
    return { input: { evaluatedAt, location: { latitude: latitude as number, longitude: longitude as number, accuracyMetres: accuracyMetres as number }, usualPremiseCode, lines },
      ...(requireMode ? { mode: data.mode as RecommendationInput['mode'] } : {}), evaluatedDate }
  } catch { return null }
}

export function preflightEvidence(snapshot: PilotSnapshotV1, input: EvidencePreflightInput): PreflightEvidence {
  try {
    const normalized = normalizePreflightInput(snapshot, input, true)
    return normalized ? preflightInput(snapshot, normalized.input, normalized.mode === 'walk' ? 2000 : 5000) : emptyPreflight()
  } catch { return emptyPreflight() }
}

export function preflightBasketDiscovery(snapshot: PilotSnapshotV1, input: BasketDiscoveryInput): BasketDiscoveryPreflight {
  try {
    const normalized = normalizePreflightInput(snapshot, input, false)
    return {
      ...(normalized ? preflightInput(snapshot, normalized.input, 5000) : emptyPreflight()),
      label: 'complete for these items within 5 km discovery—choose a travel mode to apply its radius'
    }
  } catch { return { ...emptyPreflight(), label: 'complete for these items within 5 km discovery—choose a travel mode to apply its radius' } }
}

export function preflightUsualAndGeometry(snapshot: PilotSnapshotV1, input: Pick<EvidencePreflightInput, 'evaluatedAt' | 'location' | 'usualPremiseCode'>): UsualAndGeometryPreflight {
  const safe = (): UsualAndGeometryPreflight => ({ usualPremiseReady: false, usualHasRecentPilotData: false, coordinateViablePremiseCount: 0, label: 'within 5 km' })
  try {
    const value = readExactPlainData(input, ['evaluatedAt', 'location', 'usualPremiseCode'])
    if (!value || !ISOInstantSchema.safeParse(value.evaluatedAt).success) return safe()
    const location = readExactPlainData(value.location, ['latitude', 'longitude', 'accuracyMetres'])
    if (!location) return safe()
    const usualPremiseCode = parseCanonicalPreflightCode(value.usualPremiseCode)
    const premise = usualPremiseCode === null ? undefined : snapshot.premises.find(candidate => candidate.code === usualPremiseCode)
    if (!premise || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !Number.isFinite(location.accuracyMetres) ||
        (location.latitude as number) < -90 || (location.latitude as number) > 90 || (location.longitude as number) < -180 || (location.longitude as number) > 180 || (location.accuracyMetres as number) < 0 || (location.accuracyMetres as number) > 100) return safe()
    const evaluatedAt = value.evaluatedAt as ISOInstant
    const evaluatedDate = malaysiaDateAt(evaluatedAt)
    if (new Date(evaluatedAt).getTime() < new Date(snapshot.compiledAt).getTime() - 300_000 || evaluatedDate < snapshot.dataAsOfDate ||
        (snapshot.dataAsOfDate !== evaluatedDate && snapshot.dataAsOfDate !== addLocalDates(evaluatedDate, -1))) return safe()
    const usualHasRecentPilotData = snapshot.evidence.filter(cell => cell.premiseCode === premise.code).some(cell => {
      const observation = selectedObservation(cell)
      return observation.status === 'eligible' && withinFreshTargetDates(observation.observedDate, snapshot.dataAsOfDate)
    })
    const coordinates: RecommendationInput['location'] = { latitude: location.latitude as number, longitude: location.longitude as number, accuracyMetres: location.accuracyMetres as number }
    const coordinateViablePremiseCount = snapshot.premises.filter(candidate => candidate.code !== premise.code && candidate.verificationStatus === 'field-verified' && candidate.verifiedOn <= evaluatedDate && candidate.verificationExpiresOn >= evaluatedDate && haversineMetres(coordinates, candidate) <= 5000).length
    return { usualPremiseReady: true, usualHasRecentPilotData, coordinateViablePremiseCount, label: 'within 5 km' }
  } catch { return safe() }
}

const reasonFromBaselineDetails = (details: ReasonDetail[]): ReasonCode => details[0]!.reason
const candidateReason = (exclusions: ExclusionCounts): ReasonCode => {
  for (const bucket of FAILURE_ORDER) if ((exclusions.excludedByReason[bucket] ?? 0) > 0) return detailReason('candidate', bucket)
  return 'no-complete-candidate'
}

const comparisonOnlyReasons = (snapshot: PilotSnapshotV1, input: RecommendationInput, evaluatedDate: LocalDate, compared: CompletePremiseEvidence[]): ComparisonOnlyReason[] => {
  const reasons: ComparisonOnlyReason[] = []
  if (input.basketScope === 'selected-items-only') reasons.push('selected-items-only')
  if (input.mode === 'walk') reasons.push('walking-route-unverified')
  if (snapshot.publicationMode !== 'consumer-pilot' || compared.some(({ premiseCode }) => {
    const premise = snapshot.premises.find(candidate => candidate.code === premiseCode)!
    return premise.verificationStatus !== 'field-verified' || premise.verifiedOn > evaluatedDate || premise.verificationExpiresOn < evaluatedDate
  })) reasons.push('publication-not-consumer-ready')
  if (reasons.length === 0) {
    const required = compared.map(candidate => candidate.premiseCode)
    const costs = input.fixedTripCostByPremiseCode
    if (!costs || required.some(code => costs[code] === undefined) || input.fuelPriceSenPerL === undefined || input.worthwhileThresholdSen === undefined) return reasons
    if (required.some(code => costs[code]!.status === 'unknown')) reasons.push('fixed-trip-cost-unknown')
  }
  return reasons
}

const evaluateNormalizedEvidence = (snapshot: PilotSnapshotV1, input: RecommendationInput, evaluatedDate: LocalDate): EvidenceEvaluation => {
  if (!snapshot.premises.some(premise => premise.code === input.usualPremiseCode)) return { kind: 'insufficient-evidence', primaryReason: 'usual-premise-not-in-pilot', details: [] }
  if (input.lines.some(line => !snapshot.items.some(item => item.code === line.itemCode))) return { kind: 'insufficient-evidence', primaryReason: 'item-not-in-pilot', details: [] }
  let lines: RecommendationInput['lines']
  try { lines = mergeBasketLines(snapshot, input.lines) } catch { return { kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] } }
  const evidenceInput: EvidencePreflightInput = { evaluatedAt: input.evaluatedAt, location: input.location, usualPremiseCode: input.usualPremiseCode, lines, mode: input.mode }
  const enumerated = enumerateCandidates(snapshot, evidenceInput, evaluatedDate, input.mode === 'walk' ? 2000 : 5000)
  if (!enumerated.usual) return { kind: 'insufficient-evidence', primaryReason: reasonFromBaselineDetails(enumerated.baselineDetails), details: enumerated.baselineDetails }
  if (enumerated.exclusions!.inRadiusCandidateCount === 0) return { kind: 'insufficient-evidence', primaryReason: 'no-candidate-in-radius', details: [], exclusions: enumerated.exclusions }
  if (enumerated.candidates.length === 0) return { kind: 'insufficient-evidence', primaryReason: candidateReason(enumerated.exclusions!), details: enumerated.details, exclusions: enumerated.exclusions }
  const reasons = comparisonOnlyReasons(snapshot, input, evaluatedDate, [enumerated.usual, ...enumerated.candidates])
  if (reasons.length === 0 && (input.fuelPriceSenPerL === undefined || input.worthwhileThresholdSen === undefined ||
      !input.fixedTripCostByPremiseCode || ![enumerated.usual, ...enumerated.candidates].every(candidate => input.fixedTripCostByPremiseCode![candidate.premiseCode]))) {
    return { kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] }
  }
  return { kind: 'ready', evaluatedDate, usual: enumerated.usual, candidates: enumerated.candidates, exclusions: enumerated.exclusions!, comparisonOnlyReasons: reasons }
}

export function evaluateEvidenceWithInput(
  snapshot: PilotSnapshotV1,
  request: RecommendationRequest | RecommendationInput | unknown
): { evidence: EvidenceEvaluation; input: RecommendationInput | null } {
  const common = commonPreflight(snapshot, request)
  if (!common.input || !common.evaluatedDate) {
    return { evidence: { kind: 'insufficient-evidence', primaryReason: common.reason!, details: [] }, input: null }
  }
  return { evidence: evaluateNormalizedEvidence(snapshot, common.input, common.evaluatedDate), input: common.input }
}

export function evaluateEvidence(snapshot: PilotSnapshotV1, request: RecommendationRequest | RecommendationInput | unknown): EvidenceEvaluation {
  return evaluateEvidenceWithInput(snapshot, request).evidence
}
