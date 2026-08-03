import { CanonicalCodeSchema } from './contracts/common'

export function canonicalizeCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^\d+(?:\.0+)?$/.test(text)) return null
  const integerText = text.replace(/\.0+$/, '').replace(/^0+(?=\d)/, '')
  const numeric = Number(integerText)
  return Number.isSafeInteger(numeric) && numeric >= 0 ? String(numeric) : null
}

export function compareCanonicalCodes(left: string, right: string): number {
  const leftParsed = CanonicalCodeSchema.parse(left)
  const rightParsed = CanonicalCodeSchema.parse(right)
  const a = BigInt(leftParsed)
  const b = BigInt(rightParsed)
  return a < b ? -1 : a > b ? 1 : 0
}
