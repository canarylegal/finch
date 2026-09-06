import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, X } from 'lucide-react'
import {
  companyEntitlementSettings,
  type CompanySettings,
  type Employee,
  type LeaveRequest,
} from '../domain'
import { formatBalanceAmount, remainingAnnualLeave } from '../leaveBalance'
import type { LeaveAdjustment } from '../leaveAdjustments'
import { type LeaveYearPeriod } from '../leaveYear'
import {
  countWeekdaysInRange,
  countWorkingDaysInRange,
  formatWorkingWeek,
  type AbsenceRecord,
  type BankHoliday,
} from '../payroll'

export function AdminAddLeaveModal({
  employees,
  onClose,
  onSubmit,
}: {
  employees: Employee[]
  onClose: () => void
  onSubmit: (payload: {
    employeeId: number
    start: string
    end: string
    label: string
  }) => void
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? 0)
  const [startDate, setStartDate] = useState('2026-09-18')
  const [endDate, setEndDate] = useState('2026-09-19')
  const [label, setLabel] = useState('Annual leave')
  const selectedEmployee = employees.find((item) => item.id === employeeId)
  const dayCount = useMemo(
    () =>
      selectedEmployee
        ? countWorkingDaysInRange(startDate, endDate, selectedEmployee.workingDays)
        : countWeekdaysInRange(startDate, endDate),
    [startDate, endDate, selectedEmployee],
  )

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-leave-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Team calendar</span>
            <h2 id="admin-leave-title">Add leave</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Employee
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(Number(event.target.value))}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Leave type
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option>Annual leave</option>
              <option>Unpaid leave</option>
              <option>Other</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              First day
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
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
          <div className="days-preview">
            <CalendarDays size={17} />
            <span>This entry uses</span>
            <strong>
              {dayCount} working {dayCount === 1 ? 'day' : 'days'}
            </strong>
          </div>
          {selectedEmployee && (
            <p className="field-helper">
              Based on {selectedEmployee.name}&apos;s working pattern ({formatWorkingWeek(selectedEmployee.workingDays)}).
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onSubmit({ employeeId, start: startDate, end: endDate, label })}
            disabled={!employeeId || !startDate || !endDate || endDate < startDate}
          >
            Add leave <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function LeaveModal({
  employee,
  company,
  bankHolidays,
  leaveYear,
  absences,
  requests,
  adjustments = [],
  onClose,
  onSubmit,
}: {
  employee?: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  adjustments?: LeaveAdjustment[]
  onClose: () => void
  onSubmit: (payload: {
    start: string
    end: string
    days: number
    note: string
    leaveType: string
  }) => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const [startDate, setStartDate] = useState('2026-09-18')
  const [endDate, setEndDate] = useState('2026-09-19')
  const [leaveType, setLeaveType] = useState('Annual leave')
  const [note, setNote] = useState('')
  const dayCount = useMemo(
    () =>
      employee
        ? countWorkingDaysInRange(startDate, endDate, employee.workingDays)
        : countWeekdaysInRange(startDate, endDate),
    [startDate, endDate, employee],
  )
  const remainingAfter =
    employee && leaveType === 'Annual leave' && dayCount > 0
      ? remainingAnnualLeave(
          employee,
          entitlementSettings,
          bankHolidays,
          absences,
          requests,
          leaveYear,
          dayCount,
          undefined,
          adjustments,
        )
      : null
  const overAllowance = remainingAfter !== null && remainingAfter < 0

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">New request</span>
            <h2 id="leave-title">Request time off</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Leave type
            <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
              <option>Annual leave</option>
              <option>Unpaid leave</option>
              <option>Other</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              First day
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              Last day
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="days-preview">
            <CalendarDays size={17} />
            <span>This request uses</span>
            <strong>
              {dayCount > 0
                ? `${dayCount} working ${dayCount === 1 ? 'day' : 'days'}`
                : '—'}
            </strong>
          </div>
          {employee && leaveType === 'Annual leave' && dayCount > 0 && remainingAfter !== null && (
            <div className={`allowance-preview ${overAllowance ? 'allowance-preview-warning' : ''}`}>
              <span>Balance after this request</span>
              <strong className={overAllowance ? 'negative-number' : ''}>
                {formatBalanceAmount(remainingAfter, employee.entitlementUnit)}
              </strong>
              {overAllowance && (
                <p>You will be asked to confirm before submitting because this exceeds your allowance.</p>
              )}
            </div>
          )}
          <label>
            Note <span className="optional">(optional)</span>
            <textarea
              placeholder="Add a note for Alex..."
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={dayCount <= 0}
            onClick={() =>
              onSubmit({
                start: startDate,
                end: endDate,
                days: dayCount,
                note,
                leaveType,
              })
            }
          >
            Send request <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
