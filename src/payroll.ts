export type AbsenceType =
  | 'annual_leave'
  | 'sick_paid'
  | 'sick_unpaid'
  | 'maternity'
  | 'unpaid_leave'
  | 'bank_holiday'
  | 'adjustment'

export type AbsenceRecord = {
  id: number
  employeeId: number
  type: AbsenceType
  start: string
  end: string
  amount: number
  note: string
  recordedBy: string
  recordedAt: string
  adjustmentLabel?: string
}

export type PayPeriodType = 'monthly' | 'weekly'

export type BankHolidayRegion = 'england-wales' | 'scotland' | 'ni' | 'custom'

export type PayrollSettings = {
  payPeriodType: PayPeriodType
  payrollEmail: string
  autoSendPayrollReport: boolean
  autoSendDayOfMonth: number
  bankHolidayRegion: BankHolidayRegion
}

export type BankHoliday = {
  date: string
  name: string
}

export type PayrollReportRow = {
  employeeId: number
  employeeName: string
  payPeriodStart: string
  payPeriodEnd: string
  workingDaysInPeriod: number
  daysWorked: number
  annualLeaveDays: number
  sickPaidDays: number
  sickUnpaidDays: number
  maternityDays: number
  bankHolidayDays: number
  unpaidLeaveDays: number
  adjustments: string
}

export const PAYROLL_DISCLAIMER =
  'Payroll notice: Finch records absences and working time only. It does not calculate Statutory Sick Pay (SSP), holiday pay, or other statutory amounts. Payroll must apply SSP and all pay rules before processing.'

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  annual_leave: 'Annual leave',
  sick_paid: 'Sick leave (paid)',
  sick_unpaid: 'Sick leave (unpaid)',
  maternity: 'Maternity leave',
  unpaid_leave: 'Unpaid leave',
  bank_holiday: 'Bank holiday',
  adjustment: 'Adjustment',
}

export const ENGLAND_WALES_BANK_HOLIDAYS_2026: BankHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'Early May bank holiday' },
  { date: '2026-05-25', name: 'Spring bank holiday' },
  { date: '2026-08-31', name: 'Summer bank holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)' },
]

export const SCOTLAND_BANK_HOLIDAYS_2026: BankHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-02', name: '2nd January' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-04', name: 'Early May bank holiday' },
  { date: '2026-05-25', name: 'Spring bank holiday' },
  { date: '2026-08-03', name: 'Summer bank holiday' },
  { date: '2026-11-30', name: "St Andrew's Day" },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)' },
]

export const NORTHERN_IRELAND_BANK_HOLIDAYS_2026: BankHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-03-17', name: "St Patrick's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'Early May bank holiday' },
  { date: '2026-05-25', name: 'Spring bank holiday' },
  { date: '2026-07-13', name: 'Battle of the Boyne (Orangemen’s Day)' },
  { date: '2026-08-31', name: 'Summer bank holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)' },
]

export function bankHolidaysForRegion(region: BankHolidayRegion): BankHoliday[] {
  switch (region) {
    case 'scotland':
      return SCOTLAND_BANK_HOLIDAYS_2026
    case 'ni':
      return NORTHERN_IRELAND_BANK_HOLIDAYS_2026
    case 'england-wales':
      return ENGLAND_WALES_BANK_HOLIDAYS_2026
    default:
      return ENGLAND_WALES_BANK_HOLIDAYS_2026
  }
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDisplayDate(value: string) {
  return parseIsoDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** JavaScript weekday index: 0 = Sunday … 6 = Saturday */
export const DEFAULT_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5]

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const WORKING_WEEK_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Mon–Thu', days: [1, 2, 3, 4] },
  { label: 'Tue–Sat', days: [2, 3, 4, 5, 6] },
  { label: 'Mon–Wed–Fri', days: [1, 3, 5] },
]

export function normalizeWorkingDays(days: number[] | undefined) {
  if (!days?.length) return [...DEFAULT_WORKING_DAYS]
  const unique = [...new Set(days.filter((day) => day >= 0 && day <= 6))]
  unique.sort((a, b) => a - b)
  return unique.length ? unique : [...DEFAULT_WORKING_DAYS]
}

export function formatWorkingWeek(days: number[] | undefined) {
  const normalized = normalizeWorkingDays(days)
  if (normalized.length === 7) return 'Every day'
  if (normalized.join(',') === DEFAULT_WORKING_DAYS.join(',')) return 'Mon–Fri'
  return normalized.map((day) => WEEKDAY_LABELS[day]).join(', ')
}

export function countWorkingDaysInRange(
  start: string,
  end: string,
  workingDays: number[] = [...DEFAULT_WORKING_DAYS],
) {
  if (!start || !end || end < start) return 0
  const pattern = normalizeWorkingDays(workingDays)
  let count = 0
  const cursor = parseIsoDate(start)
  const last = parseIsoDate(end)
  while (cursor <= last) {
    if (pattern.includes(cursor.getDay())) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function countWeekdaysInRange(start: string, end: string) {
  return countWorkingDaysInRange(start, end, [...DEFAULT_WORKING_DAYS])
}

export function overlapWorkingDays(
  absenceStart: string,
  absenceEnd: string,
  periodStart: string,
  periodEnd: string,
  workingDays: number[] = [...DEFAULT_WORKING_DAYS],
) {
  const start = absenceStart > periodStart ? absenceStart : periodStart
  const end = absenceEnd < periodEnd ? absenceEnd : periodEnd
  if (end < start) return 0
  return countWorkingDaysInRange(start, end, workingDays)
}

export function overlapWeekdays(
  absenceStart: string,
  absenceEnd: string,
  periodStart: string,
  periodEnd: string,
) {
  return overlapWorkingDays(absenceStart, absenceEnd, periodStart, periodEnd, [...DEFAULT_WORKING_DAYS])
}

export function bankHolidaysOnWorkingDays(
  holidays: BankHoliday[],
  periodStart: string,
  periodEnd: string,
  workingDays: number[] = [...DEFAULT_WORKING_DAYS],
) {
  const pattern = normalizeWorkingDays(workingDays)
  return bankHolidaysInPeriod(holidays, periodStart, periodEnd).filter((holiday) => {
    const day = parseIsoDate(holiday.date).getDay()
    return pattern.includes(day)
  }).length
}

export function getMonthlyPayPeriod(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

/** Pay period ending in the given month (0-indexed). e.g. startDay=10 → 10 Aug–9 Sep for September. */
export function getPayPeriodForEndMonth(payPeriodStartDay: number, year: number, month: number) {
  if (payPeriodStartDay <= 1) {
    return getMonthlyPayPeriod(year, month)
  }

  const endDay = payPeriodStartDay - 1
  const end = new Date(year, month, endDay)
  const start = new Date(year, month - 1, payPeriodStartDay)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

export function describePayPeriodSchedule(payPeriodStartDay: number) {
  if (payPeriodStartDay <= 1) {
    return 'Each pay period runs from the 1st to the last day of the calendar month.'
  }

  const endDay = payPeriodStartDay - 1
  return `Each pay period runs from the ${payPeriodStartDay}${ordinalSuffix(payPeriodStartDay)} to the ${endDay}${ordinalSuffix(endDay)} of the following month.`
}

function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

export function formatPayPeriodLabel(start: string, end: string) {
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`
}

export function bankHolidaysInPeriod(holidays: BankHoliday[], periodStart: string, periodEnd: string) {
  return holidays.filter((holiday) => holiday.date >= periodStart && holiday.date <= periodEnd)
}

export function sumAbsenceDaysInPeriod(
  records: AbsenceRecord[],
  employeeId: number,
  type: AbsenceType,
  periodStart: string,
  periodEnd: string,
  workingDays: number[] = [...DEFAULT_WORKING_DAYS],
) {
  return records
    .filter((record) => record.employeeId === employeeId && record.type === type)
    .reduce(
      (total, record) =>
        total + overlapWorkingDays(record.start, record.end, periodStart, periodEnd, workingDays),
      0,
    )
}

export function adjustmentSummaryInPeriod(
  records: AbsenceRecord[],
  employeeId: number,
  periodStart: string,
  periodEnd: string,
  workingDays: number[] = [...DEFAULT_WORKING_DAYS],
) {
  return records
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        record.type === 'adjustment' &&
        overlapWorkingDays(record.start, record.end, periodStart, periodEnd, workingDays) > 0,
    )
    .map((record) => record.adjustmentLabel || record.note || 'Adjustment')
    .join('; ')
}

type EmployeeLike = {
  id: number
  name: string
  status: 'Active' | 'Inactive'
  workingDays?: number[]
}

export function buildPayrollReport({
  employees,
  absences,
  bankHolidays,
  periodStart,
  periodEnd,
}: {
  employees: EmployeeLike[]
  absences: AbsenceRecord[]
  bankHolidays: BankHoliday[]
  periodStart: string
  periodEnd: string
}): PayrollReportRow[] {
  return employees
    .filter((employee) => employee.status === 'Active')
    .map((employee) => {
      const workingDays = normalizeWorkingDays(employee.workingDays)
      const workingDaysInPeriod = countWorkingDaysInRange(periodStart, periodEnd, workingDays)
      const annualLeaveDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'annual_leave',
        periodStart,
        periodEnd,
        workingDays,
      )
      const sickPaidDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'sick_paid',
        periodStart,
        periodEnd,
        workingDays,
      )
      const sickUnpaidDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'sick_unpaid',
        periodStart,
        periodEnd,
        workingDays,
      )
      const maternityDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'maternity',
        periodStart,
        periodEnd,
        workingDays,
      )
      const unpaidLeaveDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'unpaid_leave',
        periodStart,
        periodEnd,
        workingDays,
      )
      const employeeBankHolidayDays = sumAbsenceDaysInPeriod(
        absences,
        employee.id,
        'bank_holiday',
        periodStart,
        periodEnd,
        workingDays,
      )
      const scheduledBankHolidays = bankHolidaysOnWorkingDays(
        bankHolidays,
        periodStart,
        periodEnd,
        workingDays,
      )
      const absenceDays =
        annualLeaveDays +
        sickPaidDays +
        sickUnpaidDays +
        maternityDays +
        unpaidLeaveDays +
        employeeBankHolidayDays
      const daysWorked = Math.max(0, workingDaysInPeriod - scheduledBankHolidays - absenceDays)

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        workingDaysInPeriod,
        daysWorked,
        annualLeaveDays,
        sickPaidDays,
        sickUnpaidDays,
        maternityDays,
        bankHolidayDays: employeeBankHolidayDays || scheduledBankHolidays,
        unpaidLeaveDays,
        adjustments: adjustmentSummaryInPeriod(
          absences,
          employee.id,
          periodStart,
          periodEnd,
          workingDays,
        ),
      }
    })
}

export function payrollReportToCsv(rows: PayrollReportRow[]) {
  const headers = [
    'Employee',
    'Pay period start',
    'Pay period end',
    'Working days in period',
    'Days worked',
    'Annual leave',
    'Sick leave (paid)',
    'Sick leave (unpaid)',
    'Maternity leave',
    'Bank holidays',
    'Unpaid leave',
    'Adjustments',
  ]
  const lines = rows.map((row) =>
    [
      row.employeeName,
      row.payPeriodStart,
      row.payPeriodEnd,
      row.workingDaysInPeriod,
      row.daysWorked,
      row.annualLeaveDays,
      row.sickPaidDays,
      row.sickUnpaidDays,
      row.maternityDays,
      row.bankHolidayDays,
      row.unpaidLeaveDays,
      row.adjustments,
    ].join(','),
  )
  return [PAYROLL_DISCLAIMER, '', headers.join(','), ...lines].join('\n')
}

export function absenceTypeColor(type: AbsenceType): 'coral' | 'lavender' | 'mint' | 'yellow' {
  switch (type) {
    case 'annual_leave':
      return 'coral'
    case 'sick_paid':
    case 'sick_unpaid':
      return 'lavender'
    case 'maternity':
      return 'mint'
    case 'bank_holiday':
      return 'yellow'
    default:
      return 'mint'
  }
}

export const initialAbsences: AbsenceRecord[] = [
  {
    id: 1,
    employeeId: 2,
    type: 'annual_leave',
    start: '2026-09-08',
    end: '2026-09-12',
    amount: 5,
    note: 'Family holiday',
    recordedBy: 'Alex Morgan',
    recordedAt: '2026-08-20',
  },
  {
    id: 2,
    employeeId: 3,
    type: 'annual_leave',
    start: '2026-09-24',
    end: '2026-09-24',
    amount: 1,
    note: 'Personal day',
    recordedBy: 'Alex Morgan',
    recordedAt: '2026-08-22',
  },
  {
    id: 3,
    employeeId: 1,
    type: 'sick_paid',
    start: '2026-08-04',
    end: '2026-08-05',
    amount: 2,
    note: 'Recorded by admin',
    recordedBy: 'Alex Morgan',
    recordedAt: '2026-08-04',
  },
]
