import { addLocalDates, malaysiaDateAt } from './dates'
import { haversineMetres } from './distance'
import { canonicalizeCode, compareCanonicalCodes } from './ids'
import { checkedAdd } from './money'
import { ISOInstantSchema, type ISOInstant, type LocalDate, type ReasonCode, type Sen } from './contracts/common'
import {
  RecommendationInputSchema, RecommendationRequestSchema,
  type ExclusionCounts, type RecommendationInput, type RecommendationRequest, type ReasonDetail
} from './contracts/recommendation'
import type { EvidenceCellV1, ObservationEvidenceV1, PilotSnapshotV1 } from './contracts/snapshot'

const FAILURE_ORDER = ['anomalous', 'insufficient-reference', 'stale', 'missing', 'date-mismatch'] as const
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
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

const withinFreshTargetDates = (date: LocalDate, evaluatedDate: LocalDate): boolean => date === evaluatedDate || date === addLocalDates(evaluatedDate, -1)

const commonPreflight = (snapshot: PilotSnapshotV1, value: unknown): { input?: RecommendationInput; reason?: ReasonCode; evaluatedDate?: LocalDate } => {
  const shell = RecommendationRequestSchema.safeParse(value)
  if (!shell.success || !isRecord(value)) return { reason: 'input-invalid' }
  if (!ISOInstantSchema.safeParse(shell.data.evaluatedAt).success) return { reason: 'input-invalid' }
  const evaluatedAt = shell.data.evaluatedAt as ISOInstant
  const evaluatedDate = malaysiaDateAt(evaluatedAt)
  if (new Date(evaluatedAt).getTime() < new Date(snapshot.compiledAt).getTime() - 300_000 || evaluatedDate < snapshot.dataAsOfDate) return { reason: 'clock-invalid' }
  if (snapshot.dataAsOfDate !== evaluatedDate && snapshot.dataAsOfDate !== addLocalDates(evaluatedDate, -1)) return { reason: 'snapshot-stale' }
  if (!hasOwn(shell.data, 'location') || shell.data.location === undefined) return { reason: 'location-missing' }
  const location = shell.data.location
  if (!isRecord(location) || Object.keys(location).length !== 3 || !['latitude', 'longitude', 'accuracyMetres'].every(key => hasOwn(location, key))) return { reason: 'input-invalid' }
  const { latitude, longitude, accuracyMetres } = location
  if (![latitude, longitude, accuracyMetres].every(item => typeof item === 'number' && Number.isFinite(item)) ||
      (latitude as number) < -90 || (latitude as number) > 90 || (longitude as number) < -180 || (longitude as number) > 180 || (accuracyMetres as number) < 0) return { reason: 'input-invalid' }
  if ((accuracyMetres as number) > 100) return { reason: 'location-imprecise' }
  if (!hasOwn(shell.data, 'lines') || !Array.isArray(shell.data.lines) || shell.data.lines.length === 0) return { reason: 'basket-empty' }
  const strict = RecommendationInputSchema.safeParse(shell.data)
  if (!strict.success) return { reason: 'input-invalid' }
  return { input: strict.data, evaluatedDate }
}

/** Normalizes the public request shell without throwing public refusal reasons. */
export function normalizeRecommendationRequest(request: unknown): RecommendationInput | null {
  const shell = RecommendationRequestSchema.safeParse(request)
  return shell.success ? (RecommendationInputSchema.safeParse(shell.data).data ?? null) : null
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
    if (quantityHundredths > 9900 || (item.quantityMode === 'whole-units' && quantityHundredths % 100 !== 0)) throw new RangeError('invalid basket quantity')
    return { itemCode, quantityHundredths }
  })
}

const cellFor = (snapshot: PilotSnapshotV1, premiseCode: string, itemCode: string): EvidenceCellV1 => snapshot.evidence.find(cell => cell.premiseCode === premiseCode && cell.itemCode === itemCode)!

const baselineFor = (snapshot: PilotSnapshotV1, input: EvidencePreflightInput, evaluatedDate: LocalDate): { complete?: CompletePremiseEvidence; details: ReasonDetail[] } => {
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

const assessCandidate = (snapshot: PilotSnapshotV1, usual: CompletePremiseEvidence, premiseCode: string, input: EvidencePreflightInput, evaluatedDate: LocalDate): CandidateAssessment => {
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

const enumerateCandidates = (snapshot: PilotSnapshotV1, input: EvidencePreflightInput, evaluatedDate: LocalDate, radius: number): { usual?: CompletePremiseEvidence; baselineDetails: ReasonDetail[]; candidates: CompletePremiseEvidence[]; details: ReasonDetail[]; exclusions?: ExclusionCounts } => {
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
  return {
    usual: baseline.complete, baselineDetails: [], candidates: candidates.sort((left, right) => compareCanonicalCodes(left.premiseCode, right.premiseCode)), details: sortDetails(details),
    exclusions: { pilotPremiseCount: snapshot.premises.length - 1, inRadiusCandidateCount, completeCandidateCount: candidates.length, excludedByReason }
  }
}

const preflightInput = (snapshot: PilotSnapshotV1, input: EvidencePreflightInput, radius: number): PreflightEvidence => {
  const date = malaysiaDateAt(input.evaluatedAt)
  const enumerated = enumerateCandidates(snapshot, input, date, radius)
  return { baselineReady: enumerated.usual !== undefined, completeCandidatePremiseCodes: enumerated.candidates.map(candidate => candidate.premiseCode), excludedByReason: enumerated.exclusions?.excludedByReason ?? {} }
}

export function preflightEvidence(snapshot: PilotSnapshotV1, input: EvidencePreflightInput): PreflightEvidence {
  return preflightInput(snapshot, input, input.mode === 'walk' ? 2000 : 5000)
}

export function preflightBasketDiscovery(snapshot: PilotSnapshotV1, input: BasketDiscoveryInput): PreflightEvidence {
  return preflightInput(snapshot, input as EvidencePreflightInput, 5000)
}

export function preflightUsualAndGeometry(snapshot: PilotSnapshotV1, input: Pick<EvidencePreflightInput, 'evaluatedAt' | 'location' | 'usualPremiseCode'>): UsualAndGeometryPreflight {
  const premise = snapshot.premises.find(candidate => candidate.code === input.usualPremiseCode)
  const location = input.location
  if (!premise || !ISOInstantSchema.safeParse(input.evaluatedAt).success || !location ||
      !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !Number.isFinite(location.accuracyMetres) ||
      location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180 || location.accuracyMetres < 0 || location.accuracyMetres > 100) {
    return { usualPremiseReady: false, usualHasRecentPilotData: false, coordinateViablePremiseCount: 0, label: 'within 5 km' }
  }
  const evaluatedDate = malaysiaDateAt(input.evaluatedAt)
  if (new Date(input.evaluatedAt).getTime() < new Date(snapshot.compiledAt).getTime() - 300_000 || evaluatedDate < snapshot.dataAsOfDate ||
      (snapshot.dataAsOfDate !== evaluatedDate && snapshot.dataAsOfDate !== addLocalDates(evaluatedDate, -1))) {
    return { usualPremiseReady: false, usualHasRecentPilotData: false, coordinateViablePremiseCount: 0, label: 'within 5 km' }
  }
  const usualHasRecentPilotData = snapshot.evidence.filter(cell => cell.premiseCode === premise.code).some(cell => {
    const observation = selectedObservation(cell)
    return observation.status === 'eligible' && withinFreshTargetDates(observation.observedDate, snapshot.dataAsOfDate)
  })
  const coordinateViablePremiseCount = snapshot.premises.filter(candidate => candidate.code !== premise.code && candidate.verificationStatus === 'field-verified' && candidate.verificationExpiresOn >= evaluatedDate && haversineMetres(input.location, candidate) <= 5000).length
  return { usualPremiseReady: true, usualHasRecentPilotData, coordinateViablePremiseCount, label: 'within 5 km' }
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
    return premise.verificationStatus !== 'field-verified' || premise.verificationExpiresOn < evaluatedDate
  })) reasons.push('publication-not-consumer-ready')
  if (reasons.length === 0) {
    const required = compared.map(candidate => candidate.premiseCode)
    const costs = input.fixedTripCostByPremiseCode
    if (!costs || required.some(code => costs[code] === undefined) || input.fuelEfficiencyDeciKmPerL === undefined || input.fuelPriceSenPerL === undefined || input.worthwhileThresholdSen === undefined) return reasons
    if (required.some(code => costs[code]!.status === 'unknown')) reasons.push('fixed-trip-cost-unknown')
  }
  return reasons
}

export function evaluateEvidence(snapshot: PilotSnapshotV1, request: RecommendationRequest | RecommendationInput | unknown): EvidenceEvaluation {
  const common = commonPreflight(snapshot, request)
  if (!common.input || !common.evaluatedDate) return { kind: 'insufficient-evidence', primaryReason: common.reason!, details: [] }
  const input = common.input
  if (!snapshot.premises.some(premise => premise.code === input.usualPremiseCode)) return { kind: 'insufficient-evidence', primaryReason: 'usual-premise-not-in-pilot', details: [] }
  if (input.lines.some(line => !snapshot.items.some(item => item.code === line.itemCode))) return { kind: 'insufficient-evidence', primaryReason: 'item-not-in-pilot', details: [] }
  let lines: RecommendationInput['lines']
  try { lines = mergeBasketLines(snapshot, input.lines) } catch { return { kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] } }
  const evidenceInput: EvidencePreflightInput = { evaluatedAt: input.evaluatedAt, location: input.location, usualPremiseCode: input.usualPremiseCode, lines, mode: input.mode }
  const enumerated = enumerateCandidates(snapshot, evidenceInput, common.evaluatedDate, input.mode === 'walk' ? 2000 : 5000)
  if (!enumerated.usual) return { kind: 'insufficient-evidence', primaryReason: reasonFromBaselineDetails(enumerated.baselineDetails), details: enumerated.baselineDetails }
  if (enumerated.exclusions!.inRadiusCandidateCount === 0) return { kind: 'insufficient-evidence', primaryReason: 'no-candidate-in-radius', details: [], exclusions: enumerated.exclusions }
  if (enumerated.candidates.length === 0) return { kind: 'insufficient-evidence', primaryReason: candidateReason(enumerated.exclusions!), details: enumerated.details, exclusions: enumerated.exclusions }
  const reasons = comparisonOnlyReasons(snapshot, input, common.evaluatedDate, [enumerated.usual, ...enumerated.candidates])
  if (reasons.length === 0 && (input.fuelEfficiencyDeciKmPerL === undefined || input.fuelPriceSenPerL === undefined || input.worthwhileThresholdSen === undefined ||
      !input.fixedTripCostByPremiseCode || ![enumerated.usual, ...enumerated.candidates].every(candidate => input.fixedTripCostByPremiseCode![candidate.premiseCode]))) {
    return { kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] }
  }
  return { kind: 'ready', evaluatedDate: common.evaluatedDate, usual: enumerated.usual, candidates: enumerated.candidates, exclusions: enumerated.exclusions!, comparisonOnlyReasons: reasons }
}
