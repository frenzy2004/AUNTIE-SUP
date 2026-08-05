import type { LocalDate } from '../contracts/common'
import type { CompilePilotInput, RawTransactionRow } from '../contracts/compiler'

const THROUGH_DATE: LocalDate = '2026-08-02'
const COMPILED_AT = '2026-08-03T04:00:00.000Z'
const SOURCE_LOCK_SHA256 = 'a'.repeat(64)
const EFFECTIVE_INPUT_SHA256 = 'e'.repeat(64)
const REVIEW_INPUT_SHA256 = '7'.repeat(64)
const QUALITY_REVIEW_BASIS_SHA256 = '5'.repeat(64)

const localDates = (start: LocalDate, count: number): LocalDate[] => {
  const [year, month, day] = start.split('-').map(Number)
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset))
    return date.toISOString().slice(0, 10) as LocalDate
  })
}

const fixtureSource = (reviewer: 'reviewer-a' | 'reviewer-b', ordinal: 1 | 2, accessedOn: LocalDate) => ({
  url: `https://${reviewer}-${ordinal}.evidence.test/location`,
  accessedOn,
  redistribution: 'synthetic-cc0' as const,
  attributionCode: 'synthetic-fixture' as const
})

const premiseReview = (code: string, index: number) => {
  const latitude = 3.1 + index / 10_000
  const longitude = 101.6 + index / 10_000
  const officialName = Number(code) <= 3 ? `Pilot Premise ${code}` : `Reference Premise ${code}`
  return {
    code,
    officialName,
    displayName: officialName,
    address: `${code} Fixture Street`,
    premiseType: 'Kedai Runcit',
    latitude,
    longitude,
    coordinateAccuracyMetres: 10,
    verificationStatus: 'desk-verified' as const,
    verifiedOn: '2026-08-02' as LocalDate,
    verificationExpiresOn: '2026-10-31' as LocalDate,
    reviews: [
      {
        reviewerId: 'reviewer-a',
        reviewedOn: '2026-08-01' as LocalDate,
        observedName: officialName,
        entranceLatitude: latitude,
        entranceLongitude: longitude,
        coordinateAccuracyMetres: 10,
        closureSignal: 'none' as const,
        sources: [fixtureSource('reviewer-a', 1, '2026-08-01'), fixtureSource('reviewer-a', 2, '2026-08-01')]
      },
      {
        reviewerId: 'reviewer-b',
        reviewedOn: '2026-08-02' as LocalDate,
        observedName: officialName.toUpperCase().replace(' ', '  '),
        entranceLatitude: latitude,
        entranceLongitude: longitude,
        coordinateAccuracyMetres: 10,
        closureSignal: 'open' as const,
        sources: [fixtureSource('reviewer-b', 1, '2026-08-02'), fixtureSource('reviewer-b', 2, '2026-08-02')]
      }
    ],
    coordinateAttribution: 'Synthetic fixture coordinates'
  }
}

const itemReview = {
  code: '10',
  officialName: 'Fixture Item',
  officialUnit: 'each',
  qualifiers: ['standard'],
  quantityMode: 'whole-units' as const,
  reviews: [
    {
      reviewerId: 'reviewer-a',
      reviewedOn: '2026-08-01' as LocalDate,
      status: 'approved' as const,
      qualifiers: [' Standard '],
      quantityMode: 'whole-units' as const,
      reasonCodes: ['definition-specific', 'qualifier-agreement', 'quantity-mode-agreement'] as const
    },
    {
      reviewerId: 'reviewer-b',
      reviewedOn: '2026-08-02' as LocalDate,
      status: 'approved' as const,
      qualifiers: ['STANDARD'],
      quantityMode: 'whole-units' as const,
      reasonCodes: ['definition-specific', 'qualifier-agreement', 'quantity-mode-agreement'] as const
    }
  ],
  semanticStatus: 'approved' as const
}

const conflictBasis = {
  flag: 'rejected-cell' as const,
  cell: {
    premiseCode: '2',
    itemCode: '10',
    observedDate: THROUGH_DATE,
    sourceRows: [
      { sourceManifestIndex: 1, rowNumber: 22 },
      { sourceManifestIndex: 1, rowNumber: 41 }
    ],
    reason: 'conflicting-duplicate' as const,
    pricesSen: [1000, 1100]
  }
}

const rawRow = (premiseCode: string, observedDate: LocalDate, itemCode = '10', price: unknown = '10.00'): RawTransactionRow => ({
  date: observedDate,
  premise_code: premiseCode,
  item_code: itemCode,
  price,
  sourceManifestIndex: observedDate.startsWith('2026-07') ? 0 : 1,
  rowNumber: 1
})

export function referenceOnlyRow(observedDate: LocalDate): RawTransactionRow {
  return rawRow('4', observedDate)
}

export function pilotRow(observedDate: LocalDate): RawTransactionRow {
  return rawRow('1', observedDate)
}

export interface CompilerFixtureOverrides {
  extraRows?: RawTransactionRow[]
  omitPilotCell?: [premiseCode: string, itemCode: string, observedDate: LocalDate]
}

export function makeCompilerInput(overrides: CompilerFixtureOverrides = {}): CompilePilotInput {
  const rows = localDates('2026-07-02', 32).flatMap(observedDate =>
    Array.from({ length: 20 }, (_, index) => rawRow(String(index + 1), observedDate))
  )
  rows.push(rawRow('2', THROUGH_DATE, '10', '11.00'))
  rows.push(rawRow('1', THROUGH_DATE, '999', '10.00'))
  rows.push(...(overrides.extraRows ?? []))

  const nextRowNumber = new Map<number, number>()
  const sourcedRows = rows.map(row => {
    const sourceManifestIndex = String(row.date).startsWith('2026-07') ? 0 : 1
    const rowNumber = (nextRowNumber.get(sourceManifestIndex) ?? 0) + 1
    nextRowNumber.set(sourceManifestIndex, rowNumber)
    return { ...row, sourceManifestIndex, rowNumber }
  })
  const transactions = overrides.omitPilotCell
    ? sourcedRows.filter(row => !(
        String(row.premise_code) === overrides.omitPilotCell![0] &&
        String(row.item_code) === overrides.omitPilotCell![1] &&
        row.date === overrides.omitPilotCell![2]
      ))
    : sourcedRows
  const monthRows = (sourceManifestIndex: number) => transactions.filter(row => row.sourceManifestIndex === sourceManifestIndex)
  const manifest = (url: string, monthIndex?: number) => {
    const monthlyRows = monthIndex === undefined ? [] : monthRows(monthIndex)
    const dates = monthlyRows.map(row => String(row.date)).sort()
    return {
      url,
      retrievedAt: '2026-08-03T03:00:00.000Z',
      sha256: (monthIndex === undefined ? 'c' : monthIndex === 0 ? '1' : '2').repeat(64),
      byteLength: Math.max(1, monthlyRows.length * 40),
      rowCount: Math.max(1, ...monthlyRows.map(row => row.rowNumber)),
      ...(dates.length > 0 ? { minObservedDate: dates[0], maxObservedDate: dates.at(-1) } : {})
    }
  }

  return {
    transformVersion: '1.0.0',
    compiledAt: COMPILED_AT,
    throughDate: THROUGH_DATE,
    publicationMode: 'fixture',
    effectiveInputSha256: EFFECTIVE_INPUT_SHA256,
    reviewInputSha256: REVIEW_INPUT_SHA256,
    contentDigests: {
      microzones: '1'.repeat(64),
      premises: '2'.repeat(64),
      items: '3'.repeat(64),
      qualityReviews: '4'.repeat(64),
      qualityReviewBasis: QUALITY_REVIEW_BASIS_SHA256,
      reviewProvenance: '6'.repeat(64)
    },
    sourceLock: {
      schemaVersion: 1,
      sourceKind: 'synthetic-fixture',
      throughDate: THROUGH_DATE,
      analysisStartDate: '2026-07-02',
      window: 'public',
      sources: [
        { role: 'transactions', yearMonth: '2026-07', manifest: manifest('https://fixture.test/pricecatcher-2026-07.csv', 0) },
        { role: 'transactions', yearMonth: '2026-08', manifest: manifest('https://fixture.test/pricecatcher-2026-08.csv', 1) },
        { role: 'premise-lookup', manifest: manifest('https://fixture.test/premises.csv') },
        { role: 'item-lookup', manifest: manifest('https://fixture.test/items.csv') }
      ]
    },
    sourceLockSha256: SOURCE_LOCK_SHA256,
    transactions,
    premiseLookups: Array.from({ length: 20 }, (_, index) => ({
      premise_code: String(index + 1),
      premise: index < 3 ? `Pilot Premise ${index + 1}` : `Reference Premise ${index + 1}`,
      address: `${index + 1} Fixture Street`,
      premise_type: 'Kedai Runcit',
      state: 'Selangor',
      district: 'Petaling Jaya'
    })),
    itemLookups: [{
      item_code: '10', item: 'Fixture Item', unit: 'each',
      item_group: 'Fixture Group', item_category: 'Fixture Category'
    }],
    content: {
      microzones: [{
        id: 'fixture-zone',
        label: 'Fixture Zone',
        bounds: { north: 3.2, south: 3, east: 101.8, west: 101.5 },
        premiseCodes: ['1', '2', '3']
      }],
      premises: ['1', '2', '3'].map((code, index) => premiseReview(code, index)),
      items: [structuredClone(itemReview)],
      qualityReviewBasis: {
        schemaVersion: 1,
        transformVersion: '1.0.0',
        compiledAt: COMPILED_AT,
        throughDate: THROUGH_DATE,
        sourceLockSha256: SOURCE_LOCK_SHA256,
        reviewInputSha256: REVIEW_INPUT_SHA256,
        publicationMode: 'fixture',
        inputDigests: {
          microzones: '1'.repeat(64), premises: '2'.repeat(64), items: '3'.repeat(64)
        },
        qualityFlags: [structuredClone(conflictBasis)]
      },
      qualityReviews: {
        schemaVersion: 1,
        qualityReviewBasisSha256: QUALITY_REVIEW_BASIS_SHA256,
        qualityReviews: [{
          reviewBasis: structuredClone(conflictBasis),
          disposition: 'confirmed-exclusion',
          reviewedOn: '2026-08-02',
          reviews: [
            { reviewerId: 'reviewer-a', reviewedOn: '2026-08-01', disposition: 'confirmed-exclusion', reasonCodes: ['quality-exclusion-confirmed'] },
            { reviewerId: 'reviewer-b', reviewedOn: '2026-08-02', disposition: 'confirmed-exclusion', reasonCodes: ['quality-exclusion-confirmed'] }
          ]
        }]
      }
    }
  }
}

export function fixtureParsedContent(): CompilePilotInput['content'] {
  return structuredClone(makeCompilerInput().content)
}

export function fixtureVerifiedDigests() {
  const input = makeCompilerInput()
  return {
    sourceLockSha256: input.sourceLockSha256,
    effectiveInputSha256: input.effectiveInputSha256,
    reviewInputSha256: input.reviewInputSha256,
    contentDigests: structuredClone(input.contentDigests)
  }
}

export function makeCollectionInput(input = makeCompilerInput()) {
  const { effectiveInputSha256: _effectiveInputSha256, contentDigests, content, ...shared } = input
  return {
    ...shared,
    inputDigests: {
      microzones: contentDigests.microzones,
      premises: contentDigests.premises,
      items: contentDigests.items,
      coverageReport: contentDigests.coverageReport,
      feasibilityReport: contentDigests.feasibilityReport
    },
    content: {
      microzones: content.microzones,
      premises: content.premises,
      items: content.items,
      coverageReport: content.coverageReport,
      feasibilityReport: content.feasibilityReport
    }
  }
}

export function makeDeskCompilerInput(analysisStartDate: LocalDate = '2026-06-04'): CompilePilotInput {
  const input = structuredClone(makeCompilerInput())
  const oldSources = input.sourceLock.sources
  const officialManifest = (url: string, source = oldSources[0]!.manifest) => ({ ...source, url })
  input.publicationMode = 'desk-demo'
  input.reviewHostPolicy = { version: '2026-08-03-v1', retailerHosts: ['locator.example'] }
  input.reviewHostPolicySha256 = 'b'.repeat(64)
  input.contentDigests.coverageReport = '8'.repeat(64)
  input.contentDigests.feasibilityReport = '9'.repeat(64)
  input.sourceLock = {
    schemaVersion: 1,
    sourceKind: 'official',
    throughDate: THROUGH_DATE,
    analysisStartDate,
    window: 'feasibility',
    sources: [
      {
        role: 'transactions', yearMonth: '2026-06',
        manifest: officialManifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-06.csv', {
          ...oldSources[0]!.manifest, rowCount: 1, minObservedDate: undefined, maxObservedDate: undefined
        })
      },
      { role: 'transactions', yearMonth: '2026-07', manifest: officialManifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-07.csv', oldSources[0]!.manifest) },
      { role: 'transactions', yearMonth: '2026-08', manifest: officialManifest('https://storage.data.gov.my/pricecatcher/pricecatcher_2026-08.csv', oldSources[1]!.manifest) },
      { role: 'premise-lookup', manifest: officialManifest('https://storage.data.gov.my/pricecatcher/lookup_premise.csv', oldSources[2]!.manifest) },
      { role: 'item-lookup', manifest: officialManifest('https://storage.data.gov.my/pricecatcher/lookup_item.csv', oldSources[3]!.manifest) }
    ]
  }
  input.transactions = input.transactions.map(value => {
    const row = value as RawTransactionRow
    return { ...row, sourceManifestIndex: row.sourceManifestIndex + 1 }
  })
  const officialSources = (reviewedOn: LocalDate) => [
    { url: 'https://data.gov.my/data-catalogue/pricecatcher', accessedOn: reviewedOn, redistribution: 'cc-by-4.0' as const, attributionCode: 'kpdn-official-record' as const },
    { url: 'https://locator.example/store', accessedOn: reviewedOn, redistribution: 'official-use-permitted' as const, attributionCode: 'official-retailer-locator' as const }
  ]
  input.content.premises = Array.from({ length: 10 }, (_, index) => {
    const premise = premiseReview(String(index + 1), index)
    return { ...premise, reviews: premise.reviews.map(review => ({ ...review, sources: officialSources(review.reviewedOn) })) }
  })
  input.content.microzones = [{
    id: 'fixture-zone', label: 'Fixture Zone',
    bounds: { north: 3.2, south: 3, east: 101.8, west: 101.5 },
    premiseCodes: Array.from({ length: 10 }, (_, index) => String(index + 1))
  }]
  input.content.items = Array.from({ length: 5 }, (_, index) => {
    const code = String(10 + index)
    const name = index === 0 ? 'Fixture Item' : `Fixture Item ${code}`
    return {
      ...structuredClone(itemReview), code, officialName: name,
      reviews: itemReview.reviews.map(review => ({ ...review }))
    }
  })
  input.itemLookups = Array.from({ length: 5 }, (_, index) => {
    const code = String(10 + index)
    return {
      item_code: code, item: index === 0 ? 'Fixture Item' : `Fixture Item ${code}`,
      unit: 'each', item_group: 'Fixture Group', item_category: 'Fixture Category'
    }
  })
  const conflictBasis = (input.content.qualityReviewBasis as any).qualityFlags[0]
  for (const ref of conflictBasis.cell.sourceRows) ref.sourceManifestIndex += 1
  const dispositionBasis = (input.content.qualityReviews as any).qualityReviews[0].reviewBasis
  for (const ref of dispositionBasis.cell.sourceRows) ref.sourceManifestIndex += 1
  const basis = input.content.qualityReviewBasis as any
  basis.publicationMode = 'desk-demo'
  basis.inputDigests.coverageReport = input.contentDigests.coverageReport
  basis.inputDigests.feasibilityReport = input.contentDigests.feasibilityReport
  const reportDates = localDates('2026-06-04', 60)
  input.content.coverageReport = {
    schemaVersion: 1,
    transformVersion: '1.0.0',
    throughDate: THROUGH_DATE,
    sourceLockSha256: SOURCE_LOCK_SHA256,
    scope: 'selected-content',
    selectedContentDigests: { premises: input.contentDigests.premises, items: input.contentDigests.items },
    dataAsOfDate: THROUGH_DATE,
    calibrationDates: reportDates.slice(-14),
    premises: Array.from({ length: 10 }, (_, index) => ({
      premiseCode: String(index + 1),
      officialName: index < 3 ? `Pilot Premise ${index + 1}` : `Reference Premise ${index + 1}`,
      address: `${index + 1} Fixture Street`, premiseType: 'Kedai Runcit',
      state: 'Selangor', district: 'Petaling Jaya', distinctPresenceDates: 10,
      dateCoverageBasisPoints: 7142, completeItemCellCoverageBasisPoints: 7000, nearDaily: true
    })),
    items: Array.from({ length: 5 }, (_, index) => ({
      itemCode: String(10 + index), officialName: index === 0 ? 'Fixture Item' : `Fixture Item ${10 + index}`,
      officialUnit: 'each', itemGroup: 'Fixture Group', itemCategory: 'Fixture Category',
      coveredDates: 10, qualifyingPremiseCoverageDates: 10, qualifyingDateRateBasisPoints: 7142,
      meanPremiseCoverageBasisPoints: 7000, highCoverage: true
    })),
    passesCoverageCandidateGate: true,
    failureReasons: []
  }
  input.content.feasibilityReport = {
    schemaVersion: 1,
    transformVersion: '1.0.0',
    throughDate: THROUGH_DATE,
    sourceLockSha256: SOURCE_LOCK_SHA256,
    dataAsOfDate: THROUGH_DATE,
    coverageReportSha256: input.contentDigests.coverageReport,
    microzonesSha256: input.contentDigests.microzones,
    premisesSha256: input.contentDigests.premises,
    itemsSha256: input.contentDigests.items,
    referenceAndTargetDates: reportDates,
    targetDates: reportDates.slice(-30),
    finalPremiseCodes: Array.from({ length: 10 }, (_, index) => String(index + 1)),
    finalItemCodes: Array.from({ length: 5 }, (_, index) => String(10 + index)),
    microzones: [{
      microzoneId: 'fixture-zone', premiseCount: 10,
      baselines: Array.from({ length: 10 }, (_, index) => ({
        premiseCode: String(index + 1), completeAlternativeDates: 21,
        completeAlternativeDateBasisPoints: 7000
      })),
      minimumBaselineAlternativeDateBasisPoints: 7000,
      passes: true
    }],
    passesDeskDemoGate: true,
    failureReasons: []
  }
  return input
}
