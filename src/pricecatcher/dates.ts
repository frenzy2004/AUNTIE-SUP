import { ISOInstantSchema, LocalDateSchema, type LocalDate } from './contracts/common'

const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'
const DAY_MILLISECONDS = 86_400_000
const malaysiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MALAYSIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const parseLocalDateAtUtcMidday = (value: LocalDate): Date => {
  const parsed = LocalDateSchema.safeParse(value)
  if (!parsed.success) throw new RangeError('invalid local date')
  const [year, month, day] = parsed.data.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

const formatMalaysiaDate = (date: Date): LocalDate => {
  const fields = Object.fromEntries(malaysiaDateFormatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}` as LocalDate
}

export function malaysiaDateAt(instant: string): LocalDate {
  const parsed = ISOInstantSchema.safeParse(instant)
  if (!parsed.success) throw new RangeError('invalid UTC instant')
  const date = new Date(parsed.data)
  if (Number.isNaN(date.getTime())) throw new RangeError('invalid UTC instant')
  return formatMalaysiaDate(date)
}

export function addLocalDates(date: LocalDate, delta: number): LocalDate {
  if (!Number.isSafeInteger(delta)) throw new RangeError('local date delta must be a safe integer')
  const result = parseLocalDateAtUtcMidday(date)
  result.setUTCDate(result.getUTCDate() + delta)
  return formatMalaysiaDate(result)
}

export function differenceInLocalDates(later: LocalDate, earlier: LocalDate): number {
  const difference = (parseLocalDateAtUtcMidday(later).getTime() - parseLocalDateAtUtcMidday(earlier).getTime()) / DAY_MILLISECONDS
  if (!Number.isSafeInteger(difference)) throw new RangeError('local date difference exceeds safe integer range')
  return difference
}
