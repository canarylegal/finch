export type AccountRole = 'admin' | 'employee'
export type AccountStatus = 'Active' | 'Inactive'

export type Account = {
  id: number
  email: string
  displayName: string
  initials: string
  role: AccountRole
  employeeId: number | null
  passwordSalt: string
  passwordHash: string
  status: AccountStatus
  jobTitle?: string
}

export type AuthSession = {
  accountId: number
  signedInAt: string
}

export type DemoAccountHint = {
  email: string
  role: AccountRole
  displayName: string
}

/** Fixed salt + SHA-256(salt + "demo") for sync seed accounts. */
export const DEMO_PASSWORD = 'demo'
export const DEMO_PASSWORD_SALT = 'finch-demo-salt-v1'
export const DEMO_PASSWORD_HASH =
  '6624409e83b74ed6c8feef2a45091dfcc969b8a9be36a8fbb79880f903647c2b'

const SESSION_KEY = 'finch-session'

export const DEMO_ACCOUNT_HINTS: DemoAccountHint[] = [
  { email: 'alex@northstar.demo', role: 'admin', displayName: 'Alex Morgan' },
  { email: 'sophie@northstar.demo', role: 'employee', displayName: 'Sophie Carter' },
  { email: 'jamie@northstar.demo', role: 'employee', displayName: 'Jamie Wilson' },
  { email: 'maya@northstar.demo', role: 'employee', displayName: 'Maya Patel' },
  { email: 'oliver@northstar.demo', role: 'employee', displayName: 'Oliver Reed' },
]

export function initialAccounts(): Account[] {
  return [
    {
      id: 1,
      email: 'alex@northstar.demo',
      displayName: 'Alex Morgan',
      initials: 'AM',
      role: 'admin',
      employeeId: null,
      passwordSalt: DEMO_PASSWORD_SALT,
      passwordHash: DEMO_PASSWORD_HASH,
      status: 'Active',
      jobTitle: 'Master admin',
    },
    {
      id: 2,
      email: 'sophie@northstar.demo',
      displayName: 'Sophie Carter',
      initials: 'SC',
      role: 'employee',
      employeeId: 1,
      passwordSalt: DEMO_PASSWORD_SALT,
      passwordHash: DEMO_PASSWORD_HASH,
      status: 'Active',
      jobTitle: 'Product designer',
    },
    {
      id: 3,
      email: 'jamie@northstar.demo',
      displayName: 'Jamie Wilson',
      initials: 'JW',
      role: 'employee',
      employeeId: 2,
      passwordSalt: DEMO_PASSWORD_SALT,
      passwordHash: DEMO_PASSWORD_HASH,
      status: 'Active',
      jobTitle: 'Content strategist',
    },
    {
      id: 4,
      email: 'maya@northstar.demo',
      displayName: 'Maya Patel',
      initials: 'MP',
      role: 'employee',
      employeeId: 3,
      passwordSalt: DEMO_PASSWORD_SALT,
      passwordHash: DEMO_PASSWORD_HASH,
      status: 'Active',
      jobTitle: 'Operations lead',
    },
    {
      id: 5,
      email: 'oliver@northstar.demo',
      displayName: 'Oliver Reed',
      initials: 'OR',
      role: 'employee',
      employeeId: 4,
      passwordSalt: DEMO_PASSWORD_SALT,
      passwordHash: DEMO_PASSWORD_HASH,
      status: 'Active',
      jobTitle: 'Engineer',
    },
  ]
}

export function ensureAccounts(existing: Account[] | undefined | null): Account[] {
  if (!existing || existing.length === 0) return initialAccounts()
  return existing
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(salt + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(digest)
}

export function createRandomSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes.buffer)
}

export async function verifyPassword(account: Account, password: string) {
  const hash = await hashPassword(password, account.passwordSalt)
  return hash === account.passwordHash
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (typeof parsed.accountId !== 'number' || typeof parsed.signedInAt !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function resolveSessionAccount(
  accounts: Account[],
  session: AuthSession | null,
): Account | null {
  if (!session) return null
  const account = accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') return null
  return account
}

export async function authenticate(
  accounts: Account[],
  email: string,
  password: string,
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase()
  const account = accounts.find((item) => item.email.toLowerCase() === normalized)
  if (!account) {
    return { ok: false, error: 'Email or password is incorrect' }
  }
  if (account.status !== 'Active') {
    return { ok: false, error: 'This account is inactive. Contact an admin.' }
  }
  const valid = await verifyPassword(account, password)
  if (!valid) {
    return { ok: false, error: 'Email or password is incorrect' }
  }
  return { ok: true, account }
}

export function activeAdminCount(accounts: Account[]) {
  return accounts.filter((item) => item.role === 'admin' && item.status === 'Active').length
}

export function nextAccountId(accounts: Account[]) {
  return Math.max(0, ...accounts.map((item) => item.id)) + 1
}

export function accountInitialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export async function createAccountCredentials(password: string) {
  const passwordSalt = createRandomSalt()
  const passwordHash = await hashPassword(password, passwordSalt)
  return { passwordSalt, passwordHash }
}
