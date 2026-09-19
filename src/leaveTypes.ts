import type { AbsenceType } from './payroll'

export type LeaveRequestType = 'annual' | 'unpaid' | 'other'

export const LEAVE_REQUEST_TYPE_LABELS: Record<LeaveRequestType, string> = {
  annual: 'Annual leave',
  unpaid: 'Unpaid leave',
  other: 'Other',
}

export function leaveRequestTypeFromLabel(label: string): LeaveRequestType {
  if (label === 'Unpaid leave') return 'unpaid'
  if (label === 'Other') return 'other'
  return 'annual'
}

export function leaveRequestTypeLabel(type: LeaveRequestType | undefined) {
  return LEAVE_REQUEST_TYPE_LABELS[type ?? 'annual']
}

export function isAnnualLeaveRequest(request: {
  leaveType?: LeaveRequestType
  source?: 'mandatory'
}) {
  if (request.source === 'mandatory') return true
  return (request.leaveType ?? 'annual') === 'annual'
}

export function absenceTypeForLeaveRequest(type: LeaveRequestType | undefined): AbsenceType {
  switch (type) {
    case 'unpaid':
      return 'unpaid_leave'
    case 'other':
      return 'other_leave'
    default:
      return 'annual_leave'
  }
}

export function leaveRequestTypeFromAbsenceType(type: AbsenceType): LeaveRequestType | null {
  switch (type) {
    case 'annual_leave':
      return 'annual'
    case 'unpaid_leave':
      return 'unpaid'
    case 'other_leave':
      return 'other'
    default:
      return null
  }
}
