import { parseIsoDate, toIsoDate, type AbsenceRecord } from './payroll'

export type LeaveYearPeriod = {
  start: string
  end: string
}

const MONTH_INDEX: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

export function getLeaveYearPeriod(
  referenceDate: Date,
  startMonthName: string,
  endMonthName: string,
): LeaveYearPeriod {
  const startMonth = MONTH_INDEX[startMonthName] ?? 0
  const endMonth = MONTH_INDEX[endMonthName] ?? 11
  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()

  if (startMonth > endMonth) {
    if (refMonth >= startMonth) {
      return {
        start: toIsoDate(new Date(refYear, startMonth, 1)),
        end: toIsoDate(new Date(refYear + 1, endMonth + 1, 0)),
      }
    }
    return {
      start: toIsoDate(new Date(refYear - 1, startMonth, 1)),
      end: toIsoDate(new Date(refYear, endMonth + 1, 0)),
    }
  }

  return {
    start: toIsoDate(new Date(refYear, startMonth, 1)),
    end: toIsoDate(new Date(refYear, endMonth + 1, 0)),
  }
}

export function formatLeaveYearLabel(period: LeaveYearPeriod) {
  const start = parseIsoDate(period.start).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const end = parseIsoDate(period.end).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${start} – ${end}`
}

export function daysUntilLeaveYearEnd(referenceDate: Date, periodEnd: string) {
  const end = parseIsoDate(periodEnd)
  const startOfToday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const diff = Math.round((end.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

export function recordOverlapsPeriod(start: string, end: string, period: LeaveYearPeriod) {
  return end >= period.start && start <= period.end
}

export function absenceInLeaveYear(record: AbsenceRecord, period: LeaveYearPeriod) {
  return recordOverlapsPeriod(record.start, record.end, period)
}

export function requestInLeaveYear(start: string | undefined, period: LeaveYearPeriod) {
  if (!start) return true
  return start >= period.start && start <= period.end
}
