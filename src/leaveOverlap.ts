import type { LeaveRequest } from './domain'
import type { AbsenceRecord } from './payroll'

export function dateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aEnd >= bStart && aStart <= bEnd
}

export type LeaveConflict = {
  kind: 'absence' | 'request'
  id: number
  label: string
  start: string
  end: string
  status?: string
}

/**
 * Find Pending/Approved leave requests or absences that overlap the proposed range.
 */
export function findLeaveConflicts({
  employeeId,
  start,
  end,
  absences,
  requests,
  excludeRequestId,
  excludeAbsenceId,
}: {
  employeeId: number
  start: string
  end: string
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  excludeRequestId?: number
  excludeAbsenceId?: number
}): LeaveConflict[] {
  const conflicts: LeaveConflict[] = []
  const linkedAbsenceIds = new Set(
    requests
      .filter((request) => request.absenceId != null)
      .map((request) => request.absenceId as number),
  )

  for (const request of requests) {
    if (request.employeeId !== employeeId) continue
    if (request.id === excludeRequestId) continue
    if (request.status !== 'Pending' && request.status !== 'Approved') continue
    if (!request.start || !request.end) continue
    if (!dateRangesOverlap(start, end, request.start, request.end)) continue
    conflicts.push({
      kind: 'request',
      id: request.id,
      label: `${request.status} ${request.dates}`,
      start: request.start,
      end: request.end,
      status: request.status,
    })
  }

  for (const absence of absences) {
    if (absence.employeeId !== employeeId) continue
    if (absence.id === excludeAbsenceId) continue
    // Skip absences already represented by a request conflict above
    if (linkedAbsenceIds.has(absence.id)) continue
    if (!dateRangesOverlap(start, end, absence.start, absence.end)) continue
    conflicts.push({
      kind: 'absence',
      id: absence.id,
      label: `Recorded absence ${absence.start}${absence.end !== absence.start ? ` – ${absence.end}` : ''}`,
      start: absence.start,
      end: absence.end,
    })
  }

  return conflicts
}

export function overlapWarningMessage(conflicts: LeaveConflict[]) {
  if (conflicts.length === 0) return ''
  const sample = conflicts
    .slice(0, 2)
    .map((item) => item.label)
    .join('; ')
  const more = conflicts.length > 2 ? ` (+${conflicts.length - 2} more)` : ''
  return `These dates overlap existing leave (${sample}${more}). Continue anyway?`
}
