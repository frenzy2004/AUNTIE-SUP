export const MAX_REQUEST_COPY_VALUES = 100_000

export interface RequestCopyBudget {
  remaining: number
}

export const createRequestCopyBudget = (): RequestCopyBudget => ({ remaining: MAX_REQUEST_COPY_VALUES })

export const reserveRequestCopyValues = (budget: RequestCopyBudget, count: number): boolean => {
  if (!Number.isSafeInteger(count) || count < 0 || count > budget.remaining) return false
  budget.remaining -= count
  return true
}
