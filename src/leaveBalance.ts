import {
  countWorkingDaysInRange,
  normalizeWorkingDays,
  overlapWorkingDays,
  parseIsoDate,
  type AbsenceRecord,
  type BankHoliday,
} from './payroll'
import { absenceInLeaveYear, requestInLeaveYear, type LeaveYearPeriod } from './leaveYear'
import { leaveAdjustmentNet, type LeaveAdjustment } from './leaveAdjustments'
import { isAnnualLeaveRequest, type LeaveRequestType } from './leaveTypes'

export type EntitlementMode = 'proRata' | 'custom'

export type LeaveRequestLike = {
  id: number
  employeeId?: number
  name: string
  duration: string
  status: 'Pending' | 'Approved' | 'Declined' | 'Cancelled'
  leaveType?: LeaveRequestType
  source?: 'mandatory'
  start?: string
  end?: string
}

export type CompanyEntitlementSettings = {
  defaultEntitlement: number
  defaultEntitlementUnit: 'days' | 'hours'
  defaultWorkingDays?: number[]
  entitlementIncludesBankHolidays?: boolean
}

export type EmployeeLike = {
  id: number
  name: string
  entitlement: number
  rollOver: number
  entitlementUnit: 'days' | 'hours'
  workingDays?: number[]
  entitlementMode?: EntitlementMode
}

export function entitlementBasisLabel(includesBankHolidays: boolean) {
  return includesBankHolidays
    ? 'Including bank holidays'
    : 'Excluding bank holidays'
}

export function entitlementInputHelper(includesBankHolidays: boolean) {
  return includesBankHolidays
    ? 'Enter the total annual holiday figure from the contract, including bank holidays. Scheduled bank holidays on an employee’s working days count toward this total.'
    : 'Enter bookable leave only. Bank holidays are paid separately and do not come out of this allowance.'
}

export function scheduledBankHolidaysForEmployee(
  bankHolidays: BankHoliday[],
  workingDays: number[] | undefined,
) {
  const pattern = normalizeWorkingDays(workingDays)
  return bankHolidays.filter((holiday) => {
    const day = parseIsoDate(holiday.date).getDay()
    return pattern.includes(day)
  }).length
}

export function parseDurationDays(duration: string) {
  const match = duration.match(/([\d.]+)/)
  return match ? Number(match[1]) : 0
}

export function proRateEntitlement(
  fullTimeEntitlement: number,
  fullTimeWorkingDays: number[] | undefined,
  employeeWorkingDays: number[] | undefined,
) {
  const fullTimeCount = normalizeWorkingDays(fullTimeWorkingDays).length
  const employeeCount = normalizeWorkingDays(employeeWorkingDays).length
  if (fullTimeCount === 0) return fullTimeEntitlement
  const raw = fullTimeEntitlement * (employeeCount / fullTimeCount)
  return Math.round(raw * 2) / 2
}

export function effectiveEntitlement(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
) {
  if (employee.entitlementMode === 'custom') {
    return employee.entitlement
  }
  return proRateEntitlement(
    company.defaultEntitlement,
    company.defaultWorkingDays,
    employee.workingDays,
  )
}

export function bookableEntitlement(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
  bankHolidays: BankHoliday[] = [],
) {
  const total = effectiveEntitlement(employee, company)
  if (!company.entitlementIncludesBankHolidays) return total

  const bankHolidayDays = scheduledBankHolidaysForEmployee(bankHolidays, employee.workingDays)
  return Math.max(0, Math.round((total - bankHolidayDays) * 2) / 2)
}

export function describeBookableEntitlement(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
  bankHolidays: BankHoliday[] = [],
) {
  const total = effectiveEntitlement(employee, company)
  const unit = employee.entitlementUnit

  if (!company.entitlementIncludesBankHolidays) {
    return `${total} ${unit} bookable`
  }

  const bankHolidayDays = scheduledBankHolidaysForEmployee(bankHolidays, employee.workingDays)
  const bookable = bookableEntitlement(employee, company, bankHolidays)
  return `${total} ${unit} incl. bank holidays → ${bookable} ${unit} bookable (${bankHolidayDays} bank holidays)`
}

export function totalLeaveAllowance(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
  bankHolidays: BankHoliday[] = [],
) {
  return bookableEntitlement(employee, company, bankHolidays) + employee.rollOver
}

export function proRataPercentage(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
) {
  if (employee.entitlementMode === 'custom') return null
  const fullTimeCount = normalizeWorkingDays(company.defaultWorkingDays).length
  const employeeCount = normalizeWorkingDays(employee.workingDays).length
  if (fullTimeCount === 0) return null
  return Math.round((employeeCount / fullTimeCount) * 100)
}

export function annualLeaveTaken(
  absences: AbsenceRecord[],
  employeeId: number,
  workingDays?: number[],
  leaveYear?: LeaveYearPeriod,
) {
  const pattern = normalizeWorkingDays(workingDays)
  return absences
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        record.type === 'annual_leave' &&
        (!leaveYear || absenceInLeaveYear(record, leaveYear)),
    )
    .reduce((total, record) => {
      if (!leaveYear) {
        return total + countWorkingDaysInRange(record.start, record.end, pattern)
      }
      return (
        total +
        overlapWorkingDays(record.start, record.end, leaveYear.start, leaveYear.end, pattern)
      )
    }, 0)
}

export function pendingLeaveDays(
  requests: LeaveRequestLike[],
  employeeId: number,
  leaveYear?: LeaveYearPeriod,
  excludeRequestId?: number,
  employeeName?: string,
  workingDays?: number[],
) {
  const pattern = normalizeWorkingDays(workingDays)
  return requests
    .filter(
      (request) =>
        (request.employeeId === employeeId ||
          (request.employeeId == null && employeeName != null && request.name === employeeName)) &&
        request.status === 'Pending' &&
        isAnnualLeaveRequest(request) &&
        request.id !== excludeRequestId &&
        (!leaveYear ||
          (request.start != null &&
            request.end != null &&
            request.start <= leaveYear.end &&
            request.end >= leaveYear.start) ||
          requestInLeaveYear(request.start, leaveYear)),
    )
    .reduce((total, request) => {
      if (leaveYear && request.start && request.end) {
        return (
          total +
          overlapWorkingDays(request.start, request.end, leaveYear.start, leaveYear.end, pattern)
        )
      }
      return total + parseDurationDays(request.duration)
    }, 0)
}

/** Working days of a leave range that fall inside the leave year. */
export function leaveDaysInLeaveYear(
  start: string,
  end: string,
  leaveYear: LeaveYearPeriod,
  workingDays?: number[],
) {
  return overlapWorkingDays(
    start,
    end,
    leaveYear.start,
    leaveYear.end,
    normalizeWorkingDays(workingDays),
  )
}

export function remainingAnnualLeave(
  employee: EmployeeLike,
  company: CompanyEntitlementSettings,
  bankHolidays: BankHoliday[],
  absences: AbsenceRecord[],
  requests: LeaveRequestLike[],
  leaveYear: LeaveYearPeriod,
  additionalDays = 0,
  excludeRequestId?: number,
  adjustments: LeaveAdjustment[] = [],
) {
  const allowance = totalLeaveAllowance(employee, company, bankHolidays)
  const adjustmentNet = leaveAdjustmentNet(adjustments, employee.id, leaveYear)
  const taken = annualLeaveTaken(absences, employee.id, employee.workingDays, leaveYear)
  const pending = pendingLeaveDays(
    requests,
    employee.id,
    leaveYear,
    excludeRequestId,
    employee.name,
    employee.workingDays,
  )
  return allowance + adjustmentNet - taken - pending - additionalDays
}

export function formatBalanceAmount(amount: number, unit: string) {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10
  return `${rounded} ${unit}`
}

export function overAllowanceMessage(name: string, amount: number, unit: string) {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10
  return `${name} would exceed their allowance by ${rounded} ${unit}. Continue anyway?`
}
