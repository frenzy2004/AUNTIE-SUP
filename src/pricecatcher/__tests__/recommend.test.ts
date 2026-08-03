import { describe, expect, it } from 'vitest'
import * as publicApi from '../index'
import * as contractsApi from '../contracts'
import { recommend } from '../recommend'
import { RecommendationResultSchema } from '../contracts/recommendation'
import { PilotSnapshotV1Schema, type PilotSnapshotV1 } from '../contracts/snapshot'
import {
  drivingInput, eligibleCell, goldenInput, goldenSnapshot, goldenSnapshotWithMode,
  inputWithoutTripFields, priceOnlyDrivingInput, snapshotWherePriceAndTripWinnersDiffer,
  fixedDescriptorMutationProbe, lineDescriptorMutationProbe, previousDaySnapshotWithStaleEvidence, validInput
} from './snapshotFixture'

const OBSERVED_DATE = '2026-08-02' as const
const PRIOR_DATE = '2026-08-01' as const
const INPUT_INVALID_RESULT = { kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] } as const

const snapshotWithPrices = (usualPriceSen: number, candidatePriceSen: number): PilotSnapshotV1 => ({
  ...goldenSnapshot(),
  evidence: [
    eligibleCell('1', '10', OBSERVED_DATE, usualPriceSen),
    eligibleCell('2', '10', OBSERVED_DATE, candidatePriceSen)
  ]
})

const multiLineSnapshot = (): PilotSnapshotV1 => {
  const snapshot = goldenSnapshot()
  return {
    ...snapshot,
    items: [
      snapshot.items[0]!,
      { code: '20', officialName: 'Second fixture item', officialUnit: 'each', qualifiers: [], quantityMode: 'whole-units' }
    ],
    evidence: [
      eligibleCell('1', '10', OBSERVED_DATE, 1_000),
      eligibleCell('1', '20', OBSERVED_DATE, 2_000),
      eligibleCell('2', '10', OBSERVED_DATE, 700),
      eligibleCell('2', '20', OBSERVED_DATE, 1_500)
    ]
  }
}

const snapshotWithEqualCandidates = (nearer: boolean): PilotSnapshotV1 => {
  const snapshot = goldenSnapshot()
  const candidate = snapshot.premises.find(premise => premise.code === '2')!
  const third = {
    ...candidate,
    code: '3',
    officialName: 'Third candidate',
    displayName: 'Third candidate',
    address: '3 Test Street',
    longitude: nearer ? 0.0044966 : candidate.longitude
  }
  return {
    ...snapshot,
    premises: [snapshot.premises[0]!, candidate, third],
    evidence: [
      eligibleCell('1', '10', OBSERVED_DATE, 1_000),
      eligibleCell('2', '10', OBSERVED_DATE, 700),
      eligibleCell('3', '10', OBSERVED_DATE, 700)
    ]
  }
}

describe('PriceCatcher recommendation selection', () => {
  // Break caught: stale baseline/candidate rows can produce an actionable recommendation from a previous-day snapshot.
  it.each(['baseline', 'candidate'] as const)('never recommends from a two-evaluation-date-old %s observation', scope => {
    expect(recommend(previousDaySnapshotWithStaleEvidence(scope), validInput({ worthwhileThresholdSen: 0 }))).toMatchObject({
      kind: 'insufficient-evidence', primaryReason: `${scope}-stale`
    })
  })

  // Break caught: recommendation classifies a present malformed basket container as an empty basket.
  it.each([null, 42, 'not-an-array', { 0: { itemCode: '10', quantityHundredths: 100 }, length: 1 }])(
    'returns input-invalid for a present malformed lines container %p', lines => {
      expect(recommend(goldenSnapshot(), { ...goldenInput(), lines })).toEqual(INPUT_INVALID_RESULT)
    }
  )

  // Break caught: point-estimate savings are used as the actionable threshold gate.
  it('switches only when conservative saving clears the threshold', () => {
    const result = recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 200 }))
    expect(result).toMatchObject({ kind: 'switch' })
    if (result.kind === 'switch') {
      expect(result.comparison.conservativeNetSavingSen).toBeGreaterThanOrEqual(200)
      expect(result.comparison.priceComparison.lines.every(line =>
        line.usualLineAllowanceSen >= 20 && line.candidateLineAllowanceSen >= 20)).toBe(true)
    }
  })

  // Break caught: any serialized price, allowance, trip factor, or saving diverges from the locked arithmetic.
  it('serializes the exact golden price and trip arithmetic', () => {
    const result = recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 200 }))
    expect(result).toMatchObject({
      kind: 'switch',
      comparison: {
        priceComparison: {
          usualPremiseCode: '1', candidatePremiseCode: '2',
          usualBasketTotalSen: 1_000, candidateBasketTotalSen: 700, grossBasketSavingSen: 300,
          usualStraightLineMetres: 0, candidateStraightLineMetres: 1_000,
          oldestObservationDate: OBSERVED_DATE,
          lines: [{
            itemCode: '10', quantityHundredths: 100,
            usualUnitAllowanceSen: 20, candidateUnitAllowanceSen: 20,
            usualLineAllowanceSen: 20, candidateLineAllowanceSen: 20,
            usual: { priceSen: 1_000, lineTotalSen: 1_000, conservativeLineSen: 980 },
            candidate: { priceSen: 700, lineTotalSen: 700, conservativeLineSen: 720 }
          }]
        },
        usualEstimatedTrip: { routeFactorBasisPoints: 12_500, estimatedRoundTripRoadMetres: 0, fuelCostSen: 0, fixedCostSen: 0, totalTripCostSen: 0 },
        candidateEstimatedTrip: { routeFactorBasisPoints: 12_500, estimatedRoundTripRoadMetres: 2_500, fuelCostSen: 43, fixedCostSen: 0, totalTripCostSen: 43 },
        estimatedNetSavingSen: 257,
        usualConservativeBasketTotalSen: 980,
        candidateConservativeBasketTotalSen: 720,
        usualConservativeTrip: { routeFactorBasisPoints: 10_000, estimatedRoundTripRoadMetres: 0, fuelCostSen: 0, fixedCostSen: 0, totalTripCostSen: 0 },
        candidateConservativeTrip: { routeFactorBasisPoints: 15_000, estimatedRoundTripRoadMetres: 3_000, fuelCostSen: 51, fixedCostSen: 0, totalTripCostSen: 51 },
        usualConservativeNetCostSen: 980,
        candidateConservativeNetCostSen: 771,
        conservativeNetSavingSen: 209,
        worthwhileThresholdSen: 200
      }
    })
    expect(RecommendationResultSchema.parse(result)).toEqual(result)
  })

  // Break caught: an estimated saving can authorize a trip despite conservative uncertainty.
  it('returns no clear advantage when only the point estimate clears', () => {
    expect(recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 250 }))).toMatchObject({
      kind: 'no-clear-advantage'
    })
  })

  // Break caught: structurally price-only requests invoke or serialize trip arithmetic.
  it('returns price-only comparison for walking, partial scope, or unknown fixed cost', () => {
    const walking = recommend(goldenSnapshot(), inputWithoutTripFields({ mode: 'walk' }))
    expect(walking).toMatchObject({
      kind: 'comparison-only', reasons: ['walking-route-unverified']
    })
    const partial = recommend(goldenSnapshot(), inputWithoutTripFields({ basketScope: 'selected-items-only', mode: 'walk' }))
    expect(partial).toMatchObject({
      kind: 'comparison-only', reasons: ['selected-items-only', 'walking-route-unverified']
    })
    const unknown = recommend(goldenSnapshot(), goldenInput({
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'unknown' }
      }
    }))
    expect(unknown).toMatchObject({
      kind: 'comparison-only', reasons: ['fixed-trip-cost-unknown']
    })
    for (const result of [walking, partial, unknown]) {
      if (result.kind === 'comparison-only') {
        expect(result.comparison).not.toHaveProperty('mode')
        expect(result.comparison).not.toHaveProperty('usualEstimatedTrip')
        expect(RecommendationResultSchema.parse(result)).toEqual(result)
      }
    }
  })

  // Break caught: fixture or desk-demo evidence emits an actionable driving verdict.
  it('never emits a trip verdict from fixture or desk-demo publication', () => {
    for (const publicationMode of ['fixture', 'desk-demo'] as const) {
      expect(recommend(goldenSnapshotWithMode(publicationMode), inputWithoutTripFields({ mode: 'drive' }))).toMatchObject({
        kind: 'comparison-only', reasons: ['publication-not-consumer-ready']
      })
    }
  })

  // Break caught: one ranking criterion is reused for both price-only and trip-adjusted decisions.
  it('selects price-only by basket total and trip results by conservative saving', () => {
    expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), priceOnlyDrivingInput())).toMatchObject({
      kind: 'comparison-only', comparison: { candidatePremiseCode: '2' }
    })
    expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), drivingInput())).toMatchObject({
      kind: 'switch', comparison: { priceComparison: { candidatePremiseCode: '3' } }
    })
  })

  // Break caught: the documented efficiency default is applied before evidence classification or differs from explicit 120.
  it('defaults only fuel efficiency to 120 after trip eligibility', () => {
    expect(recommend(goldenSnapshot(), goldenInput({ fuelEfficiencyDeciKmPerL: undefined }))).toEqual(
      recommend(goldenSnapshot(), goldenInput({ fuelEfficiencyDeciKmPerL: 120 }))
    )
  })

  // Break caught: fuel price, threshold, or the complete fixed-cost map receives a hidden default.
  it.each([
    ['fuel price', { fuelPriceSenPerL: undefined }],
    ['threshold', { worthwhileThresholdSen: undefined }],
    ['fixed costs', { fixedTripCostByPremiseCode: undefined }]
  ] as const)('fails closed when required %s is absent', (_name, overrides) => {
    expect(recommend(goldenSnapshot(), goldenInput(overrides))).toEqual({
      kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: []
    })
  })

  // Break caught: fixed assumptions are checked only for the selected winner rather than every complete candidate.
  it('requires fixed costs for the usual premise and every complete candidate', () => {
    expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), goldenInput({
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'confirmed', amountSen: 0 }
      }
    }))).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
  })

  // Break caught: confirmed RM0 is treated as absent, or unknown costs are used as zero.
  it.each(['1', '2'] as const)('distinguishes confirmed zero from unknown cost at premise %s', premiseCode => {
    const fixedTripCostByPremiseCode = {
      '1': { status: 'confirmed' as const, amountSen: 0 },
      '2': { status: 'confirmed' as const, amountSen: 0 },
      [premiseCode]: { status: 'unknown' as const }
    }
    expect(recommend(goldenSnapshot(), goldenInput({ fixedTripCostByPremiseCode }))).toMatchObject({
      kind: 'comparison-only', reasons: ['fixed-trip-cost-unknown']
    })
  })

  // Break caught: only the eventual price winner's fixed cost is checked before issuing a verdict.
  it('downgrades globally for unknown cost on a non-selected complete candidate', () => {
    expect(recommend(snapshotWherePriceAndTripWinnersDiffer(), goldenInput({
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'confirmed', amountSen: 0 },
        '3': { status: 'unknown' }
      }
    }))).toMatchObject({
      kind: 'comparison-only',
      reasons: ['fixed-trip-cost-unknown'],
      comparison: { candidatePremiseCode: '2' }
    })
  })

  // Break caught: the candidate allowance is reused on the usual side when two-percent dominates the floor.
  it('computes every total and allowance from its own unequal-price side', () => {
    const result = recommend(snapshotWithPrices(1_500, 1_000), goldenInput({
      lines: [{ itemCode: '10', quantityHundredths: 1_000 }],
      worthwhileThresholdSen: 0
    }))
    expect(result).toMatchObject({
      comparison: { priceComparison: { lines: [{
        quantityHundredths: 1_000,
        usualUnitAllowanceSen: 30,
        candidateUnitAllowanceSen: 20,
        usualLineAllowanceSen: 300,
        candidateLineAllowanceSen: 200,
        usual: { priceSen: 1_500, lineTotalSen: 15_000, conservativeLineSen: 14_700 },
        candidate: { priceSen: 1_000, lineTotalSen: 10_000, conservativeLineSen: 10_200 }
      }] } }
    })
  })

  // Break caught: basket totals reuse one line or aggregate with unchecked Number addition.
  it('aggregates multiple lines and their conservative bounds exactly', () => {
    const result = recommend(multiLineSnapshot(), goldenInput({
      lines: [
        { itemCode: '10', quantityHundredths: 100 },
        { itemCode: '20', quantityHundredths: 200 }
      ],
      worthwhileThresholdSen: 0
    }))
    expect(result).toMatchObject({ comparison: {
      priceComparison: { usualBasketTotalSen: 5_000, candidateBasketTotalSen: 3_700, grossBasketSavingSen: 1_300 },
      usualConservativeBasketTotalSen: 4_900,
      candidateConservativeBasketTotalSen: 3_780
    } })
  })

  // Break caught: oldestObservationDate follows array order or takes the newest line date.
  it('serializes the oldest date across mixed-date basket lines', () => {
    const snapshot = { ...multiLineSnapshot(), compiledAt: '2026-08-02T03:00:00.000Z' as const }
    const selectedCell = (
      premiseCode: string,
      itemCode: string,
      observedDate: typeof PRIOR_DATE | typeof OBSERVED_DATE,
      priceSen: number
    ): PilotSnapshotV1['evidence'][number] => ({
      premiseCode,
      itemCode,
      officialUnit: 'each',
      observations: observedDate === PRIOR_DATE
        ? [{ status: 'eligible', observedDate: PRIOR_DATE, priceSen }, { status: 'missing', observedDate: OBSERVED_DATE }]
        : [{ status: 'missing', observedDate: PRIOR_DATE }, { status: 'eligible', observedDate: OBSERVED_DATE, priceSen }]
    })
    const mixedDates = {
      ...snapshot,
      evidence: [
        selectedCell('1', '10', OBSERVED_DATE, 1_000),
        selectedCell('1', '20', PRIOR_DATE, 2_000),
        selectedCell('2', '10', OBSERVED_DATE, 700),
        selectedCell('2', '20', PRIOR_DATE, 1_500)
      ]
    }
    const result = recommend(mixedDates, goldenInput({
      evaluatedAt: '2026-08-02T03:00:00.000Z',
      lines: [
        { itemCode: '10', quantityHundredths: 100 },
        { itemCode: '20', quantityHundredths: 100 }
      ]
    }))
    expect(result).toMatchObject({ comparison: { priceComparison: { oldestObservationDate: PRIOR_DATE } } })
  })

  // Break caught: multi-line basket accumulation silently crosses Number's safe-integer boundary.
  it('fails closed when individually safe line totals overflow the basket sum', () => {
    const snapshot = multiLineSnapshot()
    const priceSen = 4_503_599_627_370_496
    const overflow = {
      ...snapshot,
      evidence: snapshot.evidence.map(cell => eligibleCell(cell.premiseCode, cell.itemCode, OBSERVED_DATE, priceSen))
    }
    expect(recommend(overflow, goldenInput({
      lines: [
        { itemCode: '10', quantityHundredths: 100 },
        { itemCode: '20', quantityHundredths: 100 }
      ]
    }))).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
  })

  // Break caught: a maximal safe price leaks a partial or unsafe comparison when its conservative bound overflows.
  it('fails closed on maximal-safe arithmetic overflow', () => {
    expect(recommend(snapshotWithPrices(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), goldenInput())).toEqual({
      kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: []
    })
  })

  // Break caught: trip arithmetic uses one global fixed cost instead of premise-specific values in all variants.
  it('uses premise-specific fixed costs in estimated and conservative trips', () => {
    const result = recommend(goldenSnapshot(), goldenInput({
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 37 },
        '2': { status: 'confirmed', amountSen: 13 }
      },
      worthwhileThresholdSen: 0
    }))
    expect(result).toMatchObject({ comparison: {
      usualEstimatedTrip: { fixedCostSen: 37, totalTripCostSen: 37 },
      candidateEstimatedTrip: { fixedCostSen: 13, totalTripCostSen: 56 },
      usualConservativeTrip: { fixedCostSen: 37, totalTripCostSen: 37 },
      candidateConservativeTrip: { fixedCostSen: 13, totalTripCostSen: 64 }
    } })
  })

  // Break caught: equality is exclusive or a one-sen shortfall still authorizes a switch.
  it.each([
    [209, 'switch'],
    [210, 'no-clear-advantage']
  ] as const)('uses inclusive positive threshold %i as %s', (worthwhileThresholdSen, kind) => {
    expect(recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen }))).toMatchObject({ kind })
  })

  // Break caught: zero threshold turns zero or negative savings into actionable switches.
  it.each([
    [208, 1, 'switch'],
    [209, 0, 'no-clear-advantage'],
    [210, -1, 'no-clear-advantage']
  ] as const)('at zero threshold maps saving around zero with candidate fixed cost %i', (amountSen, saving, kind) => {
    const result = recommend(goldenSnapshot(), goldenInput({
      worthwhileThresholdSen: 0,
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'confirmed', amountSen }
      }
    }))
    expect(result).toMatchObject({ kind, comparison: { conservativeNetSavingSen: saving } })
  })

  // Break caught: whole-unit enforcement is bypassed at the recommendation boundary.
  it('rejects fractional quantities for whole-unit items', () => {
    expect(recommend(goldenSnapshot(), goldenInput({
      lines: [{ itemCode: '10', quantityHundredths: 150 }]
    }))).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
  })

  // Break caught: duplicate basket lines are priced independently instead of merged once.
  it('merges duplicate basket lines before comparison', () => {
    const result = recommend(goldenSnapshot(), goldenInput({
      lines: [
        { itemCode: '10', quantityHundredths: 100 },
        { itemCode: '10', quantityHundredths: 100 }
      ]
    }))
    expect(result).toMatchObject({ comparison: { priceComparison: {
      lines: [{ itemCode: '10', quantityHundredths: 200 }],
      usualBasketTotalSen: 2_000,
      candidateBasketTotalSen: 1_400
    } } })
  })

  // Break caught: the inclusive five-kilometre candidate is discarded by a strict radius comparison.
  it('includes a driving candidate exactly 5,000 metres away', () => {
    const longitude = 5_000 / 6_371_008.8 * 180 / Math.PI
    const snapshot = goldenSnapshot()
    const atBoundary = {
      ...snapshot,
      premises: snapshot.premises.map(premise => premise.code === '2' ? { ...premise, longitude } : premise)
    }
    expect(recommend(atBoundary, inputWithoutTripFields({ basketScope: 'selected-items-only', mode: 'drive' }))).toMatchObject({
      kind: 'comparison-only', comparison: { candidatePremiseCode: '2', candidateStraightLineMetres: 5_000 }
    })
  })

  // Break caught: equal observed prices select source order instead of the shortest alternative.
  it('uses shortest distance after an observed-price tie', () => {
    expect(recommend(snapshotWithEqualCandidates(true), priceOnlyDrivingInput())).toMatchObject({
      kind: 'comparison-only', comparison: { candidatePremiseCode: '3' }
    })
  })

  // Break caught: observed-price ranking loses a one-sen distinction near the safe-integer ceiling.
  it('ranks one-sen basket differences exactly near the safe boundary', () => {
    const snapshot = snapshotWithEqualCandidates(false)
    const higher = 8_800_000_000_000_000
    const lower = 8_799_999_999_999_999
    const nearBoundary = {
      ...snapshot,
      evidence: [
        eligibleCell('1', '10', OBSERVED_DATE, higher),
        eligibleCell('2', '10', OBSERVED_DATE, higher),
        eligibleCell('3', '10', OBSERVED_DATE, lower)
      ]
    }
    expect(recommend(nearBoundary, priceOnlyDrivingInput())).toMatchObject({
      kind: 'comparison-only',
      comparison: { candidatePremiseCode: '3', candidateBasketTotalSen: lower }
    })
  })

  // Break caught: equal candidates use lexical/source order rather than numeric canonical premise code.
  it('uses numeric canonical premise code after all reachable ties', () => {
    const snapshot = snapshotWithEqualCandidates(false)
    const candidateTwo = snapshot.premises.find(premise => premise.code === '2')!
    const candidateThree = snapshot.premises.find(premise => premise.code === '3')!
    const tied = {
      ...snapshot,
      premises: [snapshot.premises[0]!, { ...candidateThree, code: '10' }, candidateTwo],
      evidence: [
        snapshot.evidence[0]!,
        eligibleCell('10', '10', OBSERVED_DATE, 700),
        snapshot.evidence[1]!
      ]
    }
    expect(recommend(tied, priceOnlyDrivingInput())).toMatchObject({
      kind: 'comparison-only', comparison: { candidatePremiseCode: '2' }
    })
  })

  // Break caught: driving ties stop before the shared shortest-distance fallback.
  it('uses shortest distance after a conservative-saving tie', () => {
    const result = recommend(snapshotWithEqualCandidates(true), goldenInput({
      worthwhileThresholdSen: 0,
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'confirmed', amountSen: 0 },
        '3': { status: 'confirmed', amountSen: 25 }
      }
    }))
    expect(result).toMatchObject({
      kind: 'switch',
      comparison: { priceComparison: { candidatePremiseCode: '3' }, conservativeNetSavingSen: 209 }
    })
  })

  // Break caught: driving ties stop before numeric canonical-code ordering.
  it('uses numeric canonical code after a complete conservative tie', () => {
    const snapshot = snapshotWithEqualCandidates(false)
    const candidateTwo = snapshot.premises.find(premise => premise.code === '2')!
    const candidateThree = snapshot.premises.find(premise => premise.code === '3')!
    const tied = {
      ...snapshot,
      premises: [snapshot.premises[0]!, { ...candidateThree, code: '10' }, candidateTwo],
      evidence: [
        snapshot.evidence[0]!,
        eligibleCell('10', '10', OBSERVED_DATE, 700),
        snapshot.evidence[1]!
      ]
    }
    expect(recommend(tied, goldenInput({
      worthwhileThresholdSen: 0,
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'confirmed', amountSen: 0 },
        '10': { status: 'confirmed', amountSen: 0 }
      }
    }))).toMatchObject({
      kind: 'switch', comparison: { priceComparison: { candidatePremiseCode: '2' } }
    })
  })

  // Break caught: synthetic golden fixtures drift outside the exact Version 1 snapshot contract.
  it('keeps consumer-only golden snapshots schema-valid', () => {
    expect(PilotSnapshotV1Schema.parse(goldenSnapshot())).toEqual(goldenSnapshot())
    expect(PilotSnapshotV1Schema.parse(snapshotWherePriceAndTripWinnersDiffer())).toEqual(snapshotWherePriceAndTripWinnersDiffer())
  })

  // Break caught: one of the four public result variants bypasses final schema validation.
  it('returns schema-valid switch, refusal, comparison-only, and insufficient results', () => {
    const results = [
      recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 200 })),
      recommend(goldenSnapshot(), goldenInput({ worthwhileThresholdSen: 250 })),
      recommend(goldenSnapshot(), inputWithoutTripFields({ mode: 'walk' })),
      recommend(goldenSnapshot(), { ...goldenInput(), location: undefined })
    ]
    for (const result of results) expect(RecommendationResultSchema.parse(result)).toEqual(result)
    expect(results.map(result => result.kind)).toEqual(['switch', 'no-clear-advantage', 'comparison-only', 'insufficient-evidence'])
  })

  // Break caught: evidence and trip-assumption decoding observe different values from one raw accessor.
  it('rejects a changing top-level accessor without invoking it', () => {
    const request = { ...goldenInput() } as Record<string, unknown>
    let reads = 0
    Object.defineProperty(request, 'basketScope', {
      enumerable: true,
      get: () => ++reads === 1 ? 'complete-trip' : 'selected-items-only'
    })
    let result: ReturnType<typeof recommend> | undefined

    expect(() => { result = recommend(goldenSnapshot(), request) }).not.toThrow()
    expect(result).toEqual(INPUT_INVALID_RESULT)
    expect(reads).toBe(0)
  })

  // Break caught: a valid first decode is followed by a throwing second decode of the same raw field.
  it('rejects a getter that would throw on a second read without invoking it', () => {
    const request = { ...goldenInput() } as Record<string, unknown>
    let reads = 0
    Object.defineProperty(request, 'basketScope', {
      enumerable: true,
      get: () => {
        reads++
        if (reads === 1) return 'complete-trip'
        throw new Error('raw request was decoded twice')
      }
    })
    let result: ReturnType<typeof recommend> | undefined

    expect(() => { result = recommend(goldenSnapshot(), request) }).not.toThrow()
    expect(result).toEqual(INPUT_INVALID_RESULT)
    expect(reads).toBe(0)
  })

  // Break caught: a throwing accessor escapes before recommendation arithmetic enters its fail-closed block.
  it('rejects throwing accessors at every nested request boundary without invoking them', () => {
    const cases: Array<{ name: string; request: unknown; reads: () => number }> = []
    const add = (name: string, build: (throwing: () => never) => unknown) => {
      let reads = 0
      cases.push({
        name,
        request: build(() => { reads++; throw new Error(`${name} getter must not run`) }),
        reads: () => reads
      })
    }
    add('top-level', throwing => {
      const request = { ...goldenInput() }
      Object.defineProperty(request, 'mode', { enumerable: true, get: throwing })
      return request
    })
    add('location', throwing => {
      const request = goldenInput()
      Object.defineProperty(request.location, 'latitude', { enumerable: true, get: throwing })
      return request
    })
    add('lines array', throwing => {
      const request = goldenInput()
      Object.defineProperty(request.lines, '0', { enumerable: true, get: throwing })
      return request
    })
    add('line record', throwing => {
      const request = goldenInput()
      Object.defineProperty(request.lines[0]!, 'quantityHundredths', { enumerable: true, get: throwing })
      return request
    })
    add('fixed-cost map', throwing => {
      const request = goldenInput()
      Object.defineProperty(request.fixedTripCostByPremiseCode!, '2', { enumerable: true, get: throwing })
      return request
    })
    add('fixed-cost entry', throwing => {
      const request = goldenInput()
      Object.defineProperty(request.fixedTripCostByPremiseCode!['2']!, 'amountSen', { enumerable: true, get: throwing })
      return request
    })

    for (const entry of cases) {
      let result: ReturnType<typeof recommend> | undefined
      expect(() => { result = recommend(goldenSnapshot(), entry.request) }, entry.name).not.toThrow()
      expect(result, entry.name).toEqual(INPUT_INVALID_RESULT)
      expect(entry.reads(), entry.name).toBe(0)
    }
  })

  // Break caught: a stable descriptor Proxy is read through raw `get` operations or reflected more than once.
  it('uses one descriptor snapshot and no raw gets for a stable request Proxy', () => {
    const target = goldenInput()
    let ownKeysCalls = 0
    let getCalls = 0
    const descriptorCalls = new Map<PropertyKey, number>()
    const request = new Proxy(target, {
      ownKeys: object => { ownKeysCalls++; return Reflect.ownKeys(object) },
      getOwnPropertyDescriptor: (object, key) => {
        descriptorCalls.set(key, (descriptorCalls.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
      get: () => { getCalls++; throw new Error('raw get must not run') }
    })
    let result: ReturnType<typeof recommend> | undefined

    expect(() => { result = recommend(goldenSnapshot(), request) }).not.toThrow()
    expect(result).toMatchObject({ kind: 'switch' })
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
    expect([...descriptorCalls.values()]).toEqual(Array.from({ length: Reflect.ownKeys(target).length }, () => 1))
  })

  // Break caught: recommendation observes a line rewrite caused by the later mode descriptor.
  it('recommends from the line captured before a later mode descriptor trap', () => {
    const probe = lineDescriptorMutationProbe(goldenInput())
    expect(recommend(goldenSnapshot(), probe.request)).toMatchObject({ kind: 'switch' })
    expect(probe.events.indexOf('line:itemCode')).toBeLessThan(probe.events.indexOf('top:mode'))
    for (const event of ['line:itemCode', 'line:quantityHundredths', 'top:mode']) {
      expect(probe.descriptorCalls.get(event), event).toBe(1)
    }
  })

  // Break caught: recommendation changes to comparison-only after the threshold descriptor rewrites a fixed entry.
  it('recommends from fixed costs captured before a later threshold descriptor trap', () => {
    const probe = fixedDescriptorMutationProbe(goldenInput())
    expect(recommend(goldenSnapshot(), probe.request)).toMatchObject({ kind: 'switch' })
    expect(probe.events.indexOf('fixed-entry:status')).toBeLessThan(probe.events.indexOf('top:worthwhileThresholdSen'))
    for (const event of ['top:fixedTripCostByPremiseCode', 'fixed-map:2', 'fixed-entry:status', 'fixed-entry:amountSen', 'top:worthwhileThresholdSen']) {
      expect(probe.descriptorCalls.get(event), event).toBe(1)
    }
  })

  // Break caught: reflection failures or revoked Proxies escape instead of returning the exact invalid result.
  it.each([
    ['ownKeys trap', () => new Proxy(goldenInput(), { ownKeys: () => { throw new Error('ownKeys') } })],
    ['descriptor trap', () => new Proxy(goldenInput(), { getOwnPropertyDescriptor: () => { throw new Error('descriptor') } })],
    ['prototype trap', () => new Proxy(goldenInput(), { getPrototypeOf: () => { throw new Error('prototype') } })],
    ['revoked Proxy', () => { const pair = Proxy.revocable(goldenInput(), {}); pair.revoke(); return pair.proxy }]
  ] as const)('fails closed for a request %s', (_name, build) => {
    let result: ReturnType<typeof recommend> | undefined
    expect(() => { result = recommend(goldenSnapshot(), build()) }).not.toThrow()
    expect(result).toEqual(INPUT_INVALID_RESULT)
  })

  // Break caught: eager deep capture lets a later hostile field override an earlier semantic refusal.
  it('preserves refusal precedence without touching later hostile fields', () => {
    const scenarios: Array<{ request: unknown; result: unknown; reads: () => number }> = []
    const add = (request: ReturnType<typeof goldenInput>, mutate: (throwing: () => never) => void, result: unknown) => {
      let reads = 0
      mutate(() => { reads++; throw new Error('later getter must not run') })
      scenarios.push({ request, result, reads: () => reads })
    }

    const clock = goldenInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' })
    add(clock, throwing => Object.defineProperty(clock.location, 'latitude', { enumerable: true, get: throwing }),
      { kind: 'insufficient-evidence', primaryReason: 'clock-invalid', details: [] })

    const missingLocation = goldenInput() as Record<string, unknown>
    delete missingLocation.location
    let missingReads = 0
    Object.defineProperty((missingLocation.lines as unknown[]), '0', {
      enumerable: true,
      get: () => { missingReads++; throw new Error('line getter must not run') }
    })
    scenarios.push({
      request: missingLocation,
      result: { kind: 'insufficient-evidence', primaryReason: 'location-missing', details: [] },
      reads: () => missingReads
    })

    const imprecise = goldenInput({ location: { latitude: 0, longitude: 0, accuracyMetres: 101 } })
    add(imprecise, throwing => Object.defineProperty(imprecise.lines[0]!, 'itemCode', { enumerable: true, get: throwing }),
      { kind: 'insufficient-evidence', primaryReason: 'location-imprecise', details: [] })

    const emptyBasket = goldenInput({ lines: [] })
    add(emptyBasket, throwing => Object.defineProperty(emptyBasket.fixedTripCostByPremiseCode!['2']!, 'amountSen', { enumerable: true, get: throwing }),
      { kind: 'insufficient-evidence', primaryReason: 'basket-empty', details: [] })

    for (const scenario of scenarios) {
      expect(recommend(goldenSnapshot(), scenario.request)).toEqual(scenario.result)
      expect(scenario.reads()).toBe(0)
    }
  })

  // Break caught: eager top-level descriptor validation overwrites earlier recommendation refusal reasons.
  it('preserves recommendation refusal precedence over later top-level accessors', () => {
    const cases: Array<{ name: string; request: Record<string, unknown>; keys: string[]; primaryReason: string }> = []
    cases.push({
      name: 'invalid clock',
      request: goldenInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }) as unknown as Record<string, unknown>,
      keys: ['mode'], primaryReason: 'clock-invalid'
    })
    const missingLocation = goldenInput() as unknown as Record<string, unknown>
    delete missingLocation.location
    cases.push({ name: 'missing location', request: missingLocation, keys: ['lines', 'mode'], primaryReason: 'location-missing' })
    cases.push({
      name: 'imprecise location',
      request: goldenInput({ location: { latitude: 0, longitude: 0, accuracyMetres: 101 } }) as unknown as Record<string, unknown>,
      keys: ['mode'], primaryReason: 'location-imprecise'
    })
    cases.push({
      name: 'empty basket', request: goldenInput({ lines: [] }) as unknown as Record<string, unknown>,
      keys: ['fixedTripCostByPremiseCode'], primaryReason: 'basket-empty'
    })

    for (const entry of cases) {
      let reads = 0
      for (const key of entry.keys) Object.defineProperty(entry.request, key, {
        enumerable: true,
        get: () => { reads++; throw new Error(`${entry.name} later getter must not run`) }
      })
      expect(recommend(goldenSnapshot(), entry.request), entry.name).toEqual({
        kind: 'insufficient-evidence', primaryReason: entry.primaryReason, details: []
      })
      expect(reads, entry.name).toBe(0)
    }
  })

  // Break caught: malformed canonical values throw or an own __proto__ fixed-cost entry is silently ignored.
  it('returns the exact invalid result for malformed code boundaries', () => {
    const veryLongCode = '9'.repeat(100_000)
    const malformed: Array<{ name: string; build: () => unknown }> = [
      { name: 'usual premise', build: () => ({ ...goldenInput(), usualPremiseCode: 'abc' }) },
      { name: 'basket line', build: () => ({ ...goldenInput(), lines: [{ itemCode: '1.2', quantityHundredths: 100 }] }) },
      { name: 'very-long usual premise', build: () => ({ ...goldenInput(), usualPremiseCode: veryLongCode }) },
      { name: 'very-long basket line', build: () => ({ ...goldenInput(), lines: [{ itemCode: veryLongCode, quantityHundredths: 100 }] }) },
      ...(['constructor', '__proto__'] as const).map(key => ({
        name: `${key} fixed-cost key`,
        build: () => {
          const request = goldenInput()
          Object.defineProperty(request.fixedTripCostByPremiseCode!, key, {
            enumerable: true, value: { status: 'confirmed', amountSen: 0 }
          })
          return request
        }
      })),
      { name: 'out-of-range fixed-cost key', build: () => {
        const request = goldenInput()
        request.fixedTripCostByPremiseCode!['9007199254740992'] = { status: 'confirmed', amountSen: 0 }
        return request
      } },
      { name: 'very-long fixed-cost key', build: () => {
        const request = goldenInput()
        request.fixedTripCostByPremiseCode![veryLongCode] = { status: 'confirmed', amountSen: 0 }
        return request
      } }
    ]

    for (const entry of malformed) {
      let result: ReturnType<typeof recommend> | undefined
      expect(() => { result = recommend(goldenSnapshot(), entry.build()) }, entry.name).not.toThrow()
      expect(result, entry.name).toEqual(INPUT_INVALID_RESULT)
    }
  })

  // Break caught: the inclusive maximum canonical fixed-cost key is rejected with the one-past-maximum case.
  it('keeps recommendation behavior with a maximum-safe canonical fixed-cost key', () => {
    const request = goldenInput()
    request.fixedTripCostByPremiseCode!['9007199254740991'] = { status: 'confirmed', amountSen: 0 }
    expect(recommend(goldenSnapshot(), request)).toMatchObject({ kind: 'switch' })
  })

  // Break caught: private arithmetic/helpers leak from the supported root API or a supported contract export disappears.
  it('exposes exactly contracts and the supported domain entrypoints', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      ...Object.keys(contractsApi),
      'malaysiaDateAt',
      'preflightBasketDiscovery',
      'preflightEvidence',
      'preflightUsualAndGeometry',
      'recommend'
    ].sort())
    expect(publicApi).not.toHaveProperty('drivingTripCost')
    expect(publicApi).not.toHaveProperty('normalizeRecommendationRequest')
  })
})

const unknownSnapshotCannotReachDomain = (snapshot: unknown): void => {
  // @ts-expect-error The loader is the sole unknown snapshot boundary.
  recommend(snapshot, goldenInput())
}
void unknownSnapshotCannotReachDomain
