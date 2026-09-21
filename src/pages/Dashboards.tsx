import { useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { MoreMenu } from '../components/MoreMenu'
import { PageHeader } from '../components/PageHeader'
import { MiniMonthCalendar } from '../components/MiniMonthCalendar'
import { formatLongWeekdayDate, formatMonthYear, toIsoDate } from '../calendarUtils'

function dayGreeting(now = new Date()) {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
import {
  appToday,
  companyEntitlementSettings,
  type CompanySettings,
  type Employee,
  type ExpenseClaim,
  type LeaveRequest,
  type PolicyDocument,
  type RequestStatus,
} from '../domain'
import {
  employeeRequestsSorted,
  formatAbsenceRange,
  formatTimelineDate,
  leaveYearResetItem,
  upcomingApprovedLeave,
} from '../dashboardHelpers'
import { daysUntilLeaveYearEnd, formatLeaveYearLabel, type LeaveYearPeriod } from '../leaveYear'
import {
  formatBalanceAmount,
  leaveDaysInLeaveYear,
  remainingAnnualLeave,
  totalLeaveAllowance,
} from '../leaveBalance'
import { EXPENSE_CATEGORY_LABELS, formatGbp } from '../expenses'
import { urgencyLabel, type HrTask } from '../hrTasks'
import {
  LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE,
  needsMandatoryLeavePrompt,
} from '../mandatoryLeave'
import type { LeaveAdjustment } from '../leaveAdjustments'
import { leaveRequestTypeLabel, isAnnualLeaveRequest } from '../leaveTypes'
import { formatPolicyUpdatedAt, sortedPolicies } from '../policies'
import { PolicyViewerModal } from '../modals/PolicyViewerModal'
import { formatDisplayDate, parseIsoDate, type AbsenceRecord, type BankHoliday } from '../payroll'

type EmployeeDashboardProps = {
  employee?: Employee
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  policies: PolicyDocument[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  adjustments: LeaveAdjustment[]
  onRequestLeave: () => void
  onNavigate: (nav: string) => void
  onNotify: (message: string) => void
}

export function EmployeeDashboard({
  employee,
  absences,
  requests,
  policies,
  company,
  bankHolidays,
  leaveYear,
  adjustments,
  onRequestLeave,
  onNavigate,
  onNotify,
}: EmployeeDashboardProps) {
  const [viewingPolicy, setViewingPolicy] = useState<PolicyDocument | null>(null)
  const entitlementSettings = companyEntitlementSettings(company)
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
  const leaveReady = company.leaveYearConfigured
  const requestLeave = () => {
    if (!leaveReady) {
      onNotify(LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE)
      return
    }
    onRequestLeave()
  }
  const today = appToday()
  const totalEntitlement = employee ? totalLeaveAllowance(employee, entitlementSettings, bankHolidays) : 0
  const pendingCount = employee
    ? requests.filter((request) => request.employeeId === employee.id && request.status === 'Pending')
        .length
    : 0
  const percentRemaining =
    totalEntitlement > 0 ? Math.round((remaining / totalEntitlement) * 100) : 0
  const daysUntilReset = daysUntilLeaveYearEnd(today, leaveYear.end)
  const upcomingLeave = employee ? upcomingApprovedLeave(employee.id, absences, today) : []
  const employeeRequestRows = employee ? employeeRequestsSorted(requests, employee.id).slice(0, 3) : []
  const leaveYearEnd = leaveYearResetItem(leaveYear)
  const lastPending = employee
    ? requests
        .filter((request) => request.employeeId === employee.id && request.status === 'Pending')
        .at(-1)
    : undefined

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatLongWeekdayDate(today)}
        title={`${dayGreeting()}, ${employee?.name.split(' ')[0] ?? 'there'}`}
        description="Here’s a quick look at your time away and company updates."
        action={
          <button type="button" className="button button-primary" onClick={requestLeave}>
            <Plus size={17} />
            Request time off
          </button>
        }
      />

      <section className="employee-stats">
        <div className="card balance-card">
          <div className="card-topline">
            <span className="card-label">Holiday remaining</span>
            <span className="soft-icon soft-icon-coral">
              <CalendarDays size={17} />
            </span>
          </div>
          <div className={`balance-number ${remaining < 0 ? 'negative-number' : ''}`}>
            {employee ? (Number.isInteger(remaining) ? remaining : Math.round(remaining * 10) / 10) : '—'}{' '}
            <span>{employee?.entitlementUnit ?? 'days'}</span>
          </div>
          <div className="balance-meta">
            <span>of {totalEntitlement} {employee?.entitlementUnit ?? 'days'}</span>
            <strong>{percentRemaining}% remaining</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill coral-fill"
              style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
            />
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate('My leave')}
          >
            View breakdown <ChevronRight size={15} />
          </button>
        </div>
        <div className="card simple-stat">
          <div className="card-topline">
            <span className="card-label">Leave year</span>
            <span className="soft-icon soft-icon-lavender">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="stat-big">
            {daysUntilReset} <span>days</span>
          </div>
          <p>until your allowance resets</p>
          <div className="stat-footer">
            <span>{formatLeaveYearLabel(leaveYear)}</span>
            <CalendarDays size={15} />
          </div>
        </div>
        <div className="card simple-stat">
          <div className="card-topline">
            <span className="card-label">Pending requests</span>
            <span className="soft-icon soft-icon-mint">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="stat-big">
            {pendingCount} <span>{pendingCount === 1 ? 'request' : 'requests'}</span>
          </div>
          <p>{pendingCount === 0 ? 'nothing waiting for approval' : 'waiting for approval'}</p>
          <div className="stat-footer">
            <span>{lastPending ? `Last submitted ${lastPending.dates}` : 'No pending requests'}</span>
            <ChevronRight size={15} />
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="card upcoming-card">
          <div className="section-heading">
            <div>
              <h2>Upcoming leave</h2>
              <p>Your approved time away</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNavigate('My leave')}
            >
              View calendar <ChevronRight size={15} />
            </button>
          </div>
          <div className="leave-timeline">
            {upcomingLeave.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>No upcoming leave</strong>
                <span>Approved time away will appear here.</span>
              </div>
            ) : (
              upcomingLeave.map((record) => {
                const start = formatTimelineDate(record.start)
                return (
                  <div className="timeline-item" key={record.id}>
                    <div className="date-block">
                      <strong>{start.day}</strong>
                      <span>{start.month}</span>
                    </div>
                    <div className="timeline-line">
                      <span />
                    </div>
                    <div className="leave-detail">
                      <strong>Annual leave</strong>
                      <span>{formatAbsenceRange(record.start, record.end)}</span>
                    </div>
                    <span className="status approved">Approved</span>
                  </div>
                )
              })
            )}
            <div className="timeline-item">
              <div className="date-block muted-date">
                <strong>{leaveYearEnd.day}</strong>
                <span>{leaveYearEnd.month}</span>
              </div>
              <div className="timeline-line">
                <span />
              </div>
              <div className="leave-detail muted-detail">
                <strong>New leave year</strong>
                <span>Your balance will refresh on {leaveYearEnd.label}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card requests-card">
          <div className="section-heading">
            <div>
              <h2>My requests</h2>
              <p>Recent leave activity</p>
            </div>
            <MoreMenu
              items={[
                { label: 'Show pending only', onClick: () => onNavigate('My leave') },
                { label: 'Show approved only', onClick: () => onNavigate('My leave') },
                { label: 'Open leave history', onClick: () => onNavigate('My leave') },
              ]}
            />
          </div>
          {employeeRequestRows.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No requests yet</strong>
              <span>Your leave requests will appear here.</span>
            </div>
          ) : (
            employeeRequestRows.map((request) => (
              <div className="request-row" key={request.id}>
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
                  </span>
                </div>
                <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
              </div>
            ))
          )}
          <button
            type="button"
            className="full-link"
            onClick={() => onNavigate('My leave')}
          >
            View all requests <ChevronRight size={15} />
          </button>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="card policy-preview">
          <div className="section-heading">
            <div>
              <h2>Company policies</h2>
              <p>Keep up to date with the latest guidance</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNavigate('Policies')}
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          {sortedPolicies(policies).slice(0, 2).length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No policies yet</strong>
              <span>Published company policies will appear here.</span>
            </div>
          ) : (
            sortedPolicies(policies)
              .slice(0, 2)
              .map((policy) => (
                <button
                  type="button"
                  className="policy-row policy-row-button"
                  key={policy.id}
                  onClick={() => setViewingPolicy(policy)}
                >
                  <div className="document-icon">
                    {policy.accent === 'lavender' ? (
                      <ShieldCheck size={17} />
                    ) : (
                      <FileText size={17} />
                    )}
                  </div>
                  <div>
                    <strong>{policy.title}</strong>
                    <span>{formatPolicyUpdatedAt(policy.updatedAt)}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))
          )}
        </div>
        <div className="card reminder-card">
          <div className="reminder-blob">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="eyebrow">Friendly reminder</span>
            <h2>Take your time</h2>
            <p>
              {`You have ${formatBalanceAmount(remaining, employee?.entitlementUnit ?? 'days')} left to use before ${formatDisplayDate(leaveYear.end)}.`}
            </p>
          </div>
          <button type="button" className="button button-dark" onClick={requestLeave}>
            Plan some leave <ChevronRight size={15} />
          </button>
        </div>
      </section>
      {viewingPolicy && (
        <PolicyViewerModal policy={viewingPolicy} onClose={() => setViewingPolicy(null)} />
      )}
    </div>
  )
}

type AdminDashboardProps = {
  greetingName: string
  requests: LeaveRequest[]
  expenseClaims: ExpenseClaim[]
  employees: Employee[]
  absences: AbsenceRecord[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  pendingCount: number
  adjustments: LeaveAdjustment[]
  onUpdateRequest: (id: number, status: RequestStatus) => void
  onApproveExpense: (claimId: number) => void
  onOpenExpense: (claimId: number) => void
  upcomingTasks: HrTask[]
  onCompleteTask: (taskKey: string) => void
  onSnoozeTask: (taskKey: string) => void
  onOpenEmployee: (employeeId: number) => void
  onConfigureLeaveYear: () => void
  onConfigureMandatoryLeave: () => void
  onCloseLeaveYear: () => void
  needsLeaveYearClose: boolean
  onAddEmployee: () => void
  onNavigate: (nav: string) => void
  canReviewEmployee?: (employeeId: number) => boolean
}

export function AdminDashboard({
  greetingName,
  requests,
  expenseClaims,
  employees,
  absences,
  company,
  bankHolidays,
  leaveYear,
  pendingCount,
  adjustments,
  onUpdateRequest,
  onApproveExpense,
  onOpenExpense,
  upcomingTasks,
  onCompleteTask,
  onSnoozeTask,
  onOpenEmployee,
  onConfigureLeaveYear,
  onConfigureMandatoryLeave,
  onCloseLeaveYear,
  needsLeaveYearClose,
  onAddEmployee,
  onNavigate,
  canReviewEmployee = () => true,
}: AdminDashboardProps) {
  const today = appToday()
  const pendingRequests = requests.filter((request) => request.status === 'Pending')
  const pendingExpenses = expenseClaims.filter((claim) => claim.status === 'Pending')
  const entitlementSettings = companyEntitlementSettings(company)
  const calendarDate = today
  const needsLeaveYear = !company.leaveYearConfigured
  const needsMandatory = needsMandatoryLeavePrompt(company, leaveYear)
  const daysUntilClose = daysUntilLeaveYearEnd(today, leaveYear.end)
  const activeEmployeeCount = employees.filter((employee) => employee.status === 'Active').length
  const weekStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - ((today.getDay() + 6) % 7),
  )
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const weekStartIso = toIsoDate(weekStart)
  const weekEndIso = toIsoDate(weekEnd)
  const awayThisWeek = new Set(
    absences
      .filter(
        (record) =>
          record.type === 'annual_leave' &&
          record.start <= weekEndIso &&
          record.end >= weekStartIso,
      )
      .map((record) => record.employeeId),
  ).size

  return (
    <div className="page admin-page">
      <PageHeader
        eyebrow={formatLongWeekdayDate(today)}
        title={`${dayGreeting()}, ${greetingName.split(' ')[0] || 'there'}`}
        description="Here’s what needs your attention today."
        action={
          <button
            type="button"
            className="button button-primary"
            onClick={onAddEmployee}
          >
            <Plus size={17} />
            Add employee
          </button>
        }
      />
      {(needsLeaveYear || needsMandatory || needsLeaveYearClose) && (
        <div className="setup-banner-stack">
          {needsLeaveYear && (
            <div className="setup-banner setup-banner-critical">
              <div>
                <strong>Set your company leave year</strong>
                <span>
                  Choose whether entitlement runs Jan–Dec, Apr–Mar, or another period. Employees
                  can’t request leave until this is confirmed.
                </span>
              </div>
              <button type="button" className="button button-primary" onClick={onConfigureLeaveYear}>
                Set leave year
              </button>
            </div>
          )}
          {!needsLeaveYear && needsMandatory && (
            <div className="setup-banner setup-banner-warning">
              <div>
                <strong>Mandatory leave for {formatLeaveYearLabel(leaveYear)}</strong>
                <span>
                  Confirm Christmas–New Year shutdown dates, or mark none for this leave year.
                </span>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={onConfigureMandatoryLeave}
              >
                Set mandatory leave
              </button>
            </div>
          )}
          {!needsLeaveYear && needsLeaveYearClose && (
            <div className="setup-banner setup-banner-warning">
              <div>
                <strong>Review leave year close</strong>
                <span>
                  {formatLeaveYearLabel(leaveYear)}
                  {daysUntilClose === 0
                    ? ' ends today'
                    : ` ends in ${daysUntilClose} day${daysUntilClose === 1 ? '' : 's'}`}
                  . Approve closing balances before Finch applies opening carry to the next year.
                </span>
              </div>
              <button type="button" className="button button-secondary" onClick={onCloseLeaveYear}>
                Review and close
              </button>
            </div>
          )}
        </div>
      )}
      <section className="admin-stats">
        <div className="card admin-stat-highlight">
          <div className="admin-stat-icon">
            <Clock3 size={18} />
          </div>
          <div>
            <span className="card-label">Needs your attention</span>
            <div className="admin-number">
              {pendingCount}{' '}
              <span>pending {pendingCount === 1 ? 'request' : 'requests'}</span>
            </div>
          </div>
          <ChevronRight size={17} />
        </div>
        <div className="card admin-stat">
          <span className="card-label">Team members</span>
          <div className="admin-stat-value">{activeEmployeeCount}</div>
          <span className="stat-trend neutral">Active employees</span>
        </div>
        <div className="card admin-stat">
          <span className="card-label">Away this week</span>
          <div className="admin-stat-value">{awayThisWeek}</div>
          <span className="stat-trend neutral">On annual leave</span>
        </div>
        <div className="card admin-stat">
          <span className="card-label">Pending leave</span>
          <div className="admin-stat-value">
            {requests.filter((request) => request.status === 'Pending').length}
          </div>
          <span className="stat-trend neutral">Awaiting review</span>
        </div>
      </section>

      <section className="admin-content-grid">
        <div className="card pending-panel">
          <div className="section-heading">
            <div>
              <h2>
                Pending requests <span className="heading-count">{pendingCount}</span>
              </h2>
              <p>Review leave and expense claims from your team</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNavigate('Requests')}
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          {pendingRequests.length === 0 && pendingExpenses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Check size={20} />
              </div>
              <strong>All caught up</strong>
              <span>There are no requests waiting for review.</span>
            </div>
          ) : (
            <>
            {pendingRequests.map((request) => {
              const employee =
                employees.find((item) => item.id === request.employeeId) ??
                employees.find((item) => item.name === request.name)
              const balanceAfter =
                employee && isAnnualLeaveRequest(request)
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
                </div>
                <div className="request-balance">
                  <span>Balance after</span>
                  <strong className={balanceAfter !== null && balanceAfter < 0 ? 'negative-number' : ''}>
                    {employee && balanceAfter !== null
                      ? formatBalanceAmount(balanceAfter, employee.entitlementUnit)
                      : '—'}
                  </strong>
                </div>
                <div className="request-actions">
                  {canReviewEmployee(request.employeeId) ? (
                    <>
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
                    </>
                  ) : (
                    <span className="field-helper">Needs another admin</span>
                  )}
                </div>
              </div>
              )
            })}
            {pendingExpenses.map((claim) => (
              <div className="admin-request" key={`expense-${claim.id}`}>
                <div className={`avatar avatar-${claim.color}`}>{claim.initials}</div>
                <div className="admin-request-main">
                  <strong>{claim.name}</strong>
                  <span>
                    {formatGbp(claim.amount)} <i>·</i> {claim.merchant}
                  </span>
                  <small>
                    Expense · {EXPENSE_CATEGORY_LABELS[claim.category]}
                  </small>
                </div>
                <div className="request-actions">
                  {canReviewEmployee(claim.employeeId) ? (
                    <>
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
                        Review
                      </button>
                    </>
                  ) : (
                    <span className="field-helper">Needs another admin</span>
                  )}
                </div>
              </div>
            ))}
            </>
          )}
          {(pendingRequests.length > 0 || pendingExpenses.length > 0) && (
            <div className="panel-footer">
              <span>
                Employees are notified when you respond (email when SMTP is configured).
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => onNavigate('Settings')}
              >
                Notification settings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="card mini-calendar-card">
          <div className="section-heading">
            <div>
              <h2>{formatMonthYear(calendarDate)}</h2>
              <p>Team calendar</p>
            </div>
            <MoreMenu
              label="Calendar options"
              items={[
                { label: 'Go to team calendar', onClick: () => onNavigate('Team calendar') },
                { label: 'Record absence', onClick: () => onNavigate('Absences') },
              ]}
            />
          </div>
          <MiniMonthCalendar
            viewDate={calendarDate}
            today={today}
            absences={absences}
            bankHolidays={bankHolidays}
            employees={employees.map((item) => ({
              id: item.id,
              name: item.name,
              color: item.color,
            }))}
          />
        </div>
      </section>

      <section className="card admin-tasks">
        <div className="section-heading">
          <div>
            <h2>
              Upcoming actions
              {upcomingTasks.length > 0 && (
                <span className="heading-count">{upcomingTasks.length}</span>
              )}
            </h2>
            <p>Probation reviews and other people moments from your team data</p>
          </div>
        </div>
        {upcomingTasks.length === 0 ? (
          <div className="empty-state compact-empty">
            <Check size={20} />
            <strong>No upcoming actions</strong>
            <span>Probation end dates within the next 60 days will appear here.</span>
          </div>
        ) : (
          <div className="task-list">
            {upcomingTasks.map((task) => {
              const due = parseIsoDate(task.dueDate)
              return (
                <div className="task-item" key={task.key}>
                  <div className="task-date">
                    <strong>{String(due.getDate()).padStart(2, '0')}</strong>
                    <span>
                      {due.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.detail}</span>
                  </div>
                  <span className={`task-pill ${task.urgency === 'upcoming' ? '' : task.urgency}`}>
                    {urgencyLabel(task.urgency)}
                  </span>
                  <MoreMenu
                    label={`Actions for ${task.title}`}
                    items={[
                      {
                        label: 'Open employee',
                        onClick: () => onOpenEmployee(task.employeeId),
                      },
                      {
                        label: 'Mark complete',
                        onClick: () => onCompleteTask(task.key),
                      },
                      {
                        label: 'Snooze 7 days',
                        onClick: () => onSnoozeTask(task.key),
                      },
                    ]}
                  />
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
