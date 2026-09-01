import { formatDisplayDate, parseIsoDate, type AbsenceRecord } from './payroll'
import { toIsoDate } from './calendarUtils'
import type { LeaveYearPeriod } from './leaveYear'

type LeaveRequest = {
  id: number
  name: string
  dates: string
  duration: string
  status: 'Pending' | 'Approved' | 'Declined'
  start?: string
  end?: string
}

export function upcomingApprovedLeave(
  employeeId: number,
  absences: AbsenceRecord[],
  today: Date,
) {
  const todayIso = toIsoDate(today)
  return absences
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        record.type === 'annual_leave' &&
        record.end >= todayIso,
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3)
}

export function employeeRequestsSorted(requests: LeaveRequest[], employeeName: string) {
  return requests
    .filter((request) => request.name === employeeName)
    .sort((a, b) => {
      const aKey = a.start ?? a.dates
      const bKey = b.start ?? b.dates
      return bKey.localeCompare(aKey)
    })
}

export function formatTimelineDate(iso: string) {
  const date = parseIsoDate(iso)
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    label: formatDisplayDate(iso),
  }
}

export function formatAbsenceRange(start: string, end: string) {
  if (start === end) return formatDisplayDate(start)
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`
}

export function leaveYearResetItem(leaveYear: LeaveYearPeriod) {
  const end = parseIsoDate(leaveYear.end)
  const nextStart = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
  return formatTimelineDate(toIsoDate(nextStart))
}
