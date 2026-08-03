import { describe, expect, it } from 'vitest'
import { buildReferenceStats, classifyTargetCell, collapseObservationRows } from '../quality'

const row = (premiseCode: string, priceSen: number, observedDate = '2026-08-01') => ({
  observedDate,
  premiseCode,
  itemCode: '10',
  officialUnit: '1kg',
  priceSen
})

const referenceRows = (prices: readonly number[], observedDate = '2026-07-31') =>
  prices.map((priceSen, index) => row(String(index + 1), priceSen, observedDate))

const observation = (premiseCode: string, itemCode: string, officialUnit: string, priceSen: number, observedDate = '2026-08-01') => ({
  observedDate,
  premiseCode,
  itemCode,
  officialUnit,
  priceSen
})

describe('duplicate consolidation', () => {
  // Break caught: repeated records inflate a price cell or conflicting source prices are accepted.
  it('collapses exact duplicates but rejects conflicting prices', () => {
    const exact = collapseObservationRows([row('1', 500), row('1', 500)])
    expect(exact).toMatchObject({ exactDuplicateCount: 1, conflictingCellCount: 0 })
    expect(exact.cells).toEqual([expect.objectContaining({ status: 'value', priceSen: 500 })])

    const conflict = collapseObservationRows([row('1', 500), row('1', 1500)])
    expect(conflict).toMatchObject({ exactDuplicateCount: 0, conflictingCellCount: 1 })
    expect(conflict.cells).toEqual([expect.objectContaining({
      status: 'conflicting-duplicate',
      pricesSen: [500, 1500]
    })])
  })

  // Break caught: a valid duplicate incorrectly rescues malformed evidence for the same cell.
  it('makes malformed evidence poison the keyed cell even beside a valid price', () => {
    const malformed = { ...row('1', 500), status: 'invalid-price' as const, rawPriceValue: '5.0.0' }
    const result = collapseObservationRows([row('1', 500), malformed])
    expect(result.cells).toEqual([expect.objectContaining({
      status: 'invalid-price', rawPriceValues: ['5.0.0'], validPricesSen: [500]
    })])
  })

  // Break caught: output ordering, audit values, or duplicate accounting depend on source row order.
  it('sorts canonical cells and bounded private audit values deterministically', () => {
    const result = collapseObservationRows([
      { ...row('10', 400, '2026-08-02'), status: 'invalid-price' as const, rawPriceValue: 'z' },
      { ...row('2', 700), status: 'invalid-price' as const, rawPriceValue: 'b' },
      row('2', 800),
      { ...row('2', 700), status: 'invalid-price' as const, rawPriceValue: 'a' },
      { ...row('2', 700), status: 'invalid-price' as const, rawPriceValue: 'a' },
      { ...row('2', 700), status: 'invalid-price' as const, rawPriceValue: 'x'.repeat(65) }
    ])

    expect(result.exactDuplicateCount).toBe(1)
    expect(result.cells).toEqual([
      expect.objectContaining({
        observedDate: '2026-08-01', premiseCode: '2', status: 'invalid-price',
        rawPriceValues: ['a', 'b', 'x'.repeat(64)], validPricesSen: [800]
      }),
      expect.objectContaining({ observedDate: '2026-08-02', premiseCode: '10', status: 'invalid-price' })
    ])
  })

  // Break caught: audit truncation merges distinct malformed source rows before duplicate accounting.
  it.each([
    ['identical long raw values', ['x'.repeat(64) + 'a', 'x'.repeat(64) + 'a'], 1],
    ['distinct same-prefix long raw values', ['x'.repeat(64) + 'a', 'x'.repeat(64) + 'b'], 0]
  ])('counts %s using full raw evidence while emitting one bounded audit value', (_name, rawPriceValues, exactDuplicateCount) => {
    const result = collapseObservationRows(rawPriceValues.map(rawPriceValue => ({
      ...row('1', 500), status: 'invalid-price' as const, rawPriceValue
    })))
    expect(result).toMatchObject({ exactDuplicateCount, conflictingCellCount: 0 })
    expect(result.cells).toEqual([expect.objectContaining({
      status: 'invalid-price', rawPriceValues: ['x'.repeat(64)], validPricesSen: []
    })])
  })

  // Break caught: an unrelated runtime extension changes a valid observation into malformed evidence.
  it('keeps a normalized observation valid when it has an unrelated status property', () => {
    const result = collapseObservationRows([{ ...row('1', 500), status: 'source-row-note' } as never])
    expect(result.cells).toEqual([expect.objectContaining({ status: 'value', priceSen: 500 })])
  })

  // Break caught: a claimed invalid row missing its raw price is silently converted into poisoned undefined evidence.
  it.each([
    { ...row('1', 500), status: 'invalid-price' },
    { ...row('1', 500), status: 'invalid-price', rawPriceValue: 500 }
  ])('rejects malformed claimed-invalid observation %p', malformed => {
    expect(() => collapseObservationRows([malformed as never])).toThrow(RangeError)
  })

  // Break caught: sorting is lexical, omits a key, or delimiter-like units collide in a compound key.
  it('sorts every same-date tuple key numerically then textually without grouping delimiter-like units', () => {
    const rows = [
      observation('10', '10', '1|kg', 400),
      observation('10', '2', 'u|1', 200),
      observation('2', '10', 'u|1', 100),
      observation('10', '10', '1kg', 300)
    ]
    const forward = collapseObservationRows(rows)
    const reverse = collapseObservationRows([...rows].reverse())
    expect(forward).toMatchObject({ exactDuplicateCount: 0, conflictingCellCount: 0 })
    expect(reverse).toEqual(forward)
    expect(forward.cells).toEqual([
      expect.objectContaining({ premiseCode: '2', itemCode: '10', officialUnit: 'u|1', priceSen: 100 }),
      expect.objectContaining({ premiseCode: '10', itemCode: '2', officialUnit: 'u|1', priceSen: 200 }),
      expect.objectContaining({ premiseCode: '10', itemCode: '10', officialUnit: '1kg', priceSen: 300 }),
      expect.objectContaining({ premiseCode: '10', itemCode: '10', officialUnit: '1|kg', priceSen: 400 })
    ])
  })

  // Break caught: non-integer or unsafe prices reach bigint quality arithmetic through the public domain boundary.
  it.each([1.5, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid priceSen %p', priceSen => {
    expect(() => collapseObservationRows([row('1', priceSen)])).toThrow(RangeError)
  })
})

describe('equal-premise references', () => {
  // Break caught: a premise with more source rows receives more weight, or target-date data leaks into its reference.
  it('uses one median per premise and excludes the target date', () => {
    const rows = Array.from({ length: 20 }, (_, index) => [
      row(String(index + 1), 1000 + index, '2026-07-01'),
      row(String(index + 1), 1000 + index, '2026-07-31'),
      row(String(index + 1), 99999, '2026-08-01')
    ]).flat()
    const stats = buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')
    expect(stats.status).toBe('ready')
    if (stats.status === 'ready') {
      expect(stats.distinctPremises).toBe(20)
      expect(stats.medianSen).toBeLessThan(1100)
    }
  })

  // Break caught: zero-MAD references divide by zero or hard ratio limits are omitted.
  it('is finite at zero MAD and rejects hard-ratio errors', () => {
    const references = collapseObservationRows(referenceRows(Array.from({ length: 20 }, () => 1000))).cells
    const stats = buildReferenceStats(references, '10', '2026-08-01')
    expect(classifyTargetCell(collapseObservationRows([row('99', 1000)]).cells[0]!, stats)).toMatchObject({ status: 'eligible' })
    expect(classifyTargetCell(collapseObservationRows([row('99', 100)]).cells[0]!, stats)).toMatchObject({
      status: 'anomalous', reason: 'outside-ratio-bound'
    })
  })

  // Break caught: the reference gate counts rows rather than distinct premises.
  it('requires twenty distinct reference premises', () => {
    const references = collapseObservationRows(referenceRows(Array.from({ length: 19 }, () => 1000))).cells
    expect(buildReferenceStats(references, '10', '2026-08-01')).toEqual({
      status: 'insufficient-reference',
      distinctPremises: 19
    })
  })

  // Break caught: premises with many source observations receive more than one vote in the cross-premise median.
  it('gives one heavily sampled premise one vote', () => {
    const rows = [
      ...Array.from({ length: 21 }, (_, index) => row('1', 100, `2026-07-${String(index + 2).padStart(2, '0')}`)),
      ...Array.from({ length: 19 }, (_, index) => row(String(index + 2), 200, '2026-07-31'))
    ]
    expect(buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')).toEqual({
      status: 'ready', distinctPremises: 20, medianSen: 200, madSen: 0, robustScaleTimes10k: 200_000n
    })
  })

  // Break caught: the reference window includes H-31, target-date, or later observations, or excludes H-30.
  it('uses exactly H minus 30 through H minus 1 and retains the ceiling two-percent floor', () => {
    const rows = Array.from({ length: 20 }, (_, index) => [
      row(String(index + 1), 1001, '2026-07-02'),
      row(String(index + 1), 1, '2026-07-01'),
      row(String(index + 1), 99999, '2026-08-01'),
      row(String(index + 1), 99998, '2026-08-02')
    ]).flat()
    expect(buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')).toEqual({
      status: 'ready', distinctPremises: 20, medianSen: 1001, madSen: 0, robustScaleTimes10k: 210_000n
    })
  })

  // Break caught: an odd per-premise median uses the wrong order statistic before premises are aggregated.
  it('uses the middle value for an odd per-premise median', () => {
    const rows = [
      row('10', 100, '2026-07-02'), row('10', 200, '2026-07-03'), row('10', 900, '2026-07-04'),
      ...Array.from({ length: 9 }, (_, index) => row(String(index + 1), 100, '2026-07-31')),
      ...Array.from({ length: 10 }, (_, index) => row(String(index + 11), 300, '2026-07-31'))
    ]
    expect(buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')).toEqual({
      status: 'ready', distinctPremises: 20, medianSen: 250, madSen: 50, robustScaleTimes10k: 741_300n
    })
  })

  // Break caught: a half-sen per-premise median truncates before the cross-premise median.
  it('rounds an even per-premise median half up', () => {
    const rows = [
      row('10', 100, '2026-07-02'), row('10', 101, '2026-07-03'),
      ...Array.from({ length: 9 }, (_, index) => row(String(index + 1), 100, '2026-07-31')),
      ...Array.from({ length: 10 }, (_, index) => row(String(index + 11), 102, '2026-07-31'))
    ]
    expect(buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')).toEqual({
      status: 'ready', distinctPremises: 20, medianSen: 102, madSen: 1, robustScaleTimes10k: 200_000n
    })
  })

  // Break caught: the even cross-premise median truncates instead of half-up rounding.
  it('rounds an even cross-premise median half up', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) => row(String(index + 1), 100, '2026-07-31')),
      ...Array.from({ length: 10 }, (_, index) => row(String(index + 11), 101, '2026-07-31'))
    ]
    expect(buildReferenceStats(collapseObservationRows(rows).cells, '10', '2026-08-01')).toEqual({
      status: 'ready', distinctPremises: 20, medianSen: 101, madSen: 1, robustScaleTimes10k: 200_000n
    })
  })

  // Break caught: inclusive ratio comparisons allow values exactly at the stated hard boundaries.
  it('rejects target prices exactly at one quarter and four times the median', () => {
    const stats = buildReferenceStats(
      collapseObservationRows(referenceRows(Array.from({ length: 20 }, () => 1000))).cells,
      '10',
      '2026-08-01'
    )
    expect(classifyTargetCell(collapseObservationRows([row('99', 250)]).cells[0]!, stats)).toMatchObject({ status: 'anomalous' })
    expect(classifyTargetCell(collapseObservationRows([row('99', 4000)]).cells[0]!, stats)).toMatchObject({ status: 'anomalous' })
  })

  // Break caught: observations from the target date enter the 30 prior local-date window.
  it('does not let a huge target-date price alter reference statistics', () => {
    const rowsWithoutTargetDate = collapseObservationRows(referenceRows(Array.from({ length: 20 }, () => 1000))).cells
    const rowsIncludingHugeTargetDate = collapseObservationRows([
      ...referenceRows(Array.from({ length: 20 }, () => 1000)),
      ...referenceRows(Array.from({ length: 20 }, () => 99999), '2026-08-01')
    ]).cells
    expect(buildReferenceStats(rowsIncludingHugeTargetDate, '10', '2026-08-01')).toEqual(
      buildReferenceStats(rowsWithoutTargetDate, '10', '2026-08-01')
    )
  })

  // Break caught: a two-percent floor is not retained when a small positive MAD would otherwise be too small.
  it('keeps the two-percent scale floor for a one-sen MAD', () => {
    const stats = buildReferenceStats(
      collapseObservationRows(referenceRows([
        ...Array.from({ length: 10 }, () => 999),
        ...Array.from({ length: 10 }, () => 1001)
      ])).cells,
      '10',
      '2026-08-01'
    )
    expect(stats.status).toBe('ready')
    if (stats.status === 'ready') expect(stats.robustScaleTimes10k).toBeGreaterThanOrEqual(200_000n)
  })

  // Break caught: scaling MAD is rounded before comparison, which admits a 899-sen deviation that exact 1.4826 MAD rejects.
  it('uses the exact rational MAD scale for the robust-outlier threshold', () => {
    const stats = buildReferenceStats(
      collapseObservationRows(referenceRows([
        ...Array.from({ length: 10 }, () => 899),
        ...Array.from({ length: 10 }, () => 1101)
      ])).cells,
      '10',
      '2026-08-01'
    )
    expect(stats).toMatchObject({ status: 'ready', medianSen: 1000, madSen: 101, robustScaleTimes10k: 1_497_426n })
    expect(classifyTargetCell(collapseObservationRows([row('99', 1899)]).cells[0]!, stats)).toMatchObject({
      status: 'anomalous', reason: 'robust-scale-outlier'
    })
  })

  // Break caught: a value exactly on the robust threshold is rejected, or one sen beyond it is admitted.
  it.each([
    [1120, { status: 'eligible', priceSen: 1120 }],
    [1121, { status: 'anomalous', reason: 'robust-scale-outlier' }]
  ])('uses a strict robust-outlier comparison at target price %i', (priceSen, expected) => {
    const stats = buildReferenceStats(
      collapseObservationRows(referenceRows(Array.from({ length: 20 }, () => 1000))).cells,
      '10',
      '2026-08-01'
    )
    expect(classifyTargetCell(collapseObservationRows([row('99', priceSen)]).cells[0]!, stats)).toMatchObject(expected)
  })

  // Break caught: a target quality decision scans other dates instead of only the supplied cell.
  it('maps poisoned target cells directly to their anomaly reason', () => {
    const stats = buildReferenceStats(
      collapseObservationRows(referenceRows(Array.from({ length: 20 }, () => 1000))).cells,
      '10',
      '2026-08-01'
    )
    const invalid = collapseObservationRows([
      { ...row('99', 1000), status: 'invalid-price' as const, rawPriceValue: 'broken' }
    ]).cells[0]!
    const conflict = collapseObservationRows([row('99', 1000), row('99', 1001)]).cells[0]!
    expect(classifyTargetCell(invalid, stats)).toMatchObject({ status: 'anomalous', reason: 'invalid-price' })
    expect(classifyTargetCell(conflict, stats)).toMatchObject({ status: 'anomalous', reason: 'conflicting-duplicate' })
  })

  // Break caught: insufficient references overwrite a known poisoned target reason.
  it.each([
    ['invalid-price', { ...row('99', 1000), status: 'invalid-price' as const, rawPriceValue: 'broken' }, { status: 'anomalous', reason: 'invalid-price' }],
    ['conflicting-duplicate', [row('99', 1000), row('99', 1001)], { status: 'anomalous', reason: 'conflicting-duplicate' }],
    ['valid value', row('99', 1000), { status: 'insufficient-reference' }]
  ])('prioritizes %s correctly with insufficient references', (_name, input, expected) => {
    const insufficient = buildReferenceStats(
      collapseObservationRows(referenceRows(Array.from({ length: 19 }, () => 1000))).cells,
      '10',
      '2026-08-01'
    )
    const cell = Array.isArray(input) ? collapseObservationRows(input).cells[0]! : collapseObservationRows([input]).cells[0]!
    expect(classifyTargetCell(cell, insufficient)).toMatchObject(expected)
  })
})
