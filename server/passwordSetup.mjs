import crypto from 'node:crypto'

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashPasswordSetupToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

export function createPasswordSetupToken() {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, tokenHash: hashPasswordSetupToken(token) }
}

export function issuePasswordSetup(account, purpose, ttlMs = DEFAULT_TTL_MS) {
  const { token, tokenHash } = createPasswordSetupToken()
  account.passwordSetup = {
    tokenHash,
    purpose,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  }
  account.mustSetPassword = purpose === 'invite' ? true : Boolean(account.mustSetPassword)
  return token
}

export function clearPasswordSetup(account) {
  delete account.passwordSetup
}

/** Clear setup state only when the account still holds this exact token. */
export function clearPasswordSetupIfToken(account, rawToken) {
  if (!account) return false
  const token = String(rawToken || '').trim()
  if (!token) return false
  const tokenHash = hashPasswordSetupToken(token)
  if (account.passwordSetup?.tokenHash !== tokenHash) return false
  clearPasswordSetup(account)
  return true
}

export function findAccountByPasswordSetupToken(store, rawToken) {
  const token = String(rawToken || '').trim()
  if (!token) return { ok: false, reason: 'missing' }
  const tokenHash = hashPasswordSetupToken(token)
  const account = store.accounts.find((item) => item.passwordSetup?.tokenHash === tokenHash)
  if (!account) return { ok: false, reason: 'invalid' }
  const expiresAt = account.passwordSetup?.expiresAt
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', account }
  }
  return { ok: true, account, purpose: account.passwordSetup.purpose }
}

export function publicAppOrigin(req) {
  const configured = (process.env.FINCH_PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim()
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim()
  return `${proto}://${host}`
}

export function passwordSetupUrl(req, token) {
  return `${publicAppOrigin(req)}/?setPassword=${encodeURIComponent(token)}`
}
