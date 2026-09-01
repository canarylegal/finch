import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Download,
  Mail,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  ABSENCE_TYPE_LABELS,
  type AbsenceRecord,
  type AbsenceType,
  type BankHoliday,
  PAYROLL_DISCLAIMER,
  buildPayrollReport,
  countWorkingDaysInRange,
  describePayPeriodSchedule,
  formatDisplayDate,
  formatPayPeriodLabel,
  formatWorkingWeek,
  getPayPeriodForEndMonth,
  payrollReportToCsv,
  type PayrollReportRow,
} from './payroll'

type Employee = {
  id: number
  name: string
  status: 'Active' | 'Inactive'
  workingDays?: number[]
}

export function RecordAbsenceModal({
  employees,
  onClose,
  onSubmit,
}: {
  employees: Employee[]
  onSubmit: (record: Omit<AbsenceRecord, 'id' | 'recordedAt'>) => void
  onClose: () => void
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? 0)
  const [type, setType] = useState<AbsenceType>('sick_paid')
  const [startDate, setStartDate] = useState('2026-09-01')
  const [endDate, setEndDate] = useState('2026-09-01')
  const [note, setNote] = useState('')
  const [adjustmentLabel, setAdjustmentLabel] = useState('')

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
  const dayCount = useMemo(
    () =>
      selectedEmployee
        ? countWorkingDaysInRange(startDate, endDate, selectedEmployee.workingDays)
        : countWorkingDaysInRange(startDate, endDate),
    [startDate, endDate, selectedEmployee],
  )

  const showSickNote = type === 'sick_paid' || type === 'sick_unpaid'
  const showAdjustment = type === 'adjustment'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-absence-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Absence ledger</span>
            <h2 id="record-absence-title">Record absence</h2>
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
            Absence type
            <select value={type} onChange={(event) => setType(event.target.value as AbsenceType)}>
              {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((key) => (
                <option key={key} value={key}>
                  {ABSENCE_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          {showSickNote && (
            <p className="field-helper">
              Paid/unpaid is for reporting only. SSP eligibility must be determined by payroll.
            </p>
          )}
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
            <span>Duration</span>
            <strong>
              {dayCount} working {dayCount === 1 ? 'day' : 'days'}
            </strong>
          </div>
          {selectedEmployee && (
            <p className="field-helper">
              Based on {selectedEmployee.name}&apos;s working pattern ({formatWorkingWeek(selectedEmployee.workingDays)}).
            </p>
          )}
          {showAdjustment && (
            <label>
              Adjustment label
              <input
                value={adjustmentLabel}
                onChange={(event) => setAdjustmentLabel(event.target.value)}
                placeholder="e.g. Roll-over correction"
              />
            </label>
          )}
          <label>
            Note <span className="optional">(optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Internal note for HR records..."
              rows={3}
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
            disabled={!employeeId || !startDate || !endDate || endDate < startDate}
            onClick={() =>
              onSubmit({
                employeeId,
                type,
                start: startDate,
                end: endDate,
                amount: dayCount,
                note,
                recordedBy: 'Alex Morgan',
                adjustmentLabel: showAdjustment ? adjustmentLabel : undefined,
              })
            }
          >
            Save absence <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AbsencesPage({
  employees,
  absences,
  onRecordAbsence,
}: {
  employees: Employee[]
  absences: AbsenceRecord[]
  onRecordAbsence: () => void
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<AbsenceType | 'all'>('all')

  const rows = absences
    .map((record) => ({
      ...record,
      employeeName: employees.find((employee) => employee.id === record.employeeId)?.name ?? 'Unknown',
    }))
    .filter((record) => {
      const matchesSearch =
        record.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        record.note.toLowerCase().includes(search.toLowerCase())
      const matchesType = typeFilter === 'all' || record.type === typeFilter
      return matchesSearch && matchesType
    })
    .sort((a, b) => b.start.localeCompare(a.start))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Absence ledger</div>
          <h1>Absences</h1>
          <p>Record sick leave, maternity, bank holidays, unpaid leave, and adjustments.</p>
        </div>
        <button type="button" className="button button-primary" onClick={onRecordAbsence}>
          <Plus size={17} />
          Record absence
        </button>
      </div>

      <div className="payroll-notice">{PAYROLL_DISCLAIMER}</div>

      <div className="card full-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder="Search absences"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as AbsenceType | 'all')}
          >
            <option value="all">All types</option>
            {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((key) => (
              <option key={key} value={key}>
                {ABSENCE_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="absence-list-heading">
          <span>Employee</span>
          <span>Type</span>
          <span>Dates</span>
          <span>Days</span>
          <span>Recorded by</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No absences found</strong>
            <span>Record an absence to build your payroll report data.</span>
          </div>
        ) : (
          rows.map((record) => (
            <div className="absence-row" key={record.id}>
              <strong>{record.employeeName}</strong>
              <span className={`absence-pill absence-pill-${record.type}`}>
                {ABSENCE_TYPE_LABELS[record.type]}
              </span>
              <span>
                {formatDisplayDate(record.start)}
                {record.end !== record.start ? ` – ${formatDisplayDate(record.end)}` : ''}
              </span>
              <span>{record.amount}</span>
              <span>{record.recordedBy}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ReportTable({ rows }: { rows: PayrollReportRow[] }) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Working days</th>
            <th>Days worked</th>
            <th>Annual leave</th>
            <th>Sick (paid)</th>
            <th>Sick (unpaid)</th>
            <th>Maternity</th>
            <th>Bank holidays</th>
            <th>Unpaid leave</th>
            <th>Adjustments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId}>
              <td>{row.employeeName}</td>
              <td>{row.workingDaysInPeriod}</td>
              <td>{row.daysWorked}</td>
              <td>{row.annualLeaveDays}</td>
              <td>{row.sickPaidDays}</td>
              <td>{row.sickUnpaidDays}</td>
              <td>{row.maternityDays}</td>
              <td>{row.bankHolidayDays}</td>
              <td>{row.unpaidLeaveDays}</td>
              <td>{row.adjustments || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PayrollReportsPage({
  employees,
  absences,
  bankHolidays,
  payrollEmail,
  payPeriodStartDay,
  onNotify,
}: {
  employees: Employee[]
  absences: AbsenceRecord[]
  bankHolidays: BankHoliday[]
  payrollEmail: string
  payPeriodStartDay: number
  onNotify: (message: string) => void
}) {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(7)

  const period = useMemo(
    () => getPayPeriodForEndMonth(payPeriodStartDay, year, month),
    [payPeriodStartDay, year, month],
  )
  const rows = useMemo(
    () =>
      buildPayrollReport({
        employees,
        absences,
        bankHolidays,
        periodStart: period.start,
        periodEnd: period.end,
      }),
    [employees, absences, bankHolidays, period.start, period.end],
  )

  const exportCsv = () => {
    const csv = payrollReportToCsv(rows)
    downloadCsv(`finch-payroll-${period.start}.csv`, csv)
    onNotify('Payroll report downloaded')
  }

  const emailReport = () => {
    if (!payrollEmail) {
      onNotify('Add a payroll email in Settings first')
      return
    }
    onNotify(`Report emailed to ${payrollEmail}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Payroll export</div>
          <h1>Payroll reports</h1>
          <p>Preview and export working time and absence data for your pay period.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="button button-secondary" onClick={exportCsv}>
            <Download size={17} />
            Export CSV
          </button>
          <button type="button" className="button button-primary" onClick={emailReport}>
            <Mail size={17} />
            Email to payroll
          </button>
        </div>
      </div>

      <div className="payroll-notice">{PAYROLL_DISCLAIMER}</div>

      <div className="card full-panel">
        <div className="report-controls">
          <label>
            Pay period ending in
            <div className="form-row">
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December',
                ].map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {[2025, 2026, 2027].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <span className="field-helper">{describePayPeriodSchedule(payPeriodStartDay)}</span>
            <span className="field-helper">
              Working days and days worked are calculated from each employee&apos;s working pattern in
              Employees → Edit details.
            </span>
          </label>
          <div className="report-period-summary">
            <span className="card-label">Selected period</span>
            <strong>{formatPayPeriodLabel(period.start, period.end)}</strong>
          </div>
        </div>

        <ReportTable rows={rows} />
      </div>
    </div>
  )
}
