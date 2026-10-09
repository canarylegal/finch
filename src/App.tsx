import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Check,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { AbsencesPage, PayrollReportsPage, RecordAbsenceModal } from './AbsencesAndPayroll'
import { FinchMark } from './components/FinchMark'
import { MoreMenu } from './components/MoreMenu'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { toIsoDate } from './calendarUtils'
import {
  appToday,
  AVATAR_COLORS,
  adminNavItems,
  companyEntitlementSettings,
  companyInitials,
  navItems,
  type CompanySettings,
  type DocumentFolderVisibility,
  type Employee,
  type EmployeeDocumentCategory,
  type ExpenseCategory,
  type ExpenseReceipt,
  type RequestStatus,
  type SettingsTab,
} from './domain'
import { emptyRuntimeData } from './emptyState'
import {
  appendAuditEvent,
  createAuditEvent,
  mergeAuditEvents,
  type AuditEvent,
} from './auditLog'
import {
  createAccountRequest,
  emailPayrollReportRequest,
  fetchAppData,
  fetchMe,
  logoutRequest,
  saveAppData,
  updateAccountRequest,
} from './api'
import { AuditLogPage } from './pages/AuditLogPage'
import { VatReceiptsPage } from './pages/VatReceiptsPage'
import { getLeaveYearPeriod } from './leaveYear'
import {
  leaveDaysInLeaveYear,
  overAllowanceMessage,
  parseDurationDays,
  remainingAnnualLeave,
} from './leaveBalance'
import {
  AddEmployeeModal,
  EmployeeEditModal,
  EmployeeLeaveHistoryModal,
  LeaveAdjustmentModal,
} from './modals/EmployeeModals'
import { AdminAddLeaveModal, LeaveModal } from './modals/LeaveModals'
import { LeaveRequestDetailModal } from './modals/LeaveRequestDetailModal'
import { ExpenseClaimModal } from './modals/ExpenseClaimModal'
import { ExpenseClaimDetailModal } from './modals/ExpenseClaimDetailModal'
import {
  buildLeaveAmendment,
  buildLeaveRequestFields,
} from './leaveRequestHelpers'
import { createPortalMessage } from './portalMessages'
import { describeConflicts, mergeAppData } from './syncMerge'
import { type Account } from './auth'
import { LoginPage } from './pages/LoginPage'
import { LandingPage } from './pages/LandingPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { HelpPage } from './pages/HelpPage'
import { RecoveryConsole } from './pages/RecoveryConsole'
import { OrgSetupWizard } from './pages/OrgSetupWizard'
import {
  createDefaultFoldersForEmployee,
  documentCountInFolder,
  nextDocumentFolderId,
  nextEmployeeDocumentId,
} from './employeeDocuments'
import {
  dispatchNotificationEmail,
  shouldNotify,
} from './notificationDelivery'
import { AdminDashboard, EmployeeDashboard } from './pages/Dashboards'
import { AdminEmployeeDocumentsPage } from './pages/AdminEmployeeDocumentsPage'
import { AdminRequests } from './pages/AdminRequestsPage'
import { Documents } from './pages/DocumentsPage'
import { Employees } from './pages/EmployeesPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { LeaveYearsPage } from './pages/LeaveYearsPage'
import { MyLeavePage } from './pages/MyLeavePage'
import {
  needsLeaveYearClosePrompt,
  withLeaveYearConfiguredAt,
  type LeaveYearClosure,
} from './leaveYearClose'
import { Policies } from './pages/PoliciesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TeamCalendar } from './pages/TeamCalendarPage'
import {
  bankHolidaysForRegion,
  buildPayrollReport,
  countWorkingDaysInRange,
  dueAutoPayrollPeriod,
  formatPayPeriodLabel,
  payrollReportToCsv,
  payrollReportToEmailBody,
  type AbsenceRecord,
  type BankHoliday,
} from './payroll'
import {
  formatGbp,
  nextExpenseClaimId,
  pendingExpenseCount,
} from './expenses'
import type { VatReceipt } from './vatReceipts'
import {
  LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE,
  applyMandatoryLeaveBookings,
  confirmationForLeaveYear,
  mandatoryBookingSignature,
} from './mandatoryLeave'
import {
  absenceTypeForLeaveRequest,
  isAnnualLeaveRequest,
  leaveRequestTypeFromAbsenceType,
  leaveRequestTypeFromLabel,
} from './leaveTypes'
import {
  nextPolicyAccent,
  nextPolicyId,
} from './policies'
import {
  buildProbationTasks,
  completeTask,
  snoozeTask,
  type TaskDismissal,
} from './hrTasks'
import {
  nextLeaveAdjustmentId,
  type LeaveAdjustment,
} from './leaveAdjustments'
import { ensureEmployeesForAccounts } from './accountEmployees'
import {
  OWN_REQUEST_REVIEW_BLOCKED_MESSAGE,
  canAdminReviewSubject,
} from './approvalPolicy'
import { findLeaveConflicts, overlapWarningMessage } from './leaveOverlap'
import './App.css'

type BootState = 'loading' | 'landing' | 'login' | 'set-password' | 'recovery' | 'ready'

function readSetPasswordToken() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('setPassword')?.trim() || ''
}

function clearSetPasswordTokenFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('setPassword')) return
  url.searchParams.delete('setPassword')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function App() {
  const empty = emptyRuntimeData()
  const [bootState, setBootState] = useState<BootState>('loading')
  const [accounts, setAccounts] = useState<Account[]>(empty.accounts)
  const [sessionAccount, setSessionAccount] = useState<Account | null>(null)
  const [passwordSetupToken, setPasswordSetupToken] = useState('')
  const [loginPrefillEmail, setLoginPrefillEmail] = useState('')
  const [activeNav, setActiveNav] = useState('Overview')
  const [requests, setRequests] = useState(empty.requests)
  const [portalMessages, setPortalMessages] = useState(empty.portalMessages)
  const [employees, setEmployees] = useState(empty.employees)
  const [employeeDocuments, setEmployeeDocuments] = useState(empty.employeeDocuments)
  const [documentFolders, setDocumentFolders] = useState(empty.documentFolders)
  const [expenseClaims, setExpenseClaims] = useState(empty.expenseClaims)
  const [vatReceipts, setVatReceipts] = useState<VatReceipt[]>(empty.vatReceipts)
  const [taskDismissals, setTaskDismissals] = useState<TaskDismissal[]>(empty.taskDismissals)
  const [policies, setPolicies] = useState(empty.policies)
  const [leaveAdjustments, setLeaveAdjustments] = useState<LeaveAdjustment[]>(
    empty.leaveAdjustments,
  )
  const [leaveYearClosures, setLeaveYearClosures] = useState<LeaveYearClosure[]>(
    empty.leaveYearClosures,
  )
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(empty.auditEvents)
  const pendingAuditAppendRef = useRef<AuditEvent[]>([])
  const persistChainRef = useRef(Promise.resolve(true))
  const persistEpochRef = useRef(0)
  const suppressPersistRef = useRef(false)
  const appDataSnapshotRef = useRef({
    revision: 1,
    employees: empty.employees,
    absences: empty.absences,
    company: empty.company,
    bankHolidays: empty.bankHolidays,
    requests: empty.requests,
    portalMessages: empty.portalMessages,
    documentFolders: empty.documentFolders,
    employeeDocuments: empty.employeeDocuments,
    accounts: empty.accounts,
    expenseClaims: empty.expenseClaims,
    vatReceipts: empty.vatReceipts,
    taskDismissals: empty.taskDismissals,
    policies: empty.policies,
    leaveAdjustments: empty.leaveAdjustments,
    leaveYearClosures: empty.leaveYearClosures,
    auditEvents: empty.auditEvents,
  })
  /** Last successfully synced server snapshot — base for three-way conflict merges. */
  const syncedBaseRef = useRef<Record<string, unknown> | null>(null)
  const [dataRevision, setDataRevision] = useState(1)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('company')
  const [absences, setAbsences] = useState<AbsenceRecord[]>(empty.absences)
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>(empty.bankHolidays)
  const [company, setCompany] = useState<CompanySettings>(empty.company)
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [isAdminLeaveModalOpen, setIsAdminLeaveModalOpen] = useState(false)
  const [isRecordAbsenceOpen, setIsRecordAbsenceOpen] = useState(false)
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [leaveHistoryEmployee, setLeaveHistoryEmployee] = useState<Employee | null>(null)
  const [adjustmentEmployee, setAdjustmentEmployee] = useState<Employee | null>(null)
  const [documentsEmployee, setDocumentsEmployee] = useState<Employee | null>(null)
  const [activeLeaveRequestId, setActiveLeaveRequestId] = useState<number | null>(null)
  const [activeExpenseClaimId, setActiveExpenseClaimId] = useState<number | null>(null)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [adminWorkspaceView, setAdminWorkspaceView] = useState<'admin' | 'employee'>('admin')
  const [syncConflict, setSyncConflict] = useState<{
    serverData: Record<string, unknown>
    serverRevision: number
    baseData: Record<string, unknown>
    localData: Record<string, unknown>
    overlapSummaries: string[]
    /** Prepared merge awaiting explicit confirm when overlaps exist. */
    pendingMerge: {
      mergedPayload: Record<string, unknown>
      overlapCount: number
      /** `persistEpochRef` at prepare time — confirm must match or recalculate. */
      localEpoch: number
    } | null
  } | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)

  const applyAppData = (data: Record<string, unknown>, { asSyncedBase = true } = {}) => {
    const fallback = emptyRuntimeData()
    const rawAccounts = Array.isArray(data.accounts)
      ? (data.accounts as Account[])
      : fallback.accounts
    const rawEmployees = Array.isArray(data.employees)
      ? (data.employees as Employee[])
      : fallback.employees
    const rawFolders = Array.isArray(data.documentFolders)
      ? (data.documentFolders as typeof documentFolders)
      : fallback.documentFolders
    const nextAbsences = Array.isArray(data.absences)
      ? (data.absences as AbsenceRecord[])
      : fallback.absences
    setAbsences(nextAbsences)
    const nextCompany =
      data.company && typeof data.company === 'object'
        ? { ...fallback.company, ...(data.company as CompanySettings) }
        : fallback.company
    const leavePeriod = getLeaveYearPeriod(
      appToday(),
      nextCompany.leaveYearStart,
      nextCompany.leaveYearEnd,
    )
    const companyWithAt = withLeaveYearConfiguredAt(nextCompany, leavePeriod)
    setCompany(companyWithAt)
    const ensured = ensureEmployeesForAccounts({
      accounts: rawAccounts,
      employees: rawEmployees,
      company: companyWithAt,
      documentFolders: rawFolders,
    })
    setAccounts(ensured.accounts)
    setEmployees(ensured.employees)
    setDocumentFolders(ensured.documentFolders)
    const storedHolidays = Array.isArray(data.bankHolidays)
      ? (data.bankHolidays as BankHoliday[])
      : []
    const nextHolidays =
      storedHolidays.length > 0
        ? storedHolidays
        : bankHolidaysForRegion(nextCompany.bankHolidayRegion)
    setBankHolidays(nextHolidays)
    const nextRequests = Array.isArray(data.requests)
      ? (data.requests as typeof requests)
      : fallback.requests
    setRequests(nextRequests)
    const nextMessages = Array.isArray(data.portalMessages)
      ? (data.portalMessages as typeof portalMessages)
      : fallback.portalMessages
    setPortalMessages(nextMessages)
    const nextDocs = Array.isArray(data.employeeDocuments)
      ? (data.employeeDocuments as typeof employeeDocuments)
      : fallback.employeeDocuments
    setEmployeeDocuments(nextDocs)
    const nextClaims = Array.isArray(data.expenseClaims)
      ? (data.expenseClaims as typeof expenseClaims)
      : fallback.expenseClaims
    setExpenseClaims(nextClaims)
    const nextVat = Array.isArray(data.vatReceipts)
      ? (data.vatReceipts as VatReceipt[])
      : fallback.vatReceipts
    setVatReceipts(nextVat)
    const nextDismissals = Array.isArray(data.taskDismissals)
      ? (data.taskDismissals as TaskDismissal[])
      : fallback.taskDismissals
    setTaskDismissals(nextDismissals)
    const nextPolicies = Array.isArray(data.policies)
      ? (data.policies as typeof policies)
      : fallback.policies
    setPolicies(nextPolicies)
    const nextAdjustments = Array.isArray(data.leaveAdjustments)
      ? (data.leaveAdjustments as LeaveAdjustment[])
      : fallback.leaveAdjustments
    setLeaveAdjustments(nextAdjustments)
    const nextClosures = Array.isArray(data.leaveYearClosures)
      ? (data.leaveYearClosures as LeaveYearClosure[])
      : fallback.leaveYearClosures
    setLeaveYearClosures(nextClosures)
    const nextAudit = Array.isArray(data.auditEvents)
      ? (data.auditEvents as AuditEvent[])
      : fallback.auditEvents
    setAuditEvents(nextAudit)
    const nextRevision =
      typeof data.revision === 'number' && Number.isFinite(data.revision) ? data.revision : 1
    setDataRevision(nextRevision)

    const snapshot = {
      revision: nextRevision,
      employees: ensured.employees,
      absences: nextAbsences,
      company: companyWithAt,
      bankHolidays: nextHolidays,
      requests: nextRequests,
      portalMessages: nextMessages,
      documentFolders: ensured.documentFolders,
      employeeDocuments: nextDocs,
      accounts: ensured.accounts,
      expenseClaims: nextClaims,
      vatReceipts: nextVat,
      taskDismissals: nextDismissals,
      policies: nextPolicies,
      leaveAdjustments: nextAdjustments,
      leaveYearClosures: nextClosures,
      auditEvents: nextAudit,
    }
    appDataSnapshotRef.current = snapshot
    if (asSyncedBase) {
      syncedBaseRef.current = structuredClone(snapshot) as Record<string, unknown>
    }
    return ensured
  }

  const loadAppDataForSession = async (account: Account) => {
    const result = await fetchAppData()
    if (!result.ok) {
      setSessionAccount(null)
      setBootState('login')
      setToast(result.error)
      window.setTimeout(() => setToast(''), 2800)
      return false
    }
    // Initial load must not count as a local edit when boot becomes ready.
    suppressPersistRef.current = true
    const ensured = applyAppData(result.data)
    for (const accountId of ensured.changedAccountIds) {
      const linked = ensured.accounts.find((item) => item.id === accountId)
      if (!linked?.employeeId) continue
      await updateAccountRequest(accountId, { employeeId: linked.employeeId })
    }
    const session =
      ensured.accounts.find((item) => item.id === account.id) ?? account
    setSessionAccount(session)
    setActiveNav('Overview')
    setBootState('ready')
    return true
  }

  useEffect(() => {
    appDataSnapshotRef.current = {
      revision: dataRevision,
      employees,
      absences,
      company,
      bankHolidays,
      requests,
      portalMessages,
      documentFolders,
      employeeDocuments,
      accounts,
      expenseClaims,
      vatReceipts,
      taskDismissals,
      policies,
      leaveAdjustments,
      leaveYearClosures,
      auditEvents,
    }
    persistEpochRef.current += 1
  }, [
    dataRevision,
    employees,
    absences,
    company,
    bankHolidays,
    requests,
    portalMessages,
    documentFolders,
    employeeDocuments,
    accounts,
    expenseClaims,
    vatReceipts,
    taskDismissals,
    policies,
    leaveAdjustments,
    leaveYearClosures,
    auditEvents,
  ])

  const applyIdRemaps = (idRemap?: {
    requests?: Array<{ from: number; to: number }>
    expenseClaims?: Array<{ from: number; to: number }>
  }) => {
    if (!idRemap) return
    const requestMap = new Map((idRemap.requests || []).map((item) => [item.from, item.to]))
    const expenseMap = new Map((idRemap.expenseClaims || []).map((item) => [item.from, item.to]))
    if (requestMap.size > 0) {
      setRequests((current) =>
        current.map((request) =>
          requestMap.has(request.id) ? { ...request, id: requestMap.get(request.id)! } : request,
        ),
      )
      setPortalMessages((current) =>
        current.map((message) =>
          requestMap.has(message.requestId)
            ? { ...message, requestId: requestMap.get(message.requestId)! }
            : message,
        ),
      )
    }
    if (expenseMap.size > 0) {
      setExpenseClaims((current) =>
        current.map((claim) =>
          expenseMap.has(claim.id) ? { ...claim, id: expenseMap.get(claim.id)! } : claim,
        ),
      )
    }
  }

  const persistAppData = async (overrides: {
    expenseClaims?: typeof expenseClaims
    vatReceipts?: VatReceipt[]
    taskDismissals?: TaskDismissal[]
    policies?: typeof policies
    leaveAdjustments?: LeaveAdjustment[]
    leaveYearClosures?: LeaveYearClosure[]
    auditEvents?: AuditEvent[]
    accounts?: Account[]
    company?: CompanySettings
    revision?: number
  } = {}) => {
    const run = async () => {
      const appendBatch = pendingAuditAppendRef.current
      pendingAuditAppendRef.current = []
      const snapshot = appDataSnapshotRef.current
      const epochAtStart = persistEpochRef.current
      const auditSnapshot = mergeAuditEvents(
        overrides.auditEvents ?? snapshot.auditEvents,
        appendBatch,
      )
      const result = await saveAppData({
        employees: snapshot.employees,
        absences: snapshot.absences,
        company: overrides.company ?? snapshot.company,
        bankHolidays: snapshot.bankHolidays,
        requests: snapshot.requests,
        portalMessages: snapshot.portalMessages,
        documentFolders: snapshot.documentFolders,
        employeeDocuments: snapshot.employeeDocuments,
        accounts: overrides.accounts ?? snapshot.accounts,
        expenseClaims: overrides.expenseClaims ?? snapshot.expenseClaims,
        vatReceipts: overrides.vatReceipts ?? snapshot.vatReceipts,
        taskDismissals: overrides.taskDismissals ?? snapshot.taskDismissals,
        policies: overrides.policies ?? snapshot.policies,
        leaveAdjustments: overrides.leaveAdjustments ?? snapshot.leaveAdjustments,
        leaveYearClosures: overrides.leaveYearClosures ?? snapshot.leaveYearClosures,
        auditEvents: auditSnapshot,
        _auditAppend: appendBatch,
        _revision: overrides.revision ?? snapshot.revision,
      })
      if (!result.ok) {
        pendingAuditAppendRef.current = [...appendBatch, ...pendingAuditAppendRef.current]
        if (result.status === 409) {
          // Keep local edits — offer merge onto server or load their version.
          const fresh = await fetchAppData()
          const serverRevision =
            fresh.ok && typeof fresh.data.revision === 'number'
              ? fresh.data.revision
              : typeof result.revision === 'number'
                ? result.revision
                : snapshot.revision
          if (fresh.ok) {
            const baseData = structuredClone(
              syncedBaseRef.current || snapshot,
            ) as Record<string, unknown>
            const localData = structuredClone(snapshot) as Record<string, unknown>
            const preview = mergeAppData(baseData, localData, fresh.data)
            setSyncConflict({
              serverData: fresh.data,
              serverRevision,
              baseData,
              localData,
              overlapSummaries: describeConflicts(preview.conflicts),
              pendingMerge: null,
            })
          } else {
            setToast(
              'Someone else updated this organisation. Your changes were kept — try saving again shortly.',
            )
            window.setTimeout(() => setToast(''), 5000)
          }
        }
        return false
      }
      // If the user edited while this save was in flight, do not clobber newer local
      // state with the older server projection — only apply id remaps. Leave
      // autosave unsuppressed so the newer local epoch can persist with the new revision.
      if (persistEpochRef.current !== epochAtStart) {
        applyIdRemaps(result.data.idRemap)
        if (typeof result.data.revision === 'number') {
          setDataRevision(result.data.revision)
        }
        if (Array.isArray(result.data.auditEvents)) {
          setAuditEvents(result.data.auditEvents)
        }
        return true
      }
      // Acknowledging server state is not a local edit — suppress the persist effect
      // or applying the response would retrigger an endless save loop.
      suppressPersistRef.current = true
      if (result.data.data && typeof result.data.data === 'object') {
        applyAppData(result.data.data)
      } else {
        if (typeof result.data.revision === 'number') {
          setDataRevision(result.data.revision)
        }
        if (Array.isArray(result.data.auditEvents)) {
          setAuditEvents(result.data.auditEvents)
        }
      }
      return true
    }

    const queued = persistChainRef.current.then(run, run)
    persistChainRef.current = queued.then(
      () => true,
      () => false,
    )
    return queued
  }

  useEffect(() => {
    localStorage.removeItem('finch-app-data')
    localStorage.removeItem('finch-session')
    void (async () => {
      const setupToken = readSetPasswordToken()

      const me = await fetchMe()
      if (!me.ok) {
        if (setupToken) {
          setPasswordSetupToken(setupToken)
          setBootState('set-password')
          return
        }
        setBootState('login')
        return
      }
      if (
        me.data.kind === 'pending_2fa' ||
        me.data.kind === 'pending_2fa_setup' ||
        me.data.kind === 'pending_2fa_master'
      ) {
        // Incomplete login challenge — finish on the login screen.
        setBootState('login')
        return
      }
      if (me.data.kind === 'master_recovery') {
        setBootState('recovery')
        return
      }
      clearSetPasswordTokenFromUrl()
      const loaded = await loadAppDataForSession(me.data.account)
      if (!loaded) return
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount
  }, [])

  useEffect(() => {
    if (bootState !== 'ready') return
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false
      return
    }
    void persistAppData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist when data slices change
  }, [
    bootState,
    dataRevision,
    employees,
    absences,
    company,
    bankHolidays,
    requests,
    portalMessages,
    documentFolders,
    employeeDocuments,
    accounts,
    expenseClaims,
    vatReceipts,
    taskDismissals,
    policies,
    leaveAdjustments,
    leaveYearClosures,
    auditEvents,
  ])

  const autoPayrollAttemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (bootState !== 'ready') return
    if (sessionAccount?.role !== 'admin') return
    const due = dueAutoPayrollPeriod(company, appToday())
    if (!due) return
    if (autoPayrollAttemptedRef.current === due.end) return
    autoPayrollAttemptedRef.current = due.end

    void (async () => {
      const rows = buildPayrollReport({
        employees,
        absences,
        bankHolidays,
        periodStart: due.start,
        periodEnd: due.end,
      })
      const periodLabel = formatPayPeriodLabel(due.start, due.end)
      const result = await emailPayrollReportRequest({
        to: company.payrollEmail,
        subject: `Finch payroll report — ${periodLabel}`,
        csv: payrollReportToCsv(rows),
        filename: `finch-payroll-${due.start}.csv`,
        text: payrollReportToEmailBody(rows, {
          companyName: company.name,
          periodLabel,
        }),
      })
      if (!result.ok) {
        notify(result.error)
        return
      }
      setCompany((current) => ({
        ...current,
        lastAutoPayrollSentPeriodEnd: due.end,
      }))
      notify(`Automated payroll report emailed to ${result.data.to}`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per due period when admin session is ready
  }, [bootState, sessionAccount?.role, company.autoSendPayrollReport, company.payrollEmail, company.lastAutoPayrollSentPeriodEnd])

  const isAdminRole = sessionAccount?.role === 'admin'
  const isAdmin = Boolean(isAdminRole && adminWorkspaceView === 'admin')
  const actorDisplayName = sessionAccount?.displayName ?? 'Unknown'
  const recordAudit = (input: {
    action: Parameters<typeof createAuditEvent>[0]['action']
    summary: string
    entityType?: string
    entityId?: string | number
  }) => {
    const event = createAuditEvent({
      actorAccountId: sessionAccount?.id ?? null,
      actorName: actorDisplayName,
      action: input.action,
      summary: input.summary,
      entityType: input.entityType,
      entityId: input.entityId,
    })
    pendingAuditAppendRef.current = [...pendingAuditAppendRef.current, event]
    setAuditEvents((current) => appendAuditEvent(current, event))
  }
  const refreshAuditEvents = async () => {
    const result = await fetchAppData()
    if (!result.ok) return
    if (Array.isArray(result.data.auditEvents)) {
      setAuditEvents((current) =>
        mergeAuditEvents(current, result.data.auditEvents as AuditEvent[]),
      )
    }
  }
  const currentEmployee =
    sessionAccount?.employeeId != null
      ? employees.find((item) => item.id === sessionAccount.employeeId)
      : undefined
  const canReviewEmployee = (subjectEmployeeId: number | null | undefined) => {
    if (!sessionAccount || sessionAccount.role !== 'admin') return false
    return canAdminReviewSubject({
      actor: sessionAccount,
      subjectEmployeeId,
      company,
    })
  }
  const pendingCount =
    requests.filter((request) => request.status === 'Pending').length +
    pendingExpenseCount(expenseClaims)
  const leaveYear = useMemo(
    () => getLeaveYearPeriod(appToday(), company.leaveYearStart, company.leaveYearEnd),
    [company.leaveYearStart, company.leaveYearEnd],
  )
  const todayIso = toIsoDate(appToday())
  const upcomingTasks = useMemo(
    () => buildProbationTasks(employees, taskDismissals, todayIso),
    [employees, taskDismissals, todayIso],
  )
  const currentNav = isAdmin ? adminNavItems : navItems
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const commitPendingConflictMerge = async (
    mergedPayload: Record<string, unknown>,
    overlapCount: number,
  ) => {
    const serverRevision =
      typeof mergedPayload.revision === 'number'
        ? mergedPayload.revision
        : syncConflict?.serverRevision
    // Apply merged UI state but keep the prior sync base until persist succeeds.
    // Otherwise a mid-merge 409 would treat the merge as already synced and drop deltas.
    suppressPersistRef.current = true
    applyAppData(mergedPayload, { asSyncedBase: false })
    setSyncConflict(null)
    const saved = await persistAppData(
      typeof serverRevision === 'number' ? { revision: serverRevision } : {},
    )
    if (saved) {
      syncedBaseRef.current = structuredClone(
        appDataSnapshotRef.current,
      ) as Record<string, unknown>
      notify(
        overlapCount > 0
          ? 'Merged your changes. Where the same fields conflicted, their values were kept.'
          : 'Your changes were merged and saved',
      )
    } else {
      // Persist may 409 again if another write landed mid-merge; dialog will re-open
      // using the original synced base so local deltas can be reapplied.
      notify('Could not save the merged changes. Check the conflict prompt or try again.')
    }
  }

  const discardConflictAndReload = async () => {
    if (!syncConflict || conflictBusy) return
    setConflictBusy(true)
    try {
      const fresh = await fetchAppData()
      if (!fresh.ok) {
        notify('Could not refresh organisation data. Your changes are still here — try again.')
        return
      }
      suppressPersistRef.current = true
      applyAppData(fresh.data)
      setSyncConflict(null)
      notify('Loaded the latest organisation data')
    } finally {
      setConflictBusy(false)
    }
  }

  const prepareConflictMerge = async () => {
    if (!syncConflict) return
    // Refresh both sides: local may have changed while the dialog was open, and
    // another save may have landed on the server in the meantime.
    const fresh = await fetchAppData()
    if (!fresh.ok) {
      notify('Could not refresh organisation data. Try again.')
      return
    }
    const serverRevision =
      typeof fresh.data.revision === 'number'
        ? fresh.data.revision
        : syncConflict.serverRevision
    const localEpoch = persistEpochRef.current
    const localData = structuredClone(appDataSnapshotRef.current) as Record<string, unknown>
    const { merged, conflicts } = mergeAppData(
      syncConflict.baseData,
      localData,
      fresh.data,
    )
    const mergedPayload = { ...merged, revision: serverRevision }
    const overlapSummaries = describeConflicts(conflicts)

    // Always show recalculated overlaps before committing when any exist.
    if (conflicts.length > 0) {
      setSyncConflict({
        ...syncConflict,
        serverData: fresh.data,
        serverRevision,
        localData,
        overlapSummaries,
        pendingMerge: {
          mergedPayload,
          overlapCount: conflicts.length,
          localEpoch,
        },
      })
      notify('Review the overlapping fields below, then confirm the merge.')
      return
    }

    await commitPendingConflictMerge(mergedPayload, 0)
  }

  const mergeConflictChangesAndSave = async () => {
    if (!syncConflict || conflictBusy) return
    setConflictBusy(true)
    try {
      const pending = syncConflict.pendingMerge
      if (pending) {
        // Local edits after prepare invalidate the stored payload — recalculate.
        if (persistEpochRef.current !== pending.localEpoch) {
          notify('Your local edits changed — recalculating the merge.')
          await prepareConflictMerge()
          return
        }
        await commitPendingConflictMerge(pending.mergedPayload, pending.overlapCount)
        return
      }

      await prepareConflictMerge()
    } finally {
      setConflictBusy(false)
    }
  }

  const switchWorkspaceView = () => {
    if (!isAdminRole) return
    if (adminWorkspaceView === 'admin') {
      if (!currentEmployee) {
        notify('Your employee profile is still being set up — try again in a moment')
        return
      }
      setAdminWorkspaceView('employee')
      setActiveNav('Overview')
      setMobileNavOpen(false)
      notify('Switched to employee view')
      return
    }
    setAdminWorkspaceView('admin')
    setActiveNav('Overview')
    setMobileNavOpen(false)
    notify('Switched to admin view')
  }

  const signOut = async () => {
    await logoutRequest()
    setSessionAccount(null)
    setBootState('login')
    setActiveNav('Overview')
    setAdminWorkspaceView('admin')
    setMobileNavOpen(false)
    notify('Signed out')
  }

  const openRequestLeave = () => {
    if (!company.leaveYearConfigured) {
      notify(LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE)
      return
    }
    if (!currentEmployee) {
      notify('Your account is not linked to an employee record')
      return
    }
    setIsLeaveModalOpen(true)
  }

  const openSettings = (tab: SettingsTab = 'company') => {
    if (!isAdminRole) {
      notify('Only admins can open settings')
      return
    }
    setAdminWorkspaceView('admin')
    setSettingsTab(tab)
    setActiveNav('Settings')
    setMobileNavOpen(false)
  }

  const addAbsence = (record: Omit<AbsenceRecord, 'id' | 'recordedAt'>) => {
    setAbsences((current) => [
      ...current,
      {
        ...record,
        id: Math.max(0, ...current.map((item) => item.id)) + 1,
        recordedAt: toIsoDate(appToday()),
      },
    ])
  }

  const createDocumentFolder = (
    employeeId: number,
    name: string,
    visibility: DocumentFolderVisibility,
  ) => {
    setDocumentFolders((current) => [
      ...current,
      {
        id: nextDocumentFolderId(current),
        employeeId,
        name: name.trim(),
        visibility,
        createdAt: new Date().toISOString(),
      },
    ])
    notify('Folder created')
  }

  const deleteDocumentFolder = (folderId: number) => {
    const fileCount = documentCountInFolder(employeeDocuments, folderId)
    if (fileCount > 0) {
      notify('Move or delete files before removing this folder')
      return
    }
    setDocumentFolders((current) => current.filter((folder) => folder.id !== folderId))
    notify('Folder removed')
  }

  const uploadEmployeeDocument = (
    folderId: number,
    payload: {
      title: string
      category: EmployeeDocumentCategory
      fileName: string
      fileType: string
      fileDataUrl: string
      note?: string
    },
  ) => {
    const folder = documentFolders.find((item) => item.id === folderId)
    if (!folder) return

    setEmployeeDocuments((current) => [
      ...current,
      {
        id: nextEmployeeDocumentId(current),
        employeeId: folder.employeeId,
        folderId,
        ...payload,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actorDisplayName,
      },
    ])
    notify('Document uploaded')
    if (shouldNotify(company, 'documentUpdated')) {
      const employee = employees.find((item) => item.id === folder.employeeId)
      void dispatchNotificationEmail('documentUpdated', {
        employeeId: folder.employeeId,
        details: {
          employeeName: employee?.name || 'Employee',
          documentTitle: payload.title,
        },
      }).then((message) => notify(message))
    }
  }

  const deleteEmployeeDocument = (documentId: number) => {
    setEmployeeDocuments((current) => current.filter((document) => document.id !== documentId))
    notify('Document removed')
  }

  const openEmployeeDocuments = (employee: Employee) => {
    setDocumentsEmployee(employee)
    setActiveNav('Employee documents')
    setMobileNavOpen(false)
  }

  const employeeForRequest = (requestId: number) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request) return undefined
    return (
      employees.find((item) => item.id === request.employeeId) ??
      employees.find((item) => item.name === request.name)
    )
  }

  const sendPortalMessage = (requestId: number, author: 'employee' | 'admin', body: string) => {
    const request = requests.find((item) => item.id === requestId)
    const employee = employeeForRequest(requestId)
    if (!request || !employee) return

    setPortalMessages((current) => [
      ...current,
      createPortalMessage(current, {
        employeeId: employee.id,
        requestId,
        author,
        authorName: author === 'admin' ? actorDisplayName : employee.name,
        body,
      }),
    ])
  }

  const directAmendLeaveRequest = (
    id: number,
    payload: {
      start: string
      end: string
      days: number
      note: string
      startHalf?: import('./domain').DayHalf
      endHalf?: import('./domain').DayHalf
    },
  ) => {
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...buildLeaveRequestFields(
                payload.start,
                payload.end,
                payload.days,
                payload.note,
                payload.startHalf ?? 'full',
                payload.endHalf ?? 'full',
              ),
            }
          : item,
      ),
    )
    notify('Leave request updated')
  }

  const proposeLeaveAmendment = (
    id: number,
    payload: {
      start: string
      end: string
      days: number
      note: string
      startHalf?: import('./domain').DayHalf
      endHalf?: import('./domain').DayHalf
    },
  ) => {
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              pendingAmendment: buildLeaveAmendment(
                payload.start,
                payload.end,
                payload.days,
                payload.note,
                payload.startHalf ?? 'full',
                payload.endHalf ?? 'full',
              ),
            }
          : item,
      ),
    )
    notify('Change sent for employer approval')
  }

  const resolveLeaveAmendment = (id: number, approved: boolean) => {
    const request = requests.find((item) => item.id === id)
    const employee = employeeForRequest(id)
    if (!request?.pendingAmendment || !employee) return
    if (!canReviewEmployee(employee.id)) {
      notify(OWN_REQUEST_REVIEW_BLOCKED_MESSAGE)
      return
    }

    if (!approved) {
      setRequests((current) =>
        current.map((item) =>
          item.id === id ? { ...item, pendingAmendment: undefined } : item,
        ),
      )
      notify('Amendment declined')
      return
    }

    const amendment = request.pendingAmendment
    const amendmentStartHalf = amendment.startHalf ?? 'full'
    const amendmentEndHalf = amendment.endHalf ?? 'full'
    const amount =
      parseDurationDays(amendment.duration) ||
      countWorkingDaysInRange(amendment.start, amendment.end, employee.workingDays)

    if (isAnnualLeaveRequest(request)) {
      const currentDays =
        request.start && request.end
          ? leaveDaysInLeaveYear(
              request.start,
              request.end,
              leaveYear,
              employee.workingDays,
              request.startHalf,
              request.endHalf,
            )
          : parseDurationDays(request.duration)
      const newDays = leaveDaysInLeaveYear(
        amendment.start,
        amendment.end,
        leaveYear,
        employee.workingDays,
        amendmentStartHalf,
        amendmentEndHalf,
      )
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        newDays - currentDays,
        id,
        leaveAdjustments,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage(employee.name, Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    const recordedAt = toIsoDate(appToday())
    let nextAbsenceId = request.absenceId

    if (request.absenceId != null) {
      const previousStart = request.start
      const previousEnd = request.end
      setAbsences((current) =>
        current
          .map((item) =>
            item.id === request.absenceId
              ? {
                  ...item,
                  start: amendment.start,
                  end: amendment.end,
                  amount,
                  note: amendment.note || item.note,
                  origin: item.origin ?? 'request',
                }
              : item,
          )
          .filter((item) => {
            if (item.id === request.absenceId) return true
            if (item.origin === 'manual') return true
            if (
              item.type === absenceTypeForLeaveRequest(request.leaveType) &&
              item.employeeId === employee.id &&
              previousStart &&
              previousEnd &&
              item.start === previousStart &&
              item.end === previousEnd
            ) {
              return false
            }
            return true
          }),
      )
    } else {
      nextAbsenceId = Math.max(0, ...absences.map((item) => item.id)) + 1
      setAbsences((current) => [
        ...current,
        {
          id: nextAbsenceId!,
          employeeId: employee.id,
          type: absenceTypeForLeaveRequest(request.leaveType),
          start: amendment.start,
          end: amendment.end,
          amount,
          note: amendment.note || 'Approved leave amendment',
          recordedBy: actorDisplayName,
          recordedAt,
          origin: 'request',
        },
      ])
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...buildLeaveRequestFields(
                amendment.start,
                amendment.end,
                amount,
                amendment.note,
                amendmentStartHalf,
                amendmentEndHalf,
              ),
              absenceId: nextAbsenceId,
              pendingAmendment: undefined,
            }
          : item,
      ),
    )
    notify('Amendment approved')
  }

  const updateRequest = (id: number, status: RequestStatus) => {
    const request = requests.find((item) => item.id === id)
    const employee =
      employees.find((item) => item.id === request?.employeeId) ??
      employees.find((item) => item.name === request?.name)

    if (
      (status === 'Approved' || status === 'Declined') &&
      request &&
      !canReviewEmployee(request.employeeId)
    ) {
      notify(OWN_REQUEST_REVIEW_BLOCKED_MESSAGE)
      return
    }

    if (status === 'Approved' && request && employee && isAnnualLeaveRequest(request)) {
      const days =
        request.start && request.end
          ? leaveDaysInLeaveYear(
              request.start,
              request.end,
              leaveYear,
              employee.workingDays,
              request.startHalf,
              request.endHalf,
            )
          : parseDurationDays(request.duration)
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        days,
        id,
        leaveAdjustments,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage(employee.name, Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    if (status === 'Approved' && request && employee) {
      const days = parseDurationDays(request.duration)
      const start = request.start ?? toIsoDate(appToday())
      const end = request.end ?? request.start ?? toIsoDate(appToday())
      const leaveType = absenceTypeForLeaveRequest(request.leaveType)
      const existingOrphan = absences.find(
        (item) =>
          item.employeeId === employee.id &&
          item.type === leaveType &&
          item.start === start &&
          item.end === end &&
          !requests.some(
            (other) => other.absenceId === item.id && other.id !== request.id,
          ),
      )
      const newAbsenceId =
        existingOrphan?.id ?? Math.max(0, ...absences.map((item) => item.id)) + 1

      if (!existingOrphan) {
        setAbsences((current) => [
          ...current,
          {
            employeeId: employee.id,
            type: leaveType,
            start,
            end,
            amount: days,
            note: request.note || 'Approved leave request',
            recordedBy: actorDisplayName,
            id: newAbsenceId,
            recordedAt: toIsoDate(appToday()),
            origin: 'request',
          },
        ])
      } else {
        setAbsences((current) =>
          current.map((item) =>
            item.id === existingOrphan.id ? { ...item, origin: item.origin ?? 'request' } : item,
          ),
        )
      }
      setRequests((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'Approved', absenceId: newAbsenceId } : item,
        ),
      )
    } else if (status === 'Declined' && request) {
      setAbsences((current) =>
        current.filter((item) => {
          if (request.absenceId != null && item.id === request.absenceId) return false
          if (
            item.type === absenceTypeForLeaveRequest(request.leaveType) &&
            item.employeeId === request.employeeId &&
            item.start === request.start &&
            item.end === request.end &&
            !requests.some((other) => other.id !== request.id && other.absenceId === item.id)
          ) {
            return false
          }
          return true
        }),
      )
      setRequests((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'Declined', absenceId: undefined } : item,
        ),
      )
    } else {
      setRequests((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item)),
      )
    }

    notify(status === 'Approved' ? 'Leave request approved' : 'Leave request declined')
    if (request && (status === 'Approved' || status === 'Declined')) {
      recordAudit({
        action: status === 'Approved' ? 'leave.approved' : 'leave.declined',
        summary: `${actorDisplayName} ${status === 'Approved' ? 'approved' : 'declined'} leave for ${request.name} (${request.dates})`,
        entityType: 'leave_request',
        entityId: request.id,
      })
    }
    if (
      request &&
      (status === 'Approved' || status === 'Declined') &&
      shouldNotify(company, 'leaveRequestReviewed')
    ) {
      void dispatchNotificationEmail('leaveRequestReviewed', {
        employeeId: request.employeeId,
        details: {
          employeeName: request.name,
          dates: request.dates,
          status,
        },
      }).then((message) => notify(message))
    }
  }

  const cancelApprovedLeave = (id: number) => {
    const request = requests.find((item) => item.id === id)
    if (!request || request.status !== 'Approved') return

    if (request.absenceId != null) {
      setAbsences((current) => current.filter((item) => item.id !== request.absenceId))
    }
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'Cancelled',
              absenceId: undefined,
              pendingAmendment: undefined,
            }
          : item,
      ),
    )
    notify('Leave cancelled')
    recordAudit({
      action: 'leave.cancelled',
      summary: `${actorDisplayName} cancelled leave for ${request.name} (${request.dates})`,
      entityType: 'leave_request',
      entityId: request.id,
    })
  }

  const deleteAbsence = (absenceId: number) => {
    const linkedRequest = requests.find((item) => item.absenceId === absenceId)
    if (linkedRequest && linkedRequest.status === 'Approved') {
      cancelApprovedLeave(linkedRequest.id)
      return
    }

    setAbsences((current) => current.filter((item) => item.id !== absenceId))
    if (linkedRequest) {
      setRequests((current) =>
        current.map((item) =>
          item.id === linkedRequest.id ? { ...item, absenceId: undefined } : item,
        ),
      )
    }
    notify('Absence removed')
  }

  const saveCompanySettings = (next: CompanySettings) => {
    const previousConfirmation = confirmationForLeaveYear(
      company.mandatoryLeaveConfirmations,
      leaveYear,
    )
    const nextConfirmation = confirmationForLeaveYear(next.mandatoryLeaveConfirmations, leaveYear)
    setCompany(next)
    recordAudit({
      action: 'settings.updated',
      summary: `${actorDisplayName} updated organisation settings`,
      entityType: 'company',
    })

    if (
      nextConfirmation &&
      mandatoryBookingSignature(previousConfirmation) !==
        mandatoryBookingSignature(nextConfirmation)
    ) {
      const booked = applyMandatoryLeaveBookings({
        employees,
        confirmation: nextConfirmation,
        existingRequests: requests,
        existingAbsences: absences,
        recordedBy: actorDisplayName,
        bankHolidays,
      })
      setRequests(booked.requests)
      setAbsences(booked.absences)
      if (nextConfirmation.noneThisYear) {
        notify('Mandatory leave cleared for this leave year')
      } else {
        const created = booked.requests.filter(
          (request) =>
            request.source === 'mandatory' &&
            request.mandatoryYearKey === nextConfirmation.leaveYearKey &&
            request.status === 'Approved',
        ).length
        notify(
          created > 0
            ? `Mandatory leave booked for the team (${created} ${created === 1 ? 'booking' : 'bookings'})`
            : 'Mandatory leave saved',
        )
      }
      return
    }

    notify('Settings saved')
  }

  const submitLeaveRequest = (payload: {
    start: string
    end: string
    days: number
    note: string
    leaveType: string
    startHalf?: import('./domain').DayHalf
    endHalf?: import('./domain').DayHalf
  }) => {
    if (!company.leaveYearConfigured) {
      notify(LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE)
      return
    }
    const employee = currentEmployee
    if (!employee) return
    const startHalf = payload.startHalf ?? 'full'
    const endHalf = payload.endHalf ?? 'full'

    if (payload.leaveType === 'Annual leave') {
      const yearDays = leaveDaysInLeaveYear(
        payload.start,
        payload.end,
        leaveYear,
        employee.workingDays,
        startHalf,
        endHalf,
      )
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        yearDays,
        undefined,
        leaveAdjustments,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage('You', Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    const conflicts = findLeaveConflicts({
      employeeId: employee.id,
      start: payload.start,
      end: payload.end,
      absences,
      requests,
    })
    if (conflicts.length > 0) {
      const proceed = window.confirm(overlapWarningMessage(conflicts))
      if (!proceed) return
    }

    const fields = buildLeaveRequestFields(
      payload.start,
      payload.end,
      payload.days,
      payload.note,
      startHalf,
      endHalf,
    )

    setRequests((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((item) => item.id)) + 1,
        employeeId: employee.id,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        ...fields,
        status: 'Pending',
        leaveType: leaveRequestTypeFromLabel(payload.leaveType),
      },
    ])
    setIsLeaveModalOpen(false)
    notify('Leave request submitted')
    if (shouldNotify(company, 'leaveRequestSubmitted')) {
      void dispatchNotificationEmail('leaveRequestSubmitted', {
        employeeId: employee.id,
        details: {
          employeeName: employee.name,
          dates: fields.dates,
        },
      }).then((message) => notify(message))
    }
  }

  const submitExpenseClaim = (payload: {
    date: string
    amount: number
    merchant: string
    category: ExpenseCategory
    note?: string
    receipts: Omit<ExpenseReceipt, 'id'>[]
  }) => {
    const employee = currentEmployee
    if (!employee) return false

    const nextClaims = [
      ...expenseClaims,
      {
        id: nextExpenseClaimId(expenseClaims),
        employeeId: employee.id,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        date: payload.date,
        amount: payload.amount,
        merchant: payload.merchant,
        category: payload.category,
        note: payload.note,
        receipts: payload.receipts.map((receipt, index) => ({ ...receipt, id: index + 1 })),
        status: 'Pending' as const,
        submittedAt: new Date().toISOString(),
      },
    ]

    setExpenseClaims(nextClaims)
    setIsExpenseModalOpen(false)
    notify('Expense claim submitted')
    if (shouldNotify(company, 'expenseClaimSubmitted')) {
      void dispatchNotificationEmail('expenseClaimSubmitted', {
        employeeId: employee.id,
        details: {
          employeeName: employee.name,
          amountLabel: formatGbp(payload.amount),
        },
      }).then((message) => notify(message))
    }
    return true
  }

  const reviewExpenseClaim = (id: number, status: 'Approved' | 'Declined', reviewNote?: string) => {
    const claim = expenseClaims.find((item) => item.id === id)
    if (!claim) return
    if (!canReviewEmployee(claim.employeeId)) {
      notify(OWN_REQUEST_REVIEW_BLOCKED_MESSAGE)
      return
    }

    const nextClaims = expenseClaims.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            reviewNote: status === 'Declined' ? reviewNote : undefined,
            reviewedAt: new Date().toISOString(),
          }
        : item,
    )

    setExpenseClaims(nextClaims)
    setActiveExpenseClaimId(null)
    notify(status === 'Approved' ? 'Expense claim approved' : 'Expense claim declined')
    recordAudit({
      action: status === 'Approved' ? 'expense.approved' : 'expense.declined',
      summary: `${actorDisplayName} ${status === 'Approved' ? 'approved' : 'declined'} expense for ${claim.name} (${formatGbp(claim.amount)})`,
      entityType: 'expense_claim',
      entityId: claim.id,
    })
    if (shouldNotify(company, 'expenseClaimReviewed')) {
      void dispatchNotificationEmail('expenseClaimReviewed', {
        employeeId: claim.employeeId,
        details: {
          employeeName: claim.name,
          amountLabel: formatGbp(claim.amount),
          status,
        },
      }).then((message) => notify(message))
    }
  }

  const handleNavigation = (label: string) => {
    setActiveNav(label)
    setMobileNavOpen(false)
  }

  const saveEmployee = (employee: Employee) => {
    const previous = employees.find((item) => item.id === employee.id)
    const nextEmployee =
      employee.entitlementUnit === 'hours'
        ? { ...employee, entitlementUnit: 'days' as const }
        : employee
    setEmployees((current) =>
      current.map((item) => (item.id === employee.id ? nextEmployee : item)),
    )
    if (previous && previous.name !== nextEmployee.name) {
      setRequests((current) =>
        current.map((item) =>
          item.employeeId === nextEmployee.id
            ? {
                ...item,
                name: nextEmployee.name,
                initials: nextEmployee.initials,
                color: nextEmployee.color,
              }
            : item,
        ),
      )
    }
    setEditingEmployee(null)
    notify(`${nextEmployee.name} updated`)
  }

  const completeHrTask = (taskKey: string) => {
    setTaskDismissals((current) => completeTask(current, taskKey))
    notify('Task marked complete')
  }

  const snoozeHrTask = (taskKey: string) => {
    setTaskDismissals((current) => snoozeTask(current, taskKey, todayIso))
    notify('Reminder snoozed for 7 days')
  }

  const openEmployeeFromTask = (employeeId: number) => {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) return
    setEditingEmployee(employee)
  }

  const addPolicy = (payload: {
    title: string
    description: string
    fileName: string
    fileType: string
    fileDataUrl: string
  }) => {
    const nextPolicies = [
      ...policies,
      {
        id: nextPolicyId(policies),
        title: payload.title,
        description: payload.description,
        fileName: payload.fileName,
        fileType: payload.fileType,
        fileDataUrl: payload.fileDataUrl,
        updatedAt: new Date().toISOString(),
        accent: nextPolicyAccent(policies),
      },
    ]
    setPolicies(nextPolicies)
    notify('Policy added')
    return true
  }

  const updatePolicy = (
    id: number,
    payload: {
      title: string
      description: string
      fileName?: string
      fileType?: string
      fileDataUrl?: string
    },
  ) => {
    const nextPolicies = policies.map((policy) =>
      policy.id === id
        ? {
            ...policy,
            title: payload.title,
            description: payload.description,
            fileName: payload.fileName ?? policy.fileName,
            fileType: payload.fileType ?? policy.fileType,
            fileDataUrl: payload.fileDataUrl ?? policy.fileDataUrl,
            updatedAt: new Date().toISOString(),
          }
        : policy,
    )
    setPolicies(nextPolicies)
    notify('Policy updated')
    return true
  }

  const deletePolicy = (id: number) => {
    setPolicies((current) => current.filter((policy) => policy.id !== id))
    notify('Policy deleted')
  }

  const addEmployee = async (
    payload: Omit<Employee, 'id' | 'initials' | 'color'>,
    options: { email: string; sendInvite: boolean },
  ) => {
    const nextId = Math.max(0, ...employees.map((item) => item.id)) + 1
    const employee: Employee = {
      ...payload,
      id: nextId,
      initials: companyInitials(payload.name) || 'EE',
      color: AVATAR_COLORS[(nextId - 1) % AVATAR_COLORS.length],
    }

    if (options.sendInvite) {
      const result = await createAccountRequest({
        email: options.email,
        displayName: payload.name,
        role: 'employee',
        employeeId: nextId,
        invite: true,
        jobTitle: payload.role,
      })
      if (!result.ok) {
        notify(result.error)
        return
      }
      setAccounts((current) => [...current, result.data.account])
      setEmployees((current) => [...current, employee])
      setDocumentFolders((current) => [
        ...current,
        ...createDefaultFoldersForEmployee(nextId, current),
      ])
      setIsAddEmployeeOpen(false)
      notify(`${payload.name} added — invite emailed to ${options.email}`)
      return
    }

    setEmployees((current) => [...current, employee])
    setDocumentFolders((current) => [
      ...current,
      ...createDefaultFoldersForEmployee(nextId, current),
    ])
    setIsAddEmployeeOpen(false)
    notify(`${payload.name} added`)
  }

  const addTeamLeave = (payload: {
    employeeId: number
    start: string
    end: string
    leaveType: string
    startHalf?: import('./domain').DayHalf
    endHalf?: import('./domain').DayHalf
    days?: number
  }) => {
    const employee = employees.find((item) => item.id === payload.employeeId)
    if (!employee) return

    const leaveType = leaveRequestTypeFromLabel(payload.leaveType)
    const startHalf = payload.startHalf ?? 'full'
    const endHalf = payload.endHalf ?? 'full'
    const days =
      payload.days ??
      countWorkingDaysInRange(payload.start, payload.end, employee.workingDays)

    if (leaveType === 'annual') {
      const yearDays = leaveDaysInLeaveYear(
        payload.start,
        payload.end,
        leaveYear,
        employee.workingDays,
        startHalf,
        endHalf,
      )
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        yearDays,
        undefined,
        leaveAdjustments,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage(employee.name, Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    const conflicts = findLeaveConflicts({
      employeeId: employee.id,
      start: payload.start,
      end: payload.end,
      absences,
      requests,
    })
    if (conflicts.length > 0) {
      const proceed = window.confirm(overlapWarningMessage(conflicts))
      if (!proceed) return
    }

    const absenceId = Math.max(0, ...absences.map((item) => item.id)) + 1
    const requestId = Math.max(0, ...requests.map((item) => item.id)) + 1
    const fields = buildLeaveRequestFields(
      payload.start,
      payload.end,
      days,
      payload.leaveType === 'Annual leave' ? 'Admin-added leave' : payload.leaveType,
      startHalf,
      endHalf,
    )

    setAbsences((current) => [
      ...current,
      {
        id: absenceId,
        employeeId: employee.id,
        type: absenceTypeForLeaveRequest(leaveType),
        start: payload.start,
        end: payload.end,
        amount: days,
        note: payload.leaveType || 'Admin-added leave',
        recordedBy: actorDisplayName,
        recordedAt: toIsoDate(appToday()),
        origin: 'request',
      },
    ])
    setRequests((current) => [
      ...current,
      {
        id: requestId,
        employeeId: employee.id,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        ...fields,
        status: 'Approved',
        leaveType,
        absenceId,
      },
    ])
    setIsAdminLeaveModalOpen(false)
    notify(`Leave added for ${employee.name}`)
  }

  const recordAbsence = (record: Omit<AbsenceRecord, 'id' | 'recordedAt'>) => {
    const leaveType = leaveRequestTypeFromAbsenceType(record.type)
    const employee = employees.find((item) => item.id === record.employeeId)

    const conflicts = findLeaveConflicts({
      employeeId: record.employeeId,
      start: record.start,
      end: record.end,
      absences,
      requests,
    })
    if (conflicts.length > 0) {
      const proceed = window.confirm(overlapWarningMessage(conflicts))
      if (!proceed) return
    }

    if (leaveType && employee) {
      // Request-backed leave types need an Approved request + absenceId so reload
      // scrubbing does not treat them as legacy orphans (F10).
      const absenceId = Math.max(0, ...absences.map((item) => item.id)) + 1
      const requestId = Math.max(0, ...requests.map((item) => item.id)) + 1
      const fields = buildLeaveRequestFields(
        record.start,
        record.end,
        record.amount,
        record.note || 'Recorded absence',
      )
      setAbsences((current) => [
        ...current,
        {
          ...record,
          id: absenceId,
          recordedAt: toIsoDate(appToday()),
          origin: 'manual',
        },
      ])
      setRequests((current) => [
        ...current,
        {
          id: requestId,
          employeeId: employee.id,
          name: employee.name,
          initials: employee.initials,
          color: employee.color,
          ...fields,
          status: 'Approved',
          leaveType,
          absenceId,
        },
      ])
    } else {
      addAbsence(record)
    }

    setIsRecordAbsenceOpen(false)
    notify('Absence recorded')
  }

  const recordLeaveAdjustment = (payload: {
    direction: 'credit' | 'debit'
    amount: number
    reason: string
    effectiveDate?: string
  }) => {
    if (!adjustmentEmployee) return
    setLeaveAdjustments((current) => [
      ...current,
      {
        id: nextLeaveAdjustmentId(current),
        employeeId: adjustmentEmployee.id,
        leaveYearKey: leaveYear.start,
        direction: payload.direction,
        amount: payload.amount,
        reason: payload.reason,
        effectiveDate: payload.effectiveDate,
        recordedBy: actorDisplayName,
        recordedAt: toIsoDate(appToday()),
      },
    ])
    setAdjustmentEmployee(null)
    notify(
      payload.direction === 'credit'
        ? `Credit of ${payload.amount} ${adjustmentEmployee.entitlementUnit} recorded`
        : `Debit of ${payload.amount} ${adjustmentEmployee.entitlementUnit} recorded`,
    )
  }

  if (bootState === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'inherit',
        }}
      >
        Loading Finch…
      </div>
    )
  }

  if (bootState === 'recovery') {
    return <RecoveryConsole onSignedOut={() => setBootState('login')} />
  }

  if (bootState === 'set-password') {
    return (
      <>
        <SetPasswordPage
          token={passwordSetupToken}
          onDone={(email) => {
            clearSetPasswordTokenFromUrl()
            setPasswordSetupToken('')
            setLoginPrefillEmail(email)
            setBootState('login')
            if (email) notify('Password saved — sign in to continue')
          }}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  if (bootState === 'landing') {
    return (
      <>
        <LandingPage
          onBack={() => setBootState('login')}
          onSignedIn={(account) => {
            void (async () => {
              const loaded = await loadAppDataForSession(account)
              if (loaded) notify(`Welcome, ${account.displayName}`)
            })()
          }}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  if (bootState === 'login' || !sessionAccount) {
    return (
      <>
        <LoginPage
          initialEmail={loginPrefillEmail}
          onCreateOrganisation={() => setBootState('landing')}
          onSignedIn={(account) => {
            void (async () => {
              const loaded = await loadAppDataForSession(account)
              if (loaded) notify(`Signed in as ${account.displayName}`)
            })()
          }}
          onRecoverySignedIn={() => setBootState('recovery')}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  if (!company.leaveYearConfigured && sessionAccount.role === 'admin') {
    return (
      <>
        <OrgSetupWizard
          company={company}
          onComplete={(next) => {
            const period = getLeaveYearPeriod(
              appToday(),
              next.leaveYearStart,
              next.leaveYearEnd,
            )
            const configured = withLeaveYearConfiguredAt(
              {
                ...next,
                leaveYearConfigured: true,
                leaveYearConfiguredAt:
                  next.leaveYearConfiguredAt ?? toIsoDate(appToday()),
              },
              period,
            )
            setCompany(configured)
            void persistAppData({ company: configured })
            notify('Organisation configured')
          }}
        />
        {toast && (
          <div className="toast">
            <Check size={16} />
            {toast}
          </div>
        )}
      </>
    )
  }

  if (!company.leaveYearConfigured) {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <h1>Organisation is not set up yet</h1>
          <p className="login-lede">
            An admin needs to finish organisation setup before you can use Finch.
          </p>
          <button type="button" className="button button-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <FinchMark />
          </div>
          <span>
            finch<span className="brand-dot">.</span>
          </span>
        </div>

        <WorkspaceSwitcher
          companyName={company.name}
          companyAvatar={companyInitials(company.name)}
          logoUrl={company.logoUrl}
          isAdmin={isAdminRole}
          onOpenSettings={() => openSettings('company')}
          onNotify={notify}
        />

        <div className="sidebar-label">{isAdmin ? 'Manage' : 'Workspace'}</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {currentNav.map(({ label, icon: Icon }) => (
            <button
              type="button"
              className={`nav-item ${activeNav === label ? 'active' : ''}`}
              key={label}
              onClick={() => handleNavigation(label)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {label === 'Requests' && pendingCount > 0 && (
                <span className="nav-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item"
            onClick={() => handleNavigation('Help')}
          >
            <Bell size={17} />
            <span>Help centre</span>
          </button>
          <div className="user-chip">
            <div className="avatar avatar-sage">{sessionAccount.initials}</div>
            <div>
              <strong>{sessionAccount.displayName}</strong>
              <span>
                {sessionAccount.jobTitle ??
                  currentEmployee?.role ??
                  (isAdmin ? 'Admin' : 'Employee')}
              </span>
            </div>
            <MoreMenu
              placement="top"
              buttonClassName="more-button sidebar-more-button"
              label="Account menu"
              items={
                isAdmin
                  ? [
                      { label: 'My profile', onClick: () => notify('Profile settings opened') },
                      {
                        label: 'Workspace settings',
                        onClick: () => openSettings('company'),
                      },
                      { label: 'Sign out', onClick: signOut, danger: true },
                    ]
                  : [
                      { label: 'My profile', onClick: () => notify('Profile settings opened') },
                      { label: 'My leave', onClick: () => setActiveNav('My leave') },
                      { label: 'Expenses', onClick: () => setActiveNav('Expenses') },
                      { label: 'Sign out', onClick: signOut, danger: true },
                    ]
              }
            />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>{company.name}</span>
            <ChevronRight size={15} />
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => notify('You are all caught up')}
            >
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <button
              type="button"
              className={`role-switch ${isAdmin ? 'admin-mode' : ''}`}
              aria-label={
                isAdminRole
                  ? isAdmin
                    ? 'Switch to employee view'
                    : 'Switch to admin view'
                  : 'Signed-in role'
              }
              disabled={!isAdminRole}
              onClick={switchWorkspaceView}
              title={
                isAdminRole
                  ? isAdmin
                    ? 'Switch to employee view'
                    : 'Switch to admin view'
                  : undefined
              }
            >
              <span className="role-indicator" />
              {isAdmin ? 'Admin' : 'Employee'}
            </button>
          </div>
        </header>

        {activeNav === 'Overview' &&
          (isAdmin ? (
            <AdminDashboard
              greetingName={sessionAccount.displayName}
              requests={requests}
              expenseClaims={expenseClaims}
              employees={employees}
              absences={absences}
              company={company}
              bankHolidays={bankHolidays}
              leaveYear={leaveYear}
              pendingCount={pendingCount}
              adjustments={leaveAdjustments}
              onUpdateRequest={updateRequest}
              onApproveExpense={(id) => reviewExpenseClaim(id, 'Approved')}
              onOpenExpense={setActiveExpenseClaimId}
              upcomingTasks={upcomingTasks}
              onCompleteTask={completeHrTask}
              onSnoozeTask={snoozeHrTask}
              onOpenEmployee={openEmployeeFromTask}
              onConfigureLeaveYear={() => openSettings('company')}
              onConfigureMandatoryLeave={() => openSettings('leave')}
              onCloseLeaveYear={() => handleNavigation('Leave years')}
              needsLeaveYearClose={needsLeaveYearClosePrompt(
                company,
                leaveYear,
                leaveYearClosures,
                appToday(),
              )}
              onAddEmployee={() => setIsAddEmployeeOpen(true)}
              onNavigate={handleNavigation}
              canReviewEmployee={canReviewEmployee}
            />
          ) : (
            <EmployeeDashboard
              employee={currentEmployee}
              absences={absences}
              requests={requests}
              policies={policies}
              company={company}
              bankHolidays={bankHolidays}
              leaveYear={leaveYear}
              adjustments={leaveAdjustments}
              onRequestLeave={openRequestLeave}
              onNavigate={handleNavigation}
              onNotify={notify}
            />
          ))}
        {activeNav === 'Requests' && isAdmin && (
          <AdminRequests
            requests={requests}
            expenseClaims={expenseClaims}
            employees={employees}
            absences={absences}
            company={company}
            bankHolidays={bankHolidays}
            leaveYear={leaveYear}
            portalMessages={portalMessages}
            adjustments={leaveAdjustments}
            onUpdateRequest={updateRequest}
            onOpenRequest={setActiveLeaveRequestId}
            onOpenExpense={setActiveExpenseClaimId}
            onApproveExpense={(id) => reviewExpenseClaim(id, 'Approved')}
            onCancelApproved={cancelApprovedLeave}
            canReviewEmployee={canReviewEmployee}
          />
        )}
        {activeNav === 'Absences' && isAdmin && (
          <AbsencesPage
            employees={employees}
            absences={absences}
            requests={requests}
            onRecordAbsence={() => setIsRecordAbsenceOpen(true)}
            onDeleteAbsence={deleteAbsence}
            onOpenRequest={(requestId) => {
              setActiveLeaveRequestId(requestId)
            }}
          />
        )}
        {activeNav === 'Team calendar' && isAdmin && (
          <TeamCalendar
            employees={employees}
            absences={absences}
            bankHolidays={bankHolidays}
            onAddLeave={() => setIsAdminLeaveModalOpen(true)}
            onViewList={() => handleNavigation('Absences')}
          />
        )}
        {activeNav === 'Payroll reports' && isAdmin && (
          <PayrollReportsPage
            employees={employees}
            absences={absences}
            bankHolidays={bankHolidays}
            payrollEmail={company.payrollEmail}
            payPeriodStartDay={company.payPeriodStartDay}
            companyName={company.name}
            onNotify={notify}
          />
        )}
        {activeNav === 'VAT receipts' && isAdmin && (
          <VatReceiptsPage
            receipts={vatReceipts}
            uploadedBy={actorDisplayName}
            onChange={setVatReceipts}
            onNotify={notify}
          />
        )}
        {activeNav === 'Leave years' && isAdmin && (
          <LeaveYearsPage
            employees={employees}
            company={company}
            bankHolidays={bankHolidays}
            absences={absences}
            requests={requests}
            adjustments={leaveAdjustments}
            closures={leaveYearClosures}
            leaveYear={leaveYear}
            today={appToday()}
            closedByName={actorDisplayName}
            onConfirmClose={(result) => {
              setLeaveYearClosures(result.closures)
              setLeaveAdjustments(result.adjustments)
            }}
            onNotify={notify}
          />
        )}
        {activeNav === 'Audit log' && isAdmin && (
          <AuditLogPage
            events={auditEvents}
            onOpen={() => {
              void refreshAuditEvents()
            }}
          />
        )}
        {activeNav === 'Employees' && isAdmin && (
          <Employees
            employees={employees}
            company={company}
            bankHolidays={bankHolidays}
            onEditEmployee={setEditingEmployee}
            onAddEmployee={() => setIsAddEmployeeOpen(true)}
            onViewLeaveHistory={setLeaveHistoryEmployee}
            onRecordAdjustment={setAdjustmentEmployee}
            onManageDocuments={openEmployeeDocuments}
            onUpdateEmployee={(employee) => {
              setEmployees((current) =>
                current.map((item) => (item.id === employee.id ? employee : item)),
              )
              notify(`${employee.name} ${employee.status === 'Active' ? 'reactivated' : 'marked inactive'}`)
            }}
          />
        )}
        {activeNav === 'Employee documents' && isAdmin && documentsEmployee && (
          <AdminEmployeeDocumentsPage
            employee={documentsEmployee}
            folders={documentFolders}
            documents={employeeDocuments}
            onBack={() => {
              setActiveNav('Employees')
              setDocumentsEmployee(null)
            }}
            onCreateFolder={(name, visibility) =>
              createDocumentFolder(documentsEmployee.id, name, visibility)
            }
            onDeleteFolder={deleteDocumentFolder}
            onUploadDocument={uploadEmployeeDocument}
            onDeleteDocument={deleteEmployeeDocument}
          />
        )}
        {activeNav === 'Policies' && (
          <Policies
            policies={policies}
            isAdmin={isAdmin}
            onNotify={notify}
            onAddPolicy={addPolicy}
            onUpdatePolicy={updatePolicy}
            onDeletePolicy={deletePolicy}
          />
        )}
        {activeNav === 'Help' && (
          <HelpPage onOpenPolicies={() => handleNavigation('Policies')} />
        )}
        {activeNav === 'Documents' && !isAdmin && (
          <Documents
            employee={currentEmployee}
            folders={documentFolders}
            documents={employeeDocuments}
          />
        )}
        {activeNav === 'My leave' && !isAdmin && (
          <MyLeavePage
            employee={currentEmployee}
            absences={absences}
            requests={requests}
            company={company}
            bankHolidays={bankHolidays}
            leaveYear={leaveYear}
            portalMessages={portalMessages}
            adjustments={leaveAdjustments}
            closures={leaveYearClosures}
            onRequestLeave={openRequestLeave}
            onOpenRequest={setActiveLeaveRequestId}
          />
        )}
        {activeNav === 'Expenses' && !isAdmin && (
          <ExpensesPage
            employee={currentEmployee}
            claims={expenseClaims}
            onSubmitClaim={() => setIsExpenseModalOpen(true)}
            onOpenClaim={setActiveExpenseClaimId}
          />
        )}
        {activeNav === 'Settings' && isAdmin && sessionAccount && (
          <SettingsPage
            company={company}
            bankHolidays={bankHolidays}
            leaveYear={leaveYear}
            initialTab={settingsTab}
            accounts={accounts}
            currentAccountId={sessionAccount.id}
            onSave={saveCompanySettings}
            onBankHolidaysChange={setBankHolidays}
            onNotify={notify}
            onOpenLeaveYears={() => handleNavigation('Leave years')}
            onSessionAccountUpdated={(account) => {
              setSessionAccount((current) =>
                current && current.id === account.id ? { ...current, ...account } : current,
              )
              setAccounts((current) =>
                current.map((item) => (item.id === account.id ? { ...item, ...account } : item)),
              )
            }}
            onUpdateAccount={(account) => {
              void (async () => {
                const previous = accounts.find((item) => item.id === account.id)
                const payload: Record<string, unknown> = {
                  role: account.role,
                  status: account.status,
                }
                if (account.isPrimary && !previous?.isPrimary) {
                  const confirmPassword = window.prompt(
                    'Confirm your password to transfer primary ownership',
                  )
                  if (!confirmPassword) {
                    notify('Primary transfer cancelled')
                    return
                  }
                  payload.isPrimary = true
                  payload.confirmPassword = confirmPassword
                }
                if (Object.prototype.hasOwnProperty.call(account, 'employeeId')) {
                  payload.employeeId = account.employeeId
                }
                if (account.displayName) payload.displayName = account.displayName
                if (account.jobTitle !== undefined) payload.jobTitle = account.jobTitle

                const result = await updateAccountRequest(account.id, payload)
                if (!result.ok) {
                  notify(result.error)
                  return
                }
                const nextAccounts = result.data.accounts
                  ? result.data.accounts
                  : accounts.map((item) =>
                      item.id === result.data.account.id ? result.data.account : item,
                    )
                const ensured = ensureEmployeesForAccounts({
                  accounts: nextAccounts,
                  employees,
                  company,
                  documentFolders,
                })
                for (const accountId of ensured.changedAccountIds) {
                  const linked = ensured.accounts.find((item) => item.id === accountId)
                  if (!linked?.employeeId) continue
                  await updateAccountRequest(accountId, { employeeId: linked.employeeId })
                }
                setAccounts(ensured.accounts)
                setEmployees(ensured.employees)
                setDocumentFolders(ensured.documentFolders)
                const updated =
                  ensured.accounts.find((item) => item.id === account.id) ?? result.data.account
                if (updated.id === sessionAccount.id) {
                  if (updated.status === 'Inactive') {
                    void signOut()
                    return
                  }
                  setSessionAccount(updated)
                  if (updated.role !== 'admin' && activeNav === 'Settings') {
                    setActiveNav('Overview')
                    setAdminWorkspaceView('admin')
                  }
                }
                notify(`${updated.displayName} updated`)
              })()
            }}
            onAddAccount={async (payload) => {
              const email = payload.email.trim().toLowerCase()
              if (!email || !payload.displayName.trim()) {
                return 'Email and name are required'
              }
              const result = await createAccountRequest({
                email,
                displayName: payload.displayName.trim(),
                role: payload.role,
                employeeId: null,
                invite: true,
                jobTitle: payload.jobTitle,
              })
              if (!result.ok) return result.error

              const ensured = ensureEmployeesForAccounts({
                accounts: [...accounts, result.data.account],
                employees,
                company,
                documentFolders,
              })
              const created = ensured.accounts.find((item) => item.id === result.data.account.id)
              if (created?.employeeId) {
                const linked = await updateAccountRequest(created.id, {
                  employeeId: created.employeeId,
                })
                if (linked.ok) {
                  setAccounts(
                    ensured.accounts.map((item) =>
                      item.id === linked.data.account.id ? linked.data.account : item,
                    ),
                  )
                } else {
                  setAccounts(ensured.accounts)
                }
              } else {
                setAccounts(ensured.accounts)
              }
              setEmployees(ensured.employees)
              setDocumentFolders(ensured.documentFolders)
              notify(`Invite sent to ${result.data.account.displayName}`)
              return null
            }}
          />
        )}
      </main>

      {isLeaveModalOpen && (
        <LeaveModal
          employee={currentEmployee}
          company={company}
          bankHolidays={bankHolidays}
          absences={absences}
          requests={requests}
          leaveYear={leaveYear}
          adjustments={leaveAdjustments}
          onClose={() => setIsLeaveModalOpen(false)}
          onSubmit={submitLeaveRequest}
        />
      )}
      {isExpenseModalOpen && (
        <ExpenseClaimModal
          onClose={() => setIsExpenseModalOpen(false)}
          onSubmit={submitExpenseClaim}
        />
      )}
      {isAdminLeaveModalOpen && (
        <AdminAddLeaveModal
          employees={employees.filter((employee) => employee.status === 'Active')}
          onClose={() => setIsAdminLeaveModalOpen(false)}
          onSubmit={addTeamLeave}
        />
      )}
      {isRecordAbsenceOpen && (
        <RecordAbsenceModal
          employees={employees.filter((employee) => employee.status === 'Active')}
          recordedBy={actorDisplayName}
          onClose={() => setIsRecordAbsenceOpen(false)}
          onSubmit={recordAbsence}
        />
      )}
      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          company={company}
          bankHolidays={bankHolidays}
          onClose={() => setEditingEmployee(null)}
          onSave={saveEmployee}
        />
      )}
      {isAddEmployeeOpen && (
        <AddEmployeeModal
          company={company}
          bankHolidays={bankHolidays}
          onClose={() => setIsAddEmployeeOpen(false)}
          onSave={addEmployee}
        />
      )}
      {leaveHistoryEmployee && (
        <EmployeeLeaveHistoryModal
          employee={leaveHistoryEmployee}
          company={company}
          bankHolidays={bankHolidays}
          absences={absences}
          requests={requests}
          adjustments={leaveAdjustments}
          leaveYear={leaveYear}
          portalMessages={portalMessages}
          onClose={() => setLeaveHistoryEmployee(null)}
        />
      )}
      {adjustmentEmployee && (
        <LeaveAdjustmentModal
          employee={adjustmentEmployee}
          unit={adjustmentEmployee.entitlementUnit}
          onClose={() => setAdjustmentEmployee(null)}
          onSave={recordLeaveAdjustment}
        />
      )}
      {activeLeaveRequestId !== null && (() => {
        const request = requests.find((item) => item.id === activeLeaveRequestId)
        const employee = request ? employeeForRequest(request.id) : undefined
        if (!request || !employee) return null
        return (
          <LeaveRequestDetailModal
            request={request}
            employee={employee}
            company={company}
            bankHolidays={bankHolidays}
            absences={absences}
            requests={requests}
            leaveYear={leaveYear}
            portalMessages={portalMessages}
            adjustments={leaveAdjustments}
            viewer={isAdmin ? 'admin' : 'employee'}
            onClose={() => setActiveLeaveRequestId(null)}
            onSendMessage={(body) => sendPortalMessage(request.id, isAdmin ? 'admin' : 'employee', body)}
            onDirectAmend={(payload) => directAmendLeaveRequest(request.id, payload)}
            onProposeAmendment={(payload) => proposeLeaveAmendment(request.id, payload)}
            onUpdateRequest={(status) => {
              updateRequest(request.id, status)
              if (status !== 'Pending') setActiveLeaveRequestId(null)
            }}
            onResolveAmendment={(approved) => resolveLeaveAmendment(request.id, approved)}
            onCancelApproved={
              isAdmin
                ? () => {
                    cancelApprovedLeave(request.id)
                    setActiveLeaveRequestId(null)
                  }
                : undefined
            }
            canReview={canReviewEmployee(request.employeeId)}
          />
        )
      })()}
      {activeExpenseClaimId !== null && (() => {
        const claim = expenseClaims.find((item) => item.id === activeExpenseClaimId)
        if (!claim) return null
        return (
          <ExpenseClaimDetailModal
            claim={claim}
            viewer={isAdmin ? 'admin' : 'employee'}
            onClose={() => setActiveExpenseClaimId(null)}
            onReview={
              isAdmin && claim.status === 'Pending'
                ? (status, reviewNote) => reviewExpenseClaim(claim.id, status, reviewNote)
                : undefined
            }
            canReview={canReviewEmployee(claim.employeeId)}
          />
        )
      })()}
      {syncConflict && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal sync-conflict-modal"
            role="alertdialog"
            aria-labelledby="sync-conflict-title"
            aria-describedby="sync-conflict-body"
          >
            <div className="modal-header">
              <h2 id="sync-conflict-title">Organisation updated elsewhere</h2>
            </div>
            <div className="modal-body">
              <p id="sync-conflict-body">
                Someone else saved while you were editing. Your unsaved work is still on this
                screen. Merging reapplies only your changes onto their latest data — different
                fields on the same employee can combine; if you both changed the exact same field,
                their value is kept.
              </p>
              {syncConflict.overlapSummaries.length > 0 && (
                <div className="sync-conflict-overlaps">
                  <p>
                    {syncConflict.pendingMerge
                      ? 'These fields still overlap after refreshing latest data. Confirming will discard your local value for them and keep theirs:'
                      : 'These fields were edited by both of you. Merging will discard your local value for them and keep theirs:'}
                  </p>
                  <ul>
                    {syncConflict.overlapSummaries.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={conflictBusy}
                onClick={() => {
                  void discardConflictAndReload()
                }}
              >
                Load their version
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={conflictBusy}
                onClick={() => {
                  void mergeConflictChangesAndSave()
                }}
              >
                {conflictBusy
                  ? syncConflict.pendingMerge
                    ? 'Saving…'
                    : 'Checking…'
                  : syncConflict.pendingMerge
                    ? 'Confirm merge'
                    : 'Merge mine onto theirs'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
