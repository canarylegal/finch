import {
  BookOpen,
  CalendarDays,
  Clock3,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  ListTree,
  Receipt,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import { DEFAULT_NOTIFICATION_EVENTS, normalizeNotificationEvents, type NotificationEvents } from './notifications'
import { ENGLAND_WALES_BANK_HOLIDAYS_2026, normalizeWorkingDays, type AbsenceRecord, type BankHolidayRegion } from './payroll'
import { migrateDocumentsToFolders } from './employeeDocuments'
import { withEmploymentDates } from './hrTasks'
import type { MandatoryLeaveConfirmation } from './mandatoryLeave'
import type { Account } from './auth'
import { loadFinchAppData } from './storage'
import type { EntitlementMode } from './leaveBalance'
import type { LeaveRequestType } from './leaveTypes'

export type RequestStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled'
export type ExpenseStatus = 'Pending' | 'Approved' | 'Declined'
export type SettingsTab = 'company' | 'leave' | 'notifications' | 'security' | 'payroll'
export type TwoFactorPolicy = 'all' | 'admins' | 'optional'

export type LeaveAmendment = {
  start: string
  end: string
  dates: string
  duration: string
  note: string
  requestedAt: string
}

export type PortalMessageAuthor = 'employee' | 'admin'

export type PortalMessage = {
  id: number
  employeeId: number
  requestId: number
  author: PortalMessageAuthor
  authorName: string
  body: string
  createdAt: string
}

export type LeaveRequest = {
  id: number
  employeeId: number
  name: string
  initials: string
  color: string
  dates: string
  duration: string
  note: string
  status: RequestStatus
  leaveType?: LeaveRequestType
  start?: string
  end?: string
  absenceId?: number
  pendingAmendment?: LeaveAmendment
  /** Created by company mandatory leave confirmation */
  source?: 'mandatory'
  mandatoryYearKey?: string
}

export type Employee = {
  id: number
  name: string
  initials: string
  role: string
  entitlement: number
  entitlementUnit: 'days' | 'hours'
  rollOver: number
  workingDays: number[]
  entitlementMode: EntitlementMode
  color: string
  status: 'Active' | 'Inactive'
  /** ISO date the employee started */
  startDate: string
  /** ISO date probation ends, or null if none / cleared */
  probationEndDate: string | null
}

export type CompanySettings = {
  name: string
  logoUrl: string | null
  leaveYearStart: string
  leaveYearEnd: string
  /** Explicitly confirmed by admin — not inferred from Jan–Dec defaults */
  leaveYearConfigured: boolean
  /** ISO date when leave year was first confirmed; periods ending before this are not prompted for close */
  leaveYearConfiguredAt: string | null
  mandatoryLeaveConfirmations: MandatoryLeaveConfirmation[]
  defaultRollOver: boolean
  defaultEntitlement: number
  defaultEntitlementUnit: 'days' | 'hours'
  defaultWorkingDays: number[]
  entitlementIncludesBankHolidays: boolean
  emailNotifications: boolean
  notificationEvents: NotificationEvents
  twoFactorRequired: TwoFactorPolicy
  payrollEmail: string
  autoSendPayrollReport: boolean
  autoSendDayOfMonth: number
  /** ISO end date of the last pay period auto-emailed (dedupe). */
  lastAutoPayrollSentPeriodEnd: string | null
  payPeriodStartDay: number
  bankHolidayRegion: BankHolidayRegion
  /**
   * When false (default), non-primary admins cannot approve/decline their own
   * leave or expense requests. Primary admins are always allowed.
   */
  adminsCanApproveOwnRequests: boolean
}

export type MenuItem = {
  label: string
  onClick: () => void
  danger?: boolean
}

export type EmployeeDocumentCategory = 'contract' | 'payslip' | 'tax' | 'identity' | 'other'

export type DocumentFolderVisibility = 'shared' | 'internal'

export type DocumentFolder = {
  id: number
  employeeId: number
  name: string
  visibility: DocumentFolderVisibility
  createdAt: string
}

export type EmployeeDocument = {
  id: number
  employeeId: number
  folderId: number
  title: string
  category: EmployeeDocumentCategory
  fileName: string
  fileType: string
  fileDataUrl: string
  uploadedAt: string
  uploadedBy: string
  note?: string
}

export type ExpenseCategory = 'travel' | 'meals' | 'equipment' | 'software' | 'other'

export type ExpenseReceipt = {
  id: number
  fileName: string
  fileType: string
  fileDataUrl: string
}

export type ExpenseClaim = {
  id: number
  employeeId: number
  name: string
  initials: string
  color: string
  date: string
  amount: number
  merchant: string
  category: ExpenseCategory
  note?: string
  receipts: ExpenseReceipt[]
  status: ExpenseStatus
  submittedAt: string
  reviewedAt?: string
  reviewNote?: string
}

export type PolicyAccent = 'coral' | 'lavender' | 'mint' | 'sage'

export type PolicyDocument = {
  id: number
  title: string
  description: string
  fileName: string
  fileType: string
  fileDataUrl: string
  updatedAt: string
  accent: PolicyAccent
}

/** Local calendar “today” (midnight) for date-only app logic. */
export function appToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export const AVATAR_COLORS = ['sage', 'peach', 'lavender', 'mint'] as const

export const initialEmployees: Employee[] = [
  {
    id: 1,
    name: 'Sophie Carter',
    initials: 'SC',
    role: 'Product designer',
    entitlement: 25,
    entitlementUnit: 'days',
    rollOver: 0,
    workingDays: [1, 2, 3, 4, 5],
    entitlementMode: 'proRata',
    color: 'sage',
    status: 'Active',
    startDate: '2024-01-15',
    probationEndDate: '2024-07-15',
  },
  {
    id: 2,
    name: 'Jamie Wilson',
    initials: 'JW',
    role: 'Content strategist',
    entitlement: 25,
    entitlementUnit: 'days',
    rollOver: 0,
    workingDays: [1, 2, 3, 4, 5],
    entitlementMode: 'proRata',
    color: 'peach',
    status: 'Active',
    startDate: '2026-03-15',
    probationEndDate: '2026-09-15',
  },
  {
    id: 3,
    name: 'Maya Patel',
    initials: 'MP',
    role: 'Operations lead',
    entitlement: 28,
    entitlementUnit: 'days',
    rollOver: 2,
    workingDays: [1, 2, 3, 4],
    entitlementMode: 'proRata',
    color: 'lavender',
    status: 'Active',
    startDate: '2025-10-01',
    probationEndDate: '2026-04-01',
  },
  {
    id: 4,
    name: 'Oliver Reed',
    initials: 'OR',
    role: 'Engineer',
    entitlement: 25,
    entitlementUnit: 'days',
    rollOver: 0,
    workingDays: [2, 3, 4, 5, 6],
    entitlementMode: 'proRata',
    color: 'mint',
    status: 'Active',
    startDate: '2026-06-01',
    probationEndDate: '2026-12-01',
  },
]

export const initialRequests: LeaveRequest[] = [
  {
    id: 1,
    employeeId: 2,
    name: 'Jamie Wilson',
    initials: 'JW',
    color: 'peach',
    dates: '8–11 Sep 2026',
    duration: '4 days',
    note: 'Family holiday',
    status: 'Pending',
    start: '2026-09-08',
    end: '2026-09-11',
  },
  {
    id: 2,
    employeeId: 3,
    name: 'Maya Patel',
    initials: 'MP',
    color: 'lavender',
    dates: '24 Sep 2026',
    duration: '1 day',
    note: 'Personal day',
    status: 'Pending',
    start: '2026-09-24',
    end: '2026-09-24',
  },
  {
    id: 3,
    employeeId: 4,
    name: 'Oliver Reed',
    initials: 'OR',
    color: 'mint',
    dates: '30 Sep–2 Oct 2026',
    duration: '3 days',
    note: 'City break',
    status: 'Pending',
    start: '2026-09-30',
    end: '2026-10-02',
  },
  {
    id: 4,
    employeeId: 1,
    name: 'Sophie Carter',
    initials: 'SC',
    color: 'sage',
    dates: '17–18 Sep 2026',
    duration: '2 days',
    note: 'Long weekend',
    status: 'Pending',
    start: '2026-09-17',
    end: '2026-09-18',
  },
]

export const initialPortalMessages: PortalMessage[] = [
  {
    id: 1,
    employeeId: 2,
    requestId: 1,
    author: 'admin',
    authorName: 'Alex Morgan',
    body: 'Hi Jamie — is anyone covering content while you are away?',
    createdAt: '2026-08-29T10:15:00.000Z',
  },
  {
    id: 2,
    employeeId: 2,
    requestId: 1,
    author: 'employee',
    authorName: 'Jamie Wilson',
    body: 'Yes, Sophie is picking up the weekly newsletter.',
    createdAt: '2026-08-29T14:40:00.000Z',
  },
]

const demoFile = (label: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(`${label}\n\nDemo document stored locally in Finch.`)}`

export const initialDocumentFolders: DocumentFolder[] = [
  { id: 1, employeeId: 1, name: 'Employment documents', visibility: 'shared', createdAt: '2026-01-01T09:00:00.000Z' },
  { id: 2, employeeId: 1, name: 'HR file', visibility: 'internal', createdAt: '2026-01-01T09:00:00.000Z' },
  { id: 3, employeeId: 2, name: 'Employment documents', visibility: 'shared', createdAt: '2026-02-01T09:00:00.000Z' },
  { id: 4, employeeId: 2, name: 'HR file', visibility: 'internal', createdAt: '2026-02-01T09:00:00.000Z' },
  { id: 5, employeeId: 3, name: 'Employment documents', visibility: 'shared', createdAt: '2026-03-01T09:00:00.000Z' },
  { id: 6, employeeId: 3, name: 'HR file', visibility: 'internal', createdAt: '2026-03-01T09:00:00.000Z' },
  { id: 7, employeeId: 4, name: 'Employment documents', visibility: 'shared', createdAt: '2026-04-01T09:00:00.000Z' },
  { id: 8, employeeId: 4, name: 'HR file', visibility: 'internal', createdAt: '2026-04-01T09:00:00.000Z' },
]

export const initialEmployeeDocuments: EmployeeDocument[] = [
  {
    id: 1,
    employeeId: 1,
    folderId: 1,
    title: 'Employment contract',
    category: 'contract',
    fileName: 'sophie-carter-contract.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Employment contract — Sophie Carter'),
    uploadedAt: '2026-01-15T09:00:00.000Z',
    uploadedBy: 'Alex Morgan',
    note: 'Signed copy on file',
  },
  {
    id: 2,
    employeeId: 1,
    folderId: 1,
    title: 'Payslip — July 2026',
    category: 'payslip',
    fileName: 'payslip-2026-07.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Payslip — July 2026'),
    uploadedAt: '2026-08-03T12:00:00.000Z',
    uploadedBy: 'Alex Morgan',
  },
  {
    id: 3,
    employeeId: 1,
    folderId: 1,
    title: 'P60 — 2025/26',
    category: 'tax',
    fileName: 'p60-2025-26.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('P60 — 2025/26'),
    uploadedAt: '2026-05-20T11:30:00.000Z',
    uploadedBy: 'Alex Morgan',
  },
  {
    id: 4,
    employeeId: 2,
    folderId: 3,
    title: 'Employment contract',
    category: 'contract',
    fileName: 'jamie-wilson-contract.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Employment contract — Jamie Wilson'),
    uploadedAt: '2026-02-10T09:00:00.000Z',
    uploadedBy: 'Alex Morgan',
  },
  {
    id: 5,
    employeeId: 1,
    folderId: 2,
    title: 'Probation review notes',
    category: 'other',
    fileName: 'probation-review-notes.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Probation review notes — internal only'),
    uploadedAt: '2026-06-01T16:00:00.000Z',
    uploadedBy: 'Alex Morgan',
    note: 'Admin only — not shared with employee',
  },
]

export const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My leave', icon: CalendarDays },
  { label: 'Expenses', icon: Receipt },
  { label: 'Policies', icon: BookOpen },
  { label: 'Documents', icon: FileText },
]

export const adminNavItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Requests', icon: Clock3 },
  { label: 'Absences', icon: HeartPulse },
  { label: 'Team calendar', icon: CalendarDays },
  { label: 'Payroll reports', icon: ScrollText },
  { label: 'VAT receipts', icon: Receipt },
  { label: 'Leave years', icon: History },
  { label: 'Audit log', icon: ListTree },
  { label: 'Employees', icon: Users },
  { label: 'Policies', icon: BookOpen },
  { label: 'Settings', icon: Settings },
]

export const defaultCompanySettings: CompanySettings = {
  name: '',
  logoUrl: null,
  leaveYearStart: 'January',
  leaveYearEnd: 'December',
  leaveYearConfigured: false,
  leaveYearConfiguredAt: null,
  mandatoryLeaveConfirmations: [],
  defaultRollOver: false,
  defaultEntitlement: 25,
  defaultEntitlementUnit: 'days',
  defaultWorkingDays: [1, 2, 3, 4, 5],
  entitlementIncludesBankHolidays: false,
  emailNotifications: true,
  notificationEvents: DEFAULT_NOTIFICATION_EVENTS,
  twoFactorRequired: 'admins',
  payrollEmail: '',
  autoSendPayrollReport: false,
  autoSendDayOfMonth: 3,
  lastAutoPayrollSentPeriodEnd: null,
  payPeriodStartDay: 10,
  bankHolidayRegion: 'england-wales',
  adminsCanApproveOwnRequests: false,
}

export function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Drop annual absences that match known request-derived orphan patterns:
 * Pending mirrors, Declined/Cancelled leftovers, and amendment date ghosts.
 * Manual absences (origin: 'manual') and linked Approved absences are preserved.
 */
export function scrubOrphanLeaveAbsences(
  absences: AbsenceRecord[],
  requests: {
    employeeId?: number
    status: string
    start?: string
    end?: string
    absenceId?: number
  }[],
) {
  const linkedApprovedIds = new Set(
    requests
      .filter((request) => request.status === 'Approved' && request.absenceId != null)
      .map((request) => request.absenceId as number),
  )
  const pendingUnlinkedKeys = new Set(
    requests
      .filter(
        (request) =>
          request.status === 'Pending' &&
          request.employeeId != null &&
          request.start &&
          request.end &&
          request.absenceId == null,
      )
      .map((request) => `${request.employeeId}|${request.start}|${request.end}`),
  )
  const declinedOrCancelledKeys = new Set(
    requests
      .filter(
        (request) =>
          (request.status === 'Declined' || request.status === 'Cancelled') &&
          request.employeeId != null &&
          request.start &&
          request.end,
      )
      .map((request) => `${request.employeeId}|${request.start}|${request.end}`),
  )

  return absences.filter((absence) => {
    if (absence.type !== 'annual_leave') return true
    if (linkedApprovedIds.has(absence.id)) return true
    if (absence.origin === 'manual') return true

    const key = `${absence.employeeId}|${absence.start}|${absence.end}`
    if (pendingUnlinkedKeys.has(key)) return false
    if (declinedOrCancelledKeys.has(key)) return false

    // Amendment ghost on direct upgrade: unlinked request-derived annual while a
    // different linked Approved booking exists for the same employee.
    const hasReplacementBooking = requests.some(
      (request) =>
        request.status === 'Approved' &&
        request.employeeId === absence.employeeId &&
        request.absenceId != null &&
        request.absenceId !== absence.id &&
        (request.start !== absence.start || request.end !== absence.end),
    )
    if (hasReplacementBooking) return false

    return true
  })
}

/** @deprecated Use scrubOrphanLeaveAbsences */
export const scrubOrphanPendingAbsences = scrubOrphanLeaveAbsences

export function readPersistedState() {
  const stored = loadFinchAppData()
  if (!stored) return null
  const company = {
    ...defaultCompanySettings,
    ...stored.company,
    defaultWorkingDays: normalizeWorkingDays(stored.company.defaultWorkingDays),
    defaultEntitlementUnit:
      stored.company.defaultEntitlementUnit === 'hours'
        ? 'days'
        : (stored.company.defaultEntitlementUnit ?? defaultCompanySettings.defaultEntitlementUnit),
    entitlementIncludesBankHolidays:
      stored.company.entitlementIncludesBankHolidays ?? defaultCompanySettings.entitlementIncludesBankHolidays,
    notificationEvents: normalizeNotificationEvents(stored.company.notificationEvents),
    leaveYearConfigured: stored.company.leaveYearConfigured ?? false,
    leaveYearConfiguredAt: stored.company.leaveYearConfiguredAt ?? null,
    mandatoryLeaveConfirmations: stored.company.mandatoryLeaveConfirmations ?? [],
    adminsCanApproveOwnRequests: stored.company.adminsCanApproveOwnRequests ?? false,
    lastAutoPayrollSentPeriodEnd: stored.company.lastAutoPayrollSentPeriodEnd ?? null,
  }
  const migrated = migrateDocumentsToFolders(
    stored.employees,
    stored.documentFolders ?? [],
    stored.employeeDocuments ?? [],
  )
  const requests = stored.requests.map((request) => {
    const employeeId =
      request.employeeId ??
      stored.employees.find((employee) => employee.name === request.name)?.id ??
      0
    const clearedLink =
      request.status === 'Declined' || request.status === 'Cancelled'
        ? { absenceId: undefined }
        : {}
    return {
      ...request,
      employeeId,
      ...clearedLink,
    }
  })
  return {
    employees: stored.employees.map((employee) =>
      withEmploymentDates({
        ...employee,
        workingDays: normalizeWorkingDays(employee.workingDays),
        entitlementMode: employee.entitlementMode ?? 'custom',
        entitlementUnit: employee.entitlementUnit === 'hours' ? 'days' : employee.entitlementUnit,
      }),
    ),
    absences: scrubOrphanLeaveAbsences(stored.absences, requests),
    company,
    bankHolidays: stored.bankHolidays ?? ENGLAND_WALES_BANK_HOLIDAYS_2026,
    requests,
    portalMessages: stored.portalMessages ?? [],
    documentFolders: migrated.folders,
    employeeDocuments: migrated.documents.map((document) =>
      document.fileType === 'application/pdf' && document.fileDataUrl.startsWith('data:text/plain')
        ? {
            ...document,
            fileType: 'text/plain',
            fileName: document.fileName.replace(/\.pdf$/i, '.txt'),
          }
        : document,
    ),
    accounts: (stored.accounts as Account[] | undefined) ?? [],
    expenseClaims: stored.expenseClaims,
    vatReceipts: stored.vatReceipts ?? [],
    taskDismissals: stored.taskDismissals ?? [],
    policies: stored.policies,
    leaveAdjustments: stored.leaveAdjustments ?? [],
    leaveYearClosures: stored.leaveYearClosures ?? [],
    auditEvents: stored.auditEvents ?? [],
  }
}

export function companyEntitlementSettings(company: CompanySettings) {
  return {
    defaultEntitlement: company.defaultEntitlement,
    defaultEntitlementUnit: company.defaultEntitlementUnit,
    defaultWorkingDays: company.defaultWorkingDays,
    entitlementIncludesBankHolidays: company.entitlementIncludesBankHolidays,
  }
}
