import { DrivingTripCostV1Schema, type DrivingTripCostV1 } from './contracts/recommendation'
import { checkedAdd, multiplyDivideHalfUp } from './money'

export interface DrivingTripAssumptions {
  fuelEfficiencyDeciKmPerL: number
  fuelPriceSenPerL: number
  fixedCostSen: number
}

const inSafeIntegerRange = (value: number, minimum: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum

export function drivingTripCost(
  distanceMetres: number,
  assumptions: DrivingTripAssumptions,
  routeFactorBasisPoints: number
): DrivingTripCostV1 {
  if (!inSafeIntegerRange(distanceMetres, 0, Number.MAX_SAFE_INTEGER)) throw new RangeError('distance must be a non-negative safe integer')
  if (!inSafeIntegerRange(routeFactorBasisPoints, 5_000, 30_000)) throw new RangeError('route factor must be from 5,000 through 30,000 basis points')
  if (!inSafeIntegerRange(assumptions.fuelEfficiencyDeciKmPerL, 10, 500)) throw new RangeError('fuel efficiency is out of range')
  if (!inSafeIntegerRange(assumptions.fuelPriceSenPerL, 1, 1_000)) throw new RangeError('fuel price is out of range')
  if (!inSafeIntegerRange(assumptions.fixedCostSen, 0, 10_000)) throw new RangeError('fixed trip cost is out of range')

  const oneWayRoadMetres = multiplyDivideHalfUp(distanceMetres, routeFactorBasisPoints, 10_000)
  const estimatedRoundTripRoadMetres = checkedAdd(oneWayRoadMetres, oneWayRoadMetres)
  const fuelCostSen = multiplyDivideHalfUp(
    estimatedRoundTripRoadMetres,
    assumptions.fuelPriceSenPerL,
    100 * assumptions.fuelEfficiencyDeciKmPerL
  )
  const result: DrivingTripCostV1 = {
    straightLineMetres: distanceMetres,
    routeFactorBasisPoints,
    estimatedRoundTripRoadMetres,
    fuelCostSen,
    fixedCostSen: assumptions.fixedCostSen,
    totalTripCostSen: checkedAdd(fuelCostSen, assumptions.fixedCostSen)
  }
  return DrivingTripCostV1Schema.parse(result)
}
