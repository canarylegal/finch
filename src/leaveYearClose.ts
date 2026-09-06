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
  type LeaveYearPeriod,
} from './leaveYear'
import { toIsoDate, type AbsenceRecord, type BankHoliday } from './payroll'

/** Prompt admins this many days before leave year end (inclusive). */
export const LEAVE_YEAR_CLOSE_PROMPT_DAYS = 130

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

export function needsLeaveYearClosePrompt(
  company: CompanySettings,
  period: LeaveYearPeriod,
  closures: LeaveYearClosure[],
  today: Date,
) {
  if (!company.leaveYearConfigured) return false
  if (isLeaveYearClosed(closures, period.start)) return false
  if (isPastLeaveYearEnd(today, period.end)) return true
  return daysUntilLeaveYearEnd(today, period.end) <= LEAVE_YEAR_CLOSE_PROMPT_DAYS
}

export function pendingLeaveInYear(
  requests: LeaveRequest[],
  employees: Employee[],
  period: LeaveYearPeriod,
) {
  const names = new Set(employees.map((employee) => employee.name))
  return requests.filter(
    (request) =>
      request.status === 'Pending' &&
      names.has(request.name) &&
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
): LeaveYearCloseEmployeeLine {
  const allowance = totalLeaveAllowance(employee, entitlementSettings, bankHolidays)
  const taken = annualLeaveTaken(absences, employee.id, employee.workingDays, period)
  const adjustmentNet = leaveAdjustmentNet(adjustments, employee.id, period)
  const closingBalance = Math.round((allowance + adjustmentNet - taken) * 10) / 10

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
    proposedOpeningBalance: closingBalance,
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
