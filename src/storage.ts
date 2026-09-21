import type { AbsenceRecord, BankHoliday } from './payroll'
import type { NotificationEvents } from './notifications'

type TwoFactorPolicy = 'all' | 'admins' | 'optional'
type BankHolidayRegion = 'england-wales' | 'scotland' | 'ni' | 'custom'

export type StoredLeaveAmendment = {
  start: string
  end: string
  dates: string
  duration: string
  note: string
  requestedAt: string
}

export type StoredPortalMessage = {
  id: number
  employeeId: number
  requestId: number
  author: 'employee' | 'admin'
  authorName: string
  body: string
  createdAt: string
}

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
  startDate?: string
  probationEndDate?: string | null
}

export type StoredTaskDismissal = {
  taskKey: string
  status: 'completed' | 'snoozed'
  snoozedUntil?: string
  updatedAt: string
}

export type StoredPolicyDocument = {
  id: number
  title: string
  description: string
  fileName: string
  fileType: string
  fileDataUrl: string
  updatedAt: string
  accent: 'coral' | 'lavender' | 'mint' | 'sage'
}

export type StoredLeaveRequest = {
  id: number
  employeeId?: number
  name: string
  initials: string
  color: string
  dates: string
  duration: string
  note: string
  status: 'Pending' | 'Approved' | 'Declined' | 'Cancelled'
  leaveType?: 'annual' | 'unpaid' | 'other'
  start?: string
  end?: string
  absenceId?: number
  pendingAmendment?: StoredLeaveAmendment
  source?: 'mandatory'
  mandatoryYearKey?: string
}

export type StoredDocumentFolder = {
  id: number
  employeeId: number
  name: string
  visibility: 'shared' | 'internal'
  createdAt: string
}

export type StoredEmployeeDocument = {
  id: number
  employeeId: number
  folderId?: number
  title: string
  category: 'contract' | 'payslip' | 'tax' | 'identity' | 'other'
  fileName: string
  fileType: string
  fileDataUrl: string
  uploadedAt: string
  uploadedBy: string
  note?: string
}

export type StoredExpenseReceipt = {
  id: number
  fileName: string
  fileType: string
  fileDataUrl: string
}

export type StoredExpenseClaim = {
  id: number
  employeeId: number
  name: string
  initials: string
  color: string
  date: string
  amount: number
  merchant: string
  category: 'travel' | 'meals' | 'equipment' | 'software' | 'other'
  note?: string
  receipts: StoredExpenseReceipt[]
  status: 'Pending' | 'Approved' | 'Declined'
  submittedAt: string
  reviewedAt?: string
  reviewNote?: string
}

export type StoredCompanySettings = {
  name: string
  logoUrl: string | null
  leaveYearStart: string
  leaveYearEnd: string
  leaveYearConfigured?: boolean
  leaveYearConfiguredAt?: string | null
  mandatoryLeaveConfirmations?: {
    leaveYearKey: string
    noneThisYear: boolean
    ranges: { id: number; start: string; end: string; label?: string }[]
    confirmedAt: string
  }[]
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
  lastAutoPayrollSentPeriodEnd?: string | null
  payPeriodStartDay: number
  bankHolidayRegion: BankHolidayRegion
  adminsCanApproveOwnRequests?: boolean
}

export type StoredLeaveAdjustment = {
  id: number
  employeeId: number
  leaveYearKey: string
  direction: 'credit' | 'debit'
  amount: number
  reason: string
  effectiveDate?: string
  recordedBy: string
  recordedAt: string
}

export type StoredLeaveYearClosure = {
  leaveYearKey: string
  period: { start: string; end: string }
  nextLeaveYearKey: string
  nextPeriod: { start: string; end: string }
  closedAt: string
  closedBy: string
  lines: {
    employeeId: number
    name: string
    initials: string
    color: string
    entitlementUnit: 'days' | 'hours'
    allowance: number
    taken: number
    adjustmentNet: number
    closingBalance: number
    proposedOpeningBalance: number
  }[]
}

export type StoredAccount = {
  id: number
  email: string
  displayName: string
  initials: string
  role: 'admin' | 'employee'
  employeeId: number | null
  passwordSalt: string
  passwordHash: string
  status: 'Active' | 'Inactive'
  jobTitle?: string
}

export type FinchAppData = {
  employees: StoredEmployee[]
  absences: AbsenceRecord[]
  company: StoredCompanySettings
  bankHolidays: BankHoliday[]
  requests: StoredLeaveRequest[]
  portalMessages?: StoredPortalMessage[]
  documentFolders?: StoredDocumentFolder[]
  employeeDocuments?: StoredEmployeeDocument[]
  /** @deprecated Identity now uses finch-session + accounts */
  preferAdminView?: boolean
  accounts?: StoredAccount[]
  expenseClaims?: StoredExpenseClaim[]
  vatReceipts?: import('./vatReceipts').VatReceipt[]
  taskDismissals?: StoredTaskDismissal[]
  policies?: StoredPolicyDocument[]
  leaveAdjustments?: StoredLeaveAdjustment[]
  leaveYearClosures?: StoredLeaveYearClosure[]
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
    return true
  } catch {
    return false
  }
}

export function clearFinchAppData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
