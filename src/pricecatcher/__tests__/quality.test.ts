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
})
