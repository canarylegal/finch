import { useEffect, useMemo, useState } from 'react'
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
  APP_TODAY,
  AVATAR_COLORS,
  adminNavItems,
  companyEntitlementSettings,
  companyInitials,
  defaultCompanySettings,
  initialEmployees,
  initialDocumentFolders,
  initialEmployeeDocuments,
  initialPortalMessages,
  initialRequests,
  navItems,
  readPersistedState,
  type CompanySettings,
  type DocumentFolderVisibility,
  type Employee,
  type EmployeeDocumentCategory,
  type ExpenseCategory,
  type ExpenseReceipt,
  type RequestStatus,
  type SettingsTab,
} from './domain'
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
import {
  activeAdminCount,
  accountInitialsFromName,
  clearSession,
  createAccountCredentials,
  ensureAccounts,
  initialAccounts,
  loadSession,
  nextAccountId,
  resolveSessionAccount,
  type Account,
} from './auth'
import { LoginPage } from './pages/LoginPage'
import {
  createDefaultFoldersForEmployee,
  documentCountInFolder,
  nextDocumentFolderId,
  nextEmployeeDocumentId,
} from './employeeDocuments'
import {
  expenseReviewedNotification,
  expenseSubmittedNotification,
  leaveReviewedNotification,
  leaveSubmittedNotification,
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
  type LeaveYearClosure,
} from './leaveYearClose'
import { Policies } from './pages/PoliciesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TeamCalendar } from './pages/TeamCalendarPage'
import {
  ENGLAND_WALES_BANK_HOLIDAYS_2026,
  countWorkingDaysInRange,
  formatDisplayDate,
  initialAbsences,
  type AbsenceRecord,
  type BankHoliday,
} from './payroll'
import {
  formatGbp,
  initialExpenseClaims,
  nextExpenseClaimId,
  pendingExpenseCount,
} from './expenses'
import {
  LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE,
  applyMandatoryLeaveBookings,
  confirmationForLeaveYear,
  mandatoryBookingSignature,
} from './mandatoryLeave'
import {
  absenceTypeForLeaveRequest,
  isAnnualLeaveRequest,
  leaveRequestTypeFromLabel,
} from './leaveTypes'
import {
  initialPolicies,
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
import { saveFinchAppData } from './storage'
import './App.css'

function App() {
  const persisted = readPersistedState()
  const [accounts, setAccounts] = useState<Account[]>(
    () => ensureAccounts(persisted?.accounts ?? initialAccounts()),
  )
  const [sessionAccount, setSessionAccount] = useState<Account | null>(() =>
    resolveSessionAccount(ensureAccounts(persisted?.accounts ?? initialAccounts()), loadSession()),
  )
  const [activeNav, setActiveNav] = useState('Overview')
  const [requests, setRequests] = useState(persisted?.requests ?? initialRequests)
  const [portalMessages, setPortalMessages] = useState(
    persisted?.portalMessages ?? initialPortalMessages,
  )
  const [employees, setEmployees] = useState(persisted?.employees ?? initialEmployees)
  const [employeeDocuments, setEmployeeDocuments] = useState(
    persisted?.employeeDocuments ?? initialEmployeeDocuments,
  )
  const [documentFolders, setDocumentFolders] = useState(
    persisted?.documentFolders ?? initialDocumentFolders,
  )
  const [expenseClaims, setExpenseClaims] = useState(
    persisted?.expenseClaims ?? initialExpenseClaims,
  )
  const [taskDismissals, setTaskDismissals] = useState<TaskDismissal[]>(
    persisted?.taskDismissals ?? [],
  )
  const [policies, setPolicies] = useState(persisted?.policies ?? initialPolicies)
  const [leaveAdjustments, setLeaveAdjustments] = useState<LeaveAdjustment[]>(
    persisted?.leaveAdjustments ?? [],
  )
  const [leaveYearClosures, setLeaveYearClosures] = useState<LeaveYearClosure[]>(
    persisted?.leaveYearClosures ?? [],
  )
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('company')
  const [absences, setAbsences] = useState<AbsenceRecord[]>(persisted?.absences ?? initialAbsences)
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>(
    persisted?.bankHolidays ?? ENGLAND_WALES_BANK_HOLIDAYS_2026,
  )
  const [company, setCompany] = useState<CompanySettings>(
    persisted?.company ?? defaultCompanySettings,
  )
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

  const persistAppData = (overrides: {
    expenseClaims?: typeof expenseClaims
    taskDismissals?: TaskDismissal[]
    policies?: typeof policies
    leaveAdjustments?: LeaveAdjustment[]
    leaveYearClosures?: LeaveYearClosure[]
    accounts?: Account[]
  } = {}) =>
    saveFinchAppData({
      employees,
      absences,
      company,
      bankHolidays,
      requests,
      portalMessages,
      documentFolders,
      employeeDocuments,
      accounts: overrides.accounts ?? accounts,
      expenseClaims: overrides.expenseClaims ?? expenseClaims,
      taskDismissals: overrides.taskDismissals ?? taskDismissals,
      policies: overrides.policies ?? policies,
      leaveAdjustments: overrides.leaveAdjustments ?? leaveAdjustments,
      leaveYearClosures: overrides.leaveYearClosures ?? leaveYearClosures,
    })

  useEffect(() => {
    persistAppData()
  }, [
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
    taskDismissals,
    policies,
    leaveAdjustments,
    leaveYearClosures,
  ])

  const isAdmin = sessionAccount?.role === 'admin'
  const actorDisplayName = sessionAccount?.displayName ?? 'Unknown'
  const currentEmployee =
    sessionAccount?.employeeId != null
      ? employees.find((item) => item.id === sessionAccount.employeeId)
      : undefined
  const pendingCount =
    requests.filter((request) => request.status === 'Pending').length +
    pendingExpenseCount(expenseClaims)
  const leaveYear = useMemo(
    () => getLeaveYearPeriod(APP_TODAY, company.leaveYearStart, company.leaveYearEnd),
    [company.leaveYearStart, company.leaveYearEnd],
  )
  const todayIso = toIsoDate(APP_TODAY)
  const upcomingTasks = useMemo(
    () => buildProbationTasks(employees, taskDismissals, todayIso),
    [employees, taskDismissals, todayIso],
  )
  const currentNav = isAdmin ? adminNavItems : navItems
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const signOut = () => {
    clearSession()
    setSessionAccount(null)
    setActiveNav('Overview')
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
    if (!isAdmin) {
      notify('Only admins can open settings')
      return
    }
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
        recordedAt: toIsoDate(APP_TODAY),
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
    payload: { start: string; end: string; days: number; note: string },
  ) => {
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, ...buildLeaveRequestFields(payload.start, payload.end, payload.days, payload.note) }
          : item,
      ),
    )
    notify('Leave request updated')
  }

  const proposeLeaveAmendment = (
    id: number,
    payload: { start: string; end: string; days: number; note: string },
  ) => {
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, pendingAmendment: buildLeaveAmendment(payload.start, payload.end, payload.days, payload.note) }
          : item,
      ),
    )
    notify('Change sent for employer approval')
  }

  const resolveLeaveAmendment = (id: number, approved: boolean) => {
    const request = requests.find((item) => item.id === id)
    const employee = employeeForRequest(id)
    if (!request?.pendingAmendment || !employee) return

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
    const amount = countWorkingDaysInRange(amendment.start, amendment.end, employee.workingDays)

    if (isAnnualLeaveRequest(request)) {
      const currentDays =
        request.start && request.end
          ? leaveDaysInLeaveYear(request.start, request.end, leaveYear, employee.workingDays)
          : parseDurationDays(request.duration)
      const newDays = leaveDaysInLeaveYear(
        amendment.start,
        amendment.end,
        leaveYear,
        employee.workingDays,
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

    const recordedAt = toIsoDate(APP_TODAY)
    let nextAbsenceId = request.absenceId

    if (request.absenceId != null) {
      setAbsences((current) =>
        current.map((item) =>
          item.id === request.absenceId
            ? {
                ...item,
                start: amendment.start,
                end: amendment.end,
                amount,
                note: amendment.note || item.note,
              }
            : item,
        ),
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
        },
      ])
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...buildLeaveRequestFields(amendment.start, amendment.end, amount, amendment.note),
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

    if (status === 'Approved' && request && employee && isAnnualLeaveRequest(request)) {
      const days =
        request.start && request.end
          ? leaveDaysInLeaveYear(request.start, request.end, leaveYear, employee.workingDays)
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
      const start = request.start ?? toIsoDate(APP_TODAY)
      const end = request.end ?? request.start ?? toIsoDate(APP_TODAY)
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
            recordedAt: toIsoDate(APP_TODAY),
          },
        ])
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
    if (
      request &&
      (status === 'Approved' || status === 'Declined') &&
      shouldNotify(company, 'leaveRequestReviewed')
    ) {
      notify(leaveReviewedNotification(request.name, status, request.dates))
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
  }

  const saveCompanySettings = (next: CompanySettings) => {
    const previousConfirmation = confirmationForLeaveYear(
      company.mandatoryLeaveConfirmations,
      leaveYear,
    )
    const nextConfirmation = confirmationForLeaveYear(next.mandatoryLeaveConfirmations, leaveYear)
    setCompany(next)

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
  }) => {
    if (!company.leaveYearConfigured) {
      notify(LEAVE_NOT_CONFIGURED_EMPLOYEE_MESSAGE)
      return
    }
    const employee = currentEmployee
    if (!employee) return

    if (payload.leaveType === 'Annual leave') {
      const yearDays = leaveDaysInLeaveYear(
        payload.start,
        payload.end,
        leaveYear,
        employee.workingDays,
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

    const startLabel = formatDisplayDate(payload.start)
    const endLabel = formatDisplayDate(payload.end)
    const dates =
      payload.start === payload.end ? startLabel : `${startLabel} – ${endLabel}`

    setRequests((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((item) => item.id)) + 1,
        employeeId: employee.id,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        dates,
        duration: `${payload.days} ${payload.days === 1 ? 'day' : 'days'}`,
        note: payload.note,
        status: 'Pending',
        leaveType: leaveRequestTypeFromLabel(payload.leaveType),
        start: payload.start,
        end: payload.end,
      },
    ])
    setIsLeaveModalOpen(false)
    notify('Leave request sent to Alex')
    if (shouldNotify(company, 'leaveRequestSubmitted')) {
      notify(leaveSubmittedNotification(employee.name, dates))
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

    if (!persistAppData({ expenseClaims: nextClaims })) {
      notify('Could not save this claim — receipts are too large for browser storage. Try fewer or smaller files.')
      return false
    }

    setExpenseClaims(nextClaims)
    setIsExpenseModalOpen(false)
    notify('Expense claim sent to Alex')
    if (shouldNotify(company, 'expenseClaimSubmitted')) {
      notify(expenseSubmittedNotification(employee.name, formatGbp(payload.amount)))
    }
    return true
  }

  const reviewExpenseClaim = (id: number, status: 'Approved' | 'Declined', reviewNote?: string) => {
    const claim = expenseClaims.find((item) => item.id === id)
    if (!claim) return

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

    if (!persistAppData({ expenseClaims: nextClaims })) {
      notify('Could not save — browser storage is full.')
      return
    }

    setExpenseClaims(nextClaims)
    setActiveExpenseClaimId(null)
    notify(status === 'Approved' ? 'Expense claim approved' : 'Expense claim declined')
    if (shouldNotify(company, 'expenseClaimReviewed')) {
      notify(expenseReviewedNotification(claim.name, status, formatGbp(claim.amount)))
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
    if (!persistAppData({ policies: nextPolicies })) {
      notify('Could not save this policy — the file is too large for browser storage.')
      return false
    }
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
    if (!persistAppData({ policies: nextPolicies })) {
      notify('Could not save — browser storage is full.')
      return false
    }
    setPolicies(nextPolicies)
    notify('Policy updated')
    return true
  }

  const deletePolicy = (id: number) => {
    setPolicies((current) => current.filter((policy) => policy.id !== id))
    notify('Policy deleted')
  }

  const addEmployee = (payload: Omit<Employee, 'id' | 'initials' | 'color'>) => {
    const nextId = Math.max(0, ...employees.map((item) => item.id)) + 1
    const employee: Employee = {
      ...payload,
      id: nextId,
      initials: companyInitials(payload.name) || 'EE',
      color: AVATAR_COLORS[(nextId - 1) % AVATAR_COLORS.length],
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
  }) => {
    const employee = employees.find((item) => item.id === payload.employeeId)
    if (!employee) return

    const leaveType = leaveRequestTypeFromLabel(payload.leaveType)
    const days = countWorkingDaysInRange(payload.start, payload.end, employee.workingDays)

    if (leaveType === 'annual') {
      const yearDays = leaveDaysInLeaveYear(
        payload.start,
        payload.end,
        leaveYear,
        employee.workingDays,
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

    const absenceId = Math.max(0, ...absences.map((item) => item.id)) + 1
    const requestId = Math.max(0, ...requests.map((item) => item.id)) + 1
    const fields = buildLeaveRequestFields(
      payload.start,
      payload.end,
      days,
      payload.leaveType === 'Annual leave' ? 'Admin-added leave' : payload.leaveType,
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
        recordedAt: toIsoDate(APP_TODAY),
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
    addAbsence(record)
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
        recordedAt: toIsoDate(APP_TODAY),
      },
    ])
    setAdjustmentEmployee(null)
    notify(
      payload.direction === 'credit'
        ? `Credit of ${payload.amount} ${adjustmentEmployee.entitlementUnit} recorded`
        : `Debit of ${payload.amount} ${adjustmentEmployee.entitlementUnit} recorded`,
    )
  }

  if (!sessionAccount) {
    return (
      <>
        <LoginPage
          accounts={accounts}
          onSignedIn={(account) => {
            setSessionAccount(account)
            setActiveNav('Overview')
            notify(`Signed in as ${account.displayName}`)
          }}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
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
          isAdmin={isAdmin}
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
            onClick={() => {
              handleNavigation('Policies')
              notify('Opened policies — help centre coming later')
            }}
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
            <div className={`role-switch ${isAdmin ? 'admin-mode' : ''}`} aria-label="Signed-in role">
              <span className="role-indicator" />
              {isAdmin ? 'Admin' : 'Employee'}
            </div>
          </div>
        </header>

        {activeNav === 'Overview' &&
          (isAdmin ? (
            <AdminDashboard
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
                APP_TODAY,
              )}
              onAddEmployee={() => setIsAddEmployeeOpen(true)}
              onNavigate={handleNavigation}
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
          />
        )}
        {activeNav === 'Absences' && isAdmin && (
          <AbsencesPage
            employees={employees}
            absences={absences}
            onRecordAbsence={() => setIsRecordAbsenceOpen(true)}
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
            today={APP_TODAY}
            closedByName={actorDisplayName}
            onConfirmClose={(result) => {
              setLeaveYearClosures(result.closures)
              setLeaveAdjustments(result.adjustments)
            }}
            onNotify={notify}
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
            employees={employees}
            currentAccountId={sessionAccount.id}
            onSave={saveCompanySettings}
            onBankHolidaysChange={setBankHolidays}
            onNotify={notify}
            onOpenLeaveYears={() => handleNavigation('Leave years')}
            onUpdateAccount={(account) => {
              if (
                account.role !== 'admin' &&
                account.id !== sessionAccount.id &&
                accounts.find((item) => item.id === account.id)?.role === 'admin' &&
                activeAdminCount(accounts) <= 1
              ) {
                notify('Keep at least one active admin')
                return
              }
              if (
                account.status === 'Inactive' &&
                account.role === 'admin' &&
                activeAdminCount(accounts.filter((item) => item.id !== account.id)) < 1 &&
                accounts.find((item) => item.id === account.id)?.status === 'Active'
              ) {
                notify('Keep at least one active admin')
                return
              }
              setAccounts((current) =>
                current.map((item) => (item.id === account.id ? account : item)),
              )
              if (account.id === sessionAccount.id) {
                if (account.status === 'Inactive') {
                  signOut()
                  return
                }
                setSessionAccount(account)
                if (account.role !== 'admin' && activeNav === 'Settings') {
                  setActiveNav('Overview')
                }
              }
              notify(`${account.displayName} updated`)
            }}
            onAddAccount={async (payload) => {
              const email = payload.email.trim().toLowerCase()
              if (!email || !payload.displayName.trim() || !payload.password) {
                return 'Email, name, and password are required'
              }
              if (accounts.some((item) => item.email.toLowerCase() === email)) {
                return 'An account with that email already exists'
              }
              const credentials = await createAccountCredentials(payload.password)
              const account: Account = {
                id: nextAccountId(accounts),
                email,
                displayName: payload.displayName.trim(),
                initials: accountInitialsFromName(payload.displayName),
                role: payload.role,
                employeeId: payload.employeeId,
                status: 'Active',
                jobTitle: payload.jobTitle,
                ...credentials,
              }
              setAccounts((current) => [...current, account])
              notify(`Account created for ${account.displayName}`)
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
          />
        )
      })()}
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
