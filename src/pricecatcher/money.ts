const assertSafeInteger = (value: number, message: string): void => {
  if (!Number.isSafeInteger(value)) throw new RangeError(message)
}

const assertNonnegativeSafeInteger = (value: number, message: string): void => {
  assertSafeInteger(value, message)
  if (value < 0) throw new RangeError(message)
}

export function bigIntToSafeNumber(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new RangeError('result exceeds safe integer range')
  return number
}

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator <= 0) {
    throw new RangeError('non-negative safe integer numerator and positive denominator required')
  }
  return bigIntToSafeNumber(
    (BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)
  )
}

export function multiplyDivideHalfUp(left: number, right: number, denominator: number): number {
  if (![left, right, denominator].every(Number.isSafeInteger) || left < 0 || right < 0 || denominator <= 0) {
    throw new RangeError('non-negative safe integers and a positive denominator required')
  }
  const product = BigInt(left) * BigInt(right)
  return bigIntToSafeNumber((product + BigInt(Math.floor(denominator / 2))) / BigInt(denominator))
}

export function checkedAdd(left: number, right: number): number {
  assertSafeInteger(left, 'safe integers required')
  assertSafeInteger(right, 'safe integers required')
  return bigIntToSafeNumber(BigInt(left) + BigInt(right))
}

export function checkedSubtract(left: number, right: number): number {
  assertSafeInteger(left, 'safe integers required')
  assertSafeInteger(right, 'safe integers required')
  return bigIntToSafeNumber(BigInt(left) - BigInt(right))
}

export function checkedSum(values: readonly number[]): number {
  return bigIntToSafeNumber(values.reduce((total, value) => {
    assertSafeInteger(value, 'safe integers required')
    return total + BigInt(value)
  }, 0n))
}

export function parsePriceSen(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value)
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  const whole = BigInt(match[1])
  const fractional = BigInt((match[2] ?? '').padEnd(2, '0'))
  const price = whole * 100n + fractional
  if (price <= 0n) return null
  try {
    return bigIntToSafeNumber(price)
  } catch {
    return null
  }
}

export function lineTotalSen(priceSen: number, quantityHundredths: number): number {
  return multiplyDivideHalfUp(priceSen, quantityHundredths, 100)
}

export function unitAllowanceSen(priceSen: number): number {
  assertNonnegativeSafeInteger(priceSen, 'non-negative safe integer price required')
  return Math.max(20, bigIntToSafeNumber((BigInt(priceSen) * 2n + 99n) / 100n))
}

export function lineAllowanceSen(priceSen: number, quantityHundredths: number): number {
  assertNonnegativeSafeInteger(quantityHundredths, 'non-negative safe integer quantity required')
  return bigIntToSafeNumber((BigInt(unitAllowanceSen(priceSen)) * BigInt(quantityHundredths) + 99n) / 100n)
}
