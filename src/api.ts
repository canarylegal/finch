const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
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
  status: 'Active' | 'Inactive'
  jobTitle?: string
  isPrimary?: boolean
}

export async function fetchBootstrap() {
  return api<{
    hasAccounts: boolean
    orgConfigured: boolean
    companyName: string
    session: { kind: string; accountId: number | null } | null
  }>('/api/bootstrap')
}

export async function loginWithPassword(email: string, password: string) {
  return api<
    | { account: PublicAccount; recovery?: undefined }
    | { recovery: true; displayName: string; hasAccounts: boolean; account?: undefined }
  >('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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
  >('/api/auth/me')
}

export async function fetchAppData() {
  return api<Record<string, unknown>>('/api/app-data')
}

export async function saveAppData(data: Record<string, unknown>) {
  return api<{ ok: true }>('/api/app-data', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createAccountRequest(payload: {
  email: string
  displayName: string
  role: 'admin' | 'employee'
  employeeId: number | null
  password: string
  jobTitle?: string
}) {
  return api<{ account: PublicAccount }>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
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

export async function recoveryListAccounts() {
  return api<{ accounts: PublicAccount[] }>('/api/recovery/accounts')
}

export async function recoveryCreateAccount(payload: {
  email: string
  displayName: string
  password: string
  role?: 'admin' | 'employee'
  jobTitle?: string
}) {
  return api<{ account: PublicAccount }>('/api/recovery/accounts', {
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

export async function verifyPasswordRequest(password: string) {
  return api<{ ok: true }>('/api/auth/verify-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}
