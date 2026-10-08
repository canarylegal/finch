import { emptyAppData, emptyCompany } from './appDataShape.mjs'
import { createAuditEvent, mergeAuditEvents } from './audit.mjs'
import { accountsForTenant, ensureTenantAppData } from './tenants.mjs'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function nextNumericId(items) {
  let max = 0
  for (const item of asArray(items)) {
    const id = Number(item?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

function publicCompanyForEmployee(company) {
  const full = { ...emptyCompany(), ...(company || {}) }
  return {
    name: full.name,
    logoUrl: full.logoUrl,
    leaveYearStart: full.leaveYearStart,
    leaveYearEnd: full.leaveYearEnd,
    leaveYearConfigured: full.leaveYearConfigured,
    leaveYearConfiguredAt: full.leaveYearConfiguredAt,
    defaultRollOver: full.defaultRollOver,
    defaultEntitlement: full.defaultEntitlement,
    defaultEntitlementUnit: full.defaultEntitlementUnit,
    defaultWorkingDays: full.defaultWorkingDays,
    entitlementIncludesBankHolidays: full.entitlementIncludesBankHolidays,
    notificationEvents: full.notificationEvents,
    bankHolidayRegion: full.bankHolidayRegion,
    // Keep shape stable for the client; values are not employee-editable.
    emailNotifications: Boolean(full.emailNotifications),
    twoFactorRequired: full.twoFactorRequired === 'all' ? 'all' : 'admins',
    payrollEmail: '',
    autoSendPayrollReport: false,
    autoSendDayOfMonth: full.autoSendDayOfMonth,
    lastAutoPayrollSentPeriodEnd: null,
    payPeriodStartDay: full.payPeriodStartDay,
    adminsCanApproveOwnRequests: false,
    mandatoryLeaveConfirmations: [],
  }
}

function sharedFolderIdsForEmployee(folders, employeeId) {
  return new Set(
    asArray(folders)
      .filter(
        (folder) =>
          folder &&
          folder.employeeId === employeeId &&
          folder.visibility === 'shared',
      )
      .map((folder) => folder.id),
  )
}

function ownRequestIds(requests, employeeId) {
  return new Set(
    asArray(requests)
      .filter((request) => request && request.employeeId === employeeId)
      .map((request) => request.id),
  )
}

/**
 * Project store app-data for an authenticated viewer.
 * Admins receive the full dataset; employees receive a least-privilege slice.
 */
export function projectAppDataForViewer(store, account, publicAccount) {
  const appData = ensureTenantAppData(store, account.tenantId)
  const tenantAccounts = accountsForTenant(store, account.tenantId)
  if (account.role === 'admin') {
    return {
      ...appData,
      accounts: tenantAccounts.map(publicAccount),
      tenantId: account.tenantId,
    }
  }

  const employeeId = account.employeeId
  const folders = asArray(appData.documentFolders).filter(
    (folder) =>
      folder && folder.employeeId === employeeId && folder.visibility === 'shared',
  )
  const folderIds = new Set(folders.map((folder) => folder.id))
  const documents = asArray(appData.employeeDocuments).filter(
    (doc) =>
      doc &&
      doc.employeeId === employeeId &&
      (doc.folderId == null || folderIds.has(doc.folderId)),
  )
  const requests = asArray(appData.requests).filter(
    (request) => request && request.employeeId === employeeId,
  )
  const requestIds = ownRequestIds(requests, employeeId)
  const employees = asArray(appData.employees).filter(
    (employee) => employee && employee.id === employeeId,
  )
  const closures = asArray(appData.leaveYearClosures).map((closure) => ({
    leaveYearKey: closure.leaveYearKey,
    leaveYearStart: closure.leaveYearStart,
    leaveYearEnd: closure.leaveYearEnd,
    closedAt: closure.closedAt,
    closedBy: closure.closedBy,
    // Strip other employees' balance lines.
    lines: asArray(closure.lines).filter((line) => line && line.employeeId === employeeId),
  }))

  return {
    company: publicCompanyForEmployee(appData.company),
    bankHolidays: asArray(appData.bankHolidays),
    employees,
    absences: asArray(appData.absences).filter(
      (absence) => absence && absence.employeeId === employeeId,
    ),
    requests,
    portalMessages: asArray(appData.portalMessages).filter(
      (message) =>
        message &&
        message.employeeId === employeeId &&
        (message.requestId == null || requestIds.has(message.requestId)),
    ),
    documentFolders: folders,
    employeeDocuments: documents,
    expenseClaims: asArray(appData.expenseClaims).filter(
      (claim) => claim && claim.employeeId === employeeId,
    ),
    policies: asArray(appData.policies),
    leaveAdjustments: asArray(appData.leaveAdjustments).filter(
      (item) => item && item.employeeId === employeeId,
    ),
    leaveYearClosures: closures,
    vatReceipts: [],
    taskDismissals: asArray(appData.taskDismissals).filter(
      (item) => item && item.employeeId === employeeId,
    ),
    auditEvents: [],
    accounts: [publicAccount(account)],
    tenantId: account.tenantId,
  }
}

function mergeOwnCollection({
  serverItems,
  incomingItems,
  belongsToActor,
  canAcceptIncoming,
}) {
  const server = asArray(serverItems)
  const incoming = asArray(incomingItems)
  const others = server.filter((item) => !belongsToActor(item))
  const accepted = []
  const idRemap = new Map()
  const claimedIds = new Set()
  let nextId = nextNumericId(server)

  for (const item of incoming) {
    if (!item || !belongsToActor(item)) continue
    const existing = server.find((row) => row.id === item.id)

    // Reject client ids that already belong to someone else.
    if (existing && !belongsToActor(existing)) continue

    if (!existing) {
      if (!canAcceptIncoming(item, null)) continue
      // Server allocates ids when the client omits/duplicates one; otherwise keep a
      // free client id so the SPA stays in sync without an immediate reload.
      let serverId = item.id
      const idUsable =
        typeof serverId === 'number' &&
        Number.isFinite(serverId) &&
        !server.some((row) => row.id === serverId) &&
        !claimedIds.has(serverId)
      if (!idUsable) {
        serverId = nextId++
      }
      claimedIds.add(serverId)
      idRemap.set(item.id, serverId)
      accepted.push({ ...item, id: serverId })
      continue
    }

    if (!canAcceptIncoming(item, existing)) continue
    if (claimedIds.has(existing.id)) continue
    claimedIds.add(existing.id)
    idRemap.set(item.id, existing.id)
    accepted.push({ ...item, id: existing.id })
  }

  // Keep server-owned actor rows that the client omitted only when they are
  // terminal statuses the client is not allowed to revert.
  const acceptedIds = new Set(accepted.map((item) => item.id))
  for (const item of server) {
    if (!belongsToActor(item) || acceptedIds.has(item.id)) continue
    if (item.status === 'Approved' || item.status === 'Declined' || item.status === 'Cancelled') {
      accepted.push(item)
      idRemap.set(item.id, item.id)
    }
  }
  return { items: [...others, ...accepted], idRemap }
}

function mergeEmployeeRequests(serverRequests, incomingRequests, employeeId) {
  return mergeOwnCollection({
    serverItems: serverRequests,
    incomingItems: incomingRequests,
    belongsToActor: (item) => item.employeeId === employeeId,
    canAcceptIncoming: (incoming, existing) => {
      if (incoming.employeeId !== employeeId) return false
      // Employees cannot approve/decline.
      if (incoming.status === 'Approved' || incoming.status === 'Declined') {
        return false
      }
      if (!existing) {
        return incoming.status === 'Pending'
      }
      if (existing.employeeId !== employeeId) return false
      // Do not let a stale client revert an admin decision.
      if (
        existing.status === 'Approved' ||
        existing.status === 'Declined' ||
        existing.status === 'Cancelled'
      ) {
        // Allow amendment proposals / notes on approved leave only.
        if (existing.status === 'Approved' && incoming.status === 'Approved') {
          return true
        }
        return false
      }
      return incoming.status === 'Pending' || incoming.status === 'Cancelled'
    },
  })
}

function mergeEmployeeExpenses(serverClaims, incomingClaims, employeeId) {
  return mergeOwnCollection({
    serverItems: serverClaims,
    incomingItems: incomingClaims,
    belongsToActor: (item) => item.employeeId === employeeId,
    canAcceptIncoming: (incoming, existing) => {
      if (incoming.employeeId !== employeeId) return false
      if (incoming.status === 'Approved' || incoming.status === 'Declined') return false
      if (!existing) return incoming.status === 'Pending'
      if (existing.employeeId !== employeeId) return false
      if (existing.status === 'Approved' || existing.status === 'Declined') return false
      return incoming.status === 'Pending'
    },
  })
}

function mergeEmployeeMessages(
  serverMessages,
  incomingMessages,
  employeeId,
  requestIds,
  requestIdRemap,
) {
  const server = asArray(serverMessages)
  const incoming = asArray(incomingMessages)
  const others = server.filter((message) => message.employeeId !== employeeId)
  const ownServer = server.filter((message) => message.employeeId === employeeId)
  const byId = new Map(ownServer.map((message) => [message.id, message]))
  let nextMessageId = nextNumericId(server)

  for (const message of incoming) {
    if (!message) continue
    if (message.employeeId !== employeeId) continue
    if (message.author !== 'employee') continue

    const clientRequestId = message.requestId
    const requestId =
      clientRequestId == null
        ? null
        : requestIdRemap.has(clientRequestId)
          ? requestIdRemap.get(clientRequestId)
          : clientRequestId
    if (requestId != null && !requestIds.has(requestId)) continue

    const existing = typeof message.id === 'number' ? byId.get(message.id) : null
    // Do not let employees overwrite admin messages or steal another message id.
    if (existing && existing.author === 'admin') continue
    if (existing && existing.employeeId !== employeeId) continue

    let id = message.id
    if (typeof id !== 'number' || (existing == null && server.some((row) => row.id === id))) {
      id = nextMessageId++
    }
    byId.set(id, {
      ...message,
      id,
      employeeId,
      requestId,
      author: 'employee',
    })
  }
  return [...others, ...byId.values()]
}

function mergeEmployeeDocuments(serverFolders, serverDocs, _incomingFolders, incomingDocs, employeeId) {
  // Folders and sharing permissions are admin-managed. Employees cannot create
  // folders, change visibility, or claim another folder's id as "shared".
  const serverSharedIds = sharedFolderIdsForEmployee(serverFolders, employeeId)

  const docs = asArray(serverDocs).filter(
    (doc) => !(doc.employeeId === employeeId && serverSharedIds.has(doc.folderId)),
  )
  const acceptedDocs = asArray(incomingDocs).filter(
    (doc) =>
      doc &&
      doc.employeeId === employeeId &&
      typeof doc.folderId === 'number' &&
      serverSharedIds.has(doc.folderId),
  )
  return {
    documentFolders: asArray(serverFolders),
    employeeDocuments: [...docs, ...acceptedDocs],
  }
}

/**
 * Apply a client app-data write under role rules.
 * Returns { ok: true, auditEvents } or { ok: false, status, error }.
 */
export function applyAppDataWrite(store, account, incoming, { createAuditEventFn = createAuditEvent } = {}) {
  const body = incoming || {}
  const {
    accounts: _ignoredAccounts,
    _auditAppend: rawAppend,
    _allowEmployeeSave: _ignoredFlag,
    ...appData
  } = body

  if (!appData.company || typeof appData.company !== 'object') {
    return { ok: false, status: 400, error: 'Invalid app data' }
  }

  if (account.tenantId == null) {
    return { ok: false, status: 403, error: 'Account is not linked to an organisation' }
  }
  const current = ensureTenantAppData(store, account.tenantId)

  if (account.role === 'admin') {
    const stampedAppend = asArray(rawAppend).map((item) =>
      createAuditEventFn({
        action: item?.action,
        summary: item?.summary,
        entityType: item?.entityType,
        entityId: item?.entityId,
        // Allow stable client ids for idempotent retries; actor is always server-set.
        id: typeof item?.id === 'string' ? item.id : undefined,
        at: typeof item?.at === 'string' ? item.at : undefined,
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
      }),
    )

    // Never trust client auditEvents as a replace/merge source — only explicit appends.
    const nextAudit = mergeAuditEvents(current.auditEvents, stampedAppend)

    store.appDataByTenant[String(account.tenantId)] = {
      ...emptyAppData(),
      ...current,
      ...appData,
      company: {
        ...emptyCompany(),
        ...current.company,
        ...appData.company,
      },
      auditEvents: nextAudit,
    }
    return { ok: true, auditEvents: nextAudit }
  }

  // Employee path: merge only self-scoped mutable slices into server truth.
  const employeeId = account.employeeId
  if (employeeId == null) {
    return { ok: false, status: 403, error: 'Employee profile is not linked to this account' }
  }

  const requestMerge = mergeEmployeeRequests(current.requests, appData.requests, employeeId)
  const nextRequests = requestMerge.items
  const requestIds = ownRequestIds(nextRequests, employeeId)
  const expenseMerge = mergeEmployeeExpenses(current.expenseClaims, appData.expenseClaims, employeeId)
  const nextClaims = expenseMerge.items
  const nextMessages = mergeEmployeeMessages(
    current.portalMessages,
    appData.portalMessages,
    employeeId,
    requestIds,
    requestMerge.idRemap,
  )
  const docs = mergeEmployeeDocuments(
    current.documentFolders,
    current.employeeDocuments,
    appData.documentFolders,
    appData.employeeDocuments,
    employeeId,
  )
  const nextDismissals = [
    ...asArray(current.taskDismissals).filter((item) => item.employeeId !== employeeId),
    ...asArray(appData.taskDismissals).filter((item) => item && item.employeeId === employeeId),
  ]

  store.appDataByTenant[String(account.tenantId)] = {
    ...current,
    requests: nextRequests,
    expenseClaims: nextClaims,
    portalMessages: nextMessages,
    documentFolders: docs.documentFolders,
    employeeDocuments: docs.employeeDocuments,
    taskDismissals: nextDismissals,
    // Explicitly preserve privileged collections.
    company: current.company,
    employees: current.employees,
    absences: current.absences,
    bankHolidays: current.bankHolidays,
    policies: current.policies,
    leaveAdjustments: current.leaveAdjustments,
    leaveYearClosures: current.leaveYearClosures,
    vatReceipts: current.vatReceipts,
    auditEvents: current.auditEvents,
  }

  return { ok: true, auditEvents: [] }
}
