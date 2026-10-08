import {
  countWorkingDaysInRange,
  normalizeWorkingDays,
  overlapWorkingDays,
  parseIsoDate,
  toIsoDate,
} from './payroll'
import type { LeaveYearPeriod } from './leaveYear'

/** Half-day portion for the first or last day of a leave span. */
export type DayHalf = 'full' | 'AM' | 'PM'

export function portionDays(half: DayHalf | undefined) {
  if (half === 'AM' || half === 'PM') return 0.5
  return 1
}

export function dayHalfLabel(half: DayHalf | undefined) {
  if (half === 'AM') return 'AM'
  if (half === 'PM') return 'PM'
  return null
}

function isWorkingIso(iso: string, workingDays: number[] | undefined) {
  const pattern = normalizeWorkingDays(workingDays)
  return pattern.includes(parseIsoDate(iso).getDay())
}

/**
 * Working-day length of a leave span, honouring AM/PM on the first and last day.
 * Middle days are always full. Single-day requests use `startHalf` only.
 */
export function countLeaveWorkingDays(
  start: string,
  end: string,
  workingDays?: number[],
  startHalf: DayHalf = 'full',
  endHalf: DayHalf = 'full',
) {
  if (!start || !end || end < start) return 0
  if (start === end) {
    return isWorkingIso(start, workingDays) ? portionDays(startHalf) : 0
  }

  let days = countWorkingDaysInRange(start, end, workingDays)
  if (days <= 0) return 0

  if (isWorkingIso(start, workingDays) && startHalf !== 'full') {
    days -= 0.5
  }
  if (isWorkingIso(end, workingDays) && endHalf !== 'full') {
    days -= 0.5
  }
  return Math.max(0, days)
}

/**
 * Working days of a leave span that fall inside the leave year, with half-day portions.
 * Halves only apply when the first/last calendar day of the request sits inside the year.
 */
export function leaveDaysInLeaveYearWithHalves(
  start: string,
  end: string,
  leaveYear: LeaveYearPeriod,
  workingDays?: number[],
  startHalf: DayHalf = 'full',
  endHalf: DayHalf = 'full',
) {
  const clippedStart = start > leaveYear.start ? start : leaveYear.start
  const clippedEnd = end < leaveYear.end ? end : leaveYear.end
  if (clippedEnd < clippedStart) return 0

  const effectiveStartHalf = clippedStart === start ? startHalf : 'full'
  const effectiveEndHalf = clippedEnd === end ? endHalf : 'full'
  return countLeaveWorkingDays(
    clippedStart,
    clippedEnd,
    workingDays,
    effectiveStartHalf,
    effectiveEndHalf,
  )
}

/** Prefer stored absence amount (supports half-days); otherwise recount working days. */
export function absenceDaysInLeaveYear(
  start: string,
  end: string,
  amount: number | undefined,
  leaveYear: LeaveYearPeriod | undefined,
  workingDays?: number[],
) {
  const pattern = normalizeWorkingDays(workingDays)
  if (!leaveYear) {
    if (typeof amount === 'number' && Number.isFinite(amount)) return amount
    return countWorkingDaysInRange(start, end, pattern)
  }

  const overlap = overlapWorkingDays(start, end, leaveYear.start, leaveYear.end, pattern)
  if (overlap <= 0) return 0

  const full = countWorkingDaysInRange(start, end, pattern)
  if (typeof amount === 'number' && Number.isFinite(amount) && full > 0) {
    if (amount === full) return overlap
    // Pro-rate fractional absences across leave-year boundaries.
    return Math.round(((amount * overlap) / full) * 10) / 10
  }
  return overlap
}

export function formatHalfDayOption(half: DayHalf) {
  switch (half) {
    case 'AM':
      return 'Morning (AM)'
    case 'PM':
      return 'Afternoon (PM)'
    default:
      return 'Full day'
  }
}

/** ISO dates from start through end inclusive (calendar). */
export function eachIsoDate(start: string, end: string) {
  if (!start || !end || end < start) return [] as string[]
  const out: string[] = []
  const cursor = parseIsoDate(start)
  const last = parseIsoDate(end)
  while (cursor <= last) {
    out.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}
