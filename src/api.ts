const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; revision?: number }
> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      ...options,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof payload.error === 'string' ? payload.error : 'Request failed',
        revision: typeof payload.revision === 'number' ? payload.revision : undefined,
      }
    }
    return { ok: true, data: payload as T }
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach Finch server' }
  }
}

export type PublicAccount = {
  id: number
  email: string
  displayName: string
  initials: string
  role: 'admin' | 'employee'
  employeeId: number | null
  tenantId?: number | null
  status: 'Active' | 'Inactive'
  jobTitle?: string
  isPrimary?: boolean
  mustSetPassword?: boolean
  totpEnabled?: boolean
  recoveryCodesRemaining?: number
  passkeyCount?: number
  passkeys?: { id: string; name: string; createdAt: string | null; backedUp: boolean }[]
}

export type PublicTenant = {
  id: number
  name: string
  slug: string
  status: string
  createdAt: string | null
}

export async function fetchBootstrap() {
  return api<{
    multiTenant: boolean
    canCreateOrganisation: boolean
    organisationCount: number
    hasAccounts: boolean
    orgConfigured: boolean
    companyName: string
    session: { kind: string; accountId: number | null; tenantId?: number | null } | null
  }>('/api/bootstrap')
}

export async function loginWithPassword(email: string, password: string) {
  return api<
    | { account: PublicAccount; recovery?: undefined; requires2fa?: undefined; mustSetup2fa?: undefined }
    | { recovery: true; displayName: string; hasAccounts: boolean; account?: undefined }
    | {
        requires2fa: true
        challenge: 'account' | 'master'
        account?: PublicAccount
        displayName?: string
        hasAccounts?: boolean
        passkeysAvailable?: boolean
        totpAvailable?: boolean
      }
    | { mustSetup2fa: true; account: PublicAccount }
  >('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function requestPasswordReset(email: string) {
  return api<{ ok: true; message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function fetchPasswordSetup(token: string) {
  return api<{
    ok: true
    email: string
    displayName: string
    purpose: 'invite' | 'reset' | string
  }>(`/api/auth/password-setup?token=${encodeURIComponent(token)}`)
}

export async function completePasswordSetup(token: string, password: string) {
  return api<{ ok: true; message: string; email: string }>('/api/auth/password-setup', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function signupFirstAdmin(payload: {
  email: string
  displayName: string
  password: string
  companyName?: string
}) {
  return api<{ account: PublicAccount; tenant?: PublicTenant }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function verifyTwoFactorCode(code: string) {
  return api<
    | { account: PublicAccount; recovery?: undefined }
    | { recovery: true; displayName: string; hasAccounts: boolean }
  >('/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function setupTwoFactor() {
  return api<{ secret: string; uri: string; qrDataUrl: string }>('/api/auth/2fa/setup', {
    method: 'POST',
    body: '{}',
  })
}

export async function confirmTwoFactor(code: string) {
  return api<{ account: PublicAccount; recoveryCodes: string[] }>('/api/auth/2fa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function disableTwoFactor(password: string, code: string) {
  return api<{ account: PublicAccount }>('/api/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
  })
}

export async function fetchTwoFactorStatus() {
  return api<{
    totpEnabled: boolean
    recoveryCodesRemaining: number
    passkeyCount: number
    passkeys: { id: string; name: string; createdAt: string | null; backedUp: boolean }[]
    secondFactorEnabled: boolean
    policy: 'all' | 'admins' | 'optional'
    required: boolean
    pendingSetup: boolean
  }>('/api/auth/2fa/status')
}

export async function webauthnRegisterOptions() {
  return api<Record<string, unknown>>('/api/auth/webauthn/register/options', {
    method: 'POST',
    body: '{}',
  })
}

export async function webauthnRegisterVerify(credential: unknown, name?: string) {
  return api<{ account: PublicAccount; recoveryCodes: string[] | null }>(
    '/api/auth/webauthn/register/verify',
    {
      method: 'POST',
      body: JSON.stringify({ credential, name }),
    },
  )
}

export async function webauthnAuthenticateOptions() {
  return api<Record<string, unknown>>('/api/auth/webauthn/authenticate/options', {
    method: 'POST',
    body: '{}',
  })
}

export async function webauthnAuthenticateVerify(credential: unknown) {
  return api<{ account: PublicAccount }>('/api/auth/webauthn/authenticate/verify', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })
}

export async function webauthnLoginOptions(email: string) {
  return api<Record<string, unknown>>('/api/auth/webauthn/login/options', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function webauthnLoginVerify(email: string, credential: unknown) {
  return api<{ account: PublicAccount }>('/api/auth/webauthn/login/verify', {
    method: 'POST',
    body: JSON.stringify({ email, credential }),
  })
}

export async function webauthnRemovePasskey(id: string, password: string) {
  return api<{ account: PublicAccount }>('/api/auth/webauthn/credentials/remove', {
    method: 'POST',
    body: JSON.stringify({ id, password }),
  })
}

export async function logoutRequest() {
  return api<{ ok: true }>('/api/auth/logout', { method: 'POST', body: '{}' })
}

export async function fetchMe() {
  return api<
    | {
        kind: 'account'
        account: PublicAccount
        orgConfigured: boolean
      }
    | {
        kind: 'master_recovery'
        displayName: string
        hasAccounts: boolean
        orgConfigured: boolean
      }
    | {
        kind: 'pending_2fa' | 'pending_2fa_setup'
        account: PublicAccount
        orgConfigured: boolean
      }
    | {
        kind: 'pending_2fa_master'
        displayName: string
        hasAccounts: boolean
        orgConfigured: boolean
      }
  >('/api/auth/me')
}

export async function fetchAppData() {
  return api<Record<string, unknown>>('/api/app-data')
}

export async function saveAppData(data: Record<string, unknown>) {
  return api<{
    ok: true
    auditEvents?: import('./auditLog').AuditEvent[]
    data?: Record<string, unknown>
    revision?: number
    idRemap?: {
      requests: Array<{ from: number; to: number }>
      expenseClaims: Array<{ from: number; to: number }>
    }
  }>('/api/app-data', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createAccountRequest(payload: {
  email: string
  displayName: string
  role: 'admin' | 'employee'
  employeeId: number | null
  password?: string
  invite?: boolean
  jobTitle?: string
}) {
  return api<{ account: PublicAccount; invited?: boolean }>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function resendInviteRequest(id: number) {
  return api<{ ok: true; account: PublicAccount }>(`/api/accounts/${id}/resend-invite`, {
    method: 'POST',
    body: '{}',
  })
}

export async function updateAccountRequest(
  id: number,
  payload: Record<string, unknown>,
) {
  return api<{ account: PublicAccount; accounts?: PublicAccount[] }>(`/api/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function recoveryListTenants() {
  return api<{ tenants: PublicTenant[] }>('/api/recovery/tenants')
}

export async function recoveryCreateTenant(name: string) {
  return api<{ tenant: PublicTenant }>('/api/recovery/tenants', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function recoveryListAccounts(tenantId: number) {
  return api<{ accounts: PublicAccount[]; tenant: PublicTenant }>(
    `/api/recovery/accounts?tenantId=${encodeURIComponent(String(tenantId))}`,
  )
}

export async function recoveryCreateAccount(payload: {
  email: string
  displayName: string
  password: string
  role?: 'admin' | 'employee'
  jobTitle?: string
  tenantId?: number
  organisationName?: string
}) {
  return api<{ account: PublicAccount; tenant?: PublicTenant }>('/api/recovery/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function recoveryUpdateAccount(id: number, payload: Record<string, unknown>) {
  return api<{ account: PublicAccount }>(`/api/recovery/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function recoveryDeleteAccount(id: number) {
  return api<{ ok: true; deletedId: number }>(`/api/recovery/accounts/${id}`, {
    method: 'DELETE',
  })
}

export async function verifyPasswordRequest(password: string) {
  return api<{ ok: true }>('/api/auth/verify-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  return api<{ ok: true }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function fetchNotificationStatus() {
  return api<{ configured: boolean; from: string | null }>('/api/notifications/status')
}

export async function dispatchNotificationRequest(payload: {
  eventId: string
  employeeId?: number | null
  details?: Record<string, string | undefined>
}) {
  return api<{
    sent: boolean
    recipients?: number
    subject?: string
    reason?: string
    message?: string
  }>('/api/notifications/dispatch', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function emailPayrollReportRequest(payload: {
  to?: string
  subject?: string
  text?: string
  csv: string
  filename?: string
}) {
  return api<{ sent: true; to: string }>('/api/notifications/payroll-report', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
