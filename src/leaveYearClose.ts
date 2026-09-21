import {
  annualLeaveTaken,
  totalLeaveAllowance,
  type CompanyEntitlementSettings,
} from './leaveBalance'
import { leaveAdjustmentNet, nextLeaveAdjustmentId, type LeaveAdjustment } from './leaveAdjustments'
import { companyEntitlementSettings, type CompanySettings, type Employee, type LeaveRequest } from './domain'
import {
  daysUntilLeaveYearEnd,
  formatLeaveYearLabel,
  isPastLeaveYearEnd,
  nextLeaveYearPeriod,
  previousLeaveYearPeriod,
  type LeaveYearPeriod,
} from './leaveYear'
import { toIsoDate, type AbsenceRecord, type BankHoliday } from './payroll'

/** Prompt admins this many days before leave year end (inclusive). */
export const LEAVE_YEAR_CLOSE_PROMPT_DAYS = 30

/**
 * Persist a go-live date the first time leave is configured, so we never ask
 * admins to close leave years that pre-date the organisation in Finch.
 */
export function withLeaveYearConfiguredAt(
  company: CompanySettings,
  currentPeriod: LeaveYearPeriod,
): CompanySettings {
  if (!company.leaveYearConfigured || company.leaveYearConfiguredAt) return company
  return { ...company, leaveYearConfiguredAt: currentPeriod.start }
}

export type LeaveYearCloseEmployeeLine = {
  employeeId: number
  name: string
  initials: string
  color: string
  entitlementUnit: 'days' | 'hours'
  allowance: number
  taken: number
  adjustmentNet: number
  /** Allowance + adjustments − taken (pending requests excluded) */
  closingBalance: number
  /** Admin-editable; applied as opening adjustment on the next leave year */
  proposedOpeningBalance: number
}

export type LeaveYearClosure = {
  leaveYearKey: string
  period: LeaveYearPeriod
  nextLeaveYearKey: string
  nextPeriod: LeaveYearPeriod
  closedAt: string
  closedBy: string
  lines: LeaveYearCloseEmployeeLine[]
}

export function isLeaveYearClosed(closures: LeaveYearClosure[], leaveYearKey: string) {
  return closures.some((item) => item.leaveYearKey === leaveYearKey)
}

export function closureForLeaveYear(closures: LeaveYearClosure[], leaveYearKey: string) {
  return closures.find((item) => item.leaveYearKey === leaveYearKey)
}

/**
 * Prefer an unclosed previous year that has already ended — but only if that
 * year ran after leave was configured in Finch. Years that ended before the
 * organisation’s leave go-live date are never prompted. Otherwise the current
 * year when it is overdue or within the close prompt window.
 */
export function periodNeedingClose(
  company: CompanySettings,
  currentPeriod: LeaveYearPeriod,
  closures: LeaveYearClosure[],
  today: Date,
): LeaveYearPeriod | null {
  if (!company.leaveYearConfigured) return null

  const companyWithAt = withLeaveYearConfiguredAt(company, currentPeriod)
  // ISO date (or period start) from when leave was first set up in the app.
  const configuredFrom = companyWithAt.leaveYearConfiguredAt ?? currentPeriod.start

  const previous = previousLeaveYearPeriod(
    currentPeriod,
    company.leaveYearStart,
    company.leaveYearEnd,
  )
  if (
    previous.end >= configuredFrom &&
    !isLeaveYearClosed(closures, previous.start) &&
    isPastLeaveYearEnd(today, previous.end)
  ) {
    return previous
  }

  if (isLeaveYearClosed(closures, currentPeriod.start)) return null
  if (isPastLeaveYearEnd(today, currentPeriod.end)) return currentPeriod
  if (daysUntilLeaveYearEnd(today, currentPeriod.end) <= LEAVE_YEAR_CLOSE_PROMPT_DAYS) {
    return currentPeriod
  }
  return null
}

export function needsLeaveYearClosePrompt(
  company: CompanySettings,
  currentPeriod: LeaveYearPeriod,
  closures: LeaveYearClosure[],
  today: Date,
) {
  return periodNeedingClose(company, currentPeriod, closures, today) != null
}

export function pendingLeaveInYear(
  requests: LeaveRequest[],
  employees: Employee[],
  period: LeaveYearPeriod,
) {
  const ids = new Set(employees.map((employee) => employee.id))
  return requests.filter(
    (request) =>
      request.status === 'Pending' &&
      ids.has(request.employeeId) &&
      request.start != null &&
      request.start >= period.start &&
      request.start <= period.end,
  )
}

function employeesIncludedInClose(
  employees: Employee[],
  absences: AbsenceRecord[],
  adjustments: LeaveAdjustment[],
  period: LeaveYearPeriod,
) {
  const active = employees.filter((employee) => employee.status === 'Active')
  const activeIds = new Set(active.map((employee) => employee.id))
  const extraIds = new Set<number>()

  for (const absence of absences) {
    if (
      absence.type === 'annual_leave' &&
      absence.start <= period.end &&
      absence.end >= period.start &&
      !activeIds.has(absence.employeeId)
    ) {
      extraIds.add(absence.employeeId)
    }
  }
  for (const adjustment of adjustments) {
    if (adjustment.leaveYearKey === period.start && !activeIds.has(adjustment.employeeId)) {
      extraIds.add(adjustment.employeeId)
    }
  }

  const extras = employees.filter((employee) => extraIds.has(employee.id))
  return [...active, ...extras].sort((a, b) => a.name.localeCompare(b.name))
}

export function buildLeaveYearCloseDraft(args: {
  employees: Employee[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  absences: AbsenceRecord[]
  adjustments: LeaveAdjustment[]
  period: LeaveYearPeriod
}): LeaveYearCloseEmployeeLine[] {
  const entitlementSettings = companyEntitlementSettings(args.company)
  const included = employeesIncludedInClose(
    args.employees,
    args.absences,
    args.adjustments,
    args.period,
  )

  return included.map((employee) =>
    buildCloseLine(
      employee,
      entitlementSettings,
      args.bankHolidays,
      args.absences,
      args.adjustments,
      args.period,
      args.company.defaultRollOver,
    ),
  )
}

function buildCloseLine(
  employee: Employee,
  entitlementSettings: CompanyEntitlementSettings,
  bankHolidays: BankHoliday[],
  absences: AbsenceRecord[],
  adjustments: LeaveAdjustment[],
  period: LeaveYearPeriod,
  defaultRollOver: boolean,
): LeaveYearCloseEmployeeLine {
  const allowance = totalLeaveAllowance(employee, entitlementSettings, bankHolidays)
  const taken = annualLeaveTaken(absences, employee.id, employee.workingDays, period)
  const adjustmentNet = leaveAdjustmentNet(adjustments, employee.id, period)
  const closingBalance = Math.round((allowance + adjustmentNet - taken) * 10) / 10
  const proposedOpeningBalance = defaultRollOver
    ? closingBalance
    : Math.min(0, closingBalance)

  return {
    employeeId: employee.id,
    name: employee.name,
    initials: employee.initials,
    color: employee.color,
    entitlementUnit: employee.entitlementUnit,
    allowance,
    taken,
    adjustmentNet,
    closingBalance,
    proposedOpeningBalance,
  }
}

export function confirmLeaveYearClose(args: {
  draftLines: LeaveYearCloseEmployeeLine[]
  period: LeaveYearPeriod
  company: CompanySettings
  existingClosures: LeaveYearClosure[]
  existingAdjustments: LeaveAdjustment[]
  closedBy: string
  closedAt: Date
}): { closures: LeaveYearClosure[]; adjustments: LeaveAdjustment[] } {
  if (isLeaveYearClosed(args.existingClosures, args.period.start)) {
    return {
      closures: args.existingClosures,
      adjustments: args.existingAdjustments,
    }
  }

  const nextPeriod = nextLeaveYearPeriod(
    args.period,
    args.company.leaveYearStart,
    args.company.leaveYearEnd,
  )
  const closedAt = toIsoDate(args.closedAt)
  const lines = args.draftLines.map((line) => ({
    ...line,
    proposedOpeningBalance: Math.round(line.proposedOpeningBalance * 10) / 10,
  }))

  const closure: LeaveYearClosure = {
    leaveYearKey: args.period.start,
    period: args.period,
    nextLeaveYearKey: nextPeriod.start,
    nextPeriod,
    closedAt,
    closedBy: args.closedBy,
    lines,
  }

  let nextAdjustmentId = nextLeaveAdjustmentId(args.existingAdjustments)
  const openingAdjustments: LeaveAdjustment[] = []

  for (const line of lines) {
    if (line.proposedOpeningBalance === 0) continue
    const amount = Math.abs(line.proposedOpeningBalance)
    openingAdjustments.push({
      id: nextAdjustmentId,
      employeeId: line.employeeId,
      leaveYearKey: nextPeriod.start,
      direction: line.proposedOpeningBalance > 0 ? 'credit' : 'debit',
      amount,
      reason: 'Opening balance from previous leave year',
      recordedBy: args.closedBy,
      recordedAt: closedAt,
    })
    nextAdjustmentId += 1
  }

  return {
    closures: [...args.existingClosures, closure],
    adjustments: [...args.existingAdjustments, ...openingAdjustments],
  }
}

export function formatLeaveYearCloseReport(closure: LeaveYearClosure) {
  const lines = [
    'Finch leave year close report',
    `Leave year: ${formatLeaveYearLabel(closure.period)}`,
    `Closed: ${closure.closedAt} by ${closure.closedBy}`,
    `Opening balances applied to: ${formatLeaveYearLabel(closure.nextPeriod)}`,
    '',
    'Employee | Allowance | Taken | Adjustments | Closing | Opening carried',
    '---------|-----------|-------|-------------|---------|----------------',
  ]

  for (const line of closure.lines) {
    const unit = line.entitlementUnit
    lines.push(
      `${line.name} | ${line.allowance} ${unit} | ${line.taken} ${unit} | ${line.adjustmentNet} ${unit} | ${line.closingBalance} ${unit} | ${line.proposedOpeningBalance} ${unit}`,
    )
  }

  lines.push('')
  lines.push(
    'Note: Opening balances were recorded as leave adjustments on the next leave year after admin approval.',
  )
  return lines.join('\n')
}

export function sortedLeaveYearClosures(closures: LeaveYearClosure[]) {
  return [...closures].sort((a, b) => b.leaveYearKey.localeCompare(a.leaveYearKey))
}
