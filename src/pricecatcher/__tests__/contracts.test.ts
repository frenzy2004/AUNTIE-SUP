import { describe, expect, it } from 'vitest'
import {
  canonicalizeSourceLockV1,
  CoverageCandidateReportV1Schema,
  CurrentSnapshotPointerV1Schema,
  DistanceFeasibilityReportV1Schema,
  ExtendedSourceLockV1Schema,
  PilotSnapshotV1Schema,
  PRICECATCHER_TRANSFORM_VERSION,
  RecommendationInputSchema,
  RecommendationResultSchema,
  SenSchema,
  SourceLockV1Schema,
  SourceManifestV1Schema,
  validateDistanceFeasibilityReport
} from '../contracts'

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
const structuredSnapshot = (): any => ({
  ...snapshot,
  premises: [{ code: '1', officialName: 'Official', displayName: 'Display', address: 'Address', premiseType: 'market', latitude: 3, longitude: 101, coordinateAccuracyMetres: 10, verificationStatus: 'desk-verified', verifiedOn: '2026-08-01', verificationExpiresOn: '2026-08-03', coordinateAttribution: 'Official source' }],
  items: [{ code: '2', officialName: 'Rice', officialUnit: 'kg', qualifiers: [], quantityMode: 'whole-units' }],
  evidence: [{ premiseCode: '1', itemCode: '2', officialUnit: 'kg', observations: [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 100 }, { status: 'eligible', observedDate: '2026-08-02', priceSen: 100 }] }]
})

describe('runtime contracts', () => {
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
})
