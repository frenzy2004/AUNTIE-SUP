import { describe, expect, it } from 'vitest'
import { drivingTripCost } from '../travel'

describe('driving trip costs', () => {
  // Break caught: fuel is rounded per leg or a one-way trip is reported as round-trip travel.
  it('uses a dedicated round trip and rounds fuel once to sen', () => {
    expect(drivingTripCost(1000, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 50
    }, 12500)).toEqual({
      straightLineMetres: 1000,
      routeFactorBasisPoints: 12500,
      estimatedRoundTripRoadMetres: 2500,
      fuelCostSen: 43,
      fixedCostSen: 50,
      totalTripCostSen: 93
    })
  })

  // Break caught: route multiplication is doubled before its one-way half-up rounding.
  it('rounds the one-way road distance before doubling it', () => {
    expect(drivingTripCost(1, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 0
    }, 12_500)).toMatchObject({ estimatedRoundTripRoadMetres: 2, fuelCostSen: 0 })
  })

  // Break caught: the Version 1 factor bounds become exclusive or silently widen.
  it.each([
    [5_000, 1_000],
    [30_000, 6_000]
  ])('accepts inclusive route factor %i', (routeFactorBasisPoints, estimatedRoundTripRoadMetres) => {
    expect(drivingTripCost(1_000, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 0
    }, routeFactorBasisPoints)).toMatchObject({ routeFactorBasisPoints, estimatedRoundTripRoadMetres })
  })

  // Break caught: invalid factors or distances reach floating/unsafe arithmetic.
  it.each([
    [-1, 12_500],
    [1.5, 12_500],
    [Number.MAX_SAFE_INTEGER + 1, 12_500],
    [1_000, 4_999],
    [1_000, 30_001],
    [1_000, 12_500.5]
  ])('rejects invalid distance %p or factor %p', (distanceMetres, routeFactorBasisPoints) => {
    expect(() => drivingTripCost(distanceMetres, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 0
    }, routeFactorBasisPoints)).toThrow(RangeError)
  })

  // Break caught: a safe one-way result is doubled into an unsafe Number.
  it('rejects round-trip doubling beyond the safe-integer range', () => {
    expect(() => drivingTripCost(Number.MAX_SAFE_INTEGER, {
      fuelEfficiencyDeciKmPerL: 120,
      fuelPriceSenPerL: 205,
      fixedCostSen: 0
    }, 5_000)).toThrow(RangeError)
  })

  // Break caught: final fuel sen uses truncation or banker's rounding at an exact half.
  it('rounds the whole round-trip fuel cost half up', () => {
    expect(drivingTripCost(250, {
      fuelEfficiencyDeciKmPerL: 10,
      fuelPriceSenPerL: 1,
      fixedCostSen: 0
    }, 10_000)).toMatchObject({
      estimatedRoundTripRoadMetres: 500,
      fuelCostSen: 1,
      totalTripCostSen: 1
    })
  })

  // Break caught: direct travel callers can bypass the Version 1 assumption bounds.
  it.each([
    [{ fuelEfficiencyDeciKmPerL: 9, fuelPriceSenPerL: 205, fixedCostSen: 0 }],
    [{ fuelEfficiencyDeciKmPerL: 501, fuelPriceSenPerL: 205, fixedCostSen: 0 }],
    [{ fuelEfficiencyDeciKmPerL: 120.5, fuelPriceSenPerL: 205, fixedCostSen: 0 }],
    [{ fuelEfficiencyDeciKmPerL: 120, fuelPriceSenPerL: 0, fixedCostSen: 0 }],
    [{ fuelEfficiencyDeciKmPerL: 120, fuelPriceSenPerL: 1_001, fixedCostSen: 0 }],
    [{ fuelEfficiencyDeciKmPerL: 120, fuelPriceSenPerL: 205, fixedCostSen: -1 }],
    [{ fuelEfficiencyDeciKmPerL: 120, fuelPriceSenPerL: 205, fixedCostSen: 10_001 }]
  ])('rejects invalid trip assumption %o', assumptions => {
    expect(() => drivingTripCost(1_000, assumptions, 12_500)).toThrow(RangeError)
  })

  // Break caught: maximum valid Version 1 assumptions are treated as exclusive bounds.
  it('accepts the inclusive upper trip-assumption bounds', () => {
    expect(drivingTripCost(1_000, {
      fuelEfficiencyDeciKmPerL: 500,
      fuelPriceSenPerL: 1_000,
      fixedCostSen: 10_000
    }, 10_000)).toEqual({
      straightLineMetres: 1_000,
      routeFactorBasisPoints: 10_000,
      estimatedRoundTripRoadMetres: 2_000,
      fuelCostSen: 40,
      fixedCostSen: 10_000,
      totalTripCostSen: 10_040
    })
  })
})
