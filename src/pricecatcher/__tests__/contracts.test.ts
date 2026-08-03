import { describe, expect, it } from 'vitest'
import {
  CurrentSnapshotPointerV1Schema,
  PilotSnapshotV1Schema,
  RecommendationInputSchema
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
})
