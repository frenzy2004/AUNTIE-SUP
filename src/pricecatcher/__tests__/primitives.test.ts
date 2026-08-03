import { describe, expect, it, vi } from 'vitest'
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

  // Break caught: canonical validation delegates unbounded digit strings to BigInt.
  it('rejects an oversized canonical prompt without BigInt work', () => {
    const bigInt = vi.spyOn(globalThis, 'BigInt').mockImplementation(() => { throw new Error('BigInt must not run') })
    try {
      expect(CanonicalCodeSchema.safeParse('9007199254740991').success).toBe(true)
      expect(CanonicalCodeSchema.safeParse('9007199254740992').success).toBe(false)
      let oversizedSuccess: boolean | undefined
      expect(() => { oversizedSuccess = CanonicalCodeSchema.safeParse('9'.repeat(100_000)).success }).not.toThrow()
      expect(oversizedSuccess).toBe(false)
      expect(bigInt).not.toHaveBeenCalled()
    } finally {
      bigInt.mockRestore()
    }
  })

  // Break caught: a later BigInt refinement throws after the canonical syntax refinement has already failed.
  it.each(['abc', '1.2', 'constructor', '__proto__'])('returns a schema failure without throwing for %p', code => {
    let success: boolean | undefined
    expect(() => { success = CanonicalCodeSchema.safeParse(code).success }).not.toThrow()
    expect(success).toBe(false)
  })

  // Break caught: whitespace normalization changes, or Unicode lookalikes and embedded whitespace become valid code keys.
  it('trims surrounding ASCII and Unicode whitespace but rejects non-ASCII numeric forms', () => {
    expect(canonicalizeCode(' \t0002.000\u2003')).toBe('2')
    expect(canonicalizeCode('٢')).toBeNull()
    expect(canonicalizeCode('＋2')).toBeNull()
    expect(canonicalizeCode('2\u2003.0')).toBeNull()
    expect(canonicalizeCode('2 .0')).toBeNull()
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

  // Break caught: date arithmetic or Malaysia midnight conversion emits an out-of-contract five-digit year.
  it('rejects date calculations beyond the LocalDate year boundary', () => {
    expect(() => addLocalDates('9999-12-31', 1)).toThrow(RangeError)
    expect(() => malaysiaDateAt('9999-12-31T16:30:00.000Z')).toThrow(RangeError)
  })

  // Break caught: calendar addition incorrectly handles leap days, centuries, or the final supported LocalDate.
  it.each([
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-29', 1, '2024-03-01'],
    ['2000-02-28', 1, '2000-02-29'],
    ['2100-02-28', 1, '2100-03-01'],
    ['9999-12-30', 1, '9999-12-31']
  ])('adds %i days from %s across a calendar boundary', (date, delta, expected) => {
    expect(addLocalDates(date as never, delta)).toBe(expected)
  })

  // Break caught: the last valid Malaysia-local instant is rejected before the LocalDate boundary is crossed.
  it('retains the final supported Malaysia local date', () => {
    expect(malaysiaDateAt('9999-12-31T15:59:59.999Z')).toBe('9999-12-31')
  })

  // Break caught: non-integral or unsafe date deltas cause engine-dependent date normalization.
  it.each([0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid date delta %p', delta => {
    expect(() => addLocalDates('2026-08-03', delta)).toThrow(RangeError)
  })

  // Break caught: date difference loses leap-day semantics by treating every February as 28 days.
  it('counts the leap day when comparing local dates', () => {
    expect(differenceInLocalDates('2024-03-01', '2024-02-28')).toBe(2)
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

  // Break caught: checked addition overflows or underflows at either signed safe-integer boundary.
  it.each([
    [Number.MAX_SAFE_INTEGER, -1, Number.MAX_SAFE_INTEGER - 1],
    [Number.MIN_SAFE_INTEGER, 1, Number.MIN_SAFE_INTEGER + 1]
  ])('adds signed boundary values %p and %p safely', (left, right, expected) => {
    expect(checkedAdd(left, right)).toBe(expected)
  })

  // Break caught: checked addition converts a result outside the signed safe-integer range.
  it.each([
    [Number.MAX_SAFE_INTEGER, 1],
    [Number.MIN_SAFE_INTEGER, -1]
  ])('rejects checked-add overflow for %p and %p', (left, right) => {
    expect(() => checkedAdd(left, right)).toThrow(RangeError)
  })

  // Break caught: checked subtraction mishandles signed values near either safe-integer boundary.
  it.each([
    [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER - 1],
    [Number.MIN_SAFE_INTEGER, -1, Number.MIN_SAFE_INTEGER + 1]
  ])('subtracts signed boundary values %p and %p safely', (left, right, expected) => {
    expect(checkedSubtract(left, right)).toBe(expected)
  })

  // Break caught: checked subtraction converts a result outside the signed safe-integer range.
  it.each([
    [Number.MAX_SAFE_INTEGER, -1],
    [Number.MIN_SAFE_INTEGER, 1]
  ])('rejects checked-subtract overflow for %p and %p', (left, right) => {
    expect(() => checkedSubtract(left, right)).toThrow(RangeError)
  })

  // Break caught: checked summation loses sign or overflows at either safe-integer boundary.
  it.each([
    [[Number.MAX_SAFE_INTEGER, -1], Number.MAX_SAFE_INTEGER - 1],
    [[Number.MIN_SAFE_INTEGER, 1], Number.MIN_SAFE_INTEGER + 1]
  ])('sums signed boundary values %p safely', (values, expected) => {
    expect(checkedSum(values)).toBe(expected)
  })

  // Break caught: checked summation converts an overflowed or underflowed total to Number.
  it.each([
    [Number.MAX_SAFE_INTEGER, 1],
    [Number.MIN_SAFE_INTEGER, -1]
  ])('rejects checked-sum overflow for %p with %p', (left, right) => {
    expect(() => checkedSum([left, right])).toThrow(RangeError)
  })

  // Break caught: checked signed arithmetic accepts a non-integral operand before converting to bigint.
  it.each([
    ['checkedAdd', () => checkedAdd(0.5, 0)],
    ['checkedSubtract', () => checkedSubtract(0, 0.5)],
    ['checkedSum', () => checkedSum([0, 0.5])]
  ])('rejects non-integral input for %s', (_name, operation) => {
    expect(operation).toThrow(RangeError)
  })

  // Break caught: arithmetic helpers accept fractional operands, invalid denominators, or an unsafe product result.
  it.each([
    ['roundHalfUp fractional numerator', () => roundHalfUp(1.5, 1)],
    ['roundHalfUp negative numerator', () => roundHalfUp(-1, 1)],
    ['roundHalfUp non-positive denominator', () => roundHalfUp(1, 0)],
    ['roundHalfUp safe upper result', () => roundHalfUp(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER],
    ['multiplyDivideHalfUp fractional operand', () => multiplyDivideHalfUp(1.5, 1, 1)],
    ['multiplyDivideHalfUp negative operand', () => multiplyDivideHalfUp(-1, 1, 1)],
    ['multiplyDivideHalfUp non-positive denominator', () => multiplyDivideHalfUp(1, 1, 0)],
    ['multiplyDivideHalfUp unsafe result', () => multiplyDivideHalfUp(Number.MAX_SAFE_INTEGER, 2, 1)],
    ['lineTotalSen negative price', () => lineTotalSen(-1, 100)],
    ['lineTotalSen fractional quantity', () => lineTotalSen(1, 1.5)],
    ['lineTotalSen unsafe result', () => lineTotalSen(Number.MAX_SAFE_INTEGER, 101)],
    ['unitAllowanceSen fractional price', () => unitAllowanceSen(1.5)],
    ['unitAllowanceSen negative price', () => unitAllowanceSen(-1)],
    ['unitAllowanceSen safe upper input', () => unitAllowanceSen(Number.MAX_SAFE_INTEGER), 180_143_985_094_820],
    ['lineAllowanceSen fractional quantity', () => lineAllowanceSen(1, 1.5)],
    ['lineAllowanceSen unsafe result', () => lineAllowanceSen(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)]
  ])('validates %s', (_name, operation, expected?) => {
    if (expected === undefined) expect(operation).toThrow(RangeError)
    else expect(operation()).toBe(expected)
  })

  // Break caught: invalid price representations, including zero and exponent notation, become monetary values.
  it.each(['0', '0.00', '-1', '1e2', '1.234', Number.POSITIVE_INFINITY])('rejects invalid price %p', raw => {
    expect(parsePriceSen(raw)).toBeNull()
  })

  // Break caught: valid Number inputs no longer retain their plain decimal sen value.
  it.each([[1, 100], [1.2, 120], [1.23, 123]])('parses ordinary numeric price %p into %p sen', (raw, expected) => {
    expect(parsePriceSen(raw)).toBe(expected)
  })

  // Break caught: scientific stringification or binary floating-point artifacts are accepted as prices.
  it.each([1e-7, 1e21, 0.1 + 0.2])('rejects non-plain numeric price representation %p', raw => {
    expect(parsePriceSen(raw)).toBeNull()
  })

  // Break caught: numeric zero, negative, and non-finite inputs bypass the decimal representation guard.
  it.each([0, -1, Number.NaN, Number.NEGATIVE_INFINITY])('rejects invalid numeric price %p', raw => {
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

  // Break caught: valid coordinate extrema are rejected by strict rather than inclusive range validation.
  it.each([
    [{ latitude: -90, longitude: -180 }, { latitude: 90, longitude: 180 }],
    [{ latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 }]
  ])('accepts exact coordinate boundaries %p', (from, to) => {
    expect(haversineMetres(from, to)).toBeGreaterThan(0)
  })

  // Break caught: latitude/longitude just outside inclusive bounds or non-finite values produce distances.
  it.each([
    [{ latitude: -90.000001, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 90.000001, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: -180.000001 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: 180.000001 }, { latitude: 0, longitude: 0 }],
    [{ latitude: Number.POSITIVE_INFINITY, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 0, longitude: Number.NEGATIVE_INFINITY }, { latitude: 0, longitude: 0 }]
  ])('rejects out-of-range coordinates %p', (from, to) => {
    expect(() => haversineMetres(from, to)).toThrow(RangeError)
  })

  // Break caught: antipodal and nearly antipodal paths overflow into a non-finite rounded distance.
  it.each([
    [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }],
    [{ latitude: 0, longitude: 0 }, { latitude: 0.000001, longitude: 180 }]
  ])('returns a finite positive distance for antipodal coordinates %p', (from, to) => {
    const distance = haversineMetres(from, to)
    expect(Number.isSafeInteger(distance)).toBe(true)
    expect(distance).toBeGreaterThan(20_000_000)
  })

  // Break caught: floating-point rounding lifts the Haversine intermediate above one and poisons the result without clamping.
  it('clamps a floating-point Haversine intermediate above one', () => {
    const distance = haversineMetres(
      { latitude: 63.322350523500035, longitude: 113.08807936575892 },
      { latitude: -63.3223505234998, longitude: -66.91192063424137 }
    )
    expect(Number.isSafeInteger(distance)).toBe(true)
    expect(distance).toBe(20_015_114)
  })
})
