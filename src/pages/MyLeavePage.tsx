import { useMemo, useState } from 'react'
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
import {
  formatLeaveYearLabel,
  nextLeaveYearPeriod,
  requestInLeaveYear,
  type LeaveYearPeriod,
} from '../leaveYear'
import {
  annualLeaveBooked,
  annualLeaveTaken,
  bookableEntitlement,
  effectiveEntitlement,
  pendingLeaveDays,
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
import { isLeaveYearClosed, type LeaveYearClosure } from '../leaveYearClose'

type MyLeavePageProps = {
  employee?: Employee
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  portalMessages: PortalMessage[]
  adjustments: LeaveAdjustment[]
  closures: LeaveYearClosure[]
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
  closures,
  onRequestLeave,
  onOpenRequest,
}: MyLeavePageProps) {
  const [yearView, setYearView] = useState<'current' | 'next'>('current')
  const nextYear = useMemo(
    () => nextLeaveYearPeriod(leaveYear, company.leaveYearStart, company.leaveYearEnd),
    [leaveYear, company.leaveYearStart, company.leaveYearEnd],
  )
  const viewYear = yearView === 'next' ? nextYear : leaveYear
  const currentYearClosed = isLeaveYearClosed(closures, leaveYear.start)

  const entitlementSettings = companyEntitlementSettings(company)
  const leaveReady = company.leaveYearConfigured
  const taken = employee
    ? annualLeaveTaken(absences, employee.id, employee.workingDays, viewYear)
    : 0
  const booked = employee
    ? annualLeaveBooked(absences, employee.id, employee.workingDays, viewYear)
    : 0
  const pending = employee
    ? pendingLeaveDays(
        requests,
        employee.id,
        viewYear,
        undefined,
        employee.name,
        employee.workingDays,
      )
    : 0
  const adjustmentNet = employee ? leaveAdjustmentNet(adjustments, employee.id, viewYear) : 0
  const available = employee
    ? remainingAnnualLeave(
        employee,
        entitlementSettings,
        bankHolidays,
        absences,
        requests,
        viewYear,
        0,
        undefined,
        adjustments,
      )
    : 0
  const allowance = employee ? bookableEntitlement(employee, entitlementSettings, bankHolidays) : 0
  const totalEntitlement = employee
    ? totalLeaveAllowance(employee, entitlementSettings, bankHolidays)
    : 0

  const formatAmount = (value: number) =>
    Number.isInteger(value) ? value : Math.round(value * 10) / 10
  const employeeRequests = employee
    ? requests
        .filter(
          (request) =>
            request.employeeId === employee.id && requestInLeaveYear(request.start, viewYear),
        )
        .sort((a, b) => (b.start ?? b.dates).localeCompare(a.start ?? a.dates))
    : []

  const requestLeave = () => {
    if (!leaveReady) {
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
          <div className="leave-year-toggle" role="group" aria-label="Leave year">
            <button
              type="button"
              className={`segment-button ${yearView === 'current' ? 'is-active' : ''}`}
              onClick={() => setYearView('current')}
            >
              Current year
            </button>
            <button
              type="button"
              className={`segment-button ${yearView === 'next' ? 'is-active' : ''}`}
              onClick={() => setYearView('next')}
            >
              Next year
            </button>
          </div>
          {yearView === 'next' && !currentYearClosed && (
            <p className="field-helper inline-helper leave-year-carry-note">
              Opening balances from year close are not applied yet — figures exclude carry until
              the current leave year is closed.
            </p>
          )}
          <div className="leave-summary-row leave-summary-row-balance">
            <div>
              <span className="card-label">Taken</span>
              <div className="summary-number">
                {formatAmount(taken)} <span>{employee?.entitlementUnit ?? 'days'}</span>
              </div>
              <p className="field-helper inline-helper">Already used</p>
            </div>
            <div>
              <span className="card-label">Booked</span>
              <div className="summary-number">
                {formatAmount(booked)} <span>{employee?.entitlementUnit ?? 'days'}</span>
              </div>
              <p className="field-helper inline-helper">Approved upcoming</p>
            </div>
            <div>
              <span className="card-label">Pending</span>
              <div className="summary-number">
                {formatAmount(pending)} <span>{employee?.entitlementUnit ?? 'days'}</span>
              </div>
              <p className="field-helper inline-helper">Awaiting approval</p>
            </div>
            <div>
              <span className="card-label">Available</span>
              <div
                className={`summary-number coral-number ${available < 0 ? 'negative-number' : ''}`}
              >
                {employee ? formatAmount(available) : '—'}{' '}
                <span>{employee?.entitlementUnit ?? 'days'}</span>
              </div>
              {employee && (
                <p className="field-helper inline-helper">
                  Of {formatAmount(totalEntitlement)} {employee.entitlementUnit}
                  {adjustmentNet !== 0
                    ? ` · ${formatAdjustmentSigned(adjustmentNet, employee.entitlementUnit)} adj.`
                    : ''}
                </p>
              )}
              {employee?.entitlementMode === 'proRata' && yearView === 'current' && (
                <p className="field-helper inline-helper">
                  {allowance} pro-rated
                  {employee.rollOver > 0 ? ` + ${employee.rollOver} roll-over` : ''}
                  {company.entitlementIncludesBankHolidays ? ' bookable' : ''}
                </p>
              )}
              {company.entitlementIncludesBankHolidays && employee && yearView === 'current' && (
                <p className="field-helper inline-helper">
                  {effectiveEntitlement(employee, entitlementSettings)} {employee.entitlementUnit}{' '}
                  incl. bank holidays
                </p>
              )}
            </div>
          </div>
          <div className="section-heading leave-history-heading">
            <div>
              <h2>Leave history</h2>
              <p>Requests in {formatLeaveYearLabel(viewYear)} — open one to message or amend</p>
            </div>
          </div>
          {employeeRequests.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No leave requests yet</strong>
              <span>Requests in this leave year will appear here.</span>
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
