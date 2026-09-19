import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const STORE_PATH = path.join(DATA_DIR, 'finch-store.json')

const PORT = Number(process.env.PORT || 8787)
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const COOKIE_NAME = 'finch_session'
const BCRYPT_ROUNDS = 12

function requireEnv(name, minLen = 1) {
  const value = (process.env[name] || '').trim()
  if (!value || value.length < minLen) {
    throw new Error(`Missing or invalid environment variable: ${name}`)
  }
  return value
}

function loadMasterConfig() {
  const login = requireEnv('MASTER_ADMIN_LOGIN', 8).toLowerCase()
  const password = requireEnv('MASTER_ADMIN_PASSWORD', 12)
  const require2fa = ['1', 'true', 'yes', 'on'].includes(
    (process.env.MASTER_ADMIN_REQUIRE_2FA || 'false').trim().toLowerCase(),
  )
  if (require2fa) {
    throw new Error('MASTER_ADMIN_REQUIRE_2FA is not supported yet; set it to false')
  }
  return { login, password, require2fa }
}

if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  throw new Error('SESSION_SECRET must be set (min 16 characters)')
}

const masterConfig = loadMasterConfig()

function emptyCompany() {
  return {
    name: '',
    logoUrl: null,
    leaveYearStart: 'January',
    leaveYearEnd: 'December',
    leaveYearConfigured: false,
    mandatoryLeaveConfirmations: [],
    defaultRollOver: false,
    defaultEntitlement: 25,
    defaultEntitlementUnit: 'days',
    defaultWorkingDays: [1, 2, 3, 4, 5],
    entitlementIncludesBankHolidays: false,
    emailNotifications: true,
    notificationEvents: {
      leaveRequestSubmitted: true,
      leaveRequestReviewed: true,
      expenseSubmitted: true,
      expenseReviewed: true,
    },
    twoFactorRequired: 'admins',
    payrollEmail: '',
    autoSendPayrollReport: false,
    autoSendDayOfMonth: 3,
    payPeriodStartDay: 10,
    bankHolidayRegion: 'england-wales',
  }
}

function emptyAppData() {
  return {
    employees: [],
    absences: [],
    company: emptyCompany(),
    bankHolidays: [],
    requests: [],
    portalMessages: [],
    documentFolders: [],
    employeeDocuments: [],
    expenseClaims: [],
    taskDismissals: [],
    policies: [],
    leaveAdjustments: [],
    leaveYearClosures: [],
  }
}

function defaultStore() {
  return {
    accounts: [],
    appData: emptyAppData(),
    nextAccountId: 1,
  }
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultStore(), null, 2))
  }
}

function readStore() {
  ensureStore()
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
}

function writeStore(store) {
  ensureStore()
  const tmp = `${STORE_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, STORE_PATH)
}

function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    initials: account.initials,
    role: account.role,
    employeeId: account.employeeId,
    status: account.status,
    jobTitle: account.jobTitle,
    isPrimary: Boolean(account.isPrimary),
  }
}

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function signToken(payload) {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '12h' })
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  })
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME)
}

function readAuth(req) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return null
  try {
    return jwt.verify(token, SESSION_SECRET)
  } catch {
    return null
  }
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

const app = express()
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json({ limit: '15mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/bootstrap', (req, res) => {
  const store = readStore()
  const session = readAuth(req)
  res.json({
    hasAccounts: store.accounts.length > 0,
    orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
    companyName: store.appData?.company?.name || '',
    session: session
      ? {
          kind: session.kind,
          accountId: session.accountId ?? null,
        }
      : null,
  })
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  // Canary-style: try env master recovery on the same endpoint before DB accounts.
  const masterLoginOk = timingSafeEqualString(email, masterConfig.login)
  const masterPasswordOk = timingSafeEqualString(password, masterConfig.password)
  if (masterLoginOk && masterPasswordOk) {
    const token = signToken({ kind: 'master_recovery' })
    setSessionCookie(res, token)
    return res.json({
      recovery: true,
      displayName: 'Master recovery',
      hasAccounts: readStore().accounts.length > 0,
    })
  }

  const store = readStore()
  const account = store.accounts.find((item) => item.email === email)
  if (!account) {
    return res.status(401).json({ error: 'Email or password is incorrect' })
  }
  if (account.status !== 'Active') {
    return res.status(403).json({ error: 'This account is inactive. Contact an admin.' })
  }
  const ok = await bcrypt.compare(password, account.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Email or password is incorrect' })
  }

  const token = signToken({ kind: 'account', accountId: account.id })
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(account) })
})

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const session = readAuth(req)
  if (!session) return res.status(401).json({ error: 'Not signed in' })
  if (session.kind === 'master_recovery') {
    const store = readStore()
    return res.json({
      kind: 'master_recovery',
      displayName: 'Master recovery',
      hasAccounts: store.accounts.length > 0,
      orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
    })
  }
  const store = readStore()
  const account = store.accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }
  return res.json({
    kind: 'account',
    account: publicAccount(account),
    orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
  })
})

function requireRecovery(req, res) {
  const session = readAuth(req)
  if (!session || session.kind !== 'master_recovery') {
    res.status(403).json({ error: 'Master recovery access required' })
    return null
  }
  return session
}

function requireAccount(req, res) {
  const session = readAuth(req)
  if (!session || session.kind !== 'account') {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  const store = readStore()
  const account = store.accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  return { session, account, store }
}

app.get('/api/recovery/accounts', (req, res) => {
  if (!requireRecovery(req, res)) return
  const store = readStore()
  res.json({ accounts: store.accounts.map(publicAccount) })
})

app.post('/api/recovery/accounts', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const displayName = String(req.body?.displayName || '').trim()
  const password = String(req.body?.password || '')
  const role = req.body?.role === 'employee' ? 'employee' : 'admin'

  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' })
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' })
  }
  if (email === masterConfig.login) {
    return res.status(400).json({ error: 'That login is reserved for master recovery' })
  }

  const store = readStore()
  if (store.accounts.some((item) => item.email === email)) {
    return res.status(409).json({ error: 'An account with that email already exists' })
  }

  const isFirst = store.accounts.length === 0
  if (isFirst && role !== 'admin') {
    return res.status(400).json({ error: 'The first account must be an admin' })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const account = {
    id: store.nextAccountId++,
    email,
    displayName,
    initials: initialsFromName(displayName),
    role,
    employeeId: null,
    status: 'Active',
    jobTitle: req.body?.jobTitle || undefined,
    isPrimary: isFirst,
    passwordHash,
  }
  store.accounts.push(account)
  writeStore(store)
  return res.status(201).json({ account: publicAccount(account) })
})

app.patch('/api/recovery/accounts/:id', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const id = Number(req.params.id)
  const store = readStore()
  const account = store.accounts.find((item) => item.id === id)
  if (!account) return res.status(404).json({ error: 'Account not found' })

  if (typeof req.body?.status === 'string') {
    account.status = req.body.status === 'Inactive' ? 'Inactive' : 'Active'
  }
  if (req.body?.role === 'admin' || req.body?.role === 'employee') {
    account.role = req.body.role
    if (account.role === 'employee') account.isPrimary = false
  }
  if (req.body?.isPrimary === true) {
    for (const item of store.accounts) item.isPrimary = item.id === account.id
    account.role = 'admin'
    account.status = 'Active'
  }
  if (typeof req.body?.password === 'string' && req.body.password.length >= 10) {
    account.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
  }

  writeStore(store)
  return res.json({ account: publicAccount(account) })
})

app.get('/api/app-data', (req, res) => {
  const ctx = requireAccount(req, res)
  if (!ctx) return
  const { store } = ctx
  res.json({
    ...store.appData,
    accounts: store.accounts.map(publicAccount),
  })
})

app.put('/api/app-data', (req, res) => {
  const ctx = requireAccount(req, res)
  if (!ctx) return
  const { account, store } = ctx
  if (account.role !== 'admin' && !req.body?._allowEmployeeSave) {
    // Employees can still persist leave/expenses — allow all authenticated users to save app data
  }

  const incoming = req.body || {}
  const {
    accounts: _ignoredAccounts,
    ...appData
  } = incoming

  if (!appData.company) {
    return res.status(400).json({ error: 'Invalid app data' })
  }

  store.appData = {
    ...emptyAppData(),
    ...appData,
    company: {
      ...emptyCompany(),
      ...appData.company,
    },
  }
  writeStore(store)
  res.json({ ok: true })
})

app.post('/api/accounts', async (req, res) => {
  const ctx = requireAccount(req, res)
  if (!ctx) return
  const { account: actor, store } = ctx
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create accounts' })
  }

  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const displayName = String(req.body?.displayName || '').trim()
  const password = String(req.body?.password || '')
  const role = req.body?.role === 'admin' ? 'admin' : 'employee'
  const employeeId =
    req.body?.employeeId === null || req.body?.employeeId === undefined || req.body?.employeeId === ''
      ? null
      : Number(req.body.employeeId)

  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' })
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' })
  }
  if (email === masterConfig.login) {
    return res.status(400).json({ error: 'That login is reserved for master recovery' })
  }
  if (store.accounts.some((item) => item.email === email)) {
    return res.status(409).json({ error: 'An account with that email already exists' })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const created = {
    id: store.nextAccountId++,
    email,
    displayName,
    initials: initialsFromName(displayName),
    role,
    employeeId,
    status: 'Active',
    jobTitle: req.body?.jobTitle || undefined,
    isPrimary: false,
    passwordHash,
  }
  store.accounts.push(created)
  writeStore(store)
  res.status(201).json({ account: publicAccount(created) })
})

app.patch('/api/accounts/:id', async (req, res) => {
  const ctx = requireAccount(req, res)
  if (!ctx) return
  const { account: actor, store } = ctx
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update accounts' })
  }

  const id = Number(req.params.id)
  const target = store.accounts.find((item) => item.id === id)
  if (!target) return res.status(404).json({ error: 'Account not found' })

  const activeAdmins = () =>
    store.accounts.filter((item) => item.role === 'admin' && item.status === 'Active')

  if (req.body?.role === 'employee' && target.role === 'admin') {
    if (target.isPrimary) {
      return res.status(400).json({ error: 'Cannot remove admin from the primary admin' })
    }
    if (activeAdmins().length <= 1) {
      return res.status(400).json({ error: 'Keep at least one active admin' })
    }
    target.role = 'employee'
  }
  if (req.body?.role === 'admin') {
    target.role = 'admin'
  }

  if (req.body?.status === 'Inactive') {
    if (target.isPrimary) {
      return res.status(400).json({ error: 'Cannot deactivate the primary admin' })
    }
    if (target.id === actor.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' })
    }
    if (target.role === 'admin' && activeAdmins().filter((item) => item.id !== target.id).length < 1) {
      return res.status(400).json({ error: 'Keep at least one active admin' })
    }
    target.status = 'Inactive'
  }
  if (req.body?.status === 'Active') {
    target.status = 'Active'
  }

  if (req.body?.isPrimary === true) {
    if (!actor.isPrimary) {
      return res.status(403).json({ error: 'Only the primary admin can transfer primary status' })
    }
    const confirmPassword = String(req.body?.confirmPassword || '')
    const ok = await bcrypt.compare(confirmPassword, actor.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Password confirmation failed' })
    }
    for (const item of store.accounts) item.isPrimary = item.id === target.id
    target.role = 'admin'
    target.status = 'Active'
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'employeeId')) {
    target.employeeId =
      req.body.employeeId === null || req.body.employeeId === ''
        ? null
        : Number(req.body.employeeId)
  }
  if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
    target.displayName = req.body.displayName.trim()
    target.initials = initialsFromName(target.displayName)
  }
  if (typeof req.body?.jobTitle === 'string') {
    target.jobTitle = req.body.jobTitle
  }

  writeStore(store)
  res.json({ account: publicAccount(target), accounts: store.accounts.map(publicAccount) })
})

app.post('/api/auth/verify-password', async (req, res) => {
  const ctx = requireAccount(req, res)
  if (!ctx) return
  const password = String(req.body?.password || '')
  const ok = await bcrypt.compare(password, ctx.account.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Password is incorrect' })
  res.json({ ok: true })
})

ensureStore()
;(() => {
  const store = readStore()
  const hasDemo = store.accounts.some((item) => String(item.email || '').endsWith('@northstar.demo'))
  if (hasDemo) {
    writeStore(defaultStore())
    console.log('Wiped legacy demo accounts and app data')
  }
})()

const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Finch API listening on http://localhost:${PORT}`)
})
