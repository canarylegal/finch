import { formatDisplayDate } from './payroll'
import type { DayHalf, LeaveAmendment, LeaveRequest } from './domain'
import { dayHalfLabel } from './leaveDays'

export function formatRequestDates(
  start: string,
  end: string,
  startHalf: DayHalf = 'full',
  endHalf: DayHalf = 'full',
) {
  const startSuffix = dayHalfLabel(startHalf)
  const startLabel = startSuffix
    ? `${formatDisplayDate(start)} (${startSuffix})`
    : formatDisplayDate(start)
  if (start === end) return startLabel
  const endSuffix = dayHalfLabel(endHalf)
  const endLabel = endSuffix
    ? `${formatDisplayDate(end)} (${endSuffix})`
    : formatDisplayDate(end)
  return `${startLabel} – ${endLabel}`
}

export function formatRequestDuration(days: number) {
  const rounded = Number.isInteger(days) ? days : Math.round(days * 10) / 10
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`
}

export function buildLeaveRequestFields(
  start: string,
  end: string,
  days: number,
  note: string,
  startHalf: DayHalf = 'full',
  endHalf: DayHalf = 'full',
): Pick<LeaveRequest, 'start' | 'end' | 'dates' | 'duration' | 'note' | 'startHalf' | 'endHalf'> {
  return {
    start,
    end,
    startHalf,
    endHalf,
    dates: formatRequestDates(start, end, startHalf, endHalf),
    duration: formatRequestDuration(days),
    note,
  }
}

export function buildLeaveAmendment(
  start: string,
  end: string,
  days: number,
  note: string,
  startHalf: DayHalf = 'full',
  endHalf: DayHalf = 'full',
): LeaveAmendment {
  return {
    start,
    end,
    startHalf,
    endHalf,
    dates: formatRequestDates(start, end, startHalf, endHalf),
    duration: formatRequestDuration(days),
    note,
    requestedAt: new Date().toISOString(),
  }
}

export function canDirectlyAmend(request: LeaveRequest) {
  return request.status === 'Pending'
}

export function canProposeAmendment(request: LeaveRequest) {
  return request.status === 'Approved' && !request.pendingAmendment
}

export function canCancelApprovedLeave(request: LeaveRequest) {
  return request.status === 'Approved'
}

export function hasPendingAmendment(request: LeaveRequest) {
  return Boolean(request.pendingAmendment)
}

export function requestDisplayDates(request: LeaveRequest) {
  if (request.pendingAmendment) {
    return {
      current: request.dates,
      proposed: request.pendingAmendment.dates,
    }
  }
  return { current: request.dates, proposed: null as string | null }
}
