import { describe, expect, it } from 'vitest'
import { CanonicalCodeSchema } from '../contracts/common'
import { addLocalDates, differenceInLocalDates, malaysiaDateAt } from '../dates'
import { haversineMetres, MEAN_EARTH_RADIUS_METRES } from '../distance'
import { canonicalizeCode, compareCanonicalCodes } from '../ids'
import {
  bigIntToSafeNumber,
  checkedAdd,
  checkedSubtract,
  checkedSum,
  lineAllowanceSen,
  lineTotalSen,
  multiplyDivideHalfUp,
  parsePriceSen,
  roundHalfUp,
  unitAllowanceSen
} from '../money'

describe('canonical identifiers', () => {
  // Break caught: valid numeric source codes are not normalized to their stable canonical key.
  it.each([[2, '2'], ['2', '2'], ['2.0', '2'], ['0002', '2']])('canonicalizes %p', (raw, expected) => {
    expect(canonicalizeCode(raw)).toBe(expected)
  })

  // Break caught: malformed, fractional, or non-finite values can enter code-keyed domain data.
  it.each(['', '-2', '2.5', 'abc', Number.POSITIVE_INFINITY])('rejects %p', raw => {
    expect(canonicalizeCode(raw)).toBeNull()
  })

  // Break caught: code ordering becomes lexical or permits an unsupported safe-integer magnitude.
  it('uses one numeric comparator and rejects unsupported magnitudes', () => {
    expect(['10', '2'].sort(compareCanonicalCodes)).toEqual(['2', '10'])
    expect(canonicalizeCode('9007199254740992')).toBeNull()
  })

  // Break caught: the canonicalizer and runtime contract disagree at the supported numeric boundary.
  it('agrees with the canonical-code schema at the safe-integer boundary', () => {
    expect(canonicalizeCode('9007199254740991')).toBe('9007199254740991')
    expect(CanonicalCodeSchema.safeParse('9007199254740991').success).toBe(true)
    expect(canonicalizeCode('9007199254740992')).toBeNull()
    expect(CanonicalCodeSchema.safeParse('9007199254740992').success).toBe(false)
  })
})

describe('Malaysia dates', () => {
  // Break caught: dates are calculated in UTC instead of the Malaysia civil timezone.
  it('crosses UTC midnight in Asia/Kuala_Lumpur', () => {
    expect(malaysiaDateAt('2026-08-02T16:30:00.000Z')).toBe('2026-08-03')
    expect(addLocalDates('2026-03-01', -1)).toBe('2026-02-28')
    expect(differenceInLocalDates('2026-08-03', '2026-08-01')).toBe(2)
  })

  // Break caught: invalid instants or impossible calendar values silently normalize to another date.
  it('rejects invalid instants and impossible local dates', () => {
    expect(() => malaysiaDateAt('not-an-instant')).toThrow(RangeError)
    expect(() => addLocalDates('2026-02-30' as never, 1)).toThrow(RangeError)
    expect(() => differenceInLocalDates('2026-02-30' as never, '2026-02-28')).toThrow(RangeError)
  })
})

describe('integer-sen arithmetic', () => {
  // Break caught: price parsing accepts hidden fractions or line totals truncate rather than half-up round.
  it('parses at most two decimals and rounds extended lines half-up', () => {
    expect(parsePriceSen('10.25')).toBe(1025)
    expect(parsePriceSen('10.251')).toBeNull()
    expect(lineTotalSen(199, 50)).toBe(100)
  })

  // Break caught: line-level uncertainty neglects the requested quantity.
  it('scales uncertainty by quantity', () => {
    expect(lineAllowanceSen(1000, 100)).toBe(20)
    expect(lineAllowanceSen(1000, 1000)).toBe(200)
  })

  // Break caught: intermediate Number arithmetic loses precision before a checked money result is returned.
  it('uses bigint intermediates and rejects unsafe results', () => {
    expect(roundHalfUp(1, 2)).toBe(1)
    expect(multiplyDivideHalfUp(Number.MAX_SAFE_INTEGER, 2, 2)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => multiplyDivideHalfUp(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError)
    expect(() => bigIntToSafeNumber(9007199254740992n)).toThrow(RangeError)
  })

  // Break caught: signed checked arithmetic accepts invalid operands or permits overflow past the safe range.
  it('checks signed additions, subtractions, and sums before unsafe conversion', () => {
    expect(checkedAdd(-5, 2)).toBe(-3)
    expect(checkedSubtract(-5, 2)).toBe(-7)
    expect(checkedSum([-5, 2, 3])).toBe(0)
    expect(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError)
    expect(() => checkedSubtract(Number.MIN_SAFE_INTEGER, 1)).toThrow(RangeError)
    expect(() => checkedSum([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError)
  })

  // Break caught: invalid price representations, including zero and exponent notation, become monetary values.
  it.each(['0', '0.00', '-1', '1e2', '1.234', Number.POSITIVE_INFINITY])('rejects invalid price %p', raw => {
    expect(parsePriceSen(raw)).toBeNull()
  })

  // Break caught: the per-unit minimum allowance or percentage ceiling is rounded incorrectly.
  it('computes unit allowances with a 20-sen minimum and ceil percentage', () => {
    expect(unitAllowanceSen(999)).toBe(20)
    expect(unitAllowanceSen(1001)).toBe(21)
  })
})

describe('distance', () => {
  // Break caught: distance uses a different earth-radius constant or truncates metre results.
  it('uses the locked Earth radius and half-up metre rounding', () => {
    expect(MEAN_EARTH_RADIUS_METRES).toBe(6_371_008.8)
    expect(haversineMetres({ latitude: 3.1073, longitude: 101.6067 }, { latitude: 3.1073, longitude: 101.6067 })).toBe(0)
    expect(haversineMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBe(111195)
  })

  // Break caught: invalid or non-finite coordinates produce apparently valid distances.
  it.each([
    [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: 181 }, { latitude: 0, longitude: 0 }],
    [{ latitude: Number.NaN, longitude: 0 }, { latitude: 0, longitude: 0 }]
  ])('rejects invalid coordinates %p', (from, to) => {
    expect(() => haversineMetres(from, to)).toThrow(RangeError)
  })
})
