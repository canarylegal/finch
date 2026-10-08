import { useState } from 'react'
import { Check, ChevronRight, Clock3, X } from 'lucide-react'
import { EntitlementBasisNote } from '../components/EntitlementBasisNote'
import { WorkingDaysPicker } from '../components/WorkingDaysPicker'
import { toIsoDate } from '../calendarUtils'
import {
  appToday,
  companyEntitlementSettings,
  companyInitials,
  type CompanySettings,
  type Employee,
  type LeaveRequest,
  type PortalMessage,
} from '../domain'
import { defaultProbationEndDate, DEFAULT_PROBATION_MONTHS } from '../hrTasks'
import {
  annualLeaveBooked,
  annualLeaveTaken,
  bookableEntitlement,
  describeBookableEntitlement,
  effectiveEntitlement,
  pendingLeaveDays,
  proRataPercentage,
  remainingAnnualLeave,
  type EntitlementMode,
} from '../leaveBalance'
import { type LeaveYearPeriod } from '../leaveYear'
import {
  ADJUSTMENT_REASON_PRESETS,
  adjustmentsForEmployeeYear,
  formatAdjustmentSigned,
  leaveAdjustmentNet,
  type LeaveAdjustment,
  type LeaveAdjustmentDirection,
} from '../leaveAdjustments'
import { formatMessageTimestamp, messagesForEmployee } from '../portalMessages'
import { leaveRequestTypeLabel } from '../leaveTypes'
import {
  ABSENCE_TYPE_LABELS,
  DEFAULT_WORKING_DAYS,
  formatDisplayDate,
  formatWorkingWeek,
  normalizeWorkingDays,
  type AbsenceRecord,
  type BankHoliday,
} from '../payroll'

export function EmployeeEditModal({
  employee,
  company,
  bankHolidays,
  onClose,
  onSave,
}: {
  employee: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onClose: () => void
  onSave: (employee: Employee) => void
}) {
  const [draft, setDraft] = useState(employee)
  const entitlementSettings = companyEntitlementSettings(company)
  const calculatedEntitlement = effectiveEntitlement(draft, entitlementSettings)
  const proRataPercent = proRataPercentage(draft, entitlementSettings)
  const bookableSummary = describeBookableEntitlement(draft, entitlementSettings, bankHolidays)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Employee profile</span>
            <h2 id="employee-edit-title">Edit {employee.name}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Full name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            Job title
            <input
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            />
          </label>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          <div className="form-row">
            <label>
              Annual entitlement
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.entitlement}
                disabled={draft.entitlementMode === 'proRata'}
                onChange={(event) =>
                  setDraft({ ...draft, entitlement: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              Unit
                <select
                  value={draft.entitlementUnit}
                  disabled={draft.entitlementMode === 'proRata'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      entitlementUnit: event.target.value as 'days' | 'hours',
                    })
                  }
                >
                  <option value="days">Days</option>
                </select>
            </label>
          </div>
          <div className="entitlement-mode-field">
            <span className="field-label">Allowance method</span>
            <div className="radio-list">
              <label className="radio-row">
                <input
                  type="radio"
                  name={`entitlement-mode-${employee.id}`}
                  checked={draft.entitlementMode === 'proRata'}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      entitlementMode: 'proRata',
                      entitlementUnit: company.defaultEntitlementUnit,
                    })
                  }
                />
                <span>
                  Pro-rata from company default ({company.defaultEntitlement}{' '}
                  {company.defaultEntitlementUnit} full-time)
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name={`entitlement-mode-${employee.id}`}
                  checked={draft.entitlementMode === 'custom'}
                  onChange={() => setDraft({ ...draft, entitlementMode: 'custom' })}
                />
                <span>Custom allowance</span>
              </label>
            </div>
            {draft.entitlementMode === 'proRata' && (
              <div className="pro-rata-summary">
                <strong>
                  {calculatedEntitlement} {company.defaultEntitlementUnit}
                </strong>
                <span>
                  {proRataPercent}% of full-time · based on {formatWorkingWeek(draft.workingDays)}
                </span>
                {company.entitlementIncludesBankHolidays && <span>{bookableSummary}</span>}
              </div>
            )}
            {draft.entitlementMode === 'custom' && company.entitlementIncludesBankHolidays && (
              <div className="pro-rata-summary">
                <span>{bookableSummary}</span>
              </div>
            )}
          </div>
          <label>
            Manual roll-over ({draft.entitlementUnit})
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft.rollOver}
              onChange={(event) =>
                setDraft({ ...draft, rollOver: Number(event.target.value) || 0 })
              }
            />
          </label>
          <WorkingDaysPicker
            value={draft.workingDays}
            onChange={(workingDays) => setDraft({ ...draft, workingDays })}
          />
          <div className="form-row">
            <label>
              Start date
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => {
                  const startDate = event.target.value
                  const shouldSyncProbation =
                    !draft.probationEndDate ||
                    draft.probationEndDate === defaultProbationEndDate(draft.startDate)
                  setDraft({
                    ...draft,
                    startDate,
                    probationEndDate: shouldSyncProbation
                      ? defaultProbationEndDate(startDate)
                      : draft.probationEndDate,
                  })
                }}
              />
            </label>
            <label>
              Probation ends
              <input
                type="date"
                value={draft.probationEndDate ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    probationEndDate: event.target.value || null,
                  })
                }
              />
            </label>
          </div>
          <p className="field-helper">
            Clear the probation date if it no longer applies. Upcoming probation reviews appear on
            Overview.
          </p>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as Employee['status'] })
              }
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() =>
              onSave({
                ...draft,
                initials: companyInitials(draft.name) || draft.initials,
                entitlementUnit:
                  draft.entitlementMode === 'proRata'
                    ? company.defaultEntitlementUnit
                    : draft.entitlementUnit,
              })
            }
          >
            Save employee
          </button>
        </div>
      </div>
    </div>
  )
}

export function AddEmployeeModal({
  company,
  bankHolidays,
  onClose,
  onSave,
}: {
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onClose: () => void
  onSave: (
    employee: Omit<Employee, 'id' | 'initials' | 'color'>,
    options: { email: string; sendInvite: boolean },
  ) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sendInvite, setSendInvite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState('')
  const [startDate, setStartDate] = useState(toIsoDate(appToday()))
  const [probationEndDate, setProbationEndDate] = useState(
    defaultProbationEndDate(toIsoDate(appToday())),
  )
  const [entitlement, setEntitlement] = useState(company.defaultEntitlement)
  const [entitlementUnit, setEntitlementUnit] = useState(company.defaultEntitlementUnit)
  const [entitlementMode, setEntitlementMode] = useState<EntitlementMode>('proRata')
  const [rollOver, setRollOver] = useState(0)
  const [workingDays, setWorkingDays] = useState<number[]>([...DEFAULT_WORKING_DAYS])

  const draftEmployee: Employee = {
    id: 0,
    name: name.trim() || 'New employee',
    initials: 'NE',
    role: role.trim(),
    entitlement,
    entitlementUnit,
    rollOver,
    workingDays: normalizeWorkingDays(workingDays),
    entitlementMode,
    color: 'sage',
    status: 'Active',
    startDate,
    probationEndDate: probationEndDate || null,
  }
  const entitlementSettings = companyEntitlementSettings(company)
  const calculatedEntitlement = effectiveEntitlement(draftEmployee, entitlementSettings)
  const proRataPercent = proRataPercentage(draftEmployee, entitlementSettings)
  const bookableSummary = describeBookableEntitlement(draftEmployee, entitlementSettings, bankHolidays)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">People directory</span>
            <h2 id="add-employee-title">Add and invite employee</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Full name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Jordan Lee"
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e.g. jordan@example.com"
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(event) => setSendInvite(event.target.checked)}
            />
            <span>
              <strong>Send invite email</strong>
              <span className="field-helper">
                They receive a link to set their own password (default role: Employee).
              </span>
            </span>
          </label>
          <label>
            Job title
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="e.g. Marketing manager"
            />
          </label>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          <div className="form-row">
            <label>
              Annual entitlement
              <input
                type="number"
                min={0}
                step={0.5}
                value={entitlement}
                disabled={entitlementMode === 'proRata'}
                onChange={(event) => setEntitlement(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Unit
              <select
                value={entitlementUnit}
                disabled={entitlementMode === 'proRata'}
                onChange={(event) =>
                  setEntitlementUnit(event.target.value as 'days' | 'hours')
                }
              >
                <option value="days">Days</option>
              </select>
            </label>
          </div>
          <div className="entitlement-mode-field">
            <span className="field-label">Allowance method</span>
            <div className="radio-list">
              <label className="radio-row">
                <input
                  type="radio"
                  name="add-employee-entitlement-mode"
                  checked={entitlementMode === 'proRata'}
                  onChange={() => {
                    setEntitlementMode('proRata')
                    setEntitlementUnit(company.defaultEntitlementUnit)
                  }}
                />
                <span>
                  Pro-rata from company default ({company.defaultEntitlement}{' '}
                  {company.defaultEntitlementUnit} full-time)
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="add-employee-entitlement-mode"
                  checked={entitlementMode === 'custom'}
                  onChange={() => setEntitlementMode('custom')}
                />
                <span>Custom allowance</span>
              </label>
            </div>
            {entitlementMode === 'proRata' && (
              <div className="pro-rata-summary">
                <strong>
                  {calculatedEntitlement} {company.defaultEntitlementUnit}
                </strong>
                <span>
                  {proRataPercent}% of full-time · based on {formatWorkingWeek(workingDays)}
                </span>
                {company.entitlementIncludesBankHolidays && <span>{bookableSummary}</span>}
              </div>
            )}
            {entitlementMode === 'custom' && company.entitlementIncludesBankHolidays && (
              <div className="pro-rata-summary">
                <span>{bookableSummary}</span>
              </div>
            )}
          </div>
          <label>
            Manual roll-over ({entitlementUnit})
            <input
              type="number"
              min={0}
              step={0.5}
              value={rollOver}
              onChange={(event) => setRollOver(Number(event.target.value) || 0)}
            />
          </label>
          {company.defaultRollOver && (
            <p className="field-helper">
              Company roll-over is on — enter any opening/carried days for this employee if needed.
            </p>
          )}
          <WorkingDaysPicker value={workingDays} onChange={setWorkingDays} />
          <div className="form-row">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  const nextStart = event.target.value
                  const shouldSync =
                    !probationEndDate ||
                    probationEndDate === defaultProbationEndDate(startDate)
                  setStartDate(nextStart)
                  if (shouldSync) setProbationEndDate(defaultProbationEndDate(nextStart))
                }}
              />
            </label>
            <label>
              Probation ends
              <input
                type="date"
                value={probationEndDate}
                onChange={(event) => setProbationEndDate(event.target.value)}
              />
            </label>
          </div>
          <p className="field-helper">Defaults to {DEFAULT_PROBATION_MONTHS} months after the start date.</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={
              busy ||
              !name.trim() ||
              !role.trim() ||
              !startDate ||
              (sendInvite && !email.trim())
            }
            onClick={() => {
              void (async () => {
                setBusy(true)
                try {
                  await onSave(
                    {
                      name: name.trim(),
                      role: role.trim(),
                      entitlement,
                      entitlementUnit:
                        entitlementMode === 'proRata'
                          ? company.defaultEntitlementUnit
                          : entitlementUnit,
                      rollOver,
                      workingDays: normalizeWorkingDays(workingDays),
                      entitlementMode,
                      status: 'Active',
                      startDate,
                      probationEndDate: probationEndDate || null,
                    },
                    { email: email.trim().toLowerCase(), sendInvite },
                  )
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            {busy ? 'Saving…' : sendInvite ? 'Add and invite' : 'Add employee'}{' '}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmployeeLeaveHistoryModal({
  employee,
  company,
  bankHolidays,
  leaveYear,
  absences,
  requests,
  adjustments,
  portalMessages,
  onClose,
}: {
  employee: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  adjustments: LeaveAdjustment[]
  portalMessages: PortalMessage[]
  onClose: () => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const contractAllowance = effectiveEntitlement(employee, entitlementSettings)
  const bookableAllowance = bookableEntitlement(employee, entitlementSettings, bankHolidays)
  const employeeAbsences = absences
    .filter((record) => record.employeeId === employee.id)
    .sort((a, b) => b.start.localeCompare(a.start))

  const employeeRequests = requests
    .filter((request) => request.employeeId === employee.id)
    .sort((a, b) => b.dates.localeCompare(a.dates))

  const yearAdjustments = adjustmentsForEmployeeYear(adjustments, employee.id, leaveYear)
  const adjustmentNet = leaveAdjustmentNet(adjustments, employee.id, leaveYear)

  const takenAmount = annualLeaveTaken(
    absences,
    employee.id,
    employee.workingDays,
    leaveYear,
  )
  const bookedAmount = annualLeaveBooked(
    absences,
    employee.id,
    employee.workingDays,
    leaveYear,
  )
  const pendingAmount = pendingLeaveDays(
    requests,
    employee.id,
    leaveYear,
    undefined,
    employee.name,
    employee.workingDays,
  )

  const available = remainingAnnualLeave(
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

  const employeeMessages = messagesForEmployee(portalMessages, employee.id)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide modal-tall"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Leave history</span>
            <h2 id="leave-history-title">{employee.name}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <div className="leave-summary-row leave-summary-row-balance leave-history-summary">
            <div>
              <span className="card-label">Taken</span>
              <div className="summary-number">
                {takenAmount} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
            <div>
              <span className="card-label">Booked</span>
              <div className="summary-number">
                {bookedAmount} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
            <div>
              <span className="card-label">Pending</span>
              <div className="summary-number">
                {pendingAmount} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
            <div>
              <span className="card-label">Available</span>
              <div
                className={`summary-number coral-number ${available < 0 ? 'negative-number' : ''}`}
              >
                {available} <span>{employee.entitlementUnit}</span>
              </div>
              <p className="field-helper inline-helper">
                Of {bookableAllowance + employee.rollOver} {employee.entitlementUnit}
                {company.entitlementIncludesBankHolidays
                  ? ` (${contractAllowance} contract)`
                  : ''}
              </p>
            </div>
          </div>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          {employee.entitlementMode === 'proRata' && (
            <p className="field-helper">
              Pro-rated from {company.defaultEntitlement} {company.defaultEntitlementUnit} full-time
              ({proRataPercentage(employee, entitlementSettings)}%).
            </p>
          )}
          {employee.rollOver > 0 && (
            <p className="field-helper">
              Includes {employee.rollOver} {employee.entitlementUnit} manual roll-over.
            </p>
          )}
          {adjustmentNet !== 0 && (
            <p className="field-helper">
              Adjustments this leave year:{' '}
              {formatAdjustmentSigned(adjustmentNet, employee.entitlementUnit)}.
            </p>
          )}

          {yearAdjustments.length > 0 && (
            <>
              <div className="section-heading leave-history-heading">
                <div>
                  <h2>Balance adjustments</h2>
                  <p>Credits and debits applied to this leave year</p>
                </div>
              </div>
              {yearAdjustments.map((item) => (
                <div className="request-row leave-history-row" key={item.id}>
                  <div className="request-copy">
                    <strong>{item.reason}</strong>
                    <span>
                      Recorded {formatDisplayDate(item.recordedAt)}
                      {item.effectiveDate ? ` · Effective ${formatDisplayDate(item.effectiveDate)}` : ''}
                      {` · by ${item.recordedBy}`}
                    </span>
                  </div>
                  <span
                    className={`status ${item.direction === 'credit' ? 'approved' : 'declined'}`}
                  >
                    {item.direction === 'credit' ? '+' : '−'}
                    {item.amount} {employee.entitlementUnit}
                  </span>
                </div>
              ))}
            </>
          )}

          <div className="section-heading leave-history-heading">
            <div>
              <h2>Recorded absences</h2>
              <p>All absence entries on file for this employee</p>
            </div>
          </div>
          {employeeAbsences.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No absences recorded</strong>
              <span>Absences you record will appear here.</span>
            </div>
          ) : (
            employeeAbsences.map((record) => (
              <div className="request-row leave-history-row" key={record.id}>
                <div className="request-copy">
                  <strong>
                    {formatDisplayDate(record.start)}
                    {record.end !== record.start ? ` – ${formatDisplayDate(record.end)}` : ''}
                  </strong>
                  <span>
                    {ABSENCE_TYPE_LABELS[record.type]} · {record.amount}{' '}
                    {employee.entitlementUnit}
                    {record.note ? ` · ${record.note}` : ''}
                  </span>
                </div>
                <span className={`absence-pill absence-pill-${record.type}`}>
                  {ABSENCE_TYPE_LABELS[record.type]}
                </span>
              </div>
            ))
          )}

          {employeeRequests.length > 0 && (
            <>
              <div className="section-heading leave-history-heading">
                <div>
                  <h2>Leave requests</h2>
                  <p>Submitted requests awaiting or following approval</p>
                </div>
              </div>
              {employeeRequests.map((request) => (
                <div className="request-row leave-history-row" key={request.id}>
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
                      {request.note ? ` · ${request.note}` : ''}
                    </span>
                  </div>
                  <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
                </div>
              ))}
            </>
          )}

          <div className="section-heading leave-history-heading">
            <div>
              <h2>Portal messages</h2>
              <p>All leave request conversations saved to this profile</p>
            </div>
          </div>
          {employeeMessages.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No messages yet</strong>
              <span>Messages about leave requests will appear here.</span>
            </div>
          ) : (
            <div className="portal-profile-log">
              {employeeMessages.map((message) => {
                const linkedRequest = requests.find((item) => item.id === message.requestId)
                return (
                  <div className="portal-profile-message" key={message.id}>
                    <div className="portal-profile-message-meta">
                      <strong>{message.authorName}</strong>
                      <span>{formatMessageTimestamp(message.createdAt)}</span>
                    </div>
                    <p>{message.body}</p>
                    {linkedRequest && (
                      <small>
                        Re: {linkedRequest.dates} · {linkedRequest.status}
                      </small>
                    )}
                  </div>
                )
              })}
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

export function LeaveAdjustmentModal({
  employee,
  unit,
  onClose,
  onSave,
}: {
  employee: Employee
  unit: string
  onClose: () => void
  onSave: (payload: {
    direction: LeaveAdjustmentDirection
    amount: number
    reason: string
    effectiveDate?: string
  }) => void
}) {
  const [direction, setDirection] = useState<LeaveAdjustmentDirection>('credit')
  const [amount, setAmount] = useState(1)
  const [reasonPreset, setReasonPreset] = useState<string>(ADJUSTMENT_REASON_PRESETS[0])
  const [customReason, setCustomReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')

  const reason = reasonPreset === 'Other' ? customReason.trim() : reasonPreset

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-adjustment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Balance adjustment</span>
            <h2 id="leave-adjustment-title">{employee.name}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <p className="field-helper">
            Record a credit or debit for this leave year without changing contract entitlement. Use a
            credit when someone works an extra day to offset overspent leave.
          </p>
          <div className="radio-list">
            <label className="radio-row">
              <input
                type="radio"
                name="adjustment-direction"
                checked={direction === 'credit'}
                onChange={() => setDirection('credit')}
              />
              <span>
                <strong>Credit</strong> — increases remaining balance
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="adjustment-direction"
                checked={direction === 'debit'}
                onChange={() => setDirection('debit')}
              />
              <span>
                <strong>Debit</strong> — decreases remaining balance
              </span>
            </label>
          </div>
          <div className="form-row">
            <label>
              Amount ({unit})
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Effective date <span className="optional">(optional)</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
          </div>
          <label>
            Reason
            <select value={reasonPreset} onChange={(event) => setReasonPreset(event.target.value)}>
              {ADJUSTMENT_REASON_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
          {reasonPreset === 'Other' && (
            <label>
              Details
              <input
                value={customReason}
                placeholder="Describe the adjustment"
                onChange={(event) => setCustomReason(event.target.value)}
              />
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={amount <= 0 || !reason}
            onClick={() =>
              onSave({
                direction,
                amount,
                reason,
                effectiveDate: effectiveDate || undefined,
              })
            }
          >
            Save adjustment
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
