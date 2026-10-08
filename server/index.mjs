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
  emptyAppData,
  emptyCompany,
  getStoreBackend,
  initStore,
  readStore,
  updateStore,
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
import {
  appendAuditEvent,
  createAuditEvent,
} from './audit.mjs'
import {
  accountHasPasskey,
  accountHasSecondFactor,
  createAuthenticationOptions,
  createRegistrationOptions,
  publicPasskeyStatus,
  removePasskey,
  resolveWebAuthnConfig,
  verifyAndStoreRegistration,
  verifyAuthentication,
} from './webauthn.mjs'
import {
  clearPasswordSetup,
  clearPasswordSetupIfToken,
  findAccountByPasswordSetupToken,
  issuePasswordSetup,
  passwordSetupUrl,
} from './passwordSetup.mjs'
import { applyAppDataWrite, projectAppDataForViewer } from './appDataAccess.mjs'
import {
  accountsForTenant,
  createTenant,
  ensureTenantAppData,
  findAccountByEmail,
  findAccountById,
  getTenant,
  listTenants,
  publicTenant,
  tenantDisplayName,
} from './tenants.mjs'

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
    tenantId: account.tenantId ?? null,
    status: account.status,
    jobTitle: account.jobTitle,
    isPrimary: Boolean(account.isPrimary),
    mustSetPassword: Boolean(account.mustSetPassword),
    ...publicTotpStatus(account),
    ...publicPasskeyStatus(account),
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

function accountSessionVersion(account) {
  return typeof account?.sessionVersion === 'number' ? account.sessionVersion : 0
}

function signAccountSession(account, expiresIn = '12h') {
  return signToken(
    {
      kind: 'account',
      accountId: account.id,
      tenantId: account.tenantId,
      sv: accountSessionVersion(account),
    },
    expiresIn,
  )
}

function bumpAccountSessionVersion(account) {
  account.sessionVersion = accountSessionVersion(account) + 1
  return account.sessionVersion
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

function companyTwoFactorPolicy(store, tenantId) {
  const policy = ensureTenantAppData(store, tenantId)?.company?.twoFactorRequired
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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.FORGOT_PASSWORD_RATE_LIMIT || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again later.' },
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
  let orgConfigured = false
  let companyName = ''
  let tenantId = null
  if (session?.kind === 'account' && session.accountId != null) {
    const account = findAccountById(store, session.accountId)
    if (account?.tenantId != null) {
      tenantId = account.tenantId
      const appData = ensureTenantAppData(store, account.tenantId)
      orgConfigured = Boolean(appData.company?.leaveYearConfigured)
      companyName = appData.company?.name || getTenant(store, account.tenantId)?.name || ''
    }
  }
  res.json({
    multiTenant: true,
    canCreateOrganisation: true,
    organisationCount: listTenants(store).length,
    hasAccounts: store.accounts.length > 0,
    orgConfigured,
    companyName,
    session: session
      ? {
          kind: session.kind,
          accountId: session.accountId ?? null,
          tenantId: session.tenantId ?? tenantId,
        }
      : null,
  })
})

app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const generic = {
    ok: true,
    message:
      'If an account exists for that email, a set-password link has been sent. Check your inbox.',
  }

  // Never reset the env master recovery login via this flow.
  if (timingSafeEqualString(email, masterConfig.login)) {
    return res.json(generic)
  }

  const smtp = mailStatusPublic()
  if (!smtp.configured) {
    return res.status(503).json({
      error: 'Email is not configured on this server. Contact an admin to reset your password.',
    })
  }

  const prepared = await updateStore((store) => {
    const account = findAccountByEmail(store, email)
    if (!account || account.status !== 'Active') {
      return { ok: false, skip: true }
    }
    const token = issuePasswordSetup(account, 'reset')
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.password.reset_email',
        summary: `${account.displayName || account.email} requested a password reset link by email`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return {
      ok: true,
      token,
      email: account.email,
      orgName: tenantDisplayName(store, account.tenantId),
      hasMfa: accountHasSecondFactor(account),
      accountId: account.id,
    }
  })

  if (!prepared?.ok) {
    return res.json(generic)
  }

  const setupLink = passwordSetupUrl(req, prepared.token)
  const lines = [
    `Reset your ${prepared.orgName} Finch password using this link:`,
    '',
    setupLink,
    '',
    'This link expires in 7 days and can only be used once.',
  ]
  if (prepared.hasMfa) {
    lines.push(
      '',
      'After setting a new password, sign in and complete two-factor authentication as usual.',
      'If you have lost access to two-factor authentication, contact your organisation admin — they can clear MFA so you can enrol again.',
    )
  }
  lines.push('', 'If you did not request this reset, you can ignore this email.')

  const mailed = await sendMail({
    to: prepared.email,
    subject: `${prepared.orgName} — reset your password`,
    text: lines.join('\n'),
  })
  if (!mailed.ok) {
    // Clear only this request's token — a newer successful reset must stay valid.
    await updateStore((store) => {
      const account = findAccountById(store, prepared.accountId)
      clearPasswordSetupIfToken(account, prepared.token)
    })
    return res.status(503).json({
      error: 'Could not send the reset email. Contact an admin, or try again later.',
    })
  }

  return res.json(generic)
})

app.get('/api/auth/password-setup', async (req, res) => {
  const token = String(req.query?.token || '').trim()
  const store = await readStore()
  const found = findAccountByPasswordSetupToken(store, token)
  if (!found.ok) {
    const message =
      found.reason === 'expired'
        ? 'This link has expired. Ask an admin to send a new invite, or use Forgot password.'
        : 'This set-password link is invalid or has already been used.'
    return res.status(400).json({ error: message })
  }
  return res.json({
    ok: true,
    email: found.account.email,
    displayName: found.account.displayName,
    purpose: found.purpose,
  })
})

app.post('/api/auth/password-setup', forgotPasswordLimiter, async (req, res) => {
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '')
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' })
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const result = await updateStore((store) => {
    const found = findAccountByPasswordSetupToken(store, token)
    if (!found.ok) {
      return {
        ok: false,
        status: 400,
        error:
          found.reason === 'expired'
            ? 'This link has expired. Ask an admin to send a new invite, or use Forgot password.'
            : 'This set-password link is invalid or has already been used.',
      }
    }
    const account = found.account
    account.passwordHash = passwordHash
    account.mustSetPassword = false
    clearPasswordSetup(account)
    bumpAccountSessionVersion(account)
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.password.set',
        summary: `${account.displayName || account.email} set their password via ${found.purpose} link`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, email: account.email }
  })
  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Password setup failed' })
  }
  return res.json({
    ok: true,
    message: 'Password set. You can sign in now.',
    email: result.email,
  })
})

app.post('/api/auth/signup', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const displayName = String(req.body?.displayName || '').trim()
  const password = String(req.body?.password || '')
  const companyName = String(req.body?.companyName || '').trim() || 'Organisation'

  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' })
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' })
  }
  if (email === masterConfig.login) {
    return res.status(400).json({ error: 'That login is reserved' })
  }

  // Hash outside the store lock so concurrent signups only serialise allocation.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const created = await updateStore((store) => {
    if (findAccountByEmail(store, email)) {
      return { ok: false, status: 409, error: 'An account with that email already exists' }
    }

    const tenant = createTenant(store, { name: companyName })
    const appData = ensureTenantAppData(store, tenant.id)
    appData.company = {
      ...emptyCompany(),
      ...appData.company,
      name: companyName,
    }

    const account = {
      id: store.nextAccountId++,
      tenantId: tenant.id,
      email,
      displayName,
      initials: initialsFromName(displayName),
      role: 'admin',
      employeeId: null,
      status: 'Active',
      isPrimary: true,
      passwordHash,
      mustSetPassword: false,
      sessionVersion: 0,
    }
    store.accounts.push(account)
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'account.signup',
        summary: `${account.displayName || account.email} created organisation ${companyName}`,
        entityType: 'account',
        entityId: account.id,
      }),
      tenant.id,
    )
    return { ok: true, account, tenant }
  })

  if (!created?.ok) {
    return res.status(created?.status || 400).json({ error: created?.error || 'Signup failed' })
  }

  const token = signAccountSession(created.account)
  setSessionCookie(res, token)
  return res.status(201).json({
    account: publicAccount(created.account),
    tenant: publicTenant(created.tenant),
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
        organisationCount: listTenants(recoveryStore).length,
      })
    }
    const token = signToken({ kind: 'master_recovery' })
    setSessionCookie(res, token)
    return res.json({
      recovery: true,
      displayName: 'Master recovery',
      organisationCount: listTenants(recoveryStore).length,
      tenants: listTenants(recoveryStore).map(publicTenant),
    })
  }

  const store = await readStore()
  const account = findAccountByEmail(store, email)
  if (!account) {
    return res.status(401).json({ error: 'Email or password is incorrect' })
  }
  if (account.status !== 'Active') {
    return res.status(403).json({ error: 'This account is inactive. Contact an admin.' })
  }
  if (account.mustSetPassword || !account.passwordHash) {
    return res.status(403).json({
      error:
        'This account still needs a password. Open the invite link from your email, or ask an admin to resend it.',
    })
  }
  const ok = await bcrypt.compare(password, account.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Email or password is incorrect' })
  }

  const policy = companyTwoFactorPolicy(store, account.tenantId)
  const required = policyRequiresTwoFactor(policy, account.role)
  const enabled = accountHasSecondFactor(account)

  if (required && enabled) {
    setPendingTwoFactorCookie(res, {
      kind: 'pending_2fa',
      accountId: account.id,
      tenantId: account.tenantId,
    })
    return res.json({
      requires2fa: true,
      challenge: 'account',
      account: publicAccount(account),
      passkeysAvailable: accountHasPasskey(account),
      totpAvailable: Boolean(account.totpEnabled && account.totpSecret),
    })
  }

  if (required && !enabled) {
    setPendingTwoFactorCookie(res, {
      kind: 'pending_2fa_setup',
      accountId: account.id,
      tenantId: account.tenantId,
    })
    return res.json({
      mustSetup2fa: true,
      account: publicAccount(account),
    })
  }

  const token = signAccountSession(account)
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
    const account = findAccountById(store, session.accountId)
    if (!account || account.status !== 'Active') {
      clearSessionCookie(res)
      return res.status(401).json({ error: 'Not signed in' })
    }
    return res.json({
      kind: session.kind,
      account: publicAccount(account),
      orgConfigured: account?.tenantId != null ? Boolean(ensureTenantAppData(store, account.tenantId).company?.leaveYearConfigured) : false,
    })
  }

  if (session.kind === 'pending_2fa_master') {
    const store = await readStore()
    return res.json({
      kind: 'pending_2fa_master',
      displayName: 'Master recovery',
      organisationCount: listTenants(store).length,
      tenants: listTenants(store).map(publicTenant),
      orgConfigured: false,
    })
  }

  if (session.kind === 'master_recovery') {
    const store = await readStore()
    return res.json({
      kind: 'master_recovery',
      displayName: 'Master recovery',
      organisationCount: listTenants(store).length,
      tenants: listTenants(store).map(publicTenant),
      orgConfigured: false,
    })
  }
  if (session.kind !== 'account') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }
  const store = await readStore()
  const account = findAccountById(store, session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }
  return res.json({
    kind: 'account',
    account: publicAccount(account),
    orgConfigured: account?.tenantId != null ? Boolean(ensureTenantAppData(store, account.tenantId).company?.leaveYearConfigured) : false,
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
  const account = findAccountById(store, session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  if ((session.sv ?? 0) !== accountSessionVersion(account)) {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Session expired. Sign in again.' })
    return null
  }
  if (account.tenantId == null) {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Account is not linked to an organisation' })
    return null
  }
  if (session.tenantId != null && session.tenantId !== account.tenantId) {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Session expired. Sign in again.' })
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
  const account = findAccountById(store, session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  if (
    session.kind === 'account' &&
    (session.sv ?? 0) !== accountSessionVersion(account)
  ) {
    clearSessionCookie(res)
    res.status(401).json({ error: 'Session expired. Sign in again.' })
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
      organisationCount: listTenants(store).length,
      tenants: listTenants(store).map(publicTenant),
    })
  }

  if (session.kind !== 'pending_2fa') {
    return res.status(400).json({ error: 'No two-factor challenge in progress' })
  }

  const result = await updateStore(async (store) => {
    const account = findAccountById(store, session.accountId)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in', clearSession: true }
    }

    let ok = await verifyTotpCode(account.totpSecret, code)
    if (!ok) {
      ok = await consumeRecoveryCode(account, code)
    }
    if (!ok) return { ok: false, status: 401, error: 'Invalid authentication code' }
    return { ok: true, account }
  })

  if (!result?.ok) {
    if (result?.clearSession) clearSessionCookie(res)
    return res
      .status(result?.status || 401)
      .json({ error: result?.error || 'Invalid authentication code' })
  }

  const token = signAccountSession(result.account)
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(result.account) })
})

app.post('/api/auth/2fa/setup', async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return

  const secret = createTotpSecret()
  const result = await updateStore((store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    account.totpPendingSecret = secret
    return {
      ok: true,
      email: account.email,
      issuer: tenantDisplayName(store, account.tenantId),
    }
  })
  if (!result?.ok) {
    return res.status(result?.status || 401).json({ error: result?.error || 'Not signed in' })
  }

  const uri = buildTotpUri({ secret, email: result.email, issuer: result.issuer })
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
  const { session } = ctx
  const code = String(req.body?.code || '')

  const { codes, hashes } = await createRecoveryCodes()
  const result = await updateStore(async (store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    const secret = account.totpPendingSecret || account.totpSecret
    if (!secret) {
      return { ok: false, status: 400, error: 'Start authenticator setup first' }
    }
    const ok = await verifyTotpCode(secret, code)
    if (!ok) return { ok: false, status: 401, error: 'Invalid authentication code' }

    account.totpSecret = secret
    account.totpEnabled = true
    account.totpPendingSecret = null
    account.totpRecoveryHashes = hashes
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.totp.enabled',
        summary: `${account.displayName || account.email} enabled authenticator 2FA`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, account }
  })

  if (!result?.ok) {
    return res
      .status(result?.status || 400)
      .json({ error: result?.error || 'Authenticator setup failed' })
  }

  if (session.kind === 'pending_2fa_setup') {
    const token = signAccountSession(result.account)
    setSessionCookie(res, token)
  }

  return res.json({
    account: publicAccount(result.account),
    recoveryCodes: codes,
  })
})

app.post('/api/auth/2fa/disable', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const password = String(req.body?.password || '')
  const code = String(req.body?.code || '')
  if (!password) return res.status(400).json({ error: 'Password is required' })

  const passwordOk = await bcrypt.compare(password, ctx.account.passwordHash)
  if (!passwordOk) return res.status(401).json({ error: 'Password is incorrect' })

  const result = await updateStore(async (store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }

    const policy = companyTwoFactorPolicy(store, account.tenantId)
    const stillHasPasskey = accountHasPasskey(account)
    if (policyRequiresTwoFactor(policy, account.role) && !stillHasPasskey) {
      return {
        ok: false,
        status: 400,
        error:
          'Add a passkey first, or keep the authenticator — two-factor is required for your role.',
      }
    }

    if (account.totpEnabled && account.totpSecret) {
      let codeOk = await verifyTotpCode(account.totpSecret, code)
      if (!codeOk) codeOk = await consumeRecoveryCode(account, code)
      if (!codeOk) return { ok: false, status: 401, error: 'Invalid authentication code' }
    }

    account.totpEnabled = false
    account.totpSecret = null
    account.totpPendingSecret = null
    account.totpRecoveryHashes = []
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.totp.disabled',
        summary: `${account.displayName || account.email} disabled authenticator 2FA`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, account }
  })

  if (!result?.ok) {
    return res
      .status(result?.status || 400)
      .json({ error: result?.error || 'Could not disable authenticator' })
  }
  return res.json({ account: publicAccount(result.account) })
})

app.get('/api/auth/2fa/status', async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const policy = companyTwoFactorPolicy(ctx.store, ctx.account.tenantId)
  return res.json({
    ...publicTotpStatus(ctx.account),
    ...publicPasskeyStatus(ctx.account),
    secondFactorEnabled: accountHasSecondFactor(ctx.account),
    policy,
    required: policyRequiresTwoFactor(policy, ctx.account.role),
    pendingSetup: ctx.session.kind === 'pending_2fa_setup',
  })
})

app.post('/api/auth/webauthn/register/options', async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const config = resolveWebAuthnConfig({
    req,
    companyName: tenantDisplayName(ctx.store, ctx.account.tenantId),
  })
  const options = await createRegistrationOptions({ account: ctx.account, config })
  return res.json(options)
})

app.post('/api/auth/webauthn/register/verify', twoFactorLimiter, async (req, res) => {
  const ctx = await requireAccountOrSetup(req, res)
  if (!ctx) return
  const { session } = ctx
  const credential = req.body?.credential || req.body
  const name = req.body?.name
  // Hash outside the store gate; applied only when the live account needs recovery codes.
  const pendingRecovery = await createRecoveryCodes()

  const result = await updateStore(async (store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    const config = resolveWebAuthnConfig({
      req,
      companyName: tenantDisplayName(store, account.tenantId),
    })
    const verified = await verifyAndStoreRegistration({
      account,
      response: credential,
      config,
      name,
    })
    if (!verified.ok) return { ok: false, status: 400, error: verified.error }

    let recoveryCodes = null
    const hadRecovery =
      Array.isArray(account.totpRecoveryHashes) && account.totpRecoveryHashes.length > 0
    if (!hadRecovery && !account.totpEnabled) {
      account.totpRecoveryHashes = pendingRecovery.hashes
      recoveryCodes = pendingRecovery.codes
    }

    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.passkey.added',
        summary: `${account.displayName || account.email} added a passkey`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, account, recoveryCodes }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Passkey registration failed' })
  }

  if (session.kind === 'pending_2fa_setup') {
    const token = signAccountSession(result.account)
    setSessionCookie(res, token)
  }

  return res.json({
    account: publicAccount(result.account),
    recoveryCodes: result.recoveryCodes,
  })
})

app.post('/api/auth/webauthn/authenticate/options', twoFactorLimiter, async (req, res) => {
  const session = readAuth(req)
  if (!session || session.kind !== 'pending_2fa') {
    return res.status(400).json({ error: 'No two-factor challenge in progress' })
  }
  const store = await readStore()
  const account = findAccountById(store, session.accountId)
  if (!account || account.status !== 'Active') {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not signed in' })
  }
  const config = resolveWebAuthnConfig({
    req,
    companyName: tenantDisplayName(store, account.tenantId),
  })
  const result = await createAuthenticationOptions({ account, config })
  if (!result.ok) return res.status(400).json({ error: result.error })
  return res.json(result.options)
})

app.post('/api/auth/webauthn/authenticate/verify', twoFactorLimiter, async (req, res) => {
  const session = readAuth(req)
  if (!session || session.kind !== 'pending_2fa') {
    return res.status(400).json({ error: 'No two-factor challenge in progress' })
  }
  const credential = req.body?.credential || req.body

  const result = await updateStore(async (store) => {
    const account = findAccountById(store, session.accountId)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in', clearSession: true }
    }
    const config = resolveWebAuthnConfig({
      req,
      companyName: tenantDisplayName(store, account.tenantId),
    })
    const verified = await verifyAuthentication({
      account,
      response: credential,
      config,
    })
    if (!verified.ok) return { ok: false, status: 401, error: verified.error }
    return { ok: true, account }
  })

  if (!result?.ok) {
    if (result?.clearSession) clearSessionCookie(res)
    return res.status(result?.status || 401).json({ error: result?.error || 'Passkey sign-in failed' })
  }

  const token = signAccountSession(result.account)
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(result.account) })
})

app.post('/api/auth/webauthn/login/options', twoFactorLimiter, async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }
  const store = await readStore()
  const account = findAccountByEmail(store, email)
  if (!account || account.status !== 'Active' || !accountHasPasskey(account)) {
    return res.status(401).json({ error: 'Passkey sign-in is not available for that email' })
  }
  const config = resolveWebAuthnConfig({
    req,
    companyName: tenantDisplayName(store, account.tenantId),
  })
  const result = await createAuthenticationOptions({ account, config })
  if (!result.ok) return res.status(400).json({ error: result.error })
  return res.json(result.options)
})

app.post('/api/auth/webauthn/login/verify', twoFactorLimiter, async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }
  const credential = req.body?.credential || req.body

  const result = await updateStore(async (store) => {
    const account = findAccountByEmail(store, email)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Passkey sign-in failed' }
    }
    const config = resolveWebAuthnConfig({
      req,
      companyName: tenantDisplayName(store, account.tenantId),
    })
    const verified = await verifyAuthentication({
      account,
      response: credential,
      config,
    })
    if (!verified.ok) return { ok: false, status: 401, error: verified.error }
    return { ok: true, account }
  })

  if (!result?.ok) {
    return res.status(result?.status || 401).json({ error: result?.error || 'Passkey sign-in failed' })
  }

  const token = signAccountSession(result.account)
  setSessionCookie(res, token)
  return res.json({ account: publicAccount(result.account) })
})

app.post('/api/auth/webauthn/credentials/remove', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const credentialId = String(req.body?.id || '')
  const password = String(req.body?.password || '')
  if (!credentialId) return res.status(400).json({ error: 'Passkey id is required' })
  if (!password) return res.status(400).json({ error: 'Password is required' })

  const passwordOk = await bcrypt.compare(password, ctx.account.passwordHash)
  if (!passwordOk) return res.status(401).json({ error: 'Password is incorrect' })

  const result = await updateStore((store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }

    const existing = Array.isArray(account.webauthnCredentials) ? account.webauthnCredentials : []
    if (!existing.some((item) => item.id === credentialId)) {
      return { ok: false, status: 404, error: 'Passkey not found' }
    }

    const remainingPasskeys = existing.filter((item) => item.id !== credentialId)
    const wouldHaveSecondFactor =
      Boolean(account.totpEnabled && account.totpSecret) || remainingPasskeys.length > 0
    const policy = companyTwoFactorPolicy(store, account.tenantId)
    if (policyRequiresTwoFactor(policy, account.role) && !wouldHaveSecondFactor) {
      return {
        ok: false,
        status: 400,
        error: 'Cannot remove the last second factor while two-factor is required for your role.',
      }
    }

    removePasskey(account, credentialId)
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.passkey.removed',
        summary: `${account.displayName || account.email} removed a passkey`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, account }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Could not remove passkey' })
  }
  return res.json({ account: publicAccount(result.account) })
})

app.get('/api/recovery/tenants', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const store = await readStore()
  res.json({ tenants: listTenants(store).map(publicTenant) })
})

app.post('/api/recovery/tenants', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const name = String(req.body?.name || '').trim() || 'Organisation'
  const tenant = await updateStore((store) => {
    const created = createTenant(store, { name })
    const appData = ensureTenantAppData(store, created.id)
    appData.company = { ...emptyCompany(), ...appData.company, name }
    return created
  })
  return res.status(201).json({ tenant: publicTenant(tenant) })
})

app.get('/api/recovery/accounts', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const store = await readStore()
  const tenantId = Number(req.query?.tenantId)
  if (!Number.isFinite(tenantId) || !getTenant(store, tenantId)) {
    return res.status(400).json({ error: 'tenantId is required' })
  }
  res.json({
    tenant: publicTenant(getTenant(store, tenantId)),
    accounts: accountsForTenant(store, tenantId).map(publicAccount),
  })
})

app.post('/api/recovery/accounts', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const displayName = String(req.body?.displayName || '').trim()
  const password = String(req.body?.password || '')
  const role = req.body?.role === 'employee' ? 'employee' : 'admin'
  let tenantId = req.body?.tenantId == null || req.body?.tenantId === ''
    ? null
    : Number(req.body.tenantId)
  const organisationName = String(req.body?.organisationName || req.body?.companyName || '').trim()

  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' })
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' })
  }
  if (email === masterConfig.login) {
    return res.status(400).json({ error: 'That login is reserved for master recovery' })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const created = await updateStore((store) => {
    if (findAccountByEmail(store, email)) {
      return { ok: false, status: 409, error: 'An account with that email already exists' }
    }

    let tenant = tenantId != null ? getTenant(store, tenantId) : null
    let resolvedTenantId = tenantId
    if (!tenant) {
      const tenants = listTenants(store)
      if (tenants.length === 0 || organisationName) {
        tenant = createTenant(store, { name: organisationName || 'Organisation' })
        const appData = ensureTenantAppData(store, tenant.id)
        appData.company = {
          ...emptyCompany(),
          ...appData.company,
          name: organisationName || tenant.name,
        }
        resolvedTenantId = tenant.id
      } else if (tenants.length === 1) {
        tenant = tenants[0]
        resolvedTenantId = tenant.id
      } else {
        return {
          ok: false,
          status: 400,
          error: 'tenantId is required when multiple organisations exist',
        }
      }
    }

    const tenantAccounts = accountsForTenant(store, resolvedTenantId)
    const isFirst = tenantAccounts.length === 0
    if (isFirst && role !== 'admin') {
      return {
        ok: false,
        status: 400,
        error: 'The first account in an organisation must be an admin',
      }
    }

    const account = {
      id: store.nextAccountId++,
      tenantId: resolvedTenantId,
      email,
      displayName,
      initials: initialsFromName(displayName),
      role,
      employeeId: null,
      status: 'Active',
      jobTitle: req.body?.jobTitle || undefined,
      isPrimary: isFirst,
      passwordHash,
      sessionVersion: 0,
    }
    store.accounts.push(account)
    return {
      ok: true,
      account,
      tenant: getTenant(store, resolvedTenantId),
    }
  })

  if (!created?.ok) {
    return res.status(created?.status || 400).json({ error: created?.error || 'Create failed' })
  }
  return res.status(201).json({
    account: publicAccount(created.account),
    tenant: publicTenant(created.tenant),
  })
})

app.patch('/api/recovery/accounts/:id', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const id = Number(req.params.id)

  let passwordHash = null
  if (typeof req.body?.password === 'string') {
    if (req.body.password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' })
    }
    passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
  }

  const result = await updateStore((store) => {
    const account = findAccountById(store, id)
    if (!account) return { ok: false, status: 404, error: 'Account not found' }

    const changes = []

    if (typeof req.body?.status === 'string') {
      account.status = req.body.status === 'Inactive' ? 'Inactive' : 'Active'
      changes.push(`status=${account.status}`)
    }
    if (req.body?.role === 'admin' || req.body?.role === 'employee') {
      account.role = req.body.role
      if (account.role === 'employee') account.isPrimary = false
      changes.push(`role=${account.role}`)
    }
    if (req.body?.isPrimary === true) {
      for (const item of accountsForTenant(store, account.tenantId)) {
        item.isPrimary = item.id === account.id
      }
      account.role = 'admin'
      account.status = 'Active'
      changes.push('made-primary')
    }
    if (passwordHash) {
      account.passwordHash = passwordHash
      bumpAccountSessionVersion(account)
      changes.push('password-reset')
    }
    if (req.body?.clearTwoFactor === true) {
      account.totpEnabled = false
      account.totpSecret = null
      account.totpPendingSecret = null
      account.totpRecoveryHashes = []
      changes.push('2fa-cleared')
    }
    if (req.body?.clearPasskeys === true) {
      account.webauthnCredentials = []
      changes.push('passkeys-cleared')
    }

    if (changes.length === 0) {
      return { ok: false, status: 400, error: 'No recovery changes provided' }
    }

    appendAuditEvent(
      store,
      createAuditEvent({
        actorName: 'Master recovery',
        action: 'recovery.account.updated',
        summary: `Master recovery updated ${account.displayName || account.email} (${changes.join(', ')})`,
        entityType: 'account',
        entityId: account.id,
      }),
      account.tenantId,
    )
    return { ok: true, account }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Update failed' })
  }
  return res.json({ account: publicAccount(result.account) })
})

app.delete('/api/recovery/accounts/:id', async (req, res) => {
  if (!requireRecovery(req, res)) return
  const id = Number(req.params.id)

  const result = await updateStore((store) => {
    const index = store.accounts.findIndex((item) => item.id === id)
    if (index < 0) return { ok: false, status: 404, error: 'Account not found' }

    const [removed] = store.accounts.splice(index, 1)
    const peers = accountsForTenant(store, removed.tenantId)
    if (removed.isPrimary && peers.length > 0) {
      const nextPrimary =
        peers.find((item) => item.role === 'admin' && item.status === 'Active') ||
        peers.find((item) => item.role === 'admin') ||
        peers[0]
      for (const item of peers) item.isPrimary = item.id === nextPrimary.id
      nextPrimary.role = 'admin'
      nextPrimary.status = 'Active'
    }

    appendAuditEvent(
      store,
      createAuditEvent({
        actorName: 'Master recovery',
        action: 'recovery.account.deleted',
        summary: `Master recovery deleted ${removed.displayName || removed.email}`,
        entityType: 'account',
        entityId: removed.id,
      }),
      removed.tenantId,
    )
    return { ok: true, deletedId: removed.id }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Delete failed' })
  }
  return res.json({ ok: true, deletedId: result.deletedId })
})

app.get('/api/app-data', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { store, account } = ctx
  res.json(projectAppDataForViewer(store, account, publicAccount))
})

app.put('/api/app-data', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account } = ctx

  const result = await updateStore((store) => {
    const live = findAccountById(store, account.id)
    if (!live || live.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    const written = applyAppDataWrite(store, live, req.body || {})
    if (!written?.ok) return written
    return {
      ...written,
      data: projectAppDataForViewer(store, live, publicAccount),
    }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({
      error: result?.error || 'Save failed',
      revision: result?.revision,
    })
  }
  res.json({
    ok: true,
    auditEvents: result.auditEvents,
    data: result.data,
    revision: result.revision,
    idRemap: result.idRemap || { requests: [], expenseClaims: [] },
  })
})

app.post('/api/accounts', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account: actor } = ctx
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create accounts' })
  }

  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const displayName = String(req.body?.displayName || '').trim()
  const password = String(req.body?.password || '')
  const invite = req.body?.invite !== false && !password
  const role = req.body?.role === 'admin' ? 'admin' : 'employee'
  const employeeId =
    req.body?.employeeId === null || req.body?.employeeId === undefined || req.body?.employeeId === ''
      ? null
      : Number(req.body.employeeId)

  if (!email || !displayName) {
    return res.status(400).json({ error: 'Email and name are required' })
  }
  if (!invite) {
    if (!password) {
      return res.status(400).json({ error: 'Password is required when not sending an invite' })
    }
    if (password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' })
    }
  }
  if (email === masterConfig.login) {
    return res.status(400).json({ error: 'That login is reserved for master recovery' })
  }

  if (invite) {
    const smtp = mailStatusPublic()
    if (!smtp.configured) {
      return res.status(503).json({
        error: 'Email is not configured on this server, so invites cannot be sent.',
      })
    }
  }

  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS)
  const passwordHash = invite ? placeholderHash : await bcrypt.hash(password, BCRYPT_ROUNDS)

  // For invites, persist first then mail; roll back via a second update if mail fails.
  const createdResult = await updateStore((store) => {
    const liveActor = findAccountById(store, actor.id)
    if (!liveActor || liveActor.status !== 'Active' || liveActor.role !== 'admin') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    if (findAccountByEmail(store, email)) {
      return { ok: false, status: 409, error: 'An account with that email already exists' }
    }

    const created = {
      id: store.nextAccountId++,
      tenantId: liveActor.tenantId,
      email,
      displayName,
      initials: initialsFromName(displayName),
      role,
      employeeId,
      status: 'Active',
      jobTitle: req.body?.jobTitle || undefined,
      isPrimary: false,
      passwordHash,
      mustSetPassword: invite,
      sessionVersion: 0,
    }

    let inviteToken = null
    if (invite) {
      inviteToken = issuePasswordSetup(created, 'invite')
    }

    store.accounts.push(created)
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: liveActor.id,
        actorName: liveActor.displayName || liveActor.email,
        action: invite ? 'account.invited' : 'account.created',
        summary: invite
          ? `${liveActor.displayName || liveActor.email} invited ${displayName} (${role})`
          : `${liveActor.displayName || liveActor.email} created account ${displayName} (${role})`,
        entityType: 'account',
        entityId: created.id,
      }),
    )
    return {
      ok: true,
      account: created,
      inviteToken,
      orgName: tenantDisplayName(store, created.tenantId),
      actorName: liveActor.displayName || 'Someone',
    }
  })

  if (!createdResult?.ok) {
    return res
      .status(createdResult?.status || 400)
      .json({ error: createdResult?.error || 'Create failed' })
  }

  const created = createdResult.account

  if (invite && createdResult.inviteToken) {
    const setupLink = passwordSetupUrl(req, createdResult.inviteToken)
    const mailed = await sendMail({
      to: created.email,
      subject: `${createdResult.orgName} — you’re invited to Finch`,
      text: [
        `${createdResult.actorName} invited you to ${createdResult.orgName} on Finch.`,
        '',
        `Set your password here:`,
        setupLink,
        '',
        'This link expires in 7 days.',
        '',
        `Once you’ve set a password, sign in with ${created.email}.`,
      ].join('\n'),
    })
    if (!mailed.ok) {
      await updateStore((store) => {
        store.accounts = store.accounts.filter((item) => item.id !== created.id)
      })
      return res.status(503).json({
        error: 'Could not send the invite email. Try again later.',
      })
    }
  }
  res.status(201).json({
    account: publicAccount(created),
    invited: invite,
  })
})

app.post('/api/accounts/:id/resend-invite', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account: actor } = ctx
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can resend invites' })
  }
  const id = Number(req.params.id)

  const smtp = mailStatusPublic()
  if (!smtp.configured) {
    return res.status(503).json({
      error: 'Email is not configured on this server, so invites cannot be sent.',
    })
  }

  const prepared = await updateStore((store) => {
    const liveActor = findAccountById(store, actor.id)
    if (!liveActor || liveActor.status !== 'Active' || liveActor.role !== 'admin') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    const target = findAccountById(store, id)
    if (!target || target.tenantId !== liveActor.tenantId) {
      return { ok: false, status: 404, error: 'Account not found' }
    }
    if (!target.mustSetPassword && !target.passwordSetup) {
      return { ok: false, status: 400, error: 'This account already has a password set' }
    }

    const inviteToken = issuePasswordSetup(target, 'invite')
    target.mustSetPassword = true
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: liveActor.id,
        actorName: liveActor.displayName || liveActor.email,
        action: 'account.invite_resent',
        summary: `${liveActor.displayName || liveActor.email} resent invite to ${target.displayName || target.email}`,
        entityType: 'account',
        entityId: target.id,
      }),
    )
    return {
      ok: true,
      inviteToken,
      email: target.email,
      orgName: tenantDisplayName(store, target.tenantId),
      actorName: liveActor.displayName || 'Someone',
      accountId: target.id,
      account: target,
    }
  })

  if (!prepared?.ok) {
    return res
      .status(prepared?.status || 400)
      .json({ error: prepared?.error || 'Could not resend invite' })
  }

  const setupLink = passwordSetupUrl(req, prepared.inviteToken)
  const mailed = await sendMail({
    to: prepared.email,
    subject: `${prepared.orgName} — you’re invited to Finch`,
    text: [
      `${prepared.actorName} sent you a new Finch invite for ${prepared.orgName}.`,
      '',
      `Set your password here:`,
      setupLink,
      '',
      'This link expires in 7 days.',
    ].join('\n'),
  })
  if (!mailed.ok) {
    await updateStore((store) => {
      const account = findAccountById(store, prepared.accountId)
      clearPasswordSetupIfToken(account, prepared.inviteToken)
    })
    return res.status(503).json({ error: 'Could not send the invite email. Try again later.' })
  }
  return res.json({ ok: true, account: publicAccount(prepared.account) })
})

app.patch('/api/accounts/:id', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const { account: actor } = ctx
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update accounts' })
  }

  const id = Number(req.params.id)

  if (req.body?.isPrimary === true) {
    if (!actor.isPrimary) {
      return res.status(403).json({ error: 'Only the primary admin can transfer primary status' })
    }
    const confirmPassword = String(req.body?.confirmPassword || '')
    const ok = await bcrypt.compare(confirmPassword, actor.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Password confirmation failed' })
    }
  }

  const result = await updateStore((store) => {
    const liveActor = findAccountById(store, actor.id)
    if (!liveActor || liveActor.status !== 'Active' || liveActor.role !== 'admin') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }

    const target = findAccountById(store, id)
    if (!target || target.tenantId !== liveActor.tenantId) {
      return { ok: false, status: 404, error: 'Account not found' }
    }

    const activeAdmins = () =>
      accountsForTenant(store, liveActor.tenantId).filter(
        (item) => item.role === 'admin' && item.status === 'Active',
      )

    // Validate before mutating so a failed check does not persist partial changes.
    if (req.body?.role === 'employee' && target.role === 'admin') {
      if (target.isPrimary) {
        return { ok: false, status: 400, error: 'Cannot remove admin from the primary admin' }
      }
      if (activeAdmins().length <= 1) {
        return { ok: false, status: 400, error: 'Keep at least one active admin' }
      }
    }
    if (req.body?.status === 'Inactive') {
      if (target.isPrimary) {
        return { ok: false, status: 400, error: 'Cannot deactivate the primary admin' }
      }
      if (target.id === liveActor.id) {
        return { ok: false, status: 400, error: 'Cannot deactivate your own account' }
      }
      const roleAfter =
        req.body?.role === 'employee' || req.body?.role === 'admin' ? req.body.role : target.role
      if (
        roleAfter === 'admin' &&
        activeAdmins().filter((item) => item.id !== target.id).length < 1
      ) {
        return { ok: false, status: 400, error: 'Keep at least one active admin' }
      }
    }
    if (req.body?.isPrimary === true && !liveActor.isPrimary) {
      return {
        ok: false,
        status: 403,
        error: 'Only the primary admin can transfer primary status',
      }
    }

    if (req.body?.role === 'employee' && target.role === 'admin') {
      target.role = 'employee'
    }
    if (req.body?.role === 'admin') {
      target.role = 'admin'
    }

    if (req.body?.status === 'Inactive') {
      target.status = 'Inactive'
    }
    if (req.body?.status === 'Active') {
      target.status = 'Active'
    }

    if (req.body?.isPrimary === true) {
      for (const item of accountsForTenant(store, liveActor.tenantId)) {
        item.isPrimary = item.id === target.id
      }
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

    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: liveActor.id,
        actorName: liveActor.displayName || liveActor.email,
        action: 'account.updated',
        summary: `${liveActor.displayName || liveActor.email} updated account ${target.displayName || target.email}`,
        entityType: 'account',
        entityId: target.id,
      }),
    )
    return {
      ok: true,
      account: target,
      accounts: accountsForTenant(store, liveActor.tenantId).map(publicAccount),
    }
  })

  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Update failed' })
  }
  res.json({
    account: publicAccount(result.account),
    accounts: result.accounts,
  })
})

app.post('/api/auth/verify-password', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const password = String(req.body?.password || '')
  const ok = await bcrypt.compare(password, ctx.account.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Password is incorrect' })
  res.json({ ok: true })
})

app.post('/api/auth/change-password', async (req, res) => {
  const ctx = await requireAccount(req, res)
  if (!ctx) return
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' })
  }
  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters' })
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password' })
  }

  const ok = await bcrypt.compare(currentPassword, ctx.account.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' })

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  const result = await updateStore((store) => {
    const account = findAccountById(store, ctx.account.id)
    if (!account || account.status !== 'Active') {
      return { ok: false, status: 401, error: 'Not signed in' }
    }
    account.passwordHash = passwordHash
    bumpAccountSessionVersion(account)
    appendAuditEvent(
      store,
      createAuditEvent({
        actorAccountId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.password.changed',
        summary: `${account.displayName || account.email} changed their password`,
        entityType: 'account',
        entityId: account.id,
      }),
    )
    return { ok: true, account }
  })
  if (!result?.ok) {
    return res.status(result?.status || 400).json({ error: result?.error || 'Password change failed' })
  }
  // Issue a fresh session for the caller; other sessions are revoked via sessionVersion.
  const token = signAccountSession(result.account)
  setSessionCookie(res, token)
  return res.json({ ok: true })
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

  const company = ensureTenantAppData(store, account.tenantId).company || {}
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
  // Intentionally no automatic store wipe. Legacy demo cleanup must be a manual ops action.

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

const isDirectRun =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  boot().catch((error) => {
    console.error('Failed to start Finch:', error)
    process.exit(1)
  })
}

export { app, boot }
