import type { LeaveYearPeriod } from './leaveYear'

export type LeaveAdjustmentDirection = 'credit' | 'debit'

export type LeaveAdjustment = {
  id: number
  employeeId: number
  /** Leave year period start (ISO), e.g. 2026-01-01 */
  leaveYearKey: string
  direction: LeaveAdjustmentDirection
  /** Always positive; direction decides credit vs debit */
  amount: number
  reason: string
  /** Optional date the make-up work or correction applies to */
  effectiveDate?: string
  recordedBy: string
  recordedAt: string
}

export const ADJUSTMENT_REASON_PRESETS = [
  'Worked extra day to offset leave',
  'Opening balance from previous leave year',
  'Manual correction',
  'Other',
] as const

export function nextLeaveAdjustmentId(adjustments: LeaveAdjustment[]) {
  return Math.max(0, ...adjustments.map((item) => item.id)) + 1
}

export function adjustmentsForEmployeeYear(
  adjustments: LeaveAdjustment[],
  employeeId: number,
  period: LeaveYearPeriod,
) {
  const key = period.start
  return adjustments
    .filter((item) => item.employeeId === employeeId && item.leaveYearKey === key)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id - a.id)
}

export function leaveAdjustmentNet(
  adjustments: LeaveAdjustment[],
  employeeId: number,
  period: LeaveYearPeriod,
) {
  return adjustmentsForEmployeeYear(adjustments, employeeId, period).reduce(
    (total, item) => total + (item.direction === 'credit' ? item.amount : -item.amount),
    0,
  )
}

export function formatAdjustmentSigned(amount: number, unit: string) {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  return `${sign}${Math.abs(rounded)} ${unit}`
}
