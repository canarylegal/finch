import { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Clock3, Pencil, X } from 'lucide-react'
import { PortalMessageThread } from '../components/PortalMessageThread'
import {
  appToday,
  companyEntitlementSettings,
  type CompanySettings,
  type DayHalf,
  type Employee,
  type LeaveRequest,
  type PortalMessage,
  type RequestStatus,
} from '../domain'
import { countLeaveWorkingDays, formatHalfDayOption } from '../leaveDays'
import {
  canCancelApprovedLeave,
  canDirectlyAmend,
  canProposeAmendment,
  hasPendingAmendment,
  requestDisplayDates,
} from '../leaveRequestHelpers'
import {
  formatBalanceAmount,
  leaveDaysInLeaveYear,
  overAllowanceMessage,
  remainingAnnualLeave,
} from '../leaveBalance'
import type { LeaveAdjustment } from '../leaveAdjustments'
import { type LeaveYearPeriod } from '../leaveYear'
import { isAnnualLeaveRequest } from '../leaveTypes'
import { useModalA11y } from '../hooks/useModalA11y'
import { messagesForRequest } from '../portalMessages'
import { type AbsenceRecord, type BankHoliday } from '../payroll'
import { toIsoDate } from '../calendarUtils'

type AmendPayload = {
  start: string
  end: string
  days: number
  note: string
  startHalf: DayHalf
  endHalf: DayHalf
}

type LeaveRequestDetailModalProps = {
  request: LeaveRequest
  employee: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  leaveYear: LeaveYearPeriod
  portalMessages: PortalMessage[]
  viewer: 'employee' | 'admin'
  adjustments?: LeaveAdjustment[]
  onClose: () => void
  onSendMessage: (body: string) => void
  onDirectAmend: (payload: AmendPayload) => void
  onProposeAmendment: (payload: AmendPayload) => void
  onUpdateRequest: (status: RequestStatus) => void
  onResolveAmendment: (approved: boolean) => void
  onCancelApproved?: () => void
  canReview?: boolean
}

export function LeaveRequestDetailModal({
  request,
  employee,
  company,
  bankHolidays,
  absences,
  requests,
  leaveYear,
  portalMessages,
  viewer,
  adjustments = [],
  onClose,
  onSendMessage,
  onDirectAmend,
  onProposeAmendment,
  onUpdateRequest,
  onResolveAmendment,
  onCancelApproved,
  canReview = true,
}: LeaveRequestDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const defaults = {
    start: request.start ?? toIsoDate(appToday()),
    end:
      request.end ??
      toIsoDate(new Date(appToday().getFullYear(), appToday().getMonth(), appToday().getDate() + 1)),
  }
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)
  const [startHalf, setStartHalf] = useState<DayHalf>(request.startHalf ?? 'full')
  const [endHalf, setEndHalf] = useState<DayHalf>(request.endHalf ?? 'full')
  const [note, setNote] = useState(request.note)
  const dialogRef = useModalA11y(onClose)
  const singleDay = startDate === endDate
  const effectiveEndHalf = singleDay ? startHalf : endHalf

  const entitlementSettings = companyEntitlementSettings(company)
  const threadMessages = messagesForRequest(portalMessages, request.id)
  const dates = requestDisplayDates(request)
  const dayCount = useMemo(
    () =>
      countLeaveWorkingDays(
        startDate,
        endDate,
        employee.workingDays,
        startHalf,
        effectiveEndHalf,
      ),
    [startDate, endDate, employee.workingDays, startHalf, effectiveEndHalf],
  )
  const balanceAfterAmend = useMemo(() => {
    if (!isAnnualLeaveRequest(request) || dayCount <= 0) return null
    const newYearDays = leaveDaysInLeaveYear(
      startDate,
      endDate,
      leaveYear,
      employee.workingDays,
      startHalf,
      effectiveEndHalf,
    )
    const additionalDays =
      request.status === 'Pending'
        ? newYearDays
        : newYearDays -
          (request.start && request.end
            ? leaveDaysInLeaveYear(
                request.start,
                request.end,
                leaveYear,
                employee.workingDays,
                request.startHalf,
                request.endHalf,
              )
            : 0)
    return remainingAnnualLeave(
      employee,
      entitlementSettings,
      bankHolidays,
      absences,
      requests,
      leaveYear,
      additionalDays,
      request.id,
      adjustments,
    )
  }, [
    dayCount,
    startDate,
    endDate,
    startHalf,
    effectiveEndHalf,
    request,
    employee,
    entitlementSettings,
    bankHolidays,
    absences,
    requests,
    leaveYear,
    adjustments,
  ])

  const canEdit = viewer === 'employee' && (canDirectlyAmend(request) || canProposeAmendment(request))
  const showAmendForm = isEditing && canEdit
  const messagingDisabled = request.status === 'Declined' || request.status === 'Cancelled'

  const handleSaveAmendment = () => {
    if (dayCount <= 0) return
    if (
      isAnnualLeaveRequest(request) &&
      balanceAfterAmend !== null &&
      balanceAfterAmend < 0
    ) {
      const proceed = window.confirm(
        overAllowanceMessage(
          viewer === 'employee' ? 'You' : employee.name,
          Math.abs(balanceAfterAmend),
          employee.entitlementUnit,
        ),
      )
      if (!proceed) return
    }

    const payload = {
      start: startDate,
      end: endDate,
      days: dayCount,
      note,
      startHalf,
      endHalf: effectiveEndHalf,
    }
    if (canDirectlyAmend(request)) {
      onDirectAmend(payload)
    } else if (canProposeAmendment(request)) {
      onProposeAmendment(payload)
    }
    setIsEditing(false)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal modal-wide modal-tall leave-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-request-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Leave request</span>
            <h2 id="leave-request-detail-title">{request.dates}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-form leave-request-detail">
          <div className="leave-request-summary">
            <div className={`avatar avatar-${request.color}`}>{request.initials}</div>
            <div className="leave-request-summary-copy">
              <strong>{employee.name}</strong>
              <span>
                {dates.current} · {request.duration}
              </span>
              {request.note && <small>{request.note}</small>}
            </div>
            <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
          </div>

          {hasPendingAmendment(request) && request.pendingAmendment && (
            <div className="amendment-banner">
              <Clock3 size={16} />
              <div>
                <strong>Amendment awaiting approval</strong>
                <span>
                  Proposed: {request.pendingAmendment.dates} · {request.pendingAmendment.duration}
                </span>
              </div>
              {viewer === 'admin' && (
                <div className="amendment-actions">
                  {canReview ? (
                    <>
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() => onResolveAmendment(true)}
                      >
                        <Check size={14} />
                        Approve change
                      </button>
                      <button
                        type="button"
                        className="decline-button"
                        onClick={() => onResolveAmendment(false)}
                      >
                        <X size={14} />
                        Decline
                      </button>
                    </>
                  ) : (
                    <span className="field-helper">Needs another admin</span>
                  )}
                </div>
              )}
            </div>
          )}

          {canEdit && !showAmendForm && !hasPendingAmendment(request) && (
            <button
              type="button"
              className="button button-secondary amend-trigger"
              onClick={() => {
                setStartDate(request.start ?? startDate)
                setEndDate(request.end ?? endDate)
                setNote(request.note)
                setIsEditing(true)
              }}
            >
              <Pencil size={15} />
              {canDirectlyAmend(request) ? 'Edit request' : 'Request a change'}
            </button>
          )}

          {showAmendForm && (
            <div className="amend-form card-inset">
              <div className="section-heading compact-heading">
                <div>
                  <h3>{canDirectlyAmend(request) ? 'Edit dates' : 'Propose new dates'}</h3>
                  <p>
                    {canDirectlyAmend(request)
                      ? 'You can update this request until it is approved.'
                      : 'Your employer must agree before approved leave changes.'}
                  </p>
                </div>
              </div>
              <div className="form-row">
                <label>
                  First day
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const next = event.target.value
                      setStartDate(next)
                      if (endDate < next) setEndDate(next)
                    }}
                  />
                </label>
                <label>
                  Last day
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  {singleDay ? 'Day portion' : 'First day portion'}
                  <select
                    value={startHalf}
                    onChange={(event) => setStartHalf(event.target.value as DayHalf)}
                  >
                    <option value="full">{formatHalfDayOption('full')}</option>
                    <option value="AM">{formatHalfDayOption('AM')}</option>
                    <option value="PM">{formatHalfDayOption('PM')}</option>
                  </select>
                </label>
                {!singleDay && (
                  <label>
                    Last day portion
                    <select
                      value={endHalf}
                      onChange={(event) => setEndHalf(event.target.value as DayHalf)}
                    >
                      <option value="full">{formatHalfDayOption('full')}</option>
                      <option value="AM">{formatHalfDayOption('AM')}</option>
                      <option value="PM">{formatHalfDayOption('PM')}</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="days-preview">
                <CalendarDays size={17} />
                <span>This uses</span>
                <strong>
                  {dayCount > 0
                    ? `${dayCount} working ${dayCount === 1 ? 'day' : 'days'}`
                    : '—'}
                </strong>
              </div>
              {balanceAfterAmend !== null && dayCount > 0 && (
                <div className={`allowance-preview ${balanceAfterAmend < 0 ? 'allowance-preview-warning' : ''}`}>
                  <span>Balance after this change</span>
                  <strong className={balanceAfterAmend < 0 ? 'negative-number' : ''}>
                    {formatBalanceAmount(balanceAfterAmend, employee.entitlementUnit)}
                  </strong>
                </div>
              )}
              <label>
                Note
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <div className="amend-form-actions">
                <button type="button" className="button button-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={dayCount <= 0}
                  onClick={handleSaveAmendment}
                >
                  {canDirectlyAmend(request) ? 'Save changes' : 'Send for approval'}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          <div className="section-heading compact-heading">
            <div>
              <h3>Messages</h3>
              <p>Discuss this request before approving or changing dates.</p>
            </div>
          </div>
          <PortalMessageThread
            messages={threadMessages}
            viewer={viewer}
            onSend={onSendMessage}
            disabled={messagingDisabled}
          />

          {viewer === 'admin' && request.status === 'Pending' && (
            <div className="leave-request-admin-actions">
              {canReview ? (
                <>
                  <button type="button" className="approve-button" onClick={() => onUpdateRequest('Approved')}>
                    <Check size={15} />
                    Approve leave
                  </button>
                  <button type="button" className="decline-button" onClick={() => onUpdateRequest('Declined')}>
                    <X size={15} />
                    Decline
                  </button>
                </>
              ) : (
                <p className="field-helper">
                  You can’t approve or decline your own request. Ask another admin to review it.
                </p>
              )}
            </div>
          )}

          {viewer === 'admin' && canCancelApprovedLeave(request) && onCancelApproved && (
            <div className="leave-request-admin-actions">
              <button
                type="button"
                className="decline-button"
                onClick={() => {
                  const confirmed = window.confirm(
                    `Cancel approved leave for ${employee.name}? This removes the absence and restores their balance.`,
                  )
                  if (!confirmed) return
                  onCancelApproved()
                }}
              >
                <X size={15} />
                Cancel leave
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
