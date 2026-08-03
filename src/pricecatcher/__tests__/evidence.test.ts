import { describe, expect, it } from 'vitest'
import { evaluateEvidence, mergeBasketLines, normalizeRecommendationRequest, preflightBasketDiscovery, preflightEvidence, preflightUsualAndGeometry } from '../evidence'
import { RecommendationResultSchema } from '../contracts/recommendation'
import {
  inputWithOldClock, makeSnapshot, snapshotWithBadBaselineAndNoCandidate, snapshotWithCandidateObservations,
  snapshotWithMixedCandidateFailures, snapshotWithOldData, snapshotWithOnlyFarCandidates, snapshotWithPairDates,
  snapshotWithThreePremisesAndOneBadCandidate, validInput, eligibleCell,
  fixedDescriptorMutationProbe, lineDescriptorMutationProbe, previousDaySnapshotWithStaleEvidence
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

  // Break caught: baseline freshness is measured from snapshot publication instead of the injected evaluation date.
  it('rejects a previous-day snapshot whose baseline selected observation is two evaluation dates old', () => {
    const snapshot = previousDaySnapshotWithStaleEvidence('baseline')
    const input = validInput()
    expect(evaluateEvidence(snapshot, input)).toMatchObject({
      kind: 'insufficient-evidence', primaryReason: 'baseline-stale'
    })
    expect(preflightUsualAndGeometry(snapshot, usualPreflightInput())).toMatchObject({ usualHasRecentPilotData: false })
    expect(preflightBasketDiscovery(snapshot, discoveryPreflightInput())).toMatchObject({ baselineReady: false })
    expect(preflightEvidence(snapshot, modePreflightInput() as never)).toMatchObject({ baselineReady: false })
  })

  // Break caught: candidate freshness is measured from snapshot publication instead of the injected evaluation date.
  it('rejects a previous-day snapshot whose candidate selected observation is two evaluation dates old', () => {
    expect(evaluateEvidence(previousDaySnapshotWithStaleEvidence('candidate'), validInput())).toMatchObject({
      kind: 'insufficient-evidence', primaryReason: 'candidate-stale'
    })
  })

  // Break caught: a later anomalous observation is skipped in favour of an older price.
  it('never falls back from a newer anomalous row', () => {
    expect(evaluateEvidence(snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'anomalous', observedDate: '2026-08-02', reason: 'outside-ratio-bound' }]), validInput())).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-anomalous' })
  })

  // Break caught: an explicitly materialized missing row hides the available older observation.
  it('treats materialized missing as no raw row rather than masking yesterday', () => {
    const snapshot = snapshotWithCandidateObservations([{ status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'missing', observedDate: '2026-08-02' }])
    snapshot.compiledAt = '2026-08-02T03:00:00.000Z'
    expect(evaluateEvidence(snapshot, validInput({ evaluatedAt: '2026-08-02T03:00:00.000Z' })).kind).toBe('ready')
  })

  // Break caught: evaluator finds an older common date instead of aligning the independently newest rows.
  it('requires independently newest baseline and candidate dates to match', () => {
    const snapshot = snapshotWithPairDates('2026-08-01', '2026-08-02')
    snapshot.compiledAt = '2026-08-02T03:00:00.000Z'
    expect(evaluateEvidence(snapshot, validInput({ evaluatedAt: '2026-08-02T03:00:00.000Z' }))).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-date-mismatch' })
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
    [{ lines: undefined }, 'basket-empty'],
    [{ lines: [] }, 'basket-empty'],
    [{ lines: [{ itemCode: '10', quantityHundredths: 99 }] }, 'input-invalid']
  ])('normalizes public request failures as %s', (patch, reason) => {
    expect(evaluateEvidence(makeSnapshot(), { ...validInput(), ...patch } as never)).toMatchObject({ kind: 'insufficient-evidence', primaryReason: reason })
  })

  // Break caught: a present malformed basket container is classified as semantic absence.
  it.each([null, 42, 'not-an-array', { 0: { itemCode: '10', quantityHundredths: 100 }, length: 1 }])(
    'classifies a present malformed lines container %p as input-invalid', lines => {
      expect(evaluateEvidence(makeSnapshot(), { ...validInput(), lines })).toEqual({
        kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: []
      })
    }
  )

  // Break caught: classifying malformed lines reads a later allowed descriptor and loses refusal precedence.
  it('returns input-invalid for malformed lines without reading a later mode descriptor', () => {
    const request = { ...validInput(), lines: null } as unknown as Record<string, unknown>
    let modeDescriptorCalls = 0
    const trapped = new Proxy(request, {
      getOwnPropertyDescriptor: (target, key) => {
        if (key === 'mode') {
          modeDescriptorCalls++
          throw new Error('later mode descriptor must not run')
        }
        return Reflect.getOwnPropertyDescriptor(target, key)
      }
    })

    expect(evaluateEvidence(makeSnapshot(), trapped)).toEqual({
      kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: []
    })
    expect(modeDescriptorCalls).toBe(0)
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
    const normalized = normalizeRecommendationRequest(validInput())
    expect(normalized).toEqual(validInput())
    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized!.location)).toBe(true)
    expect(Object.isFrozen(normalized!.lines)).toBe(true)
    expect(normalized!.lines.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(normalized!.fixedTripCostByPremiseCode)).toBe(true)
    expect(Object.values(normalized!.fixedTripCostByPremiseCode!).every(Object.isFrozen)).toBe(true)
  })

  // Break caught: a later top descriptor can rewrite a line before nested capture.
  it('captures a line before reading the later mode descriptor', () => {
    const normalization = lineDescriptorMutationProbe(validInput())
    const normalized = normalizeRecommendationRequest(normalization.request)
    expect(normalized?.lines).toEqual([{ itemCode: '10', quantityHundredths: 100 }])
    expect(normalization.events.indexOf('line:itemCode')).toBeLessThan(normalization.events.indexOf('top:mode'))
    for (const event of ['line:itemCode', 'line:quantityHundredths', 'top:mode']) {
      expect(normalization.descriptorCalls.get(event), event).toBe(1)
    }

    const evaluation = lineDescriptorMutationProbe(validInput())
    expect(evaluateEvidence(makeSnapshot(), evaluation.request)).toMatchObject({ kind: 'ready', comparisonOnlyReasons: [] })
    expect(evaluation.events.indexOf('line:itemCode')).toBeLessThan(evaluation.events.indexOf('top:mode'))
    for (const event of ['line:itemCode', 'line:quantityHundredths', 'top:mode']) {
      expect(evaluation.descriptorCalls.get(event), event).toBe(1)
    }
  })

  // Break caught: a later threshold descriptor can rewrite a fixed-cost entry before nested capture.
  it('captures fixed costs before reading the later worthwhile threshold descriptor', () => {
    const normalization = fixedDescriptorMutationProbe(validInput())
    const normalized = normalizeRecommendationRequest(normalization.request)
    expect(normalized?.fixedTripCostByPremiseCode?.['2']).toEqual({ status: 'confirmed', amountSen: 0 })
    expect(normalization.events.indexOf('fixed-entry:status')).toBeLessThan(normalization.events.indexOf('top:worthwhileThresholdSen'))
    for (const event of ['top:fixedTripCostByPremiseCode', 'fixed-map:2', 'fixed-entry:status', 'fixed-entry:amountSen', 'top:worthwhileThresholdSen']) {
      expect(normalization.descriptorCalls.get(event), event).toBe(1)
    }

    const evaluation = fixedDescriptorMutationProbe(validInput())
    expect(evaluateEvidence(makeSnapshot(), evaluation.request)).toMatchObject({ kind: 'ready', comparisonOnlyReasons: [] })
    expect(evaluation.events.indexOf('fixed-entry:status')).toBeLessThan(evaluation.events.indexOf('top:worthwhileThresholdSen'))
    for (const event of ['top:fixedTripCostByPremiseCode', 'fixed-map:2', 'fixed-entry:status', 'fixed-entry:amountSen', 'top:worthwhileThresholdSen']) {
      expect(evaluation.descriptorCalls.get(event), event).toBe(1)
    }
  })

  // Break caught: attacker ownKeys order lets a later known nested descriptor rewrite an earlier location or line field.
  it('captures known nested request fields in semantic order regardless of attacker key order', () => {
    const locationRequest = validInput()
    const rawLocation = { ...locationRequest.location }
    locationRequest.location = new Proxy(rawLocation, {
      ownKeys: target => ['accuracyMetres', 'longitude', 'latitude'] satisfies Array<keyof typeof target>,
      getOwnPropertyDescriptor: (target, key) => {
        if (key === 'accuracyMetres') rawLocation.latitude = 999
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get: () => { throw new Error('raw location get must not run') }
    })
    expect(evaluateEvidence(makeSnapshot(), locationRequest)).toMatchObject({ kind: 'ready' })

    const lineRequest = validInput()
    const rawLine = { ...lineRequest.lines[0]! }
    lineRequest.lines = [new Proxy(rawLine, {
      ownKeys: target => ['quantityHundredths', 'itemCode'] satisfies Array<keyof typeof target>,
      getOwnPropertyDescriptor: (target, key) => {
        if (key === 'quantityHundredths') rawLine.itemCode = '99'
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get: () => { throw new Error('raw line get must not run') }
    })]
    expect(normalizeRecommendationRequest(lineRequest)?.lines).toEqual([{ itemCode: '10', quantityHundredths: 100 }])
    rawLine.itemCode = '10'
    expect(evaluateEvidence(makeSnapshot(), lineRequest)).toMatchObject({ kind: 'ready' })
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
    const snapshot = makeSnapshot({ compiledAt: '2026-08-02T03:00:00.000Z', evidence: [{ premiseCode: '1', itemCode: '10', officialUnit: 'each', observations: [
      { status: 'eligible', observedDate: '2026-08-01', priceSen: 600 }, { status: 'missing', observedDate: '2026-08-02' }
    ] }, { premiseCode: '2', itemCode: '10', officialUnit: 'each', observations: [
      { status: 'eligible', observedDate: '2026-08-01', priceSen: 500 }, { status: 'eligible', observedDate: '2026-08-02', priceSen: 501 }
    ] }] })
    expect(evaluateEvidence(snapshot, validInput({ evaluatedAt: '2026-08-02T03:00:00.000Z' }))).toMatchObject({ kind: 'insufficient-evidence', primaryReason: 'candidate-date-mismatch' })
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

  // Break caught: the efficiency-only 120 default is rejected before recommendation arithmetic can apply it.
  it('keeps an otherwise trip-eligible drive ready when only efficiency is absent', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput({ fuelEfficiencyDeciKmPerL: undefined }))).toMatchObject({ kind: 'ready', comparisonOnlyReasons: [] })
  })

  // Break caught: the absent optional efficiency hides a present unknown fixed cost.
  it('retains the unknown-fixed comparison reason when efficiency is absent', () => {
    expect(evaluateEvidence(makeSnapshot(), validInput({
      fuelEfficiencyDeciKmPerL: undefined,
      fixedTripCostByPremiseCode: {
        '1': { status: 'confirmed', amountSen: 0 },
        '2': { status: 'unknown' }
      }
    }))).toMatchObject({ kind: 'ready', comparisonOnlyReasons: ['fixed-trip-cost-unknown'] })
  })

  // Break caught: the direct evidence boundary invokes or trusts a changing raw request accessor.
  it('rejects a changing recommendation accessor without invoking it', () => {
    const request = { ...validInput() } as Record<string, unknown>
    let reads = 0
    Object.defineProperty(request, 'basketScope', {
      enumerable: true,
      get: () => ++reads === 1 ? 'complete-trip' : 'selected-items-only'
    })
    let result: ReturnType<typeof evaluateEvidence> | undefined

    expect(() => { result = evaluateEvidence(makeSnapshot(), request) }).not.toThrow()
    expect(result).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
    expect(reads).toBe(0)
  })

  // Break caught: nested accessors and reflection failures escape the direct evidence boundary.
  it('fails closed without invoking hostile nested recommendation fields', () => {
    const nested = validInput()
    let nestedReads = 0
    Object.defineProperty(nested.fixedTripCostByPremiseCode!['2']!, 'amountSen', {
      enumerable: true,
      get: () => { nestedReads++; throw new Error('fixed-cost getter must not run') }
    })
    const trapped = new Proxy(validInput(), { ownKeys: () => { throw new Error('ownKeys') } })

    expect(() => evaluateEvidence(makeSnapshot(), nested)).not.toThrow()
    expect(evaluateEvidence(makeSnapshot(), nested)).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
    expect(nestedReads).toBe(0)
    expect(() => evaluateEvidence(makeSnapshot(), trapped)).not.toThrow()
    expect(evaluateEvidence(makeSnapshot(), trapped)).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
  })

  // Break caught: direct evidence normalization performs raw gets or multiple top-level descriptor snapshots.
  it('uses one descriptor snapshot and no raw gets at the direct evidence boundary', () => {
    const target = validInput()
    let ownKeysCalls = 0
    let getCalls = 0
    const request = new Proxy(target, {
      ownKeys: object => { ownKeysCalls++; return Reflect.ownKeys(object) },
      getOwnPropertyDescriptor: (object, key) => Reflect.getOwnPropertyDescriptor(object, key),
      get: () => { getCalls++; throw new Error('raw get must not run') }
    })

    expect(evaluateEvidence(makeSnapshot(), request)).toMatchObject({ kind: 'ready' })
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
  })

  // Break caught: eager nested stabilization overwrites the existing clock refusal precedence.
  it('does not touch hostile nested fields after an earlier clock refusal', () => {
    const request = validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' })
    let reads = 0
    Object.defineProperty(request.location, 'latitude', {
      enumerable: true,
      get: () => { reads++; throw new Error('location getter must not run') }
    })

    expect(evaluateEvidence(makeSnapshot(), request)).toEqual({ kind: 'insufficient-evidence', primaryReason: 'clock-invalid', details: [] })
    expect(reads).toBe(0)
  })

  // Break caught: top-level descriptor validation rejects later accessors before the locked semantic refusal stage.
  it('preserves direct-evidence refusal precedence over later top-level accessors', () => {
    const cases: Array<{ name: string; snapshot: ReturnType<typeof makeSnapshot>; request: Record<string, unknown>; keys: string[]; expectedReason: string }> = []
    const add = (name: string, snapshot: ReturnType<typeof makeSnapshot>, request: Record<string, unknown>, keys: string[], expectedReason: string) => {
      cases.push({ name, snapshot, request, keys, expectedReason })
    }
    add('invalid clock', makeSnapshot(), validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }) as unknown as Record<string, unknown>, ['mode'], 'clock-invalid')
    add('stale snapshot', snapshotWithOldData(), validInput() as unknown as Record<string, unknown>, ['mode'], 'snapshot-stale')
    const missingLocation = validInput() as unknown as Record<string, unknown>
    delete missingLocation.location
    add('missing location', makeSnapshot(), missingLocation, ['lines', 'mode'], 'location-missing')
    add('imprecise location', makeSnapshot(), validInput({ location: { latitude: 3, longitude: 101, accuracyMetres: 101 } }) as unknown as Record<string, unknown>, ['mode'], 'location-imprecise')
    add('empty basket', makeSnapshot(), validInput({ lines: [] }) as unknown as Record<string, unknown>, ['fixedTripCostByPremiseCode'], 'basket-empty')

    for (const entry of cases) {
      let reads = 0
      for (const key of entry.keys) Object.defineProperty(entry.request, key, {
        enumerable: true,
        get: () => { reads++; throw new Error(`${entry.name} later getter must not run`) }
      })
      expect(evaluateEvidence(entry.snapshot, entry.request), entry.name).toEqual({
        kind: 'insufficient-evidence', primaryReason: entry.expectedReason, details: []
      })
      expect(reads, entry.name).toBe(0)
    }
  })

  // Break caught: loose normalization runs before the strict shell has rejected an unknown top-level key name.
  it.each([
    ['invalid clock', makeSnapshot(), { ...validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }), extra: true }, 'input-invalid'],
    ['stale snapshot', snapshotWithOldData(), { ...validInput(), extra: true }, 'input-invalid'],
    ['missing location', makeSnapshot(), (() => { const request = { ...validInput(), extra: true } as Record<string, unknown>; delete request.location; return request })(), 'input-invalid'],
    ['imprecise location', makeSnapshot(), { ...validInput({ location: { latitude: 3, longitude: 101, accuracyMetres: 101 } }), extra: true }, 'input-invalid'],
    ['empty basket', makeSnapshot(), { ...validInput({ lines: [] }), extra: true }, 'input-invalid'],
    ['otherwise valid', makeSnapshot(), { ...validInput(), extra: true }, 'input-invalid'],
    ['symbol key', makeSnapshot(), (() => { const request = validInput(); Object.defineProperty(request, Symbol('extra'), { enumerable: true, value: true }); return request })(), 'input-invalid']
  ] as const)('rejects an extra key before the %s gate', (_name, snapshot, request, primaryReason) => {
    expect(evaluateEvidence(snapshot, request)).toEqual({ kind: 'insufficient-evidence', primaryReason, details: [] })
  })

  // Break caught: bulk descriptor capture consults attacker-ordered later traps before the semantic field that decides the refusal.
  it('reads allowed top-level descriptors lazily in semantic order after one key snapshot', () => {
    const cases: Array<{ name: string; request: Record<string, unknown>; trappedKey: string; primaryReason: string }> = []
    cases.push({
      name: 'invalid clock', request: validInput({ evaluatedAt: '2026-08-03T02:54:59.000Z' }) as unknown as Record<string, unknown>,
      trappedKey: 'mode', primaryReason: 'clock-invalid'
    })
    const missingLocation = validInput() as unknown as Record<string, unknown>
    delete missingLocation.location
    cases.push({ name: 'missing location', request: missingLocation, trappedKey: 'mode', primaryReason: 'location-missing' })
    cases.push({
      name: 'imprecise location',
      request: validInput({ location: { latitude: 3, longitude: 101, accuracyMetres: 101 } }) as unknown as Record<string, unknown>,
      trappedKey: 'mode', primaryReason: 'location-imprecise'
    })
    cases.push({
      name: 'empty basket', request: validInput({ lines: [] }) as unknown as Record<string, unknown>,
      trappedKey: 'fixedTripCostByPremiseCode', primaryReason: 'basket-empty'
    })

    for (const entry of cases) {
      let ownKeysCalls = 0
      let trappedDescriptorCalls = 0
      const request = new Proxy(entry.request, {
        ownKeys: target => {
          ownKeysCalls++
          return [entry.trappedKey, ...Reflect.ownKeys(target).filter(key => key !== entry.trappedKey)]
        },
        getOwnPropertyDescriptor: (target, key) => {
          if (key === entry.trappedKey) {
            trappedDescriptorCalls++
            throw new Error(`${entry.name} later descriptor must not run`)
          }
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
        get: () => { throw new Error('raw get must not run') }
      })

      expect(evaluateEvidence(makeSnapshot(), request), entry.name).toEqual({
        kind: 'insufficient-evidence', primaryReason: entry.primaryReason, details: []
      })
      expect(ownKeysCalls, entry.name).toBe(1)
      expect(trappedDescriptorCalls, entry.name).toBe(0)
    }
  })

  // Break caught: malformed canonical values throw or prototype-named fixed-cost entries disappear during unknown-input decoding.
  it('fails closed across evidence and normalization for every malformed code boundary', () => {
    const veryLongCode = '9'.repeat(100_000)
    const malformed: Array<{ name: string; build: () => unknown }> = [
      { name: 'usual premise', build: () => ({ ...validInput(), usualPremiseCode: 'abc' }) },
      { name: 'basket line', build: () => ({ ...validInput(), lines: [{ itemCode: '1.2', quantityHundredths: 100 }] }) },
      { name: 'very-long usual premise', build: () => ({ ...validInput(), usualPremiseCode: veryLongCode }) },
      { name: 'very-long basket line', build: () => ({ ...validInput(), lines: [{ itemCode: veryLongCode, quantityHundredths: 100 }] }) },
      { name: 'constructor fixed-cost key', build: () => {
        const request = validInput()
        Object.defineProperty(request.fixedTripCostByPremiseCode!, 'constructor', {
          enumerable: true, value: { status: 'confirmed', amountSen: 0 }
        })
        return request
      } },
      { name: '__proto__ fixed-cost key', build: () => {
        const request = validInput()
        Object.defineProperty(request.fixedTripCostByPremiseCode!, '__proto__', {
          enumerable: true, value: { status: 'confirmed', amountSen: 0 }
        })
        return request
      } },
      { name: 'out-of-range fixed-cost key', build: () => {
        const request = validInput()
        request.fixedTripCostByPremiseCode!['9007199254740992'] = { status: 'confirmed', amountSen: 0 }
        return request
      } },
      { name: 'very-long fixed-cost key', build: () => {
        const request = validInput()
        request.fixedTripCostByPremiseCode![veryLongCode] = { status: 'confirmed', amountSen: 0 }
        return request
      } }
    ]

    for (const entry of malformed) {
      const request = entry.build()
      let evidence: ReturnType<typeof evaluateEvidence> | undefined
      let normalized: ReturnType<typeof normalizeRecommendationRequest> | undefined
      expect(() => { evidence = evaluateEvidence(makeSnapshot(), request) }, entry.name).not.toThrow()
      expect(evidence, entry.name).toEqual({ kind: 'insufficient-evidence', primaryReason: 'input-invalid', details: [] })
      expect(() => { normalized = normalizeRecommendationRequest(request) }, entry.name).not.toThrow()
      expect(normalized, entry.name).toBeNull()
    }
  })

  // Break caught: explicit map-key validation narrows the supported canonical range below the schema's inclusive maximum.
  it('retains a maximum-safe canonical fixed-cost key', () => {
    const request = validInput()
    request.fixedTripCostByPremiseCode!['9007199254740991'] = { status: 'confirmed', amountSen: 0 }
    const normalized = normalizeRecommendationRequest(request)

    expect(normalized?.fixedTripCostByPremiseCode?.['9007199254740991']).toEqual({ status: 'confirmed', amountSen: 0 })
    expect(evaluateEvidence(makeSnapshot(), request)).toMatchObject({ kind: 'ready' })
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

  // Break caught: a later mode descriptor mutates a line before mode-aware preflight captures the line record.
  it('captures mode-preflight lines before the later mode descriptor regardless of attacker key order', () => {
    const events: string[] = []
    const rawLine = { itemCode: '10', quantityHundredths: 100 }
    const line = new Proxy(rawLine, {
      ownKeys: target => Reflect.ownKeys(target),
      getOwnPropertyDescriptor: (target, key) => {
        events.push(`line:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get: () => { throw new Error('raw line get must not run') }
    })
    const target = modePreflightInput({ lines: [line] })
    const input = new Proxy(target, {
      ownKeys: object => ['mode', ...Reflect.ownKeys(object).filter(key => key !== 'mode')],
      getOwnPropertyDescriptor: (object, key) => {
        events.push(`top:${String(key)}`)
        if (key === 'mode') rawLine.itemCode = '99'
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
      get: () => { throw new Error('raw top-level get must not run') }
    })

    expect(preflightEvidence(makeSnapshot(), input as never)).toMatchObject({
      baselineReady: true, completeCandidatePremiseCodes: ['2']
    })
    expect(events.indexOf('line:itemCode')).toBeLessThan(events.indexOf('top:mode'))
    for (const event of ['top:evaluatedAt', 'top:location', 'top:usualPremiseCode', 'top:lines', 'top:mode', 'line:itemCode', 'line:quantityHundredths']) {
      expect(events.filter(candidate => candidate === event), event).toHaveLength(1)
    }
  })

  // Break caught: reflecting a later array index can mutate an earlier line before discovery captures it.
  it('captures each discovery line before reflecting a later array index', () => {
    const events: string[] = []
    const rawFirst = { itemCode: '10', quantityHundredths: 50 }
    const first = new Proxy(rawFirst, {
      ownKeys: target => Reflect.ownKeys(target),
      getOwnPropertyDescriptor: (target, key) => {
        events.push(`first:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get: () => { throw new Error('raw first-line get must not run') }
    })
    const target = [first, { itemCode: '10', quantityHundredths: 50 }]
    const lines = new Proxy(target, {
      ownKeys: array => Reflect.ownKeys(array),
      getOwnPropertyDescriptor: (array, key) => {
        events.push(`array:${String(key)}`)
        if (key === '1') rawFirst.itemCode = '99'
        return Reflect.getOwnPropertyDescriptor(array, key)
      },
      get: () => { throw new Error('raw lines get must not run') }
    })

    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines }) as never)).toMatchObject({
      baselineReady: true, completeCandidatePremiseCodes: ['2']
    })
    expect(events.indexOf('first:itemCode')).toBeLessThan(events.indexOf('array:1'))
    for (const event of ['array:length', 'array:0', 'array:1', 'first:itemCode', 'first:quantityHundredths']) {
      expect(events.filter(candidate => candidate === event), event).toHaveLength(1)
    }
  })

  // Break caught: a later usual-code descriptor mutates location before usual/geometry preflight captures it.
  it('captures usual-preflight location before the later usual code regardless of attacker key order', () => {
    const events: string[] = []
    const rawLocation = { latitude: 3, longitude: 101, accuracyMetres: 10 }
    const location = new Proxy(rawLocation, {
      ownKeys: target => Reflect.ownKeys(target),
      getOwnPropertyDescriptor: (target, key) => {
        events.push(`location:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get: () => { throw new Error('raw location get must not run') }
    })
    const target = usualPreflightInput({ location })
    const input = new Proxy(target, {
      ownKeys: object => ['usualPremiseCode', ...Reflect.ownKeys(object).filter(key => key !== 'usualPremiseCode')],
      getOwnPropertyDescriptor: (object, key) => {
        events.push(`top:${String(key)}`)
        if (key === 'usualPremiseCode') rawLocation.latitude = 999
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
      get: () => { throw new Error('raw top-level get must not run') }
    })

    expect(preflightUsualAndGeometry(makeSnapshot(), input as never)).toMatchObject({
      usualPremiseReady: true, coordinateViablePremiseCount: 1
    })
    expect(events.indexOf('location:latitude')).toBeLessThan(events.indexOf('top:usualPremiseCode'))
    for (const event of ['top:evaluatedAt', 'top:location', 'top:usualPremiseCode', 'location:latitude', 'location:longitude', 'location:accuracyMetres']) {
      expect(events.filter(candidate => candidate === event), event).toHaveLength(1)
    }
  })

  // Break caught: reduced preflights scan an attacker-sized digit string before enforcing the canonical-code bound.
  it('bounds very-long canonical-code candidates before regex work in every reduced preflight', () => {
    const veryLongCode = '9'.repeat(100_000)
    const originalTest = RegExp.prototype.test
    let longPatternCalls = 0
    RegExp.prototype.test = function (value: string): boolean {
      if (value === veryLongCode) longPatternCalls++
      return originalTest.call(this, value)
    }
    try {
      expect(preflightUsualAndGeometry(makeSnapshot(), usualPreflightInput({ usualPremiseCode: veryLongCode }) as never)).toMatchObject({ usualPremiseReady: false })
      expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ usualPremiseCode: veryLongCode }) as never)).toMatchObject({ baselineReady: false })
      expect(preflightEvidence(makeSnapshot(), modePreflightInput({ usualPremiseCode: veryLongCode }) as never)).toMatchObject({ baselineReady: false })
      expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines: [{ itemCode: veryLongCode, quantityHundredths: 100 }] }) as never)).toMatchObject({ baselineReady: false })
      expect(preflightEvidence(makeSnapshot(), modePreflightInput({ lines: [{ itemCode: veryLongCode, quantityHundredths: 100 }] }) as never)).toMatchObject({ baselineReady: false })
    } finally {
      RegExp.prototype.test = originalTest
    }
    expect(longPatternCalls).toBe(0)
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

  // Break caught: exact top-level keys are checked in one reflection pass but values are copied from a later, expanded pass.
  it('decodes a top-level record from exactly one bulk descriptor snapshot', () => {
    let ownKeysCalls = 0
    let getCalls = 0
    const input = new Proxy(usualPreflightInput(), {
      ownKeys: target => {
        ownKeysCalls++
        return ownKeysCalls === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'lateExtra']
      },
      getOwnPropertyDescriptor: (target, key) => key === 'lateExtra'
        ? { configurable: true, enumerable: true, writable: true, value: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
      get: () => { getCalls++; throw new Error('must not be read') }
    })

    expect(preflightUsualAndGeometry(makeSnapshot(), input as never)).toMatchObject({ usualPremiseReady: true })
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
  })

  // Break caught: a nested location is key-checked and descriptor-copied from different reflective states.
  it('decodes a nested location from exactly one bulk descriptor snapshot', () => {
    let ownKeysCalls = 0
    let getCalls = 0
    const input = discoveryPreflightInput()
    input.location = new Proxy(input.location, {
      ownKeys: target => {
        ownKeysCalls++
        return ownKeysCalls === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'lateExtra']
      },
      getOwnPropertyDescriptor: (target, key) => key === 'lateExtra'
        ? { configurable: true, enumerable: true, writable: true, value: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
      get: () => { getCalls++; throw new Error('must not be read') }
    })

    expect(preflightBasketDiscovery(makeSnapshot(), input as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
  })

  // Break caught: a line record is key-checked and descriptor-copied from different reflective states.
  it('decodes a line record from exactly one bulk descriptor snapshot', () => {
    let ownKeysCalls = 0
    let getCalls = 0
    const input = modePreflightInput()
    input.lines[0] = new Proxy(input.lines[0]!, {
      ownKeys: target => {
        ownKeysCalls++
        return ownKeysCalls === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'lateExtra']
      },
      getOwnPropertyDescriptor: (target, key) => key === 'lateExtra'
        ? { configurable: true, enumerable: true, writable: true, value: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
      get: () => { getCalls++; throw new Error('must not be read') }
    })

    expect(preflightEvidence(makeSnapshot(), input as never)).toMatchObject({ baselineReady: true, completeCandidatePremiseCodes: ['2'] })
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
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

  // Break caught: virtual dense indices are reflected before the request's maximum satisfiable raw-line count is checked.
  it('rejects an over-bound virtual dense lines array before bulk reflection', () => {
    const virtualLength = 9_901
    const target = new Array(virtualLength)
    let ownKeysCalls = 0
    let virtualIndexDescriptorCalls = 0
    const lines = new Proxy(target, {
      ownKeys: () => {
        ownKeysCalls++
        return [...Array.from({ length: virtualLength }, (_, index) => String(index)), 'length']
      },
      getOwnPropertyDescriptor: (array, key) => {
        if (key === 'length') return Reflect.getOwnPropertyDescriptor(array, key)
        virtualIndexDescriptorCalls++
        return { configurable: true, enumerable: true, writable: true, value: { itemCode: '10', quantityHundredths: 1 } }
      }
    })

    const result = preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines }) as never)

    expect(result).toMatchObject({ baselineReady: false, completeCandidatePremiseCodes: [], excludedByReason: {} })
    expect(ownKeysCalls).toBe(0)
    expect(virtualIndexDescriptorCalls).toBe(0)
  })

  it('rejects a dense array whose captured length disagrees with its exact key set', () => {
    const target = new Array(2)
    Object.defineProperty(target, '0', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { itemCode: '10', quantityHundredths: 100 }
    })
    Object.defineProperty(target, '1', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { itemCode: '10', quantityHundredths: 100 }
    })
    let lengthDescriptorCalls = 0
    let ownKeysCalls = 0
    let getCalls = 0
    const lines = new Proxy(target, {
      ownKeys: array => { ownKeysCalls++; return Reflect.ownKeys(array) },
      getOwnPropertyDescriptor: (array, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(array, key)
        if (key === 'length' && ++lengthDescriptorCalls === 1) return { ...descriptor!, value: 1 }
        return descriptor
      },
      get: () => { getCalls++; throw new Error('must not be read') }
    })

    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines }) as never)).toMatchObject({
      baselineReady: false,
      completeCandidatePremiseCodes: [],
      excludedByReason: {}
    })
    expect(lengthDescriptorCalls).toBe(1)
    expect(ownKeysCalls).toBe(1)
    expect(getCalls).toBe(0)
  })

  it('accepts the maximum raw-line count that can satisfy the snapshot basket rules', () => {
    const lines = Array.from({ length: 9_900 }, () => ({ itemCode: '10', quantityHundredths: 1 }))

    expect(preflightBasketDiscovery(makeSnapshot(), discoveryPreflightInput({ lines }) as never)).toMatchObject({
      baselineReady: true,
      completeCandidatePremiseCodes: ['2']
    })
  })
})
