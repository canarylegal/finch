import { useMemo, useState } from 'react'
import { Check, ChevronDown, MessageCircle, Receipt, Search, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  companyEntitlementSettings,
  type CompanySettings,
  type Employee,
  type ExpenseClaim,
  type LeaveRequest,
  type PortalMessage,
  type RequestStatus,
} from '../domain'
import { estimateDataUrlSize, formatFileSize } from '../employeeDocuments'
import { EXPENSE_CATEGORY_LABELS, formatGbp } from '../expenses'
import { hasPendingAmendment } from '../leaveRequestHelpers'
import { type LeaveYearPeriod } from '../leaveYear'
import { formatBalanceAmount, leaveDaysInLeaveYear, remainingAnnualLeave } from '../leaveBalance'
import type { LeaveAdjustment } from '../leaveAdjustments'
import { isAnnualLeaveRequest, leaveRequestTypeLabel } from '../leaveTypes'
import { messagesForRequest } from '../portalMessages'
import { formatDisplayDate, type AbsenceRecord, type BankHoliday } from '../payroll'

type RequestsTab = 'leave' | 'expenses'

type AdminRequestsProps = {
  requests: LeaveRequest[]
  expenseClaims: ExpenseClaim[]
  employees: Employee[]
  absences: AbsenceRecord[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  portalMessages: PortalMessage[]
  adjustments: LeaveAdjustment[]
  initialTab?: RequestsTab
  onUpdateRequest: (id: number, status: RequestStatus) => void
  onOpenRequest: (requestId: number) => void
  onOpenExpense: (claimId: number) => void
  onApproveExpense: (claimId: number) => void
  onCancelApproved?: (id: number) => void
}

export function AdminRequests({
  requests,
  expenseClaims,
  employees,
  absences,
  company,
  bankHolidays,
  leaveYear,
  portalMessages,
  adjustments,
  initialTab = 'leave',
  onUpdateRequest,
  onOpenRequest,
  onOpenExpense,
  onApproveExpense,
  onCancelApproved,
}: AdminRequestsProps) {
  const entitlementSettings = companyEntitlementSettings(company)
  const [tab, setTab] = useState<RequestsTab>(initialTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const query = search.trim().toLowerCase()

  const leaveRows = useMemo(
    () =>
      requests.filter((request) => {
        if (statusFilter !== 'all' && request.status !== statusFilter) return false
        if (!query) return true
        return (
          request.name.toLowerCase().includes(query) ||
          request.note.toLowerCase().includes(query) ||
          request.dates.toLowerCase().includes(query)
        )
      }),
    [query, requests, statusFilter],
  )

  const expenseRows = useMemo(
    () =>
      expenseClaims.filter((claim) => {
        if (!query) return true
        return (
          claim.name.toLowerCase().includes(query) ||
          claim.merchant.toLowerCase().includes(query) ||
          EXPENSE_CATEGORY_LABELS[claim.category].toLowerCase().includes(query)
        )
      }),
    [expenseClaims, query],
  )

  const pendingLeave = requests.filter((request) => request.status === 'Pending').length
  const pendingExpenses = expenseClaims.filter((claim) => claim.status === 'Pending').length

  return (
    <div className="page">
      <PageHeader
        eyebrow="Approvals"
        title="Requests"
        description="Review leave and expense claims in one inbox."
      />

      <div className="document-visibility-tabs">
        <button
          type="button"
          className={`document-visibility-tab ${tab === 'leave' ? 'active' : ''}`}
          onClick={() => setTab('leave')}
        >
          Leave
          {pendingLeave > 0 && <span className="nav-count">{pendingLeave}</span>}
        </button>
        <button
          type="button"
          className={`document-visibility-tab ${tab === 'expenses' ? 'active' : ''}`}
          onClick={() => setTab('expenses')}
        >
          Expenses
          {pendingExpenses > 0 && <span className="nav-count">{pendingExpenses}</span>}
        </button>
      </div>

      <div className="card full-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder={tab === 'leave' ? 'Search leave requests' : 'Search expense claims'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="filter-select">
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | RequestStatus)
              }
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Declined">Declined</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        {tab === 'leave' &&
          (leaveRows.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No leave requests match</strong>
              <span>Try a different search.</span>
            </div>
          ) : (
            leaveRows.map((request) => {
              const employee =
                employees.find((item) => item.id === request.employeeId) ??
                employees.find((item) => item.name === request.name)
              const balanceAfter =
                request.status === 'Pending' && employee && isAnnualLeaveRequest(request)
                  ? remainingAnnualLeave(
                      employee,
                      entitlementSettings,
                      bankHolidays,
                      absences,
                      requests,
                      leaveYear,
                      request.start && request.end
                        ? leaveDaysInLeaveYear(
                            request.start,
                            request.end,
                            leaveYear,
                            employee.workingDays,
                          )
                        : 0,
                      request.id,
                      adjustments,
                    )
                  : null
              const messageCount = messagesForRequest(portalMessages, request.id).length

              return (
                <div className="admin-request" key={request.id}>
                  <div className={`avatar avatar-${request.color}`}>{request.initials}</div>
                  <div className="admin-request-main">
                    <strong>{request.name}</strong>
                    <span>
                      {request.dates} <i>·</i> {request.duration}
                    </span>
                    <small>
                      {leaveRequestTypeLabel(request.leaveType)}
                      {request.note ? ` · ${request.note}` : ''}
                    </small>
                    {hasPendingAmendment(request) && (
                      <small className="amendment-pill">Amendment awaiting approval</small>
                    )}
                  </div>
                  {balanceAfter !== null && (
                    <div className="request-balance">
                      <span>Balance after</span>
                      <strong className={balanceAfter < 0 ? 'negative-number' : ''}>
                        {formatBalanceAmount(balanceAfter, employee!.entitlementUnit)}
                      </strong>
                    </div>
                  )}
                  <button
                    type="button"
                    className="message-open-button"
                    onClick={() => onOpenRequest(request.id)}
                  >
                    <MessageCircle size={15} />
                    Messages
                    {messageCount > 0 && <span className="message-count-badge">{messageCount}</span>}
                  </button>
                  <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
                  {request.status === 'Pending' && (
                    <div className="request-actions">
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() => onUpdateRequest(request.id, 'Approved')}
                      >
                        <Check size={15} />
                        Approve
                      </button>
                      <button
                        type="button"
                        className="decline-button"
                        onClick={() => onUpdateRequest(request.id, 'Declined')}
                      >
                        <X size={15} />
                        Decline
                      </button>
                    </div>
                  )}
                  {request.status === 'Approved' && onCancelApproved && (
                    <div className="request-actions">
                      <button
                        type="button"
                        className="decline-button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Cancel approved leave for ${request.name}? This removes the absence and restores their balance.`,
                          )
                          if (!confirmed) return
                          onCancelApproved(request.id)
                        }}
                      >
                        <X size={15} />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          ))}

        {tab === 'expenses' &&
          (expenseRows.length === 0 ? (
            <div className="empty-state compact-empty">
              <Receipt size={22} />
              <strong>No expense claims match</strong>
              <span>Claims your team submit will appear here.</span>
            </div>
          ) : (
            expenseRows.map((claim) => (
              <div className="admin-request" key={claim.id}>
                <div className={`avatar avatar-${claim.color}`}>{claim.initials}</div>
                <div className="admin-request-main">
                  <strong>{claim.name}</strong>
                  <span>
                    {formatGbp(claim.amount)} <i>·</i> {claim.merchant}
                  </span>
                  <small>
                    {EXPENSE_CATEGORY_LABELS[claim.category]} · {formatDisplayDate(claim.date)} ·{' '}
                    {claim.receipts.length} {claim.receipts.length === 1 ? 'receipt' : 'receipts'}
                    {claim.receipts[0]
                      ? ` · ${formatFileSize(estimateDataUrlSize(claim.receipts[0].fileDataUrl))}`
                      : ''}
                  </small>
                </div>
                <button
                  type="button"
                  className="message-open-button"
                  onClick={() => onOpenExpense(claim.id)}
                >
                  Receipts
                </button>
                <span className={`status ${claim.status.toLowerCase()}`}>{claim.status}</span>
                {claim.status === 'Pending' && (
                  <div className="request-actions">
                    <button
                      type="button"
                      className="approve-button"
                      onClick={() => onApproveExpense(claim.id)}
                    >
                      <Check size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      className="decline-button"
                      onClick={() => onOpenExpense(claim.id)}
                    >
                      <X size={15} />
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}
      </div>
    </div>
  )
}
