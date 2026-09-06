import { formatDisplayDate } from './payroll'
import type { LeaveAmendment, LeaveRequest } from './domain'

export function formatRequestDates(start: string, end: string) {
  const startLabel = formatDisplayDate(start)
  if (start === end) return startLabel
  return `${startLabel} – ${formatDisplayDate(end)}`
}

export function formatRequestDuration(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

export function buildLeaveRequestFields(
  start: string,
  end: string,
  days: number,
  note: string,
): Pick<LeaveRequest, 'start' | 'end' | 'dates' | 'duration' | 'note'> {
  return {
    start,
    end,
    dates: formatRequestDates(start, end),
    duration: formatRequestDuration(days),
    note,
  }
}

export function buildLeaveAmendment(
  start: string,
  end: string,
  days: number,
  note: string,
): LeaveAmendment {
  return {
    start,
    end,
    dates: formatRequestDates(start, end),
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
