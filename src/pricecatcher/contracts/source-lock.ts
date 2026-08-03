import { z } from 'zod'
import { LocalDateSchema } from './common'
import { SourceManifestV1Schema } from './snapshot'

const TransactionSourceV1Schema = z.object({
  role: z.literal('transactions'), yearMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  manifest: SourceManifestV1Schema
}).strict()
const PremiseLookupSourceV1Schema = z.object({
  role: z.literal('premise-lookup'), manifest: SourceManifestV1Schema
}).strict()
const ItemLookupSourceV1Schema = z.object({
  role: z.literal('item-lookup'), manifest: SourceManifestV1Schema
}).strict()

const addDays = (value: string, offset: number): string => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`
}

const calendarMonths = (start: string, end: string): string[] => {
  const months: string[] = []
  let [year, month] = start.slice(0, 7).split('-').map(Number)
  const final = end.slice(0, 7)
  while (`${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}` <= final) {
    months.push(`${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`)
    month += 1
    if (month === 13) { month = 1; year += 1 }
  }
  return months
}

const officialUrls = {
  premise: 'https://storage.data.gov.my/pricecatcher/lookup_premise.csv',
  item: 'https://storage.data.gov.my/pricecatcher/lookup_item.csv',
  transaction: (yearMonth: string) => `https://storage.data.gov.my/pricecatcher/pricecatcher_${yearMonth}.csv`
}

const SourceLockV1Shape = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.enum(['official', 'synthetic-fixture']),
  throughDate: LocalDateSchema,
  analysisStartDate: LocalDateSchema,
  window: z.enum(['public', 'feasibility']),
  sources: z.array(z.discriminatedUnion('role', [
    TransactionSourceV1Schema, PremiseLookupSourceV1Schema, ItemLookupSourceV1Schema
  ])).min(3)
}).strict()

const validateSourceLock = (value: z.infer<typeof SourceLockV1Shape>, context: z.RefinementCtx, extended: boolean) => {
  const transactions = value.sources.filter((source): source is z.infer<typeof TransactionSourceV1Schema> => source.role === 'transactions')
  const premiseLookups = value.sources.filter(source => source.role === 'premise-lookup')
  const itemLookups = value.sources.filter(source => source.role === 'item-lookup')
  const expectedMonths = calendarMonths(value.analysisStartDate, value.throughDate)
  const months = transactions.map(source => source.yearMonth)
  if (premiseLookups.length !== 1 || itemLookups.length !== 1 || new Set(months).size !== months.length || months.length !== expectedMonths.length || months.some(month => !expectedMonths.includes(month))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'source lock roles and transaction months must exactly cover the locked period' })
  }
  if (value.window === 'public' && value.analysisStartDate !== addDays(value.throughDate, -31)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['analysisStartDate'], message: 'public lock starts exactly 31 days before through date' })
  }
  if (value.window === 'feasibility' && (extended ? value.analysisStartDate > addDays(value.throughDate, -59) : value.analysisStartDate !== addDays(value.throughDate, -59))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['analysisStartDate'], message: extended ? 'extended feasibility lock starts no later than 59 days before through date' : 'bootstrap feasibility lock starts exactly 59 days before through date' })
  }
  for (const source of value.sources) {
    if (value.sourceKind === 'official') {
      const expected = source.role === 'transactions' ? officialUrls.transaction(source.yearMonth) : source.role === 'premise-lookup' ? officialUrls.premise : officialUrls.item
      if (source.manifest.url !== expected) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'official source URL does not match its role' })
    }
    if (value.sourceKind === 'synthetic-fixture') {
      if (!/^https:\/\/[a-z0-9.-]+\.test(?:[:/]|$)/i.test(source.manifest.url)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'fixture sources must use HTTPS .test URLs' })
      }
    }
  }
}

export const SourceLockV1Schema = SourceLockV1Shape.superRefine((value, context) => validateSourceLock(value, context, false))
export const ExtendedSourceLockV1Schema = SourceLockV1Shape.superRefine((value, context) => {
  if (value.window !== 'feasibility') context.addIssue({ code: z.ZodIssueCode.custom, path: ['window'], message: 'only feasibility locks may be extended' })
  validateSourceLock(value, context, true)
})

export const canonicalizeSourceLockV1 = (value: z.input<typeof SourceLockV1Schema>): z.infer<typeof SourceLockV1Schema> => {
  const lock = SourceLockV1Schema.parse(value)
  return {
    ...lock,
    sources: [...lock.sources].sort((left, right) => {
      const rank = (source: typeof left): number => source.role === 'transactions' ? 0 : source.role === 'premise-lookup' ? 1 : 2
      const rankDifference = rank(left) - rank(right)
      if (rankDifference !== 0) return rankDifference
      return left.role === 'transactions' && right.role === 'transactions' ? left.yearMonth.localeCompare(right.yearMonth) : 0
    })
  }
}

export const canonicalizeExtendedSourceLockV1 = (value: z.input<typeof ExtendedSourceLockV1Schema>): z.infer<typeof ExtendedSourceLockV1Schema> => {
  const lock = ExtendedSourceLockV1Schema.parse(value)
  return { ...lock, sources: [...lock.sources].sort((left, right) => {
    const rank = (source: typeof left): number => source.role === 'transactions' ? 0 : source.role === 'premise-lookup' ? 1 : 2
    const rankDifference = rank(left) - rank(right)
    return rankDifference !== 0 ? rankDifference : left.role === 'transactions' && right.role === 'transactions' ? left.yearMonth.localeCompare(right.yearMonth) : 0
  }) }
}

export type SourceLockV1 = z.infer<typeof SourceLockV1Schema>
