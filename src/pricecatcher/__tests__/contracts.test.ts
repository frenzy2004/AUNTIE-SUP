import { describe, expect, it } from 'vitest'
import {
  canonicalizeSourceLockV1,
  CoverageCandidateReportV1Schema,
  CurrentSnapshotPointerV1Schema,
  DistanceFeasibilityReportV1Schema,
  ExtendedSourceLockV1Schema,
  ExclusionCountsSchema,
  PilotSnapshotV1Schema,
  PRICECATCHER_TRANSFORM_VERSION,
  RecommendationInputSchema,
  RecommendationRequestSchema,
  RecommendationResultSchema,
  SenSchema,
  SignedSenSchema,
  SourceLockV1Schema,
  SourceManifestV1Schema,
  validateDistanceFeasibilityReport
} from '../contracts'
import { validInput } from './snapshotFixture'

const source = {
  url: 'https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv',
  retrievedAt: '2026-08-03T04:00:00.000Z',
  sha256: 'a'.repeat(64),
  byteLength: 100,
  rowCount: 2,
  minObservedDate: '2026-08-02',
  maxObservedDate: '2026-08-02'
}

const snapshot = {
  schemaVersion: 1,
  buildId: 'fixture-2026-08-02',
  transformVersion: '1.0.0',
  compiledAt: '2026-08-03T04:00:00.000Z',
  dataAsOfDate: '2026-08-02',
  publicationMode: 'fixture',
  timeZone: 'Asia/Kuala_Lumpur',
  sources: [source],
  attribution: {
    text: 'PriceCatcher data transformed by AUNTIE Saves.',
    transactionalRecordsUrl: 'https://data.gov.my/data-catalogue/pricecatcher',
    premiseLookupUrl: 'https://data.gov.my/data-catalogue/lookup_premise',
    itemLookupUrl: 'https://data.gov.my/data-catalogue/lookup_item',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  },
  premises: [],
  items: [],
  evidence: []
}

const sha = 'a'.repeat(64)
const dates = (count: number) => Array.from({ length: count }, (_, index) => {
  const date = new Date(Date.UTC(2026, 7, 3 - count + index + 1))
  return date.toISOString().slice(0, 10)
})
const coverage = (scope: 'candidate-universe' | 'selected-content' = 'selected-content'): any => ({
  schemaVersion: 1, transformVersion: PRICECATCHER_TRANSFORM_VERSION, throughDate: '2026-08-03', sourceLockSha256: sha, scope,
  ...(scope === 'selected-content' ? { selectedContentDigests: { premises: sha, items: sha } } : {}),
  dataAsOfDate: '2026-08-03', calibrationDates: dates(14),
  premises: Array.from({ length: 10 }, (_, premise) => ({ premiseCode: String(premise), officialName: `Premise ${premise}`, address: `Address ${premise}`, premiseType: 'market', state: 'Selangor', district: 'Petaling Jaya', distinctPresenceDates: 10, dateCoverageBasisPoints: 7142, completeItemCellCoverageBasisPoints: 7000, nearDaily: true })),
  items: Array.from({ length: 5 }, (_, item) => ({ itemCode: String(item), officialName: `Item ${item}`, officialUnit: 'kg', itemGroup: 'food', itemCategory: 'fresh', coveredDates: 10, qualifyingPremiseCoverageDates: 10, qualifyingDateRateBasisPoints: 7142, meanPremiseCoverageBasisPoints: 7000, highCoverage: true })),
  passesCoverageCandidateGate: true, failureReasons: []
})
const candidateCoverageWithSpareHighCoverageItem = (): any => {
  const value = coverage('candidate-universe')
  value.items.push({
    itemCode: '5', officialName: 'Item 5', officialUnit: 'kg', itemGroup: 'food', itemCategory: 'fresh',
    coveredDates: 10, qualifyingPremiseCoverageDates: 10, qualifyingDateRateBasisPoints: 7142,
    meanPremiseCoverageBasisPoints: 7000, highCoverage: true
  })
  return value
}
const distance = (): any => ({
  schemaVersion: 1, transformVersion: PRICECATCHER_TRANSFORM_VERSION, throughDate: '2026-08-03', sourceLockSha256: sha, dataAsOfDate: '2026-08-03', coverageReportSha256: sha, microzonesSha256: sha, premisesSha256: sha, itemsSha256: sha,
  referenceAndTargetDates: dates(60), targetDates: dates(30), finalPremiseCodes: Array.from({ length: 10 }, (_, index) => String(index)), finalItemCodes: Array.from({ length: 5 }, (_, index) => String(index)),
  microzones: [{ microzoneId: 'central', premiseCount: 10, baselines: Array.from({ length: 10 }, (_, index) => ({ premiseCode: String(index), completeAlternativeDates: 21, completeAlternativeDateBasisPoints: 7000 })), minimumBaselineAlternativeDateBasisPoints: 7000, passes: true }],
  passesDeskDemoGate: true, failureReasons: []
})
const manifest = (url: string) => ({ url, retrievedAt: '2026-08-03T00:00:00.000Z', sha256: sha, byteLength: 1, rowCount: 1 })
const fixtureLock = (analysisStartDate: string): any => ({
  schemaVersion: 1, sourceKind: 'synthetic-fixture', throughDate: '2026-08-03', analysisStartDate, window: 'feasibility',
  sources: [
    { role: 'item-lookup', manifest: manifest('https://fixture.test/items.csv') },
    { role: 'transactions', yearMonth: '2026-06', manifest: manifest('https://fixture.test/2026-06.csv') },
    { role: 'premise-lookup', manifest: manifest('https://fixture.test/premises.csv') },
    { role: 'transactions', yearMonth: '2026-07', manifest: manifest('https://fixture.test/2026-07.csv') },
    { role: 'transactions', yearMonth: '2026-08', manifest: manifest('https://fixture.test/2026-08.csv') }
  ]
})
const officialFeasibilityLock = (): any => ({
  ...fixtureLock('2026-06-05'),
  sourceKind: 'official',
  sources: [
    { role: 'transactions', yearMonth: '2026-06', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-06.csv') },
    { role: 'transactions', yearMonth: '2026-07', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-07.csv') },
    { role: 'transactions', yearMonth: '2026-08', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv') },
    { role: 'premise-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_premise.csv') },
    { role: 'item-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_item.csv') }
  ]
})
const publicLock = (): any => ({
  schemaVersion: 1, sourceKind: 'official', throughDate: '2026-08-03', analysisStartDate: '2026-07-03', window: 'public',
  sources: [
    { role: 'transactions', yearMonth: '2026-07', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-07.csv') },
    { role: 'transactions', yearMonth: '2026-08', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv') },
    { role: 'premise-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_premise.csv') },
    { role: 'item-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_item.csv') }
  ]
})
const structuredSnapshot = (): any => ({
  ...snapshot,
  premises: [{ code: '1', officialName: 'Official', displayName: 'Display', address: 'Address', premiseType: 'market', latitude: 3, longitude: 101, coordinateAccuracyMetres: 10, verificationStatus: 'desk-verified', verifiedOn: '2026-08-01', verificationExpiresOn: '2026-08-03', coordinateAttribution: 'Official source' }],
  items: [{ code: '2', officialName: 'Rice', officialUnit: 'kg', qualifiers: [], quantityMode: 'whole-units' }],
  evidence: [{ premiseCode: '1', itemCode: '2', officialUnit: 'kg', observations: [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 100 }, { status: 'eligible', observedDate: '2026-08-02', priceSen: 100 }] }]
})
const snapshotWithTwoPremises = (withItems: boolean): any => {
  const value = structuredSnapshot()
  value.premises.push({ ...value.premises[0], code: '3', officialName: 'Official 3', displayName: 'Display 3' })
  if (withItems) value.evidence.push({ ...value.evidence[0], premiseCode: '3' })
  else { value.items = []; value.evidence = [] }
  return value
}
const snapshotWithTwoItemsAndNoPremises = (): any => {
  const value = structuredSnapshot()
  value.items.push({ ...value.items[0], code: '3', officialName: 'Rice 3' })
  value.premises = []
  value.evidence = []
  return value
}
const expectOnlyIssue = (result: any, expected: { path: PropertyKey[], message: string }): void => {
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues.map((issue: any) => ({ path: issue.path, message: issue.message }))).toEqual([expected])
  }
}

describe('runtime contracts', () => {
  // Break caught: ordinary-record capture sorts and reflects an attacker-sized key set before applying its finite budget.
  it('rejects oversized virtual records before reading any value descriptor', () => {
    const keys = Array.from({ length: 100_001 }, (_, index) => `virtual${index}`)
    for (const [name, schema] of [
      ['request', RecommendationRequestSchema],
      ['input', RecommendationInputSchema]
    ] as const) {
      let ownKeysCalls = 0
      let descriptorCalls = 0
      const record = new Proxy({}, {
        ownKeys: () => { ownKeysCalls++; return keys },
        getOwnPropertyDescriptor: (_target, key) => {
          descriptorCalls++
          return { configurable: true, enumerable: true, value: key, writable: true }
        },
        get: () => { throw new Error('raw virtual record get must not run') }
      })

      expect(schema.safeParse(record).success, name).toBe(false)
      expect(ownKeysCalls, name).toBe(1)
      expect(descriptorCalls, name).toBe(0)
    }
  })

  // Break caught: recursive request capture reflects every virtual sparse index before rejecting an over-budget array.
  it('rejects an oversized nested array before invoking its ownKeys trap', () => {
    for (const [name, schema, build] of [
      ['request', RecommendationRequestSchema, (lines: unknown) => ({ lines })],
      ['input', RecommendationInputSchema, (lines: unknown) => ({ ...validInput(), lines })]
    ] as const) {
      const target = new Array(100_001)
      let lengthDescriptorCalls = 0
      let ownKeysCalls = 0
      let getCalls = 0
      const lines = new Proxy(target, {
        ownKeys: array => { ownKeysCalls++; return Reflect.ownKeys(array) },
        getOwnPropertyDescriptor: (array, key) => {
          if (key === 'length') lengthDescriptorCalls++
          return Reflect.getOwnPropertyDescriptor(array, key)
        },
        get: () => { getCalls++; throw new Error('raw array get must not run') }
      })

      expect(schema.safeParse(build(lines)).success, name).toBe(false)
      expect(lengthDescriptorCalls, name).toBe(1)
      expect(ownKeysCalls, name).toBe(0)
      expect(getCalls, name).toBe(0)
    }
  })

  // Break caught: exported strict schemas silently strip reflection-only extras or throw on hostile reflection.
  it('rejects symbol, non-enumerable, and own __proto__ extras without throwing', () => {
    const expectSafeFailure = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown, name: string): void => {
      let result: { success: boolean } | undefined
      expect(() => { result = schema.safeParse(value) }, name).not.toThrow()
      expect(result?.success, name).toBe(false)
    }
    const addExtra = (target: object, kind: 'symbol' | 'hidden' | '__proto__'): void => {
      const key = kind === 'symbol' ? Symbol('extra') : kind === 'hidden' ? 'hidden' : '__proto__'
      Object.defineProperty(target, key, { configurable: true, enumerable: kind !== 'hidden', value: true })
    }

    const boundaries: Array<[string, (input: ReturnType<typeof validInput>) => object]> = [
      ['top', input => input],
      ['location', input => input.location],
      ['lines array', input => input.lines],
      ['line', input => input.lines[0]!],
      ['fixed map', input => input.fixedTripCostByPremiseCode!],
      ['fixed entry', input => input.fixedTripCostByPremiseCode!['2']!]
    ]
    for (const [schemaName, schema] of [['request', RecommendationRequestSchema], ['input', RecommendationInputSchema]] as const) {
      for (const [boundaryName, select] of boundaries) {
        for (const kind of ['symbol', 'hidden', '__proto__'] as const) {
          const input = validInput()
          addExtra(select(input), kind)
          expectSafeFailure(schema, input, `${schemaName} ${boundaryName} ${kind}`)
        }
      }
    }

    for (const [trapName, handler] of [
      ['getPrototypeOf', { getPrototypeOf: () => { throw new Error('prototype trap') } }],
      ['ownKeys', { ownKeys: () => { throw new Error('keys trap') } }],
      ['getOwnPropertyDescriptor', { getOwnPropertyDescriptor: () => { throw new Error('descriptor trap') } }]
    ] as const) {
      for (const [schemaName, schema] of [['request', RecommendationRequestSchema], ['input', RecommendationInputSchema]] as const) {
        expectSafeFailure(schema, new Proxy(validInput(), handler), `${schemaName} top ${trapName}`)
        const nested = validInput()
        nested.lines[0] = new Proxy(nested.lines[0]!, handler)
        expectSafeFailure(schema, nested, `${schemaName} line ${trapName}`)
      }
    }
  })

  it('keeps request semantics loose while enforcing canonical fixed-map keys in strict inputs', () => {
    expect(RecommendationRequestSchema.safeParse({ location: 42, lines: 'not-an-array', mode: { malformed: true } }).success).toBe(true)

    for (const key of ['constructor', '__proto__']) {
      const input = validInput()
      Object.defineProperty(input.fixedTripCostByPremiseCode!, key, {
        configurable: true, enumerable: true, value: { status: 'confirmed', amountSen: 0 }
      })
      expect(RecommendationInputSchema.safeParse(input).success, key).toBe(false)
    }

    const maximum = validInput()
    maximum.fixedTripCostByPremiseCode!['9007199254740991'] = { status: 'confirmed', amountSen: 0 }
    expect(RecommendationInputSchema.safeParse(maximum).success).toBe(true)
  })

  it('accepts a complete Version 1 snapshot and pointer', () => {
    expect(PilotSnapshotV1Schema.parse(snapshot).schemaVersion).toBe(1)
    expect(CurrentSnapshotPointerV1Schema.parse({
      schemaVersion: 1,
      buildId: snapshot.buildId,
      snapshotUrl: './data/builds/fixture-2026-08-02/snapshot.json',
      snapshotSha256: 'b'.repeat(64)
    }).buildId).toBe(snapshot.buildId)
  })

  it('rejects imprecise location and non-integral money', () => {
    const input = {
      evaluatedAt: '2026-08-03T04:00:00.000Z',
      location: { latitude: 3.1073, longitude: 101.6067, accuracyMetres: 101 },
      usualPremiseCode: '1',
      basketScope: 'complete-trip',
      lines: [{ itemCode: '2', quantityHundredths: 100 }],
      mode: 'drive',
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedTripCostByPremiseCode: { '1': { status: 'confirmed', amountSen: 0 } },
      worthwhileThresholdSen: 500
    }
    expect(() => RecommendationInputSchema.parse(input)).toThrow()
    expect(() => RecommendationInputSchema.parse({
      ...input,
      location: { ...input.location, accuracyMetres: 50 },
      worthwhileThresholdSen: 500.5
    })).toThrow()
  })

  it('rejects impossible local dates rather than checking shape only', () => {
    expect(() => PilotSnapshotV1Schema.parse({ ...snapshot, dataAsOfDate: '2026-02-30' })).toThrow()
  })

  it.each(['.', '..', '-leading', 'trailing.', 'a'.repeat(81)])('rejects unsafe build ID %s', buildId => {
    expect(() => CurrentSnapshotPointerV1Schema.parse({
      schemaVersion: 1, buildId,
      snapshotUrl: `./data/builds/${buildId}/snapshot.json`, snapshotSha256: 'b'.repeat(64)
    })).toThrow()
  })

  it('enforces exact public/bootstrap locks, source URL kinds, canonical order, and IMF dates', () => {
    // Break caught: a source lock can silently widen a bootstrap horizon or point an official role at an arbitrary blob.
    const publicLock = {
      schemaVersion: 1, sourceKind: 'official', throughDate: '2026-08-03', analysisStartDate: '2026-07-03', window: 'public',
      sources: [
        { role: 'item-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_item.csv') },
        { role: 'transactions', yearMonth: '2026-07', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-07.csv') },
        { role: 'premise-lookup', manifest: manifest('https://storage.data.gov.my/pricecatcher/lookup_premise.csv') },
        { role: 'transactions', yearMonth: '2026-08', manifest: manifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv') }
      ]
    }
    expect(SourceLockV1Schema.parse(publicLock).analysisStartDate).toBe('2026-07-03')
    expect(() => SourceLockV1Schema.parse({ ...publicLock, analysisStartDate: '2026-07-04' })).toThrow()
    expect(() => SourceLockV1Schema.parse({ ...publicLock, sources: [...publicLock.sources.slice(0, 2), { ...publicLock.sources[2], manifest: manifest('https://storage.data.gov.my/pricecatcher/not-premises.csv') }, publicLock.sources[3]] })).toThrow()
    const bootstrap = fixtureLock('2026-06-05')
    expect(canonicalizeSourceLockV1(bootstrap).sources.map(source => source.role)).toEqual(['transactions', 'transactions', 'transactions', 'premise-lookup', 'item-lookup'])
    expect(() => SourceLockV1Schema.parse(fixtureLock('2026-06-04'))).toThrow()
    expect(ExtendedSourceLockV1Schema.parse(fixtureLock('2026-06-04')).analysisStartDate).toBe('2026-06-04')
    expect(() => SourceLockV1Schema.parse({ ...bootstrap, sources: bootstrap.sources.map((entry: any) => ({ ...entry, manifest: { ...entry.manifest, url: 'https://fixture.invalid/data.csv' } })) })).toThrow()
    expect(() => SourceManifestV1Schema.parse({ ...manifest('https://fixture.test/data.csv'), lastModified: 'Tue, 31 Feb 2026 00:00:00 GMT' })).toThrow()
  })

  it('recomputes coverage thresholds, transform binding, and exact failure reasons', () => {
    // Break caught: coverage producers self-certify row flags, current transforms, or gate reasons.
    const dishonest = coverage('candidate-universe')
    dishonest.premises[0].nearDaily = false
    dishonest.items[0].qualifyingDateRateBasisPoints = 7000
    dishonest.items[0].highCoverage = false
    expect(() => CoverageCandidateReportV1Schema.parse(dishonest)).toThrow()
    const sparse = coverage('candidate-universe')
    sparse.premises = sparse.premises.slice(0, 9)
    sparse.passesCoverageCandidateGate = false
    sparse.failureReasons = ['insufficient-near-daily-premises']
    expect(CoverageCandidateReportV1Schema.parse(sparse).failureReasons).toEqual(['insufficient-near-daily-premises'])
    const oldSelected = coverage()
    oldSelected.transformVersion = '0.9.0'
    expect(() => CoverageCandidateReportV1Schema.parse(oldSelected)).toThrow()
    const historical = coverage('candidate-universe')
    historical.transformVersion = '0.9.0'
    expect(CoverageCandidateReportV1Schema.parse(historical).transformVersion).toBe('0.9.0')
  })

  it('binds distance evidence, derives its failure state, and allows an honest sparse report', () => {
    // Break caught: a distance report can claim unrelated selected codes, basis points, partitions, or a passing desk gate.
    const selected = CoverageCandidateReportV1Schema.parse(coverage())
    const report = distance()
    expect(validateDistanceFeasibilityReport(report, selected).passesDeskDemoGate).toBe(true)
    expect(() => validateDistanceFeasibilityReport({ ...report, finalPremiseCodes: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '11'] }, selected)).toThrow()
    expect(() => DistanceFeasibilityReportV1Schema.parse({ ...report, transformVersion: '0.9.0' })).toThrow()
    expect(() => DistanceFeasibilityReportV1Schema.parse({ ...report, microzones: [{ ...report.microzones[0], baselines: report.microzones[0].baselines.map((baseline: any, index: number) => index === 0 ? { ...baseline, completeAlternativeDateBasisPoints: 6999 } : baseline) }] })).toThrow()
    const sparse = { ...report, finalPremiseCodes: [], finalItemCodes: [], microzones: [], passesDeskDemoGate: false, failureReasons: ['invalid-final-premise-count', 'invalid-final-item-count', 'invalid-microzone-count', 'microzone-premise-count-below-three'] }
    expect(DistanceFeasibilityReportV1Schema.parse(sparse).passesDeskDemoGate).toBe(false)
  })

  it('orders all premise-code report comparisons numerically', () => {
    // Break caught: a valid canonical code sequence containing 10 is rejected because code comparison is lexical.
    const selected = coverage()
    selected.premises[9].premiseCode = '10'
    const report = distance()
    report.finalPremiseCodes[9] = '10'
    report.microzones[0].baselines[9].premiseCode = '10'
    expect(validateDistanceFeasibilityReport(report, selected).passesDeskDemoGate).toBe(true)
  })

  it('enforces strict snapshot/result objects and safe integer/cross-field boundaries', () => {
    // Break caught: serialized contracts admit extra fields, an unknown evidence key, unsafe money, or candidate-stage result without exclusions.
    expect(() => PilotSnapshotV1Schema.parse({ ...snapshot, extra: true })).toThrow()
    const complete = structuredSnapshot()
    expect(PilotSnapshotV1Schema.parse(complete).evidence).toHaveLength(1)
    expect(() => PilotSnapshotV1Schema.parse({ ...complete, evidence: [{ ...complete.evidence[0], itemCode: '3' }] })).toThrow()
    expect(() => RecommendationResultSchema.parse({ kind: 'insufficient-evidence', primaryReason: 'candidate-missing', details: [] })).toThrow()
    expect(() => RecommendationResultSchema.parse({ kind: 'insufficient-evidence', primaryReason: 'location-missing', details: [], extra: true })).toThrow()
    expect(SenSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => SenSchema.parse(Number.MAX_SAFE_INTEGER + 1)).toThrow()
    expect(() => RecommendationInputSchema.parse({
      evaluatedAt: '2026-08-03T04:00:00.000Z', location: { latitude: 3, longitude: 101, accuracyMetres: 1 }, usualPremiseCode: '1', basketScope: 'complete-trip', lines: [{ itemCode: '2', quantityHundredths: 100 }], mode: 'drive', extra: true
    })).toThrow()
  })

  it.each(['2026-07-02', '2026-07-04'])('rejects public source locks starting %s instead of exactly H−31', analysisStartDate => {
    const lock = publicLock()
    expect(SourceLockV1Schema.parse(lock).analysisStartDate).toBe('2026-07-03')
    lock.analysisStartDate = analysisStartDate
    expectOnlyIssue(SourceLockV1Schema.safeParse(lock), {
      path: ['analysisStartDate'], message: 'public lock starts exactly 31 days before through date'
    })
  })

  it.each([
    ['transaction', 0, 'https://storage.data.gov.my/pricecatcher/pricecatcher_2026-07.csv'],
    ['premise lookup', 3, 'https://storage.data.gov.my/pricecatcher/wrong_premise.csv'],
    ['item lookup', 4, 'https://storage.data.gov.my/pricecatcher/wrong_item.csv']
  ])('rejects a wrong official %s URL independently', (_role, index, url) => {
    const lock = officialFeasibilityLock()
    expect(SourceLockV1Schema.parse(lock).sourceKind).toBe('official')
    lock.sources[index].manifest.url = url
    expectOnlyIssue(SourceLockV1Schema.safeParse(lock), {
      path: ['sources'], message: 'official source URL does not match its role'
    })
  })

  it.each([
    ['accepts HTTPS .test', 'https://fixture.test/data.csv', true],
    ['rejects HTTP .test', 'http://fixture.test/data.csv', false],
    ['rejects HTTPS non-.test', 'https://fixture.invalid/data.csv', false]
  ])('%s synthetic source URLs', (_name, url, accepted) => {
    const lock = fixtureLock('2026-06-05')
    expect(SourceLockV1Schema.parse(lock).sourceKind).toBe('synthetic-fixture')
    lock.sources[0].manifest.url = url
    const result = SourceLockV1Schema.safeParse(lock)
    if (accepted) expect(result.success).toBe(true)
    else expectOnlyIssue(result, { path: ['sources'], message: 'fixture sources must use HTTPS .test URLs' })
  })

  it.each([
    ['premise basis points', coverage, (value: any) => { value.premises[0].dateCoverageBasisPoints = 7143 }, { path: ['premises', 0], message: 'premise coverage metrics are inconsistent' }],
    ['near-daily flag', coverage, (value: any) => { value.premises[0].nearDaily = false; value.passesCoverageCandidateGate = false; value.failureReasons = ['insufficient-near-daily-premises'] }, { path: ['premises', 0], message: 'premise coverage metrics are inconsistent' }],
    ['item qualifying basis points', coverage, (value: any) => { value.items[0].qualifyingDateRateBasisPoints = 7143 }, { path: ['items', 0], message: 'item coverage metrics are inconsistent' }],
    ['high-coverage flag', candidateCoverageWithSpareHighCoverageItem, (value: any) => { value.items[0].highCoverage = false }, { path: ['items', 0], message: 'item coverage metrics are inconsistent' }],
    ['gate boolean', coverage, (value: any) => { value.passesCoverageCandidateGate = false }, { path: ['failureReasons'], message: 'coverage gate and failure reasons are inconsistent' }],
    ['failure reason list', coverage, (value: any) => { value.failureReasons = ['insufficient-near-daily-premises'] }, { path: ['failureReasons'], message: 'coverage gate and failure reasons are inconsistent' }],
    ['selected transform version', coverage, (value: any) => { value.transformVersion = '0.9.0' }, { path: ['transformVersion'], message: 'selected report must use the current transform version' }]
  ])('rejects a tampered derived coverage %s independently', (_name, build, mutate, expectedIssue) => {
    const value = build()
    expect(CoverageCandidateReportV1Schema.safeParse(value).success).toBe(true)
    mutate(value)
    expectOnlyIssue(CoverageCandidateReportV1Schema.safeParse(value), expectedIssue)
  })

  it.each([
    ['final premise codes', 'binding', (report: any) => { report.finalPremiseCodes[9] = '90' }, 'distance final codes must exactly match selected coverage rows'],
    ['baseline premise partition', 'binding', (report: any) => { report.microzones[0].baselines[9].premiseCode = '90' }, 'microzone assignments must partition selected premises'],
    ['baseline basis points', 'local', (report: any) => { report.microzones[0].baselines[0].completeAlternativeDateBasisPoints = 7001 }, { path: ['microzones', 0], message: 'microzone baselines are inconsistent' }],
    ['distance transform version', 'local', (report: any) => { report.transformVersion = '0.9.0' }, { path: ['transformVersion'], message: 'distance report must use the current transform version' }],
    ['local failure reasons', 'local', (report: any) => { report.passesDeskDemoGate = false; report.failureReasons = ['invalid-final-item-count'] }, { path: ['failureReasons'], message: 'desk gate and failure reasons are inconsistent' }]
  ])('rejects a tampered distance %s independently', (_name, validation, mutate, expected) => {
    const selected = CoverageCandidateReportV1Schema.parse(coverage())
    const report = distance()
    expect(DistanceFeasibilityReportV1Schema.safeParse(report).success).toBe(true)
    mutate(report)
    const localResult = DistanceFeasibilityReportV1Schema.safeParse(report)
    if (validation === 'binding') {
      expect(localResult.success).toBe(true)
      expect(() => validateDistanceFeasibilityReport(report, selected)).toThrow(expected as string)
    } else expectOnlyIssue(localResult, expected as { path: PropertyKey[], message: string })
  })

  it('derives selected-coverage failure from the bound report instead of trusting distance output', () => {
    const selected = coverage()
    selected.premises[0] = { ...selected.premises[0], distinctPresenceDates: 9, dateCoverageBasisPoints: 6428, nearDaily: false }
    selected.passesCoverageCandidateGate = false
    selected.failureReasons = ['insufficient-near-daily-premises']
    expect(CoverageCandidateReportV1Schema.safeParse(selected).success).toBe(true)

    const declaredFailure = { ...distance(), passesDeskDemoGate: false, failureReasons: ['selected-coverage-gate-failed'] }
    expect(DistanceFeasibilityReportV1Schema.safeParse(declaredFailure).success).toBe(true)
    expect(validateDistanceFeasibilityReport(declaredFailure, selected).failureReasons).toEqual(['selected-coverage-gate-failed'])

    const locallyPassing = distance()
    expect(DistanceFeasibilityReportV1Schema.safeParse(locallyPassing).success).toBe(true)
    expect(() => validateDistanceFeasibilityReport(locallyPassing, selected)).toThrow('bound selected coverage does not satisfy the desk gate')
  })

  it.each([
    ['duplicate premise', () => snapshotWithTwoPremises(false), (value: any) => { value.premises[1].code = '1' }, { path: ['premises'], message: 'duplicate premise code' }],
    ['duplicate item', snapshotWithTwoItemsAndNoPremises, (value: any) => { value.items[1].code = '2' }, { path: ['items'], message: 'duplicate item code' }],
    ['missing matrix cell', structuredSnapshot, (value: any) => { value.evidence = [] }, { path: ['evidence'], message: 'evidence matrix is incomplete' }],
    ['duplicate evidence key', () => snapshotWithTwoPremises(true), (value: any) => { value.evidence[1].premiseCode = '1' }, { path: ['evidence', 1], message: 'duplicate evidence key' }],
    ['unknown evidence code', structuredSnapshot, (value: any) => { value.evidence[0].premiseCode = '3' }, { path: ['evidence', 0], message: 'unknown evidence code' }],
    ['unit mismatch', structuredSnapshot, (value: any) => { value.evidence[0].officialUnit = 'g' }, { path: ['evidence', 0, 'officialUnit'], message: 'evidence unit mismatch' }],
    ['wrong evidence dates', structuredSnapshot, (value: any) => { value.evidence[0].observations[0].observedDate = '2026-07-31' }, { path: ['evidence', 0, 'observations'], message: 'evidence dates must be sorted target dates' }],
    ['verification inversion', structuredSnapshot, (value: any) => { value.premises[0].verificationExpiresOn = '2026-07-31' }, { path: ['premises', 0], message: 'verification expiry precedes verification' }],
    ['consumer desk verification', structuredSnapshot, (value: any) => { value.publicationMode = 'consumer-pilot' }, { path: ['premises', 0], message: 'consumer pilot requires field verification' }],
    ['compiled-before-data date', structuredSnapshot, (value: any) => { value.compiledAt = '2026-08-01T00:00:00.000Z' }, { path: ['compiledAt'], message: 'compiled before data date in Malaysia' }]
  ])('rejects snapshot %s invariant', (_name, build, mutate, expectedIssue) => {
    const value = build()
    expect(PilotSnapshotV1Schema.safeParse(value).success).toBe(true)
    mutate(value)
    expectOnlyIssue(PilotSnapshotV1Schema.safeParse(value), expectedIssue)
  })

  it('rejects source date inversion independently', () => {
    const value = structuredSnapshot()
    expect(PilotSnapshotV1Schema.safeParse(value).success).toBe(true)
    value.sources = [{ ...value.sources[0], minObservedDate: '2026-08-03', maxObservedDate: '2026-08-02' }]
    expectOnlyIssue(PilotSnapshotV1Schema.safeParse(value), {
      path: ['sources', 0, 'maxObservedDate'], message: 'source dates must be ordered'
    })
  })

  it.each([
    ['inconsistent candidate partition', ExclusionCountsSchema,
      () => ({ pilotPremiseCount: 3, inRadiusCandidateCount: 2, completeCandidateCount: 1, excludedByReason: { 'outside-radius': 1, missing: 1 } }),
      (value: any) => { delete value.excludedByReason.missing }, { path: ['excludedByReason'], message: 'candidate partition counts are inconsistent' }],
    ['candidate-stage result without exclusions', RecommendationResultSchema,
      () => ({ kind: 'insufficient-evidence', primaryReason: 'candidate-missing', details: [], exclusions: { pilotPremiseCount: 0, inRadiusCandidateCount: 0, completeCandidateCount: 0, excludedByReason: {} } }),
      (value: any) => { delete value.exclusions }, { path: ['exclusions'], message: 'required after candidate enumeration' }],
    ['pre-candidate result with exclusions', RecommendationResultSchema,
      () => ({ kind: 'insufficient-evidence', primaryReason: 'location-missing', details: [] }),
      (value: any) => { value.exclusions = { pilotPremiseCount: 0, inRadiusCandidateCount: 0, completeCandidateCount: 0, excludedByReason: {} } },
      { path: ['exclusions'], message: 'forbidden before candidate enumeration' }],
    ['result extra key', RecommendationResultSchema,
      () => ({ kind: 'insufficient-evidence', primaryReason: 'location-missing', details: [] }),
      (value: any) => { value.extra = true }, { path: [], message: 'Unrecognized key: "extra"' }]
  ])('rejects result %s', (_name, schema, build, mutate, expectedIssue) => {
    const value = build()
    expect(schema.safeParse(value).success).toBe(true)
    mutate(value)
    expectOnlyIssue(schema.safeParse(value), expectedIssue)
  })

  it.each([
    ['Sen lower bound', SenSchema, 0, -1],
    ['Sen upper safe bound', SenSchema, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1],
    ['signed Sen upper safe bound', SignedSenSchema, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1],
    ['signed Sen lower safe bound', SignedSenSchema, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER - 1]
  ])('rejects %s', (_name, schema, valid, invalid) => {
    expect(schema.safeParse(valid).success).toBe(true)
    expect(schema.safeParse(invalid).success).toBe(false)
  })

  it('accepts the nonnegative and signed safe-integer endpoints', () => {
    expect(SenSchema.parse(0)).toBe(0)
    expect(SenSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(SignedSenSchema.parse(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER)
    expect(SignedSenSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })
})
