import { Check, Clock3, MessageCircle, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  companyEntitlementSettings,
  type CompanySettings,
  type Employee,
  type LeaveRequest,
  type PortalMessage,
} from '../domain'
import { hasPendingAmendment } from '../leaveRequestHelpers'
import { formatLeaveYearLabel, requestInLeaveYear, type LeaveYearPeriod } from '../leaveYear'
import {
  annualLeaveTaken,
  bookableEntitlement,
  effectiveEntitlement,
  remainingAnnualLeave,
  totalLeaveAllowance,
} from '../leaveBalance'
import {
  formatAdjustmentSigned,
  leaveAdjustmentNet,
  type LeaveAdjustment,
} from '../leaveAdjustments'
import { LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE } from '../mandatoryLeave'
import { leaveRequestTypeLabel } from '../leaveTypes'
import { messagesForRequest } from '../portalMessages'
import type { AbsenceRecord, BankHoliday } from '../payroll'

type MyLeavePageProps = {
  employee?: Employee
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  portalMessages: PortalMessage[]
  adjustments: LeaveAdjustment[]
  onRequestLeave: () => void
  onOpenRequest: (requestId: number) => void
}

export function MyLeavePage({
  employee,
  absences,
  requests,
  company,
  bankHolidays,
  leaveYear,
  portalMessages,
  adjustments,
  onRequestLeave,
  onOpenRequest,
}: MyLeavePageProps) {
  const entitlementSettings = companyEntitlementSettings(company)
  const leaveReady = company.leaveYearConfigured
  const taken = employee
    ? annualLeaveTaken(absences, employee.id, employee.workingDays, leaveYear)
    : 0
  const adjustmentNet = employee ? leaveAdjustmentNet(adjustments, employee.id, leaveYear) : 0
  const remaining = employee
    ? remainingAnnualLeave(
        employee,
        entitlementSettings,
        bankHolidays,
        absences,
        requests,
        leaveYear,
        0,
        undefined,
        adjustments,
      )
    : 0
  const allowance = employee ? bookableEntitlement(employee, entitlementSettings, bankHolidays) : 0
  const totalEntitlement = employee
    ? totalLeaveAllowance(employee, entitlementSettings, bankHolidays)
    : 0
  const employeeRequests = employee
    ? requests
        .filter(
          (request) =>
            request.employeeId === employee.id && requestInLeaveYear(request.start, leaveYear),
        )
        .sort((a, b) => (b.start ?? b.dates).localeCompare(a.start ?? a.dates))
    : []

  const requestLeave = () => {
    if (!leaveReady) {
      // Parent may also guard; keep a clear empty-state path.
      return
    }
    onRequestLeave()
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your time away"
        title="My leave"
        description="Plan ahead, amend requests, and message your employer about time off."
        action={
          <button
            type="button"
            className="button button-primary"
            disabled={!leaveReady}
            onClick={requestLeave}
          >
            <Plus size={17} />
            Request time off
          </button>
        }
      />
      {!leaveReady ? (
        <div className="card full-panel">
          <div className="empty-state">
            <strong>Leave isn’t set up yet</strong>
            <span>{LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE}</span>
          </div>
        </div>
      ) : (
      <div className="card full-panel">
        <div className="leave-summary-row">
          <div>
            <span className="card-label">{formatLeaveYearLabel(leaveYear)} entitlement</span>
            <div className="summary-number">
              {totalEntitlement} <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
            {employee?.entitlementMode === 'proRata' && (
              <p className="field-helper inline-helper">
                {allowance} pro-rated
                {employee.rollOver > 0 ? ` + ${employee.rollOver} roll-over` : ''}
                {company.entitlementIncludesBankHolidays ? ' bookable days' : ''}
              </p>
            )}
            {company.entitlementIncludesBankHolidays && employee && (
              <p className="field-helper inline-helper">
                {effectiveEntitlement(employee, entitlementSettings)} {employee.entitlementUnit}{' '}
                incl. bank holidays
              </p>
            )}
          </div>
          <div>
            <span className="card-label">Taken</span>
            <div className="summary-number">
              {taken} <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
          </div>
          <div>
            <span className="card-label">Remaining</span>
            <div className={`summary-number coral-number ${remaining < 0 ? 'negative-number' : ''}`}>
              {employee ? (Number.isInteger(remaining) ? remaining : Math.round(remaining * 10) / 10) : '—'}{' '}
              <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
            {adjustmentNet !== 0 && employee && (
              <p className="field-helper inline-helper">
                Includes {formatAdjustmentSigned(adjustmentNet, employee.entitlementUnit)}{' '}
                adjustments
              </p>
            )}
          </div>
        </div>
        <div className="section-heading leave-history-heading">
          <div>
            <h2>Leave history</h2>
            <p>Requests in {formatLeaveYearLabel(leaveYear)} — open one to message or amend</p>
          </div>
        </div>
        {employeeRequests.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No leave requests yet</strong>
            <span>Requests you submit this leave year will appear here.</span>
          </div>
        ) : (
          employeeRequests.map((request) => {
            const messageCount = messagesForRequest(portalMessages, request.id).length
            return (
              <button
                type="button"
                className="request-row leave-history-row request-row-button"
                key={request.id}
                onClick={() => onOpenRequest(request.id)}
              >
                <div
                  className={`request-icon ${
                    request.status === 'Pending'
                      ? 'request-icon-pending'
                      : request.status === 'Approved'
                        ? 'request-icon-approved'
                        : request.status === 'Cancelled'
                          ? 'request-icon-cancelled'
                          : 'request-icon-declined'
                  }`}
                >
                  {request.status === 'Pending' ? (
                    <Clock3 size={16} />
                  ) : request.status === 'Approved' ? (
                    <Check size={16} />
                  ) : (
                    <X size={16} />
                  )}
                </div>
                <div className="request-copy">
                  <strong>{request.dates}</strong>
                  <span>
                    {leaveRequestTypeLabel(request.leaveType)} · {request.duration}
                    {hasPendingAmendment(request) ? ' · Change pending approval' : ''}
                  </span>
                </div>
                <span className="request-message-count">
                  <MessageCircle size={14} />
                  {messageCount}
                </span>
                <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
              </button>
            )
          })
        )}
      </div>
      )}
    </div>
  )
}
