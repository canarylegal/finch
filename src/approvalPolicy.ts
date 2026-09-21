import type { Account } from './auth'
import type { CompanySettings } from './domain'

/** True when the actor’s linked employee is the subject of the request/claim. */
export function isReviewingOwnEmployeeRecord(
  actorEmployeeId: number | null | undefined,
  subjectEmployeeId: number | null | undefined,
) {
  return (
    actorEmployeeId != null &&
    subjectEmployeeId != null &&
    actorEmployeeId === subjectEmployeeId
  )
}

/**
 * Whether an admin may approve/decline a leave or expense for the given employee.
 * Primary admins may always review their own. Non-primary admins may only when
 * company.adminsCanApproveOwnRequests is enabled.
 */
export function canAdminReviewSubject({
  actor,
  subjectEmployeeId,
  company,
}: {
  actor: Pick<Account, 'role' | 'isPrimary' | 'employeeId'>
  subjectEmployeeId: number | null | undefined
  company: Pick<CompanySettings, 'adminsCanApproveOwnRequests'>
}) {
  if (actor.role !== 'admin') return false
  if (!isReviewingOwnEmployeeRecord(actor.employeeId, subjectEmployeeId)) return true
  if (actor.isPrimary) return true
  return Boolean(company.adminsCanApproveOwnRequests)
}

export const OWN_REQUEST_REVIEW_BLOCKED_MESSAGE =
  'You can’t approve or decline your own requests. Ask another admin, or ask the primary admin to allow this in Settings.'
