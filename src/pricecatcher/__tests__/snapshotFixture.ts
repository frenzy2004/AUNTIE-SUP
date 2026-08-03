import type { LocalDate } from '../contracts/common'
import type { EvidenceCellV1, ObservationEvidenceV1, PilotSnapshotV1 } from '../contracts/snapshot'
import type { RecommendationInput } from '../contracts/recommendation'

const DATE: LocalDate = '2026-08-02'
const PRIOR: LocalDate = '2026-08-01'

const selectedYesterdayCell = (premiseCode: string, priceSen: number): EvidenceCellV1 => ({
  premiseCode, itemCode: '10', officialUnit: 'each', observations: [
    { status: 'eligible', observedDate: PRIOR, priceSen }, { status: 'missing', observedDate: DATE }
  ]
})

export function eligibleCell(premiseCode: string, itemCode: string, observedDate: LocalDate, priceSen: number): EvidenceCellV1 {
  const otherDate = observedDate === DATE ? PRIOR : DATE
  return {
    premiseCode, itemCode, officialUnit: 'each', observations: [
      { status: 'eligible', observedDate: otherDate, priceSen },
      { status: 'eligible', observedDate, priceSen }
    ].sort((left, right) => left.observedDate.localeCompare(right.observedDate)) as EvidenceCellV1['observations']
  }
}

export function makeSnapshot(overrides: Partial<PilotSnapshotV1> = {}): PilotSnapshotV1 {
  const snapshot: PilotSnapshotV1 = {
    schemaVersion: 1, buildId: 'fixture', transformVersion: '1.0.0',
    compiledAt: '2026-08-03T03:00:00.000Z', dataAsOfDate: DATE,
    publicationMode: 'consumer-pilot', timeZone: 'Asia/Kuala_Lumpur',
    sources: [{ url: 'https://example.test/source.csv', retrievedAt: '2026-08-03T02:00:00.000Z', sha256: 'a'.repeat(64), byteLength: 1, rowCount: 1 }],
    attribution: {
      text: 'Fixture attribution', transactionalRecordsUrl: 'https://data.gov.my/data-catalogue/pricecatcher',
      premiseLookupUrl: 'https://data.gov.my/data-catalogue/lookup_premise', itemLookupUrl: 'https://data.gov.my/data-catalogue/lookup_item',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
    },
    premises: [
      { code: '1', officialName: 'Usual', displayName: 'Usual', address: '1 Test Street', premiseType: 'store', latitude: 3, longitude: 101, coordinateAccuracyMetres: 10, verificationStatus: 'field-verified', verifiedOn: '2026-01-01', verificationExpiresOn: '2026-12-31', coordinateAttribution: 'fixture' },
      { code: '2', officialName: 'Candidate', displayName: 'Candidate', address: '2 Test Street', premiseType: 'store', latitude: 3, longitude: 101.01, coordinateAccuracyMetres: 10, verificationStatus: 'field-verified', verifiedOn: '2026-01-01', verificationExpiresOn: '2026-12-31', coordinateAttribution: 'fixture' }
    ],
    items: [{ code: '10', officialName: 'Fixture item', officialUnit: 'each', qualifiers: [], quantityMode: 'whole-units' }],
    evidence: [eligibleCell('1', '10', DATE, 600), eligibleCell('2', '10', DATE, 500)]
  }
  return { ...snapshot, ...overrides }
}

export function validInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    evaluatedAt: '2026-08-03T03:00:00.000Z', location: { latitude: 3, longitude: 101, accuracyMetres: 10 }, usualPremiseCode: '1',
    basketScope: 'complete-trip', lines: [{ itemCode: '10', quantityHundredths: 100 }], mode: 'drive',
    fuelEfficiencyDeciKmPerL: 100, fuelPriceSenPerL: 205,
    fixedTripCostByPremiseCode: { '1': { status: 'confirmed', amountSen: 0 }, '2': { status: 'confirmed', amountSen: 0 }, '3': { status: 'confirmed', amountSen: 0 } }, worthwhileThresholdSen: 100,
    ...overrides
  }
}

export interface NestedDescriptorMutationProbe {
  request: RecommendationInput
  events: string[]
  descriptorCalls: Map<string, number>
}

const recordDescriptor = (probe: Pick<NestedDescriptorMutationProbe, 'events' | 'descriptorCalls'>, event: string): void => {
  probe.events.push(event)
  probe.descriptorCalls.set(event, (probe.descriptorCalls.get(event) ?? 0) + 1)
}

export function lineDescriptorMutationProbe(input: RecommendationInput): NestedDescriptorMutationProbe {
  const probe = { events: [], descriptorCalls: new Map<string, number>() }
  const line = { ...input.lines[0]! }
  input.lines = [new Proxy(line, {
    getOwnPropertyDescriptor: (target, key) => {
      recordDescriptor(probe, `line:${String(key)}`)
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get: () => { throw new Error('raw line get must not run') }
  })]
  const request = new Proxy(input, {
    getOwnPropertyDescriptor: (target, key) => {
      recordDescriptor(probe, `top:${String(key)}`)
      if (key === 'mode') line.itemCode = '99'
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get: () => { throw new Error('raw request get must not run') }
  })
  return { request, ...probe }
}

export function fixedDescriptorMutationProbe(input: RecommendationInput): NestedDescriptorMutationProbe {
  const probe = { events: [], descriptorCalls: new Map<string, number>() }
  const entry = { status: 'confirmed', amountSen: 0 } as Record<string, unknown>
  const entryProxy = new Proxy(entry, {
    getOwnPropertyDescriptor: (target, key) => {
      recordDescriptor(probe, `fixed-entry:${String(key)}`)
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get: () => { throw new Error('raw fixed-entry get must not run') }
  })
  const map = { ...input.fixedTripCostByPremiseCode, '2': entryProxy } as unknown as RecommendationInput['fixedTripCostByPremiseCode']
  input.fixedTripCostByPremiseCode = new Proxy(map!, {
    getOwnPropertyDescriptor: (target, key) => {
      recordDescriptor(probe, `fixed-map:${String(key)}`)
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get: () => { throw new Error('raw fixed-map get must not run') }
  })
  const request = new Proxy(input, {
    getOwnPropertyDescriptor: (target, key) => {
      recordDescriptor(probe, `top:${String(key)}`)
      if (key === 'worthwhileThresholdSen') {
        entry.status = 'unknown'
        delete entry.amountSen
      }
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get: () => { throw new Error('raw request get must not run') }
  })
  return { request, ...probe }
}

export function snapshotWithCandidateObservations(observations: ObservationEvidenceV1[]): PilotSnapshotV1 {
  const snapshot = makeSnapshot()
  const selected = [...observations].sort((left, right) => right.observedDate.localeCompare(left.observedDate)).find(observation => observation.status !== 'missing')
  const baseline = selected?.observedDate === PRIOR ? selectedYesterdayCell('1', 600) : snapshot.evidence[0]!
  return { ...snapshot, evidence: [baseline, { premiseCode: '2', itemCode: '10', officialUnit: 'each', observations } as EvidenceCellV1] }
}

export function snapshotWithPairDates(usualDate: LocalDate, candidateDate: LocalDate): PilotSnapshotV1 {
  const selected = (premiseCode: string, observedDate: LocalDate, priceSen: number): EvidenceCellV1 => ({
    premiseCode, itemCode: '10', officialUnit: 'each', observations: [
      observedDate === PRIOR ? { status: 'eligible', observedDate: PRIOR, priceSen } : { status: 'missing', observedDate: PRIOR },
      observedDate === DATE ? { status: 'eligible', observedDate: DATE, priceSen } : { status: 'missing', observedDate: DATE }
    ]
  })
  return makeSnapshot({ evidence: [selected('1', usualDate, 600), selected('2', candidateDate, 500)] })
}

export function snapshotWithThreePremisesAndOneBadCandidate(): PilotSnapshotV1 {
  const base = makeSnapshot()
  const third = { code: '3', officialName: 'Complete', displayName: 'Complete', address: '3 Test Street', premiseType: 'store', latitude: 3, longitude: 101.02, coordinateAccuracyMetres: 10, verificationStatus: 'field-verified' as const, verifiedOn: '2026-01-01' as LocalDate, verificationExpiresOn: '2026-12-31' as LocalDate, coordinateAttribution: 'fixture' }
  return { ...base, premises: [...base.premises, third], evidence: [base.evidence[0]!, snapshotWithCandidateObservations([{ status: 'eligible', observedDate: PRIOR, priceSen: 500 }, { status: 'anomalous', observedDate: DATE, reason: 'outside-ratio-bound' }]).evidence[1]!, eligibleCell('3', '10', DATE, 450)] }
}

export function snapshotWithOldData(): PilotSnapshotV1 {
  const old: LocalDate = '2026-08-01'
  const prior: LocalDate = '2026-07-31'
  const cell = (premiseCode: string, priceSen: number): EvidenceCellV1 => ({ premiseCode, itemCode: '10', officialUnit: 'each', observations: [
    { status: 'eligible', observedDate: prior, priceSen }, { status: 'eligible', observedDate: old, priceSen }
  ] })
  return makeSnapshot({ dataAsOfDate: old, evidence: [cell('1', 600), cell('2', 500)] })
}

export function previousDaySnapshotWithStaleEvidence(scope: 'baseline' | 'candidate'): PilotSnapshotV1 {
  const selectedCell = (premiseCode: string, selectedDate: LocalDate, priceSen: number): EvidenceCellV1 => ({
    premiseCode,
    itemCode: '10',
    officialUnit: 'each',
    observations: [
      selectedDate === PRIOR ? { status: 'eligible', observedDate: PRIOR, priceSen } : { status: 'missing', observedDate: PRIOR },
      selectedDate === DATE ? { status: 'eligible', observedDate: DATE, priceSen } : { status: 'missing', observedDate: DATE }
    ]
  })
  return makeSnapshot({
    evidence: [
      selectedCell('1', scope === 'baseline' ? PRIOR : DATE, 600),
      selectedCell('2', PRIOR, 400)
    ]
  })
}

export function inputWithOldClock(): RecommendationInput { return validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }) }

export function snapshotWithBadBaselineAndNoCandidate(): PilotSnapshotV1 {
  return makeSnapshot({ evidence: [
    { premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [{ status: 'eligible', observedDate: PRIOR, priceSen: 600 }, { status: 'anomalous', observedDate: DATE, reason: 'outside-ratio-bound' }] },
    eligibleCell('2', '10', DATE, 500)
  ] })
}

export function snapshotWithOnlyFarCandidates(): PilotSnapshotV1 {
  const snapshot = makeSnapshot()
  return { ...snapshot, premises: snapshot.premises.map(premise => premise.code === '2' ? { ...premise, longitude: 102 } : premise) }
}

export function snapshotWithMixedCandidateFailures(): PilotSnapshotV1 {
  const snapshot = makeSnapshot()
  const extra = { ...snapshot.premises[1]!, code: '3', officialName: 'Missing', displayName: 'Missing', address: '3 Test Street', longitude: 101.02 }
  return { ...snapshot, premises: [...snapshot.premises, extra], evidence: [snapshot.evidence[0]!, { premiseCode: '2', itemCode: '10', officialUnit: 'each', observations: [{ status: 'eligible', observedDate: PRIOR, priceSen: 500 }, { status: 'anomalous', observedDate: DATE, reason: 'outside-ratio-bound' }] }, { premiseCode: '3', itemCode: '10', officialUnit: 'each', observations: [{ status: 'missing', observedDate: PRIOR }, { status: 'missing', observedDate: DATE }] }] }
}

export function goldenSnapshot(): PilotSnapshotV1 {
  const snapshot = makeSnapshot()
  return {
    ...snapshot,
    buildId: 'golden-consumer-test',
    premises: snapshot.premises.map(premise => premise.code === '1'
      ? { ...premise, latitude: 0, longitude: 0 }
      : { ...premise, latitude: 0, longitude: 0.0089932 }),
    evidence: [eligibleCell('1', '10', DATE, 1000), eligibleCell('2', '10', DATE, 700)]
  }
}

export function goldenSnapshotWithMode(mode: 'fixture' | 'desk-demo'): PilotSnapshotV1 {
  return { ...goldenSnapshot(), publicationMode: mode }
}

export function goldenInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    evaluatedAt: '2026-08-03T03:00:00.000Z',
    location: { latitude: 0, longitude: 0, accuracyMetres: 10 },
    usualPremiseCode: '1',
    basketScope: 'complete-trip',
    lines: [{ itemCode: '10', quantityHundredths: 100 }],
    mode: 'drive',
    fuelEfficiencyDeciKmPerL: 120,
    fuelPriceSenPerL: 205,
    fixedTripCostByPremiseCode: {
      '1': { status: 'confirmed', amountSen: 0 },
      '2': { status: 'confirmed', amountSen: 0 },
      '3': { status: 'confirmed', amountSen: 0 }
    },
    worthwhileThresholdSen: 200,
    ...overrides
  }
}

export function inputWithoutTripFields(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  const {
    fuelEfficiencyDeciKmPerL: _fuelEfficiencyDeciKmPerL,
    fuelPriceSenPerL: _fuelPriceSenPerL,
    fixedTripCostByPremiseCode: _fixedTripCostByPremiseCode,
    worthwhileThresholdSen: _worthwhileThresholdSen,
    ...input
  } = goldenInput(overrides)
  return input
}

export function snapshotWherePriceAndTripWinnersDiffer(): PilotSnapshotV1 {
  const snapshot = goldenSnapshot()
  const candidate = snapshot.premises.find(premise => premise.code === '2')!
  const third = {
    ...candidate,
    code: '3',
    officialName: 'Near candidate',
    displayName: 'Near candidate',
    address: '3 Test Street',
    longitude: 0.0044966
  }
  return {
    ...snapshot,
    premises: snapshot.premises.map(premise => premise.code === '2'
      ? { ...premise, officialName: 'Cheap far candidate', displayName: 'Cheap far candidate', longitude: 0.0359728 }
      : premise).concat(third),
    evidence: [
      eligibleCell('1', '10', DATE, 1000),
      eligibleCell('2', '10', DATE, 600),
      eligibleCell('3', '10', DATE, 700)
    ]
  }
}

export function priceOnlyDrivingInput(): RecommendationInput {
  return goldenInput({ basketScope: 'selected-items-only' })
}

export function drivingInput(): RecommendationInput {
  return goldenInput()
}
