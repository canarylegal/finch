import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import {
  dispatchNotificationEmail,
  mailStatusPublic,
  reasonMessage,
  sendMail,
} from './email.mjs'
import {
  closeStore,
  defaultStore,
  emptyAppData,
  emptyCompany,
  getStoreBackend,
  initStore,
  readStore,
  writeStore,
} from './store.mjs'
import {
  buildTotpUri,
  consumeRecoveryCode,
  createRecoveryCodes,
  createTotpSecret,
  policyRequiresTwoFactor,
  publicTotpStatus,
  totpQrDataUrl,
  verifyTotpCode,
} from './totp.mjs'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT || 8787)
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const COOKIE_NAME = 'finch_session'
const BCRYPT_ROUNDS = 12
const IS_PROD = process.env.NODE_ENV === 'production'
const COOKIE_SECURE = ['1', 'true', 'yes', 'on'].includes(
  (process.env.COOKIE_SECURE || (IS_PROD ? 'true' : 'false')).trim().toLowerCase(),
)
const TRUST_PROXY = (process.env.TRUST_PROXY || (IS_PROD ? '1' : 'false')).trim()

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
  const totpSecret = (process.env.MASTER_ADMIN_TOTP_SECRET || '').trim()
  if (require2fa && totpSecret.length < 16) {
    throw new Error(
      'MASTER_ADMIN_REQUIRE_2FA is enabled but MASTER_ADMIN_TOTP_SECRET is missing (min 16 chars base32)',
    )
  }
  return { login, password, require2fa, totpSecret }
}

if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  throw new Error('SESSION_SECRET must be set (min 16 characters)')
}

const masterConfig = loadMasterConfig()

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
    ...publicTotpStatus(account),
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

function signToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn })
}

function setSessionCookie(res, token, maxAgeMs = 12 * 60 * 60 * 1000) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: maxAgeMs,
  })
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
  })
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

function companyTwoFactorPolicy(store) {
  const policy = store.appData?.company?.twoFactorRequired
  if (policy === 'all' || policy === 'admins' || policy === 'optional') return policy
  return 'admins'
}

function setPendingTwoFactorCookie(res, payload) {
  const token = signToken(payload, '10m')
  setSessionCookie(res, token, 10 * 60 * 1000)
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
if (TRUST_PROXY === '1' || TRUST_PROXY.toLowerCase() === 'true') {
  app.set('trust proxy', 1)
} else if (/^\d+$/.test(TRUST_PROXY)) {
  app.set('trust proxy', Number(TRUST_PROXY))
}

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json({ limit: '15mb' }))
app.use(cookieParser())

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
})

app.get('/api/health', async (_req, res) => {
  try {
    await readStore()
    res.json({ ok: true, store: getStoreBackend() })
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Store unavailable' })
  }
})

app.get('/api/bootstrap', async (req, res) => {
  const store = await readStore()
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

app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
    const recoveryStore = await readStore()
    if (masterConfig.require2fa) {
      setPendingTwoFactorCookie(res, { kind: 'pending_2fa_master' })
      return res.json({
        requires2fa: true,
        challenge: 'master',
        displayName: 'Master recovery',
        hasAccounts: recoveryStore.accounts.length > 0,
      })
    }
    const token = signToken({ kind: 'master_recovery' })
    setSessionCookie(res, token)
    return res.json({
      recovery: true,
      displayName: 'Master recovery',
      hasAccounts: recoveryStore.accounts.length > 0,
    })
  }

  const store = await readStore()
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

  const policy = companyTwoFactorPolicy(store)
  const required = policyRequiresTwoFactor(policy, account.role)
  const enabled = Boolean(account.totpEnabled && account.totpSecret)

  if (required && enabled) {
    setPendingTwoFactorCookie(res, { kind: 'pending_2fa', accountId: account.id })
    return res.json({
      requires2fa: true,
      challenge: 'account',
      account: publicAccount(account),
    })
  }

  if (required && !enabled) {
    setPendingTwoFactorCookie(res, { kind: 'pending_2fa_setup', accountId: account.id })
    return res.json({
      mustSetup2fa: true,
      account: publicAccount(account),
    })
  }

  const token = signToken({ kind: 'account', accountId: account.id })
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(account) })
})

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/auth/me', async (req, res) => {
  const session = readAuth(req)
  if (!session) return res.status(401).json({ error: 'Not signed in' })

  if (session.kind === 'pending_2fa' || session.kind === 'pending_2fa_setup') {
    const store = await readStore()
    const account = store.accounts.find((item) => item.id === session.accountId)
    if (!account || account.status !== 'Active') {
      clearSessionCookie(res)
      return res.status(401).json({ error: 'Not signed in' })
    }
    return res.json({
      kind: session.kind,
      account: publicAccount(account),
      orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
    })
  }

  if (session.kind === 'pending_2fa_master') {
    const store = await readStore()
    return res.json({
      kind: 'pending_2fa_master',
      displayName: 'Master recovery',
      hasAccounts: store.accounts.length > 0,
      orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
    })
  }

  if (session.kind === 'master_recovery') {
    const store = await readStore()
    return res.json({
      kind: 'master_recovery',
      displayName: 'Master recovery',
      hasAccounts: store.accounts.length > 0,
      orgConfigured: Boolean(store.appData?.company?.leaveYearConfigured),
    })
  }
  if (session.kind !== 'account') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }
  const store = await readStore()
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

async function requireAccount(req, res) {
  const session = readAuth(req)
  if (!session || session.kind !== 'account') {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  const store = await readStore()
  const account = store.accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  return { session, account, store }
}

async function requireAccountOrSetup(req, res) {
  const session = readAuth(req)
  if (
    !session ||
    (session.kind !== 'account' && session.kind !== 'pending_2fa_setup')
  ) {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  const store = await readStore()
  const account = store.accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  return { session, account, store }
}

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.TOTP_RATE_LIMIT || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Try again later.' },
})

app.post('/api/auth/2fa/verify', twoFactorLimiter, async (req, res) => {
  const session = readAuth(req)
  const code = String(req.body?.code || '')
  if (!session) return res.status(401).json({ error: 'Not signed in' })

  if (session.kind === 'pending_2fa_master') {
    const ok = await verifyTotpCode(masterConfig.totpSecret, code)
    if (!ok) return res.status(401).json({ error: 'Invalid authentication code' })
    const token = signToken({ kind: 'master_recovery' })
    setSessionCookie(res, token)
    const store = await readStore()
    return res.json({
      recovery: true,
      displayName: 'Master recovery',
      hasAccounts: store.accounts.length > 0,
    })
  }

  if (session.kind !== 'pending_2fa') {
    return res.status(400).json({ error: 'No two-factor challenge in progress' })
  }

  const store = await readStore()
  const account = store.accounts.find((item) => item.id === session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }

  let ok = await verifyTotpCode(account.totpSecret, code)
  if (!ok) {
    ok = await consumeRecoveryCode(account, code)
    if (ok) await writeStore(store)
  }
  if (!ok) return res.status(401).json({ error: 'Invalid authentication code' })

  const token = signToken({ kind: 'account', accountId: account.id })
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(account) })
})

app.post('/api/auth/2fa/setup', async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const { account, store } = ctx

  const secret = createTotpSecret()
  account.totpPendingSecret = secret
  await writeStore(store)

  const issuer = store.appData?.company?.name?.trim() || 'Finch'
  const uri = buildTotpUri({ secret, email: account.email, issuer })
  const qrDataUrl = await totpQrDataUrl(uri)
  return res.json({
    secret,
    uri,
    qrDataUrl,
  })
})

app.post('/api/auth/2fa/confirm', twoFactorLimiter, async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const { account, store, session } = ctx
  const code = String(req.body?.code || '')
  const secret = account.totpPendingSecret || account.totpSecret
  if (!secret) {
    return res.status(400).json({ error: 'Start authenticator setup first' })
  }
  const ok = await verifyTotpCode(secret, code)
  if (!ok) return res.status(401).json({ error: 'Invalid authentication code' })

  const { codes, hashes } = await createRecoveryCodes()
  account.totpSecret = secret
  account.totpEnabled = true
  account.totpPendingSecret = null
  account.totpRecoveryHashes = hashes
  await writeStore(store)

  if (session.kind === 'pending_2fa_setup') {
    const token = signToken({ kind: 'account', accountId: account.id })
    setSessionCookie(res, token)
  }

  return res.json({
    account: publicAccount(account),
    recoveryCodes: codes,
  })
})

app.post('/api/auth/2fa/disable', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account, store } = ctx
  const password = String(req.body?.password || '')
  const code = String(req.body?.code || '')
  if (!password) return res.status(400).json({ error: 'Password is required' })

  const passwordOk = await bcrypt.compare(password, account.passwordHash)
  if (!passwordOk) return res.status(401).json({ error: 'Password is incorrect' })

  if (account.totpEnabled && account.totpSecret) {
    let codeOk = await verifyTotpCode(account.totpSecret, code)
    if (!codeOk) codeOk = await consumeRecoveryCode(account, code)
    if (!codeOk) return res.status(401).json({ error: 'Invalid authentication code' })
  }

  account.totpEnabled = false
  account.totpSecret = null
  account.totpPendingSecret = null
  account.totpRecoveryHashes = []
  await writeStore(store)
  return res.json({ account: publicAccount(account) })
})

app.get('/api/auth/2fa/status', async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const policy = companyTwoFactorPolicy(ctx.store)
  return res.json({
    ...publicTotpStatus(ctx.account),
    policy,
    required: policyRequiresTwoFactor(policy, ctx.account.role),
    pendingSetup: ctx.session.kind === 'pending_2fa_setup',
  })
})

app.get('/api/recovery/accounts', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const store = await readStore()
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

  const store = await readStore()
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
  await writeStore(store)
  return res.status(201).json({ account: publicAccount(account) })
})

app.patch('/api/recovery/accounts/:id', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const id = Number(req.params.id)
  const store = await readStore()
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

  await writeStore(store)
  return res.json({ account: publicAccount(account) })
})

app.get('/api/app-data', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { store } = ctx
  res.json({
    ...store.appData,
    accounts: store.accounts.map(publicAccount),
  })
})

app.put('/api/app-data', async (req, res) => {
  const ctx = await requireAccount(req, res)
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
  await writeStore(store)
  res.json({ ok: true })
})

app.post('/api/accounts', async (req, res) => {
  const ctx = await requireAccount(req, res)
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
  await writeStore(store)
  res.status(201).json({ account: publicAccount(created) })
})

app.patch('/api/accounts/:id', async (req, res) => {
  const ctx = await requireAccount(req, res)
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

  await writeStore(store)
  res.json({ account: publicAccount(target), accounts: store.accounts.map(publicAccount) })
})

app.post('/api/auth/verify-password', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const password = String(req.body?.password || '')
  const ok = await bcrypt.compare(password, ctx.account.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Password is incorrect' })
  res.json({ ok: true })
})

app.get('/api/notifications/status', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  res.json(mailStatusPublic())
})

app.post('/api/notifications/dispatch', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account, store } = ctx
  const eventId = String(req.body?.eventId || '').trim()
  const employeeId =
    req.body?.employeeId === null || req.body?.employeeId === undefined || req.body?.employeeId === ''
      ? null
      : Number(req.body.employeeId)
  const details =
    req.body?.details && typeof req.body.details === 'object' && !Array.isArray(req.body.details)
      ? req.body.details
      : {}

  const result = await dispatchNotificationEmail({
    store,
    actor: account,
    eventId,
    employeeId,
    details,
  })

  if (result.ok) {
    return res.json({
      sent: true,
      recipients: result.recipients?.length ?? 0,
      subject: result.subject,
    })
  }

  if (result.reason === 'forbidden') {
    return res.status(403).json({
      sent: false,
      reason: result.reason,
      message: reasonMessage(result.reason),
    })
  }
  if (result.reason === 'invalid_event') {
    return res.status(400).json({
      sent: false,
      reason: result.reason,
      message: reasonMessage(result.reason),
    })
  }

  return res.json({
    sent: false,
    reason: result.reason,
    message: result.error || reasonMessage(result.reason),
  })
})

app.post('/api/notifications/payroll-report', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account, store } = ctx
  if (account.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can email payroll reports' })
  }

  const company = store.appData?.company || {}
  const to = String(req.body?.to || company.payrollEmail || '')
    .trim()
    .toLowerCase()
  const subject = String(req.body?.subject || 'Finch payroll report').trim()
  const text = String(req.body?.text || '').trim()
  const csv = String(req.body?.csv || '')
  const filename = String(req.body?.filename || 'payroll-report.csv').trim() || 'payroll-report.csv'

  if (!to) {
    return res.status(400).json({ error: 'Set a payroll email address in Settings first' })
  }
  if (!csv) {
    return res.status(400).json({ error: 'Report CSV is required' })
  }

  try {
    const result = await sendMail({
      to,
      subject,
      text:
        text ||
        [
          'Payroll notice: Finch records absences and working time only.',
          'It does not calculate Statutory Sick Pay (SSP), holiday pay, or other statutory amounts.',
          '',
          'The CSV report is attached.',
        ].join('\n'),
      attachments: [
        {
          filename,
          content: csv,
          contentType: 'text/csv',
        },
      ],
    })
    if (!result.ok) {
      const status = result.reason === 'smtp_not_configured' ? 503 : 400
      return res.status(status).json({
        error: reasonMessage(result.reason),
        reason: result.reason,
      })
    }
    return res.json({ sent: true, to })
  } catch (error) {
    console.error('Payroll email failed:', error?.message || error)
    return res.status(502).json({ error: String(error?.message || 'Failed to send payroll email') })
  }
})

const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

async function boot() {
  await initStore()
  const store = await readStore()
  const hasDemo = store.accounts.some((item) => String(item.email || '').endsWith('@northstar.demo'))
  if (hasDemo) {
    await writeStore(defaultStore())
    console.log('Wiped legacy demo accounts and app data')
  }

  const server = app.listen(PORT, () => {
    console.log(`Finch API listening on http://localhost:${PORT} (${getStoreBackend()})`)
  })

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down`)
    server.close(async () => {
      await closeStore()
      process.exit(0)
    })
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

boot().catch((error) => {
  console.error('Failed to start Finch:', error)
  process.exit(1)
})
