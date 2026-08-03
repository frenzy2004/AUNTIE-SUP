import { describe, expect, it } from 'vitest'
import { evaluateEvidence, mergeBasketLines, normalizeRecommendationRequest, preflightBasketDiscovery, preflightEvidence, preflightUsualAndGeometry } from '../evidence'
import { RecommendationResultSchema } from '../contracts/recommendation'
import {
  inputWithOldClock, makeSnapshot, snapshotWithBadBaselineAndNoCandidate, snapshotWithCandidateObservations,
  snapshotWithMixedCandidateFailures, snapshotWithOldData, snapshotWithOnlyFarCandidates, snapshotWithPairDates,
  snapshotWithThreePremisesAndOneBadCandidate, validInput, eligibleCell
} from './snapshotFixture'

const usualPreflightInput = (overrides: Record<string, unknown> = {}) => {
  const { evaluatedAt, location, usualPremiseCode } = validInput()
  return { evaluatedAt, location, usualPremiseCode, ...overrides }
}

const discoveryPreflightInput = (overrides: Record<string, unknown> = {}) => {
  const { evaluatedAt, location, usualPremiseCode, lines } = validInput()
  return { evaluatedAt, location, usualPremiseCode, lines, ...overrides }
}

const modePreflightInput = (overrides: Record<string, unknown> = {}) => {
  const { evaluatedAt, location, usualPremiseCode, lines, mode } = validInput()
  return { evaluatedAt, location, usualPremiseCode, lines, mode, ...overrides }
}

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
    const discoveryInput = discoveryPreflightInput()
    const discovery = preflightBasketDiscovery(snapshot, discoveryInput)
    expect(discovery.completeCandidatePremiseCodes).toEqual(['2'])
    expect(preflightEvidence(snapshot, modePreflightInput({ mode: 'walk' }) as never).completeCandidatePremiseCodes).toEqual([])
    expect(preflightEvidence(snapshot, modePreflightInput({ mode: 'drive' }) as never).completeCandidatePremiseCodes).toEqual(['2'])
  })

  it('does usual and coordinate preflight without pretending an empty basket is complete', () => {
    const usualInput = usualPreflightInput()
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
    const usualInput = usualPreflightInput()
    expect(preflightUsualAndGeometry(snapshot, usualInput)).toMatchObject({ usualPremiseReady: true, usualHasRecentPilotData: false, coordinateViablePremiseCount: 1 })
  })

  it('includes a field-verified coordinate candidate exactly at the inclusive five kilometre geometry boundary', () => {
    const longitudeDelta = 5000 / 6_371_008.8 * 180 / Math.PI
    const snapshot = makeSnapshot({ premises: makeSnapshot().premises.map(premise => ({ ...premise, latitude: 0, longitude: premise.code === '1' ? 101 : 101 + longitudeDelta })) })
    const usualInput = usualPreflightInput({ location: { latitude: 0, longitude: 101, accuracyMetres: 10 } })
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

  // Break caught: transient direct preflight input either throws or treats an invalid basket as complete.
  it.each([
    ['stale snapshot', snapshotWithOldData(), validInput()],
    ['empty basket', makeSnapshot(), { ...validInput(), lines: [] }],
    ['unknown usual premise', makeSnapshot(), { ...validInput(), usualPremiseCode: '99' }],
    ['unknown item', makeSnapshot(), { ...validInput(), lines: [{ itemCode: '99', quantityHundredths: 100 }] }]
  ])('fails closed without throwing for discovery preflight with %s', (_name, snapshot, input) => {
    const discoveryInput = { evaluatedAt: input.evaluatedAt, location: input.location, usualPremiseCode: input.usualPremiseCode, lines: input.lines }
    expect(() => preflightBasketDiscovery(snapshot, discoveryInput as never)).not.toThrow()
    expect(preflightBasketDiscovery(snapshot, discoveryInput as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })
  })

  it('fails closed without throwing for mode-aware preflight with an invalid explicit mode', () => {
    const input = modePreflightInput({ mode: 'fly' })
    expect(() => preflightEvidence(makeSnapshot(), input as never)).not.toThrow()
    expect(preflightEvidence(makeSnapshot(), input as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })
  })

  it('labels basket discovery precisely without attributing that label to a mode-aware preflight', () => {
    const discoveryInput = discoveryPreflightInput()
    expect(preflightBasketDiscovery(makeSnapshot(), discoveryInput)).toMatchObject({
      label: 'complete for these items within 5 km discovery—choose a travel mode to apply its radius'
    })
    expect(preflightEvidence(makeSnapshot(), modePreflightInput() as never)).not.toHaveProperty('label')
  })

  it('serializes candidate exclusion buckets identically after premise/evidence permutation', () => {
    const snapshot = snapshotWithThreePremisesAndOneBadCandidate()
    const original = evaluateEvidence(snapshot, validInput())
    const reversed = evaluateEvidence({ ...snapshot, premises: [...snapshot.premises].reverse(), evidence: [...snapshot.evidence].reverse() }, validInput())
    if (original.kind !== 'ready' || reversed.kind !== 'ready') throw new Error('fixture must have an independent complete candidate')
    expect(JSON.stringify(reversed.exclusions.excludedByReason)).toBe(JSON.stringify(original.exclusions.excludedByReason))
  })

  it('retains every sorted failure detail while one no-complete premise occupies only its highest bucket', () => {
    const base = makeSnapshot()
    const item = (code: string) => ({ code, officialName: `Item ${code}`, officialUnit: 'each', qualifiers: [], quantityMode: 'whole-units' as const })
    const bad = (itemCode: string, observations: any[]) => ({ premiseCode: '2', itemCode, officialUnit: 'each', observations })
    const snapshot = { ...base, items: ['10', '11', '12'].map(item), evidence: [
      ...['10', '11', '12'].map(code => eligibleCell('1', code, '2026-08-02', 600)),
      bad('10', [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }]),
      bad('11', [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'insufficient-reference', observedDate: '2026-08-02' }]),
      bad('12', [{ status: 'missing', observedDate: '2026-08-01' }, { status: 'missing', observedDate: '2026-08-02' }])
    ] }
    const result = evaluateEvidence(snapshot, validInput({ lines: ['10', '11', '12'].map(itemCode => ({ itemCode, quantityHundredths: 100 })) }))
    expect(result).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-anomalous', exclusions: { excludedByReason: { anomalous: 1 }, completeCandidateCount: 0 } })
    if (result.kind === 'insufficient-evidence') expect(result.details).toEqual([
      { reason: 'candidate-anomalous', premiseCode: '2', itemCode: '10', observedDate: '2026-08-02' },
      { reason: 'candidate-insufficient-reference', premiseCode: '2', itemCode: '11', observedDate: '2026-08-02' },
      { reason: 'candidate-missing', premiseCode: '2', itemCode: '12', observedDate: '2026-08-02' }
    ])
  })

  it('emits result-schema-valid early and candidate-stage refusals with the correct exclusions boundary', () => {
    const early = evaluateEvidence(makeSnapshot(), inputWithOldClock())
    const candidate = evaluateEvidence(snapshotWithOnlyFarCandidates(), validInput())
    expect(RecommendationResultSchema.parse(early)).toEqual(early)
    expect(RecommendationResultSchema.parse(candidate)).toEqual(candidate)
  })

  it.each([
    ['unknown item', { lines: [{ itemCode: '99', quantityHundredths: 100 }] }, 'item-not-in-pilot'],
    ['unknown usual premise', { usualPremiseCode: '99' }, 'usual-premise-not-in-pilot']
  ] as const)('reaches public membership refusal %s before arithmetic', (_name, patch, primaryReason) => {
    expect(evaluateEvidence(makeSnapshot(), { ...validInput(), ...patch })).toMatchObject({ kind: 'insufficient-evidence', primaryReason })
  })

  it.each([
    ['baseline-missing', () => makeSnapshot({ evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [{ status: 'missing', observedDate: '2026-08-01' }, { status: 'missing', observedDate: '2026-08-02' }] }, makeSnapshot().evidence[1]!] })],
    ['baseline-insufficient-reference', () => makeSnapshot({ evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [{ status: 'eligible', observedDate: '2026-08-01', priceSen: 600 }, { status: 'insufficient-reference', observedDate: '2026-08-02' }] }, makeSnapshot().evidence[1]!] })],
    ['baseline-stale', () => makeSnapshot({ evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [{ status: 'eligible', observedDate: '2026-07-31', priceSen: 600 }, { status: 'missing', observedDate: '2026-08-02' }] }, makeSnapshot().evidence[1]!] })],
    ['candidate-missing', () => snapshotWithCandidateObservations([{ status: 'missing', observedDate: '2026-08-01' }, { status: 'missing', observedDate: '2026-08-02' }])],
    ['candidate-insufficient-reference', () => snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'insufficient-reference', observedDate: '2026-08-02' }])],
    ['candidate-stale', () => snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-07-31', priceSen: 500 }, { status: 'missing', observedDate: '2026-08-02' }])]
  ] as const)('reaches the realizable public evidence refusal %s', (primaryReason, buildSnapshot) => {
    const result = evaluateEvidence(buildSnapshot(), validInput())
    expect(result).toMatchObject({ kind: 'insufficient-evidence', primaryReason })
    if (primaryReason.startsWith('candidate-')) expect(RecommendationResultSchema.parse(result)).toEqual(result)
    else expect(result).not.toHaveProperty('exclusions')
  })

  it('applies the active verification interval to consumer-readiness as well as geometry', () => {
    const snapshot = makeSnapshot({ premises: makeSnapshot().premises.map(premise => premise.code === '2' ? { ...premise, verifiedOn: '2026-08-04' } : premise) })
    expect(evaluateEvidence(snapshot, validInput())).toMatchObject({ kind: 'ready', comparisonOnlyReasons: ['publication-not-consumer-ready'] })
  })

  it('uses inclusive and outside walk, drive, and discovery boundaries', () => {
    const atDistance = (metres: number) => makeSnapshot({ premises: makeSnapshot().premises.map(premise => ({ ...premise, latitude: 0, longitude: premise.code === '1' ? 101 : 101 + metres / 6_371_008.8 * 180 / Math.PI })) })
    const location = { latitude: 0, longitude: 101, accuracyMetres: 10 }
    const discoveryInput = discoveryPreflightInput({ location })
    expect(preflightEvidence(atDistance(2000), modePreflightInput({ location, mode: 'walk' }) as never).completeCandidatePremiseCodes).toEqual(['2'])
    expect(preflightEvidence(atDistance(2001), modePreflightInput({ location, mode: 'walk' }) as never).completeCandidatePremiseCodes).toEqual([])
    expect(preflightEvidence(atDistance(5000), modePreflightInput({ location, mode: 'drive' }) as never).completeCandidatePremiseCodes).toEqual(['2'])
    expect(preflightEvidence(atDistance(5001), modePreflightInput({ location, mode: 'drive' }) as never).completeCandidatePremiseCodes).toEqual([])
    expect(preflightBasketDiscovery(atDistance(5000), discoveryInput).completeCandidatePremiseCodes).toEqual(['2'])
    expect(preflightBasketDiscovery(atDistance(5001), discoveryInput).completeCandidatePremiseCodes).toEqual([])
  })

  // Break caught: the usual preflight dereferences an async/transient container before validation.
  it.each([null, undefined, [], { location: { latitude: 3 } }])('fails closed without throwing for malformed usual preflight container %p', input => {
    expect(() => preflightUsualAndGeometry(makeSnapshot(), input as never)).not.toThrow()
    expect(preflightUsualAndGeometry(makeSnapshot(), input as never)).toMatchObject({ usualPremiseReady: false, usualHasRecentPilotData: false, coordinateViablePremiseCount: 0 })
  })

  it('keeps valid exact reduced preflight shapes functional', () => {
    expect(preflightUsualAndGeometry(makeSnapshot(), usualPreflightInput() as never)).toMatchObject({ usualPremiseReady: true, coordinateViablePremiseCount: 1 })
    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput() as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(preflightEvidence(makeSnapshot(), modePreflightInput() as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
  })

  it.each([
    ['usual extra top-level key', preflightUsualAndGeometry, usualPreflightInput({ extra: true }), { usualPremiseReady: false }],
    ['usual nested location key', preflightUsualAndGeometry, usualPreflightInput({ location: { latitude: 3, longitude: 101, accuracyMetres: 10, extra: true } }), { usualPremiseReady: false }],
    ['discovery extra top-level key', preflightBasketDiscovery, discoveryPreflightInput({ extra: true }), { baselineReady: false, completeCandidatePremiseCodes: [] }],
    ['discovery explicit mode', preflightBasketDiscovery, discoveryPreflightInput({ mode: 'walk' }), { baselineReady: false, completeCandidatePremiseCodes: [] }],
    ['discovery nested line key', preflightBasketDiscovery, discoveryPreflightInput({ lines: [{ itemCode: '10', quantityHundredths: 100, extra: true }] }), { baselineReady: false, completeCandidatePremiseCodes: [] }],
    ['mode-aware extra top-level key', preflightEvidence, modePreflightInput({ extra: true }), { baselineReady: false, completeCandidatePremiseCodes: [] }],
    ['mode-aware nested location key', preflightEvidence, modePreflightInput({ location: { latitude: 3, longitude: 101, accuracyMetres: 10, extra: true } }), { baselineReady: false, completeCandidatePremiseCodes: [] }],
    ['mode-aware nested line key', preflightEvidence, modePreflightInput({ lines: [{ itemCode: '10', quantityHundredths: 100, extra: true }] }), { baselineReady: false, completeCandidatePremiseCodes: [] }]
  ] as const)('rejects unknown fields at the exact reduced %s boundary', (_name, preflight, input, expected) => {
    expect(() => preflight(makeSnapshot(), input as never)).not.toThrow()
    expect(preflight(makeSnapshot(), input as never)).toMatchObject(expected)
  })

  it.each([1, '01', ' 1 ', '1.0'] as const)('rejects non-canonical usual code %p at every reduced preflight boundary', code => {
    expect(preflightUsualAndGeometry(makeSnapshot(), usualPreflightInput({ usualPremiseCode: code }) as never)).toMatchObject({ usualPremiseReady: false })
    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ usualPremiseCode: code }) as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [] })
    expect(preflightEvidence(makeSnapshot(), modePreflightInput({ usualPremiseCode: code }) as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [] })
  })

  it.each([10, '010', ' 10 ', '10.0'] as const)('rejects non-canonical item code %p at basket reduced preflight boundaries', code => {
    const lines = [{ itemCode: code, quantityHundredths: 100 }]
    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines }) as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [] })
    expect(preflightEvidence(makeSnapshot(), modePreflightInput({ lines }) as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [] })
  })

  const expectUsualSafeFailure = (input: unknown) => {
    expect(() => preflightUsualAndGeometry(makeSnapshot(), input as never)).not.toThrow()
    expect(preflightUsualAndGeometry(makeSnapshot(), input as never)).toMatchObject({ usualPremiseReady: false, usualHasRecentPilotData: false, coordinateViablePremiseCount: 0 })
  }
  const expectDiscoverySafeFailure = (input: unknown) => {
    expect(() => preflightBasketDiscovery(makeSnapshot(), input as never)).not.toThrow()
    expect(preflightBasketDiscovery(makeSnapshot(), input as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })
  }
  const expectModeSafeFailure = (input: unknown) => {
    expect(() => preflightEvidence(makeSnapshot(), input as never)).not.toThrow()
    expect(preflightEvidence(makeSnapshot(), input as never)).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })
  }

  // Break caught: Object.keys hides non-enumerable/symbol extras and validation invokes unsafe descriptors/getters.
  it('rejects non-enumerable and symbol own extras at every reflective reduced boundary', () => {
    const symbol = Symbol('hidden')
    const usual = usualPreflightInput(); Object.defineProperty(usual, 'hidden', { value: true }); Object.defineProperty(usual.location, 'hidden', { value: true }); (usual as any)[symbol] = true
    const discovery = discoveryPreflightInput(); Object.defineProperty(discovery, 'hidden', { value: true }); Object.defineProperty(discovery.location, 'hidden', { value: true }); Object.defineProperty(discovery.lines[0]!, 'hidden', { value: true }); (discovery as any)[symbol] = true
    const mode = modePreflightInput(); Object.defineProperty(mode, 'hidden', { value: true }); Object.defineProperty(mode.location, 'hidden', { value: true }); Object.defineProperty(mode.lines[0]!, 'hidden', { value: true }); (mode as any)[symbol] = true
    expectUsualSafeFailure(usual); expectDiscoverySafeFailure(discovery); expectModeSafeFailure(mode)
  })

  it('rejects custom/inherited data prototypes including discovery inherited mode', () => {
    const usual = Object.assign(Object.create({ inherited: true }), usualPreflightInput())
    const discovery = Object.assign(Object.create({ mode: 'walk' }), discoveryPreflightInput())
    const mode = Object.assign(Object.create({ inherited: true }), modePreflightInput())
    expectUsualSafeFailure(usual); expectDiscoverySafeFailure(discovery); expectModeSafeFailure(mode)
  })

  it('rejects accessors without invoking them at every reduced boundary', () => {
    const throwingGetter = () => { throw new Error('getter must not run') }
    const usual = usualPreflightInput(); Object.defineProperty(usual, 'evaluatedAt', { enumerable: true, get: throwingGetter })
    const discovery = discoveryPreflightInput(); Object.defineProperty(discovery.location, 'latitude', { enumerable: true, get: throwingGetter })
    const mode = modePreflightInput(); Object.defineProperty(mode.lines[0]!, 'itemCode', { enumerable: true, get: throwingGetter })
    expectUsualSafeFailure(usual); expectDiscoverySafeFailure(discovery); expectModeSafeFailure(mode)
  })

  it.each([
    ['ownKeys', () => ({ ownKeys: () => { throw new Error('ownKeys') } })],
    ['getPrototypeOf', () => ({ getPrototypeOf: () => { throw new Error('getPrototypeOf') } })],
    ['getOwnPropertyDescriptor', () => ({ getOwnPropertyDescriptor: () => { throw new Error('descriptor') } })]
  ] as const)('fails closed for Proxy %s traps across every reduced preflight', (_name, handler) => {
    expectUsualSafeFailure(new Proxy(usualPreflightInput(), handler()))
    expectDiscoverySafeFailure(new Proxy(discoveryPreflightInput(), handler()))
    expectModeSafeFailure(new Proxy(modePreflightInput(), handler()))
  })

  it('does not invoke get-only Proxy traps while decoding copied top-level descriptors', () => {
    let calls = 0
    const handler = { get: () => { calls++; throw new Error('must not be read') } }
    expect(preflightUsualAndGeometry(makeSnapshot(), new Proxy(usualPreflightInput(), handler) as never)).toMatchObject({ usualPremiseReady: true })
    expect(preflightBasketDiscovery(makeSnapshot(), new Proxy(discoveryPreflightInput(), handler) as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(preflightEvidence(makeSnapshot(), new Proxy(modePreflightInput(), handler) as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(calls).toBe(0)
  })

  it.each([
    ['usual non-enumerable top', expectUsualSafeFailure, () => { const value = usualPreflightInput(); Object.defineProperty(value, 'hidden', { value: true }); return value }],
    ['usual symbol top', expectUsualSafeFailure, () => { const value = usualPreflightInput(); (value as any)[Symbol('hidden')] = true; return value }],
    ['usual non-enumerable location', expectUsualSafeFailure, () => { const value = usualPreflightInput(); Object.defineProperty(value.location, 'hidden', { value: true }); return value }],
    ['usual symbol location', expectUsualSafeFailure, () => { const value = usualPreflightInput(); (value.location as any)[Symbol('hidden')] = true; return value }],
    ['discovery non-enumerable top', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); Object.defineProperty(value, 'hidden', { value: true }); return value }],
    ['discovery symbol location', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); (value.location as any)[Symbol('hidden')] = true; return value }],
    ['discovery non-enumerable line', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); Object.defineProperty(value.lines[0]!, 'hidden', { value: true }); return value }],
    ['discovery symbol line', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); (value.lines[0] as any)[Symbol('hidden')] = true; return value }],
    ['mode non-enumerable top', expectModeSafeFailure, () => { const value = modePreflightInput(); Object.defineProperty(value, 'hidden', { value: true }); return value }],
    ['mode symbol location', expectModeSafeFailure, () => { const value = modePreflightInput(); (value.location as any)[Symbol('hidden')] = true; return value }],
    ['mode non-enumerable line', expectModeSafeFailure, () => { const value = modePreflightInput(); Object.defineProperty(value.lines[0]!, 'hidden', { value: true }); return value }],
    ['mode symbol line', expectModeSafeFailure, () => { const value = modePreflightInput(); (value.lines[0] as any)[Symbol('hidden')] = true; return value }]
  ] as const)('isolates reflective own-field rejection for %s', (_name, assertSafeFailure, build) => assertSafeFailure(build()))

  it.each([
    ['discovery location Proxy', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); value.location = new Proxy(value.location, { ownKeys: () => { throw new Error('location ownKeys') } }); return value }],
    ['discovery lines-array Proxy', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); value.lines = new Proxy(value.lines, { ownKeys: () => { throw new Error('lines ownKeys') } }); return value }],
    ['mode lines-array Proxy', expectModeSafeFailure, () => { const value = modePreflightInput(); value.lines = new Proxy(value.lines, { getPrototypeOf: () => { throw new Error('lines prototype') } }); return value }],
    ['discovery line-record Proxy', expectDiscoverySafeFailure, () => { const value = discoveryPreflightInput(); value.lines[0] = new Proxy(value.lines[0]!, { getOwnPropertyDescriptor: () => { throw new Error('line descriptor') } }); return value }]
  ] as const)('fails closed for nested Proxy %s traps', (_name, assertSafeFailure, build) => assertSafeFailure(build()))

  it('does not invoke get-only nested Proxy traps while retaining valid results', () => {
    let calls = 0
    const handler = { get: () => { calls++; throw new Error('must not be read') } }
    const discovery = discoveryPreflightInput(); discovery.location = new Proxy(discovery.location, handler)
    const mode = modePreflightInput(); mode.lines[0] = new Proxy(mode.lines[0]!, handler)
    expect(preflightBasketDiscovery(makeSnapshot(), discovery as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(preflightEvidence(makeSnapshot(), mode as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(calls).toBe(0)
  })

  it.each([
    ['sparse array', () => { const value = discoveryPreflightInput(); value.lines = new Array(1); return value }],
    ['array extra property', () => { const value = discoveryPreflightInput(); (value.lines as any).extra = true; return value }],
    ['array symbol property', () => { const value = discoveryPreflightInput(); (value.lines as any)[Symbol('hidden')] = true; return value }],
    ['array accessor element', () => { const value = discoveryPreflightInput(); Object.defineProperty(value.lines, '0', { enumerable: true, get: () => { throw new Error('array accessor') } }); return value }]
  ] as const)('rejects non-dense hostile basket lines arrays: %s', (_name, build) => {
    const discovery = build()
    const mode = modePreflightInput({ lines: discovery.lines })
    expectDiscoverySafeFailure(discovery); expectModeSafeFailure(mode)
  })

  it('rejects null-prototype reduced records while accepting ordinary object literals', () => {
    expectUsualSafeFailure(Object.assign(Object.create(null), usualPreflightInput()))
    expect(preflightUsualAndGeometry(makeSnapshot(), usualPreflightInput() as never)).toMatchObject({ usualPremiseReady: true })
  })

  it('rejects a huge sparse lines array without treating its declared length as work', () => {
    const lines = new Array(10_000_000)
    const startedAt = performance.now()
    expectDiscoverySafeFailure(discoveryPreflightInput({ lines }))
    expect(performance.now() - startedAt).toBeLessThan(250)
  })
})
