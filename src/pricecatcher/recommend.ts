import { compareCanonicalCodes } from './ids'
import {
  checkedAdd, checkedSubtract, checkedSum, lineAllowanceSen, lineTotalSen, unitAllowanceSen
} from './money'
import { drivingTripCost } from './travel'
import { evaluateEvidenceWithInput, type CompletePremiseEvidence } from './evidence'
import {
  RecommendationResultSchema,
  type ComparedLineV1,
  type PriceComparisonV1,
  type RecommendationInput,
  type RecommendationResult,
  type TripComparisonV1
} from './contracts/recommendation'
import type { PilotSnapshotV1 } from './contracts/snapshot'

interface RequiredTripAssumptions {
  fuelEfficiencyDeciKmPerL: number
  fuelPriceSenPerL: number
  worthwhileThresholdSen: number
  fixedTripCostByPremiseCode: Record<string, { status: 'confirmed'; amountSen: number }>
}

interface CandidatePriceCalculation {
  comparison: PriceComparisonV1
  usualConservativeBasketTotalSen: number
  candidateConservativeBasketTotalSen: number
}

interface CandidateTripCalculation {
  comparison: TripComparisonV1
}

const invalidResult = (): RecommendationResult => RecommendationResultSchema.parse({
  kind: 'insufficient-evidence',
  primaryReason: 'input-invalid',
  details: []
})

const requireTripAssumptions = (
  input: RecommendationInput,
  usualPremiseCode: string,
  completeCandidatePremiseCodes: readonly string[]
): RequiredTripAssumptions | null => {
  const fuelPriceSenPerL = input.fuelPriceSenPerL
  const worthwhileThresholdSen = input.worthwhileThresholdSen
  const sourceCosts = input.fixedTripCostByPremiseCode
  if (fuelPriceSenPerL === undefined || worthwhileThresholdSen === undefined || !sourceCosts) return null
  const fixedTripCostByPremiseCode: RequiredTripAssumptions['fixedTripCostByPremiseCode'] = {}
  for (const premiseCode of [usualPremiseCode, ...completeCandidatePremiseCodes]) {
    const entry = sourceCosts[premiseCode]
    if (!entry || entry.status !== 'confirmed') return null
    fixedTripCostByPremiseCode[premiseCode] = entry
  }
  return {
    fuelEfficiencyDeciKmPerL: input.fuelEfficiencyDeciKmPerL ?? 120,
    fuelPriceSenPerL,
    worthwhileThresholdSen,
    fixedTripCostByPremiseCode
  }
}

const buildPriceCalculation = (
  usual: CompletePremiseEvidence,
  candidate: CompletePremiseEvidence
): CandidatePriceCalculation => {
  const candidateByItem = new Map(candidate.lines.map(line => [line.itemCode, line]))
  const lines: ComparedLineV1[] = usual.lines.map(usualLine => {
    const candidateLine = candidateByItem.get(usualLine.itemCode)!
    const usualTotal = lineTotalSen(usualLine.priceSen, usualLine.quantityHundredths)
    const candidateTotal = lineTotalSen(candidateLine.priceSen, usualLine.quantityHundredths)
    const usualUnitAllowance = unitAllowanceSen(usualLine.priceSen)
    const candidateUnitAllowance = unitAllowanceSen(candidateLine.priceSen)
    const usualAllowance = lineAllowanceSen(usualLine.priceSen, usualLine.quantityHundredths)
    const candidateAllowance = lineAllowanceSen(candidateLine.priceSen, usualLine.quantityHundredths)
    const usualConservative = Math.max(0, checkedSubtract(usualTotal, usualAllowance))
    const candidateConservative = checkedAdd(candidateTotal, candidateAllowance)
    return {
      itemCode: usualLine.itemCode,
      officialUnit: usualLine.officialUnit,
      quantityHundredths: usualLine.quantityHundredths,
      observedDate: usualLine.observedDate,
      usualUnitAllowanceSen: usualUnitAllowance,
      candidateUnitAllowanceSen: candidateUnitAllowance,
      usualLineAllowanceSen: usualAllowance,
      candidateLineAllowanceSen: candidateAllowance,
      usual: { priceSen: usualLine.priceSen, lineTotalSen: usualTotal, conservativeLineSen: usualConservative },
      candidate: { priceSen: candidateLine.priceSen, lineTotalSen: candidateTotal, conservativeLineSen: candidateConservative }
    }
  })
  const usualBasketTotalSen = checkedSum(lines.map(line => line.usual.lineTotalSen))
  const candidateBasketTotalSen = checkedSum(lines.map(line => line.candidate.lineTotalSen))
  return {
    comparison: {
      usualPremiseCode: usual.premiseCode,
      candidatePremiseCode: candidate.premiseCode,
      lines,
      usualBasketTotalSen,
      candidateBasketTotalSen,
      grossBasketSavingSen: checkedSubtract(usualBasketTotalSen, candidateBasketTotalSen),
      usualStraightLineMetres: usual.straightLineMetres,
      candidateStraightLineMetres: candidate.straightLineMetres,
      oldestObservationDate: lines.map(line => line.observedDate).sort()[0]!
    },
    usualConservativeBasketTotalSen: checkedSum(lines.map(line => line.usual.conservativeLineSen)),
    candidateConservativeBasketTotalSen: checkedSum(lines.map(line => line.candidate.conservativeLineSen))
  }
}

const compareTieBreaks = (left: PriceComparisonV1, right: PriceComparisonV1): number =>
  right.oldestObservationDate.localeCompare(left.oldestObservationDate) ||
  checkedSubtract(left.candidateStraightLineMetres, right.candidateStraightLineMetres) ||
  compareCanonicalCodes(left.candidatePremiseCode, right.candidatePremiseCode)

const compareObservedPrice = (left: CandidatePriceCalculation, right: CandidatePriceCalculation): number =>
  checkedSubtract(left.comparison.candidateBasketTotalSen, right.comparison.candidateBasketTotalSen) ||
  compareTieBreaks(left.comparison, right.comparison)

const buildTripCalculation = (
  price: CandidatePriceCalculation,
  assumptions: RequiredTripAssumptions
): CandidateTripCalculation => {
  const comparison = price.comparison
  const tripAssumptions = (premiseCode: string) => ({
    fuelEfficiencyDeciKmPerL: assumptions.fuelEfficiencyDeciKmPerL,
    fuelPriceSenPerL: assumptions.fuelPriceSenPerL,
    fixedCostSen: assumptions.fixedTripCostByPremiseCode[premiseCode]!.amountSen
  })
  const usualEstimatedTrip = drivingTripCost(comparison.usualStraightLineMetres, tripAssumptions(comparison.usualPremiseCode), 12_500)
  const candidateEstimatedTrip = drivingTripCost(comparison.candidateStraightLineMetres, tripAssumptions(comparison.candidatePremiseCode), 12_500)
  const usualEstimatedNetCostSen = checkedAdd(comparison.usualBasketTotalSen, usualEstimatedTrip.totalTripCostSen)
  const candidateEstimatedNetCostSen = checkedAdd(comparison.candidateBasketTotalSen, candidateEstimatedTrip.totalTripCostSen)
  const usualConservativeTrip = drivingTripCost(comparison.usualStraightLineMetres, tripAssumptions(comparison.usualPremiseCode), 10_000)
  const candidateConservativeTrip = drivingTripCost(comparison.candidateStraightLineMetres, tripAssumptions(comparison.candidatePremiseCode), 15_000)
  const usualConservativeNetCostSen = checkedAdd(price.usualConservativeBasketTotalSen, usualConservativeTrip.totalTripCostSen)
  const candidateConservativeNetCostSen = checkedAdd(price.candidateConservativeBasketTotalSen, candidateConservativeTrip.totalTripCostSen)
  return {
    comparison: {
      mode: 'drive',
      priceComparison: comparison,
      usualEstimatedTrip,
      candidateEstimatedTrip,
      estimatedNetSavingSen: checkedSubtract(usualEstimatedNetCostSen, candidateEstimatedNetCostSen),
      usualConservativeBasketTotalSen: price.usualConservativeBasketTotalSen,
      candidateConservativeBasketTotalSen: price.candidateConservativeBasketTotalSen,
      usualConservativeTrip,
      candidateConservativeTrip,
      usualConservativeNetCostSen,
      candidateConservativeNetCostSen,
      conservativeNetSavingSen: checkedSubtract(usualConservativeNetCostSen, candidateConservativeNetCostSen),
      worthwhileThresholdSen: assumptions.worthwhileThresholdSen
    }
  }
}

const compareConservativeSaving = (left: CandidateTripCalculation, right: CandidateTripCalculation): number => {
  const leftSaving = left.comparison.conservativeNetSavingSen
  const rightSaving = right.comparison.conservativeNetSavingSen
  const savingOrder = leftSaving === rightSaving ? 0 : leftSaving > rightSaving ? -1 : 1
  return savingOrder || compareTieBreaks(left.comparison.priceComparison, right.comparison.priceComparison)
}

export function recommend(snapshot: PilotSnapshotV1, request: unknown): RecommendationResult {
  const evaluated = evaluateEvidenceWithInput(snapshot, request)
  const evidence = evaluated.evidence
  if (evidence.kind === 'insufficient-evidence') return RecommendationResultSchema.parse(evidence)
  const input = evaluated.input
  if (!input) return invalidResult()

  try {
    const priceCalculations = evidence.candidates.map(candidate => buildPriceCalculation(evidence.usual, candidate))
    if (evidence.comparisonOnlyReasons.length > 0) {
      const selected = [...priceCalculations].sort(compareObservedPrice)[0]!
      return RecommendationResultSchema.parse({
        kind: 'comparison-only',
        comparison: selected.comparison,
        reasons: evidence.comparisonOnlyReasons,
        exclusions: evidence.exclusions
      })
    }

    const assumptions = requireTripAssumptions(
      input,
      evidence.usual.premiseCode,
      evidence.candidates.map(candidate => candidate.premiseCode)
    )
    if (!assumptions) return invalidResult()
    const selected = priceCalculations.map(price => buildTripCalculation(price, assumptions)).sort(compareConservativeSaving)[0]!
    const conservativeNetSavingSen = selected.comparison.conservativeNetSavingSen
    return RecommendationResultSchema.parse(conservativeNetSavingSen > 0 && conservativeNetSavingSen >= assumptions.worthwhileThresholdSen
      ? { kind: 'switch', comparison: selected.comparison, exclusions: evidence.exclusions }
      : { kind: 'no-clear-advantage', comparison: selected.comparison, exclusions: evidence.exclusions })
  } catch (error) {
    if (error instanceof RangeError) return invalidResult()
    throw error
  }
}
