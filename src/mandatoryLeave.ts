import { APP_TODAY, type CompanySettings, type Employee, type LeaveRequest } from './domain'
import { buildLeaveRequestFields } from './leaveRequestHelpers'
import type { LeaveYearPeriod } from './leaveYear'
import { countWorkingDaysInRange, parseIsoDate, toIsoDate, type AbsenceRecord } from './payroll'

export type MandatoryLeaveRange = {
  id: number
  start: string
  end: string
  label?: string
}

export type MandatoryLeaveConfirmation = {
  /** Leave year period start (ISO), e.g. 2026-01-01 */
  leaveYearKey: string
  noneThisYear: boolean
  ranges: MandatoryLeaveRange[]
  confirmedAt: string
}

export const LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE =
  'Leave isn’t available yet. Please contact an admin.'

export function leaveYearKey(period: LeaveYearPeriod) {
  return period.start
}

export function nextMandatoryRangeId(ranges: MandatoryLeaveRange[]) {
  return Math.max(0, ...ranges.map((range) => range.id)) + 1
}

export function confirmationForLeaveYear(
  confirmations: MandatoryLeaveConfirmation[],
  period: LeaveYearPeriod,
) {
  return confirmations.find((item) => item.leaveYearKey === leaveYearKey(period))
}

/** Compare booking-relevant fields only (ignore confirmedAt timestamps). */
export function mandatoryBookingSignature(
  confirmation: MandatoryLeaveConfirmation | undefined | null,
) {
  if (!confirmation) return null
  return JSON.stringify({
    leaveYearKey: confirmation.leaveYearKey,
    noneThisYear: confirmation.noneThisYear,
    ranges: confirmation.ranges.map((range) => ({
      id: range.id,
      start: range.start,
      end: range.end,
      label: range.label ?? '',
    })),
  })
}

export function needsMandatoryLeavePrompt(company: CompanySettings, period: LeaveYearPeriod) {
  if (!company.leaveYearConfigured) return false
  return !confirmationForLeaveYear(company.mandatoryLeaveConfirmations, period)
}

export function formatMandatoryRangeLabel(range: MandatoryLeaveRange) {
  if (range.label?.trim()) return range.label.trim()
  const start = parseIsoDate(range.start).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
  const end = parseIsoDate(range.end).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  if (range.start === range.end) return end
  return `${start} – ${end}`
}

export function upsertMandatoryConfirmation(
  confirmations: MandatoryLeaveConfirmation[],
  next: MandatoryLeaveConfirmation,
) {
  const without = confirmations.filter((item) => item.leaveYearKey !== next.leaveYearKey)
  return [...without, next]
}

export function isMandatoryLeaveRequest(request: LeaveRequest, yearKey?: string) {
  if (request.source !== 'mandatory') return false
  if (!yearKey) return true
  return request.mandatoryYearKey === yearKey
}

export function mandatoryBookingNote(range: MandatoryLeaveRange) {
  return `Mandatory leave · ${formatMandatoryRangeLabel(range)}`
}

type BookingBuildArgs = {
  employees: Employee[]
  confirmation: MandatoryLeaveConfirmation
  existingRequests: LeaveRequest[]
  existingAbsences: AbsenceRecord[]
  recordedBy: string
}

/**
 * Cancel prior mandatory bookings for this leave year, then create approved
 * leave + absences for each active employee and date range (if they have working days).
 */
export function applyMandatoryLeaveBookings({
  employees,
  confirmation,
  existingRequests,
  existingAbsences,
  recordedBy,
}: BookingBuildArgs): { requests: LeaveRequest[]; absences: AbsenceRecord[] } {
  const yearKey = confirmation.leaveYearKey
  const recordedAt = toIsoDate(APP_TODAY)

  let nextAbsenceId = Math.max(0, ...existingAbsences.map((item) => item.id)) + 1
  let nextRequestId = Math.max(0, ...existingRequests.map((item) => item.id)) + 1

  const requests: LeaveRequest[] = existingRequests.map((request) => {
    if (!isMandatoryLeaveRequest(request, yearKey) || request.status !== 'Approved') {
      return request
    }
    return {
      ...request,
      status: 'Cancelled' as const,
      absenceId: undefined,
      pendingAmendment: undefined,
    }
  })

  const cancelledAbsenceIds = new Set(
    existingRequests
      .filter(
        (request) =>
          isMandatoryLeaveRequest(request, yearKey) &&
          request.status === 'Approved' &&
          request.absenceId != null,
      )
      .map((request) => request.absenceId!),
  )

  let absences = existingAbsences.filter((absence) => !cancelledAbsenceIds.has(absence.id))

  if (confirmation.noneThisYear) {
    return { requests, absences }
  }

  const activeEmployees = employees.filter((employee) => employee.status === 'Active')

  for (const range of confirmation.ranges) {
    if (!range.start || !range.end || range.start > range.end) continue
    const note = mandatoryBookingNote(range)

    for (const employee of activeEmployees) {
      const days = countWorkingDaysInRange(range.start, range.end, employee.workingDays)
      if (days <= 0) continue

      const absenceId = nextAbsenceId
      nextAbsenceId += 1
      absences = [
        ...absences,
        {
          id: absenceId,
          employeeId: employee.id,
          type: 'annual_leave',
          start: range.start,
          end: range.end,
          amount: days,
          note,
          recordedBy,
          recordedAt,
          origin: 'request',
        },
      ]

      const requestId = nextRequestId
      nextRequestId += 1
      requests.push({
        id: requestId,
        employeeId: employee.id,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        ...buildLeaveRequestFields(range.start, range.end, days, note),
        status: 'Approved',
        leaveType: 'annual',
        absenceId,
        source: 'mandatory',
        mandatoryYearKey: yearKey,
      })
    }
  }

  return { requests, absences }
}
