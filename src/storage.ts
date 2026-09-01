import type { AbsenceRecord, BankHoliday } from './payroll'
import type { NotificationEvents } from './notifications'

type TwoFactorPolicy = 'all' | 'admins' | 'optional'
type BankHolidayRegion = 'england-wales' | 'scotland' | 'ni' | 'custom'

export type StoredEmployee = {
  id: number
  name: string
  initials: string
  role: string
  entitlement: number
  entitlementUnit: 'days' | 'hours'
  rollOver: number
  color: string
  status: 'Active' | 'Inactive'
  workingDays?: number[]
  entitlementMode?: 'proRata' | 'custom'
}

export type StoredLeaveRequest = {
  id: number
  name: string
  initials: string
  color: string
  dates: string
  duration: string
  note: string
  status: 'Pending' | 'Approved' | 'Declined'
  start?: string
  end?: string
}

export type StoredCompanySettings = {
  name: string
  logoUrl: string | null
  leaveYearStart: string
  leaveYearEnd: string
  defaultRollOver: boolean
  defaultEntitlement: number
  defaultEntitlementUnit: 'days' | 'hours'
  defaultWorkingDays?: number[]
  entitlementIncludesBankHolidays?: boolean
  emailNotifications: boolean
  notificationEvents?: NotificationEvents
  twoFactorRequired: TwoFactorPolicy
  payrollEmail: string
  autoSendPayrollReport: boolean
  autoSendDayOfMonth: number
  payPeriodStartDay: number
  bankHolidayRegion: BankHolidayRegion
}

export type FinchAppData = {
  employees: StoredEmployee[]
  absences: AbsenceRecord[]
  company: StoredCompanySettings
  bankHolidays: BankHoliday[]
  requests: StoredLeaveRequest[]
}

const STORAGE_KEY = 'finch-app-data'

export function loadFinchAppData(): FinchAppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FinchAppData
  } catch {
    return null
  }
}

export function saveFinchAppData(data: FinchAppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore quota or private browsing errors.
  }
}
