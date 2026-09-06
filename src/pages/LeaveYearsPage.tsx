import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, ClipboardCopy, Download } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  type CompanySettings,
  type Employee,
  type LeaveRequest,
} from '../domain'
import type { LeaveAdjustment } from '../leaveAdjustments'
import {
  buildLeaveYearCloseDraft,
  confirmLeaveYearClose,
  formatLeaveYearCloseReport,
  pendingLeaveInYear,
  periodNeedingClose,
  sortedLeaveYearClosures,
  type LeaveYearCloseEmployeeLine,
  type LeaveYearClosure,
} from '../leaveYearClose'
import {
  daysUntilLeaveYearEnd,
  formatLeaveYearLabel,
  isPastLeaveYearEnd,
  nextLeaveYearPeriod,
  type LeaveYearPeriod,
} from '../leaveYear'
import { ADMIN_DISPLAY_NAME } from '../portalMessages'
import { formatDisplayDate, type AbsenceRecord, type BankHoliday } from '../payroll'

type LeaveYearsTab = 'close' | 'history'

type LeaveYearsPageProps = {
  employees: Employee[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  adjustments: LeaveAdjustment[]
  closures: LeaveYearClosure[]
  leaveYear: LeaveYearPeriod
  today: Date
  onConfirmClose: (result: {
    closures: LeaveYearClosure[]
    adjustments: LeaveAdjustment[]
  }) => void
  onNotify: (message: string) => void
}

export function LeaveYearsPage({
  employees,
  company,
  bankHolidays,
  absences,
  requests,
  adjustments,
  closures,
  leaveYear,
  today,
  onConfirmClose,
  onNotify,
}: LeaveYearsPageProps) {
  const closePeriod = periodNeedingClose(company, leaveYear, closures, today)
  const [tab, setTab] = useState<LeaveYearsTab>(closePeriod ? 'close' : 'history')
  const [draftLines, setDraftLines] = useState<LeaveYearCloseEmployeeLine[]>([])

  const nextPeriod = useMemo(
    () =>
      closePeriod
        ? nextLeaveYearPeriod(closePeriod, company.leaveYearStart, company.leaveYearEnd)
        : null,
    [closePeriod, company.leaveYearStart, company.leaveYearEnd],
  )

  const pending = useMemo(
    () => (closePeriod ? pendingLeaveInYear(requests, employees, closePeriod) : []),
    [requests, employees, closePeriod],
  )

  const history = useMemo(() => sortedLeaveYearClosures(closures), [closures])

  useEffect(() => {
    if (!closePeriod || !company.leaveYearConfigured) {
      setDraftLines([])
      return
    }
    setDraftLines(
      buildLeaveYearCloseDraft({
        employees,
        company,
        bankHolidays,
        absences,
        adjustments,
        period: closePeriod,
      }),
    )
  }, [closePeriod, company, employees, bankHolidays, absences, adjustments])

  const daysLeft = closePeriod ? daysUntilLeaveYearEnd(today, closePeriod.end) : 0
  const overdue = closePeriod ? isPastLeaveYearEnd(today, closePeriod.end) : false

  const updateProposed = (employeeId: number, value: number) => {
    setDraftLines((current) =>
      current.map((line) =>
        line.employeeId === employeeId ? { ...line, proposedOpeningBalance: value } : line,
      ),
    )
  }

  const handleConfirm = () => {
    if (!closePeriod || !nextPeriod) return
    if (pending.length > 0) {
      const proceed = window.confirm(
        `${pending.length} pending leave ${pending.length === 1 ? 'request' : 'requests'} remain in this leave year. Closing will not approve them. Continue?`,
      )
      if (!proceed) return
    }

    const confirmed = window.confirm(
      `Close ${formatLeaveYearLabel(closePeriod)} and apply opening balances to ${formatLeaveYearLabel(nextPeriod)}? This cannot be undone.`,
    )
    if (!confirmed) return

    const result = confirmLeaveYearClose({
      draftLines,
      period: closePeriod,
      company,
      existingClosures: closures,
      existingAdjustments: adjustments,
      closedBy: ADMIN_DISPLAY_NAME,
      closedAt: today,
    })
    onConfirmClose(result)
    setTab('history')
    onNotify('Leave year closed — opening balances applied')
  }

  const downloadReport = (closure: LeaveYearClosure) => {
    const text = formatLeaveYearCloseReport(closure)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `finch-leave-year-${closure.leaveYearKey}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    onNotify('Leave year report downloaded')
  }

  const copyReport = async (closure: LeaveYearClosure) => {
    try {
      await navigator.clipboard.writeText(formatLeaveYearCloseReport(closure))
      onNotify('Report copied to clipboard')
    } catch {
      onNotify('Could not copy report')
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Leave year administration"
        title="Leave years"
        description="Review closing balances, approve opening carry into the next leave year, and keep historical reports."
      />

      <div className="document-visibility-tabs">
        <button
          type="button"
          className={`document-visibility-tab ${tab === 'close' ? 'active' : ''}`}
          onClick={() => setTab('close')}
        >
          Close leave year
        </button>
        <button
          type="button"
          className={`document-visibility-tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          Previous years
        </button>
      </div>

      {tab === 'close' && (
        <div className="card full-panel">
          {!company.leaveYearConfigured ? (
            <div className="empty-state">
              <strong>Leave year not configured</strong>
              <span>Confirm the company leave year in Settings before closing a period.</span>
            </div>
          ) : !closePeriod || !nextPeriod ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Check size={20} />
              </div>
              <strong>Nothing to close right now</strong>
              <span>
                Finch will prompt you near the end of {formatLeaveYearLabel(leaveYear)}, or if a
                previous leave year was left unclosed.
              </span>
              <button type="button" className="button button-secondary" onClick={() => setTab('history')}>
                View previous years
              </button>
            </div>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <h2>Review {formatLeaveYearLabel(closePeriod)}</h2>
                  <p>
                    {overdue
                      ? 'This leave year has ended — approve closing balances to carry into the next year.'
                      : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining until ${formatDisplayDate(closePeriod.end)}. Approve when ready; Finch will apply opening balances to ${formatLeaveYearLabel(nextPeriod)}.`}
                  </p>
                </div>
              </div>

              {pending.length > 0 && (
                <div className="setup-banner setup-banner-warning leave-year-pending-banner">
                  <div>
                    <strong>
                      {pending.length} pending leave{' '}
                      {pending.length === 1 ? 'request' : 'requests'}
                    </strong>
                    <span>
                      Closing does not approve these. Resolve them first if they should count in this
                      year.
                    </span>
                  </div>
                </div>
              )}

              <div className="leave-year-close-table-wrap">
                <table className="leave-year-close-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Allowance</th>
                      <th>Taken</th>
                      <th>Adjustments</th>
                      <th>Closing</th>
                      <th>Opening next year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftLines.map((line) => (
                      <tr key={line.employeeId}>
                        <td>
                          <div className="leave-year-employee-cell">
                            <div className={`avatar avatar-${line.color}`}>{line.initials}</div>
                            <strong>{line.name}</strong>
                          </div>
                        </td>
                        <td>
                          {line.allowance} {line.entitlementUnit}
                        </td>
                        <td>
                          {line.taken} {line.entitlementUnit}
                        </td>
                        <td>
                          {line.adjustmentNet} {line.entitlementUnit}
                        </td>
                        <td className={line.closingBalance < 0 ? 'negative-number' : ''}>
                          {line.closingBalance} {line.entitlementUnit}
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.5}
                            className="leave-year-opening-input"
                            value={line.proposedOpeningBalance}
                            onChange={(event) =>
                              updateProposed(line.employeeId, Number(event.target.value) || 0)
                            }
                            aria-label={`Opening balance for ${line.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="field-helper">
                Closing balance excludes pending requests. Edit opening next year if you agreed a
                different carry (including a deficit). Zero means no opening adjustment.
                {!company.defaultRollOver &&
                  ' Company roll-over is off, so unused leave defaults to 0 carry (deficits still proposed).'}
              </p>

              <div className="leave-year-close-actions">
                <button type="button" className="button button-primary" onClick={handleConfirm}>
                  Approve and close leave year
                  <ChevronRight size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card full-panel">
          {history.length === 0 ? (
            <div className="empty-state">
              <strong>No closed leave years yet</strong>
              <span>Approved year-end closes and reports will appear here.</span>
            </div>
          ) : (
            history.map((closure) => (
              <div className="leave-year-history-card" key={closure.leaveYearKey}>
                <div className="leave-year-history-header">
                  <div>
                    <strong>{formatLeaveYearLabel(closure.period)}</strong>
                    <span>
                      Closed {formatDisplayDate(closure.closedAt)} by {closure.closedBy} ·{' '}
                      {closure.lines.length}{' '}
                      {closure.lines.length === 1 ? 'employee' : 'employees'}
                    </span>
                  </div>
                  <div className="header-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => copyReport(closure)}
                    >
                      <ClipboardCopy size={15} />
                      Copy report
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => downloadReport(closure)}
                    >
                      <Download size={15} />
                      Download
                    </button>
                  </div>
                </div>
                <div className="leave-year-close-table-wrap">
                  <table className="leave-year-close-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Closing</th>
                        <th>Opening carried</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closure.lines.map((line) => (
                        <tr key={line.employeeId}>
                          <td>{line.name}</td>
                          <td className={line.closingBalance < 0 ? 'negative-number' : ''}>
                            {line.closingBalance} {line.entitlementUnit}
                          </td>
                          <td>
                            {line.proposedOpeningBalance} {line.entitlementUnit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
