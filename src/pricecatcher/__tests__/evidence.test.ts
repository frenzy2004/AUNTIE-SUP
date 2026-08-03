import { describe, expect, it } from 'vitest'
import { evaluateEvidence, mergeBasketLines, normalizeRecommendationRequest, preflightBasketDiscovery, preflightEvidence, preflightUsualAndGeometry } from '../evidence'
import {
  inputWithOldClock, makeSnapshot, snapshotWithBadBaselineAndNoCandidate, snapshotWithCandidateObservations,
  snapshotWithMixedCandidateFailures, snapshotWithOldData, snapshotWithOnlyFarCandidates, snapshotWithPairDates,
  snapshotWithThreePremisesAndOneBadCandidate, validInput, eligibleCell
} from './snapshotFixture'

describe('evidence evaluation', () => {
  // Break caught: clocks before the five-minute compile grace are permitted.
  it('rejects an evaluation clock before compilation', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }))).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'clock-invalid' })
  })

  // Break caught: an old snapshot is treated as current or valid same-day data is rejected.
  it('accepts today or yesterday but rejects older observations', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput()).kind).toBe('ready')
    expect(evaluateEvidence(snapshotWithOldData(), validInput())).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'snapshot-stale' })
  })

  // Break caught: a later anomalous observation is skipped in favour of an older price.
  it('never falls back from a newer anomalous row', () => {
    expect(evaluateEvidence(snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }]), validInput())).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-anomalous' })
  })

  // Break caught: an explicitly materialized missing row hides the available older observation.
  it('treats materialized missing as no raw row rather than masking yesterday', () => {
    expect(evaluateEvidence(snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'missing', observedDate: '2026-08-02' }]), validInput()).kind).toBe('ready')
  })

  // Break caught: evaluator finds an older common date instead of aligning the independently newest rows.
  it('requires independently newest baseline and candidate dates to match', () => {
    expect(evaluateEvidence(snapshotWithPairDates('2026-08-01', '2026-08-02'), validInput())).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-date-mismatch' })
  })

  // Break caught: one failed premise removes an independent complete candidate or increments line counts.
  it('excludes one bad candidate while retaining a complete independent candidate', () => {
    const result = evaluateEvidence(snapshotWithThreePremisesAndOneBadCandidate(), validInput())
    expect(result).toMatchObject({ kind: 'ready', candidates: [{ premiseCode: '3' }] })
    if (result.kind === 'ready') expect(result.exclusions.excludedByReason.anomalous).toBe(1)
  })

  it.each([
    ['clock-invalid beats stale', snapshotWithOldData(), inputWithOldClock(), 'clock-invalid'],
    ['baseline anomaly beats candidate absence', snapshotWithBadBaselineAndNoCandidate(), validInput(), 'baseline-anomalous'],
    ['no radius candidate beats candidate evidence', snapshotWithOnlyFarCandidates(), validInput(), 'no-candidate-in-radius'],
    ['candidate anomaly beats candidate missing', snapshotWithMixedCandidateFailures(), validInput(), 'candidate-anomalous']
  ] as const)('applies precedence when %s', (_name, snapshot, input, reason) => {
    expect(evaluateEvidence(snapshot, input)).toMatchObject({ kind: 'insufficient-evidence', primaryReason: reason })
  })

  // Break caught: request normalization leaks invalid shell fields into calculation.
  it.each([
    [{ extra: true }, 'input-invalid'],
    [{ location: undefined }, 'location-missing'],
    [{ location: { latitude: 3, longitude: 101, accuracyMetres: 101 } }, 'location-imprecise'],
    [{ lines: [] }, 'basket-empty'],
    [{ lines: [{ itemCode: '10', quantityHundredths: 99 }] }, 'input-invalid']
  ])('normalizes public request failures as %s', (patch, reason) => {
    expect(evaluateEvidence(makeSnapshot(), { ...validInput(), ...patch } as never)).toMatchObject({ kind: 'insufficient-evidence', primaryReason: reason })
  })

  it('coalesces duplicate quantities and retains only valid whole unit baskets', () => {
    expect(mergeBasketLines(makeSnapshot(), [{ itemCode: '10', quantityHundredths: 100 }, { itemCode: '10', quantityHundredths: 200 }])).toEqual([{ itemCode: '10', quantityHundredths: 300 }])
  })

  it('keeps early failures free of fabricated exclusion counts and candidate failures counted', () => {
    expect(evaluateEvidence(makeSnapshot(), inputWithOldClock())).not.toHaveProperty('exclusions')
    expect(evaluateEvidence(snapshotWithOnlyFarCandidates(), validInput())).toHaveProperty('exclusions')
  })

  it('uses five kilometre discovery before mode selection and exact mode radii afterwards', () => {
    const snapshot = makeSnapshot({ premises: makeSnapshot().premises.map(premise => premise.code === '2' ? { ...premise, longitude: 101.027 } : premise) })
    const { mode: _mode, ...discoveryInput } = validInput()
    const discovery = preflightBasketDiscovery(snapshot, discoveryInput)
    expect(discovery.completeCandidatePremiseCodes).toEqual(['2'])
    expect(preflightEvidence(snapshot, validInput({ mode: 'walk' })).completeCandidatePremiseCodes).toEqual([])
    expect(preflightEvidence(snapshot, validInput({ mode: 'drive' })).completeCandidatePremiseCodes).toEqual(['2'])
  })

  it('does usual and coordinate preflight without pretending an empty basket is complete', () => {
    const { lines: _lines, mode: _mode, ...usualInput } = validInput()
    const result = preflightUsualAndGeometry(makeSnapshot(), usualInput)
    expect(result).toMatchObject({ usualHasRecentPilotData: true, coordinateViablePremiseCount: 1, label: 'within 5 km' })
  })

  it('normalizes only exact request fields before strict calculation parsing', () => {
    expect(normalizeRecommendationRequest(validInput())).toEqual(validInput())
  })

  // Break caught: the five minute grace is implemented as a strict or rounded boundary.
  it('uses an inclusive exact five-minute compilation grace', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput({ evaluatedAt: '2026-08-03T02:55:00.000Z' })).kind).toBe('ready')
    expect(evaluateEvidence(makeSnapshot(), validInput({ evaluatedAt: '2026-08-03T02:54:59.999Z' }))).toMatchObject({ primaryReason: 'clock-invalid' })
  })

  // Break caught: freshness uses UTC dates rather than the Malaysia civil date.
  it('uses Malaysia civil dates at the 16:00Z boundary', () => {
    const snapshot = makeSnapshot({ compiledAt: '2026-08-02T15:55:00.000Z' })
    const result = evaluateEvidence(snapshot, validInput({ evaluatedAt: '2026-08-02T16:00:00.000Z' }))
    expect(result).toMatchObject({ kind: 'ready', evaluatedDate: '2026-08-03' })
  })

  // Break caught: sorting observations ascending picks a bad old row instead of the newest raw evidence.
  it('selects the newest eligible row and serializes its price and date', () => {
    const snapshot = makeSnapshot({ evidence: [eligibleCell('1', '10', '2026-08-02', 600), {
      premiseCode: '2', itemCode: '10', officialUnit: 'each', observations: [
        { status: 'anomalous', observedDate: '2026-08-01', reason: 'outside-ratio-bound' }, { status: 'eligible', observedDate: '2026-08-02', priceSen: 499 }
      ]
    }] })
    const result = evaluateEvidence(snapshot, validInput())
    expect(result).toMatchObject({ kind: 'ready', usual: { lines: [{ observedDate: '2026-08-02', priceSen: 600 }] }, candidates: [{ lines: [{ observedDate: '2026-08-02', priceSen: 499 }] }] })
  })

  it('does not search an older common date after independently selecting a newer candidate row', () => {
    const snapshot = makeSnapshot({ evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [
      { status: 'eligible', observedDate: '2026-08-01', priceSen: 600 }, { status: 'missing', observedDate: '2026-08-02' }
    ] }, { premiseCode: '2', itemCode: '10', officialUnit: 'each', observations: [
      { status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'eligible', observedDate: '2026-08-02', priceSen: 501 }
    ] }] })
    expect(evaluateEvidence(snapshot, validInput())).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-date-mismatch' })
  })

  it('reports no recent usual data without claiming an empty basket is complete', () => {
    const snapshot = makeSnapshot({ evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [
      { status: 'anomalous', observedDate: '2026-08-01', reason: 'outside-ratio-bound' }, { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }
    ] }, makeSnapshot().evidence[1]!] })
    const { lines: _lines, mode: _mode, ...usualInput } = validInput()
    expect(preflightUsualAndGeometry(snapshot, usualInput)).toMatchObject({ usualPremiseReady: true, usualHasRecentPilotData: false, coordinateViablePremiseCount: 1 })
  })

  it('includes a field-verified coordinate candidate exactly at the inclusive five kilometre geometry boundary', () => {
    const longitudeDelta = 5000 / 6_371_008.8 * 180 / Math.PI
    const snapshot = makeSnapshot({ premises: makeSnapshot().premises.map(premise => ({ ...premise, latitude: 0, longitude: premise.code === '1' ? 101 : 101 + longitudeDelta })) })
    const { lines: _lines, mode: _mode, ...usualInput } = validInput({ location: { latitude: 0, longitude: 101, accuracyMetres: 10 } })
    expect(preflightUsualAndGeometry(snapshot, usualInput).coordinateViablePremiseCount).toBe(1)
  })

  // Break caught: candidate partitions count failed lines rather than assigning one bucket per premise.
  it('counts a multi-line failed premise once while retaining every sorted detail', () => {
    const base = makeSnapshot()
    const third = { ...base.premises[1]!, code: '3', officialName: 'Third', displayName: 'Third', address: '3 Test Street', longitude: 101.02 }
    const item = (code: string) => ({ code, officialName: `Item ${code}`, officialUnit: 'each', qualifiers: [], quantityMode: 'whole-units' as const })
    const bad = (itemCode: string, observations: any[]) => ({ premiseCode: '2', itemCode, officialUnit: 'each', observations })
    const snapshot = { ...base, premises: [...base.premises, third], items: ['10', '11', '12'].map(item), evidence: [
      ...['10', '11', '12'].map(code => eligibleCell('1', code, '2026-08-02', 600)),
      bad('10', [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }]),
      bad('11', [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'insufficient-reference', observedDate: '2026-08-02' }]),
      bad('12', [{ status: 'missing', observedDate: '2026-08-01' }, { status: 'missing', observedDate: '2026-08-02' }]),
      ...['10', '11', '12'].map(code => eligibleCell('3', code, '2026-08-02', 500))
    ] }
    const result = evaluateEvidence(snapshot, validInput({ lines: ['10', '11', '12'].map(itemCode => ({ itemCode, quantityHundredths: 100 })), fixedTripCostByPremiseCode: { '1': { status: 'confirmed', amountSen: 0 }, '2': { status: 'confirmed', amountSen: 0 }, '3': { status: 'confirmed', amountSen: 0 } } }))
    expect(result).toMatchObject({ kind: 'ready', exclusions: { excludedByReason: { anomalous: 1 }, completeCandidateCount: 1 } })
  })

  it('keeps comparison-only reasons ordered and short-circuits absent trip assumptions', () => {
    const result = evaluateEvidence(makeSnapshot({ publicationMode: 'desk-demo' }), validInput({ basketScope: 'selected-items-only', mode: 'walk', fuelEfficiencyDeciKmPerL: undefined, fuelPriceSenPerL: undefined, fixedTripCostByPremiseCode: undefined, worthwhileThresholdSen: undefined }))
    expect(result).toMatchObject({ kind: 'ready', comparisonOnlyReasons: ['selected-items-only', 'walking-route-unverified', 'publication-not-consumer-ready'] })
  })

  it('rejects missing trip assumptions only for an otherwise trip-eligible drive', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput({ fuelEfficiencyDeciKmPerL: undefined }))).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'input-invalid' })
  })

  it.each([
    [[{ itemCode: '10', quantityHundredths: 9900 }], true],
    [[{ itemCode: '10', quantityHundredths: 9901 }], false],
    [[{ itemCode: '10', quantityHundredths: 5000 }, { itemCode: '10', quantityHundredths: 5000 }], false]
  ] as const)('enforces post-merge basket cap for %o', (lines, accepted) => {
    const operation = () => mergeBasketLines(makeSnapshot(), lines as never)
    if (accepted) expect(operation()).toEqual([{ itemCode: '10', quantityHundredths: 9900 }])
    else expect(operation).toThrow(RangeError)
  })
})
