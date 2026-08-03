import { LocalDateSchema, CanonicalCodeSchema, type LocalDate, type QualityReason } from './contracts/common'
import { addLocalDates } from './dates'
import { compareCanonicalCodes } from './ids'
import { bigIntToSafeNumber } from './money'

const MAX_AUDIT_RAW_PRICE_LENGTH = 64
const REFERENCE_WINDOW_DAYS = 30
const MINIMUM_REFERENCE_PREMISES = 20

export interface NormalizedObservation {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
  priceSen: number
}

export interface InvalidPriceObservation {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
  status: 'invalid-price'
  rawPriceValue: string
}

export type ParsedObservation = NormalizedObservation | InvalidPriceObservation

export type ConsolidatedCell =
  | (Omit<NormalizedObservation, 'priceSen'> & { status: 'value'; priceSen: number })
  | (Omit<NormalizedObservation, 'priceSen'> & {
      status: 'conflicting-duplicate'
      pricesSen: number[]
    })
  | (Omit<InvalidPriceObservation, 'status' | 'rawPriceValue'> & {
      status: 'invalid-price'
      rawPriceValues: string[]
      validPricesSen: number[]
    })

export type ReferenceStats =
  | { status: 'insufficient-reference'; distinctPremises: number }
  | {
      status: 'ready'
      distinctPremises: number
      medianSen: number
      madSen: number
      robustScaleTimes10k: bigint
    }

export type ClassifiedEvidence =
  | { status: 'eligible'; observedDate: LocalDate; priceSen: number }
  | { status: 'anomalous'; observedDate: LocalDate; reason: QualityReason }
  | { status: 'insufficient-reference'; observedDate: LocalDate }

interface ObservationGroup {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
  pricesSen: number[]
  rawPriceValues: string[]
  distinctObservations: Set<string>
  rowCount: number
}

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const compareNumbers = (left: number, right: number): number => left - right

const assertNonnegativeSafeInteger: (value: unknown, message: string) => asserts value is number = (value, message) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new RangeError(message)
}

const assertObservationFields = (observation: {
  observedDate: LocalDate
  premiseCode: string
  itemCode: string
  officialUnit: string
}): void => {
  LocalDateSchema.parse(observation.observedDate)
  CanonicalCodeSchema.parse(observation.premiseCode)
  CanonicalCodeSchema.parse(observation.itemCode)
  if (typeof observation.officialUnit !== 'string') throw new RangeError('official unit must be a string')
}

const boundedRawPrice = (value: unknown): string => {
  if (typeof value !== 'string') throw new RangeError('raw invalid price must be a string')
  return value.slice(0, MAX_AUDIT_RAW_PRICE_LENGTH)
}

const distinctSortedNumbers = (values: readonly number[]): number[] => [...new Set(values)].sort(compareNumbers)

const distinctSortedText = (values: readonly string[]): string[] => [...new Set(values)].sort(compareText)

const compareCells = (left: ConsolidatedCell, right: ConsolidatedCell): number =>
  compareText(left.observedDate, right.observedDate) ||
  compareCanonicalCodes(left.premiseCode, right.premiseCode) ||
  compareCanonicalCodes(left.itemCode, right.itemCode) ||
  compareText(left.officialUnit, right.officialUnit)

const medianHalfUp = (values: readonly number[]): number => {
  if (values.length === 0) throw new RangeError('median requires at least one value')
  const sorted = [...values].sort(compareNumbers)
  const upperIndex = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[upperIndex]!
  return bigIntToSafeNumber((BigInt(sorted[upperIndex - 1]!) + BigInt(sorted[upperIndex]!) + 1n) / 2n)
}

const assertConsolidatedCell = (cell: ConsolidatedCell): void => {
  assertObservationFields(cell)
  if (cell.status === 'value') {
    assertNonnegativeSafeInteger(cell.priceSen, 'priceSen must be a non-negative safe integer')
    return
  }
  if (cell.status === 'conflicting-duplicate') {
    if (!Array.isArray(cell.pricesSen) || cell.pricesSen.length < 2) throw new RangeError('conflicting prices must contain at least two values')
    cell.pricesSen.forEach(priceSen => assertNonnegativeSafeInteger(priceSen, 'priceSen must be a non-negative safe integer'))
    return
  }
  if (cell.status === 'invalid-price') {
    if (!Array.isArray(cell.rawPriceValues) || cell.rawPriceValues.length === 0) throw new RangeError('invalid prices must contain raw values')
    cell.rawPriceValues.forEach(rawPriceValue => {
      if (typeof rawPriceValue !== 'string' || rawPriceValue.length > MAX_AUDIT_RAW_PRICE_LENGTH) {
        throw new RangeError('raw invalid price must be a bounded string')
      }
    })
    if (!Array.isArray(cell.validPricesSen)) throw new RangeError('valid prices must be an array')
    cell.validPricesSen.forEach(priceSen => assertNonnegativeSafeInteger(priceSen, 'priceSen must be a non-negative safe integer'))
    return
  }
  throw new RangeError('unsupported consolidated cell status')
}

export function collapseObservationRows(rows: readonly ParsedObservation[]): {
  cells: ConsolidatedCell[]
  exactDuplicateCount: number
  conflictingCellCount: number
} {
  const groups = new Map<string, ObservationGroup>()

  for (const observation of rows) {
    assertObservationFields(observation)
    const key = JSON.stringify([observation.observedDate, observation.premiseCode, observation.itemCode, observation.officialUnit])
    const group = groups.get(key) ?? {
      observedDate: observation.observedDate,
      premiseCode: observation.premiseCode,
      itemCode: observation.itemCode,
      officialUnit: observation.officialUnit,
      pricesSen: [],
      rawPriceValues: [],
      distinctObservations: new Set<string>(),
      rowCount: 0
    }
    group.rowCount += 1

    if ('status' in observation) {
      const rawPriceValue = boundedRawPrice(observation.rawPriceValue)
      group.rawPriceValues.push(rawPriceValue)
      group.distinctObservations.add(`invalid:${rawPriceValue}`)
    } else {
      assertNonnegativeSafeInteger(observation.priceSen, 'priceSen must be a non-negative safe integer')
      group.pricesSen.push(observation.priceSen)
      group.distinctObservations.add(`value:${observation.priceSen}`)
    }
    groups.set(key, group)
  }

  let exactDuplicateCount = 0
  let conflictingCellCount = 0
  const cells = [...groups.values()].map(group => {
    exactDuplicateCount += group.rowCount - group.distinctObservations.size
    const validPricesSen = distinctSortedNumbers(group.pricesSen)
    if (group.rawPriceValues.length > 0) {
      return {
        observedDate: group.observedDate,
        premiseCode: group.premiseCode,
        itemCode: group.itemCode,
        officialUnit: group.officialUnit,
        status: 'invalid-price' as const,
        rawPriceValues: distinctSortedText(group.rawPriceValues),
        validPricesSen
      }
    }
    if (validPricesSen.length === 1) {
      return {
        observedDate: group.observedDate,
        premiseCode: group.premiseCode,
        itemCode: group.itemCode,
        officialUnit: group.officialUnit,
        status: 'value' as const,
        priceSen: validPricesSen[0]!
      }
    }
    conflictingCellCount += 1
    return {
      observedDate: group.observedDate,
      premiseCode: group.premiseCode,
      itemCode: group.itemCode,
      officialUnit: group.officialUnit,
      status: 'conflicting-duplicate' as const,
      pricesSen: validPricesSen
    }
  })

  return { cells: cells.sort(compareCells), exactDuplicateCount, conflictingCellCount }
}

export function buildReferenceStats(
  rows: readonly ConsolidatedCell[],
  itemCode: string,
  targetDate: LocalDate
): ReferenceStats {
  CanonicalCodeSchema.parse(itemCode)
  const windowStart = addLocalDates(targetDate, -REFERENCE_WINDOW_DAYS)
  const pricesByPremise = new Map<string, number[]>()

  for (const cell of rows) {
    assertConsolidatedCell(cell)
    if (cell.status !== 'value' || cell.itemCode !== itemCode || cell.observedDate < windowStart || cell.observedDate >= targetDate) continue
    const prices = pricesByPremise.get(cell.premiseCode) ?? []
    prices.push(cell.priceSen)
    pricesByPremise.set(cell.premiseCode, prices)
  }

  const perPremiseMedians = [...pricesByPremise.values()].map(medianHalfUp)
  const distinctPremises = perPremiseMedians.length
  if (distinctPremises < MINIMUM_REFERENCE_PREMISES) return { status: 'insufficient-reference', distinctPremises }

  const medianSen = medianHalfUp(perPremiseMedians)
  const madSen = medianHalfUp(perPremiseMedians.map(priceSen => Math.abs(priceSen - medianSen)))
  const twoPercentMedianSen = bigIntToSafeNumber((BigInt(medianSen) * 2n + 99n) / 100n)
  const robustScaleTimes10k = [
    BigInt(madSen) * 14_826n,
    20n * 10_000n,
    BigInt(twoPercentMedianSen) * 10_000n
  ].reduce((largest, value) => value > largest ? value : largest)

  return { status: 'ready', distinctPremises, medianSen, madSen, robustScaleTimes10k }
}

const assertReferenceStats = (stats: ReferenceStats): void => {
  assertNonnegativeSafeInteger(stats.distinctPremises, 'distinct premises must be a non-negative safe integer')
  if (stats.status === 'insufficient-reference') return
  if (stats.status !== 'ready') throw new RangeError('unsupported reference status')
  assertNonnegativeSafeInteger(stats.medianSen, 'medianSen must be a non-negative safe integer')
  assertNonnegativeSafeInteger(stats.madSen, 'madSen must be a non-negative safe integer')
  if (typeof stats.robustScaleTimes10k !== 'bigint' || stats.robustScaleTimes10k < 0n) {
    throw new RangeError('robust scale must be a non-negative bigint')
  }
}

export function classifyTargetCell(cell: ConsolidatedCell, stats: ReferenceStats): ClassifiedEvidence {
  assertConsolidatedCell(cell)
  assertReferenceStats(stats)
  if (cell.status === 'invalid-price') return { status: 'anomalous', observedDate: cell.observedDate, reason: 'invalid-price' }
  if (cell.status === 'conflicting-duplicate') {
    return { status: 'anomalous', observedDate: cell.observedDate, reason: 'conflicting-duplicate' }
  }
  if (stats.status === 'insufficient-reference') return { status: 'insufficient-reference', observedDate: cell.observedDate }

  const price = BigInt(cell.priceSen)
  const median = BigInt(stats.medianSen)
  const outsideRatio = price * 4n <= median || price >= median * 4n
  if (outsideRatio) return { status: 'anomalous', observedDate: cell.observedDate, reason: 'outside-ratio-bound' }

  const robustOutlier = BigInt(Math.abs(cell.priceSen - stats.medianSen)) * 10_000n > 6n * stats.robustScaleTimes10k
  if (robustOutlier) return { status: 'anomalous', observedDate: cell.observedDate, reason: 'robust-scale-outlier' }
  return { status: 'eligible', observedDate: cell.observedDate, priceSen: cell.priceSen }
}
