import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'

/** @type {Map<string, { challenge: string; type: 'registration' | 'authentication'; expiresAt: number }>} */
const challenges = new Map()

const CHALLENGE_TTL_MS = 5 * 60 * 1000

function challengeKey(accountId, type) {
  return `${type}:${accountId}`
}

function pruneChallenges() {
  const now = Date.now()
  for (const [key, value] of challenges) {
    if (value.expiresAt <= now) challenges.delete(key)
  }
}

export function rememberChallenge(accountId, type, challenge) {
  pruneChallenges()
  challenges.set(challengeKey(accountId, type), {
    challenge,
    type,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  })
}

export function takeChallenge(accountId, type) {
  pruneChallenges()
  const key = challengeKey(accountId, type)
  const entry = challenges.get(key)
  challenges.delete(key)
  if (!entry || entry.expiresAt <= Date.now()) return null
  return entry.challenge
}

export function listPasskeys(account) {
  const credentials = Array.isArray(account.webauthnCredentials)
    ? account.webauthnCredentials
    : []
  return credentials.map((item) => ({
    id: item.id,
    name: item.name || 'Passkey',
    createdAt: item.createdAt || null,
    backedUp: Boolean(item.backedUp),
  }))
}

export function accountHasPasskey(account) {
  return listPasskeys(account).length > 0
}

export function accountHasSecondFactor(account) {
  const totp = Boolean(account.totpEnabled && account.totpSecret)
  return totp || accountHasPasskey(account)
}

export function publicPasskeyStatus(account) {
  const passkeys = listPasskeys(account)
  return {
    passkeyCount: passkeys.length,
    passkeys,
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return Buffer.from(value, 'base64url')
  return new Uint8Array(value)
}

function credentialFromStored(stored) {
  return {
    id: stored.id,
    publicKey: toUint8Array(stored.publicKey),
    counter: Number(stored.counter) || 0,
    transports: stored.transports,
  }
}

export function resolveWebAuthnConfig({ req, companyName }) {
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
  const hostname = hostHeader.split(':')[0].toLowerCase() || 'localhost'
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
  const proto =
    forwardedProto ||
    (hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : 'https')

  const rpID = (process.env.WEBAUTHN_RP_ID || '').trim() || hostname
  const envOrigins = (process.env.WEBAUTHN_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const requestOrigin = String(req.headers.origin || '').trim()
  const derivedOrigin =
    requestOrigin ||
    (hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'http://localhost:5173'
      : `${proto}://${hostHeader}`)

  const expectedOrigins = envOrigins.length > 0 ? envOrigins : [derivedOrigin]
  if (requestOrigin && !expectedOrigins.includes(requestOrigin)) {
    expectedOrigins.push(requestOrigin)
  }

  // Vite/dev often calls API on :8787 while the page is on :5173.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8787']) {
      if (!expectedOrigins.includes(origin)) expectedOrigins.push(origin)
    }
  }

  const rpName = (companyName || '').trim() || 'Finch'
  return { rpID, rpName, expectedOrigins }
}

export async function createRegistrationOptions({ account, config }) {
  const existing = Array.isArray(account.webauthnCredentials) ? account.webauthnCredentials : []
  const userID = new TextEncoder().encode(`finch-account-${account.id}`)
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: account.email,
    userDisplayName: account.displayName || account.email,
    userID,
    attestationType: 'none',
    excludeCredentials: existing.map((item) => ({
      id: item.id,
      transports: item.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })
  rememberChallenge(account.id, 'registration', options.challenge)
  return options
}

export async function verifyAndStoreRegistration({
  account,
  response,
  config,
  name,
}) {
  const expectedChallenge = takeChallenge(account.id, 'registration')
  if (!expectedChallenge) {
    return { ok: false, error: 'Passkey registration expired. Try again.' }
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      requireUserVerification: false,
    })
  } catch (error) {
    return { ok: false, error: error?.message || 'Passkey registration failed' }
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'Passkey registration could not be verified' }
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  if (!Array.isArray(account.webauthnCredentials)) account.webauthnCredentials = []
  if (account.webauthnCredentials.some((item) => item.id === credential.id)) {
    return { ok: false, error: 'That passkey is already registered' }
  }

  account.webauthnCredentials.push({
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: response?.response?.transports,
    deviceType: credentialDeviceType,
    backedUp: Boolean(credentialBackedUp),
    name: String(name || '').trim() || 'Passkey',
    createdAt: new Date().toISOString(),
  })

  return { ok: true }
}

export async function createAuthenticationOptions({ account, config }) {
  const existing = Array.isArray(account.webauthnCredentials) ? account.webauthnCredentials : []
  if (existing.length === 0) {
    return { ok: false, error: 'No passkeys registered on this account' }
  }
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: existing.map((item) => ({
      id: item.id,
      transports: item.transports,
    })),
    userVerification: 'preferred',
  })
  rememberChallenge(account.id, 'authentication', options.challenge)
  return { ok: true, options }
}

export async function verifyAuthentication({ account, response, config }) {
  const expectedChallenge = takeChallenge(account.id, 'authentication')
  if (!expectedChallenge) {
    return { ok: false, error: 'Passkey sign-in expired. Try again.' }
  }

  const existing = Array.isArray(account.webauthnCredentials) ? account.webauthnCredentials : []
  const matched = existing.find((item) => item.id === response?.id)
  if (!matched) {
    return { ok: false, error: 'Unknown passkey' }
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      credential: credentialFromStored(matched),
      requireUserVerification: false,
    })
  } catch (error) {
    return { ok: false, error: error?.message || 'Passkey verification failed' }
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return { ok: false, error: 'Passkey could not be verified' }
  }

  matched.counter = verification.authenticationInfo.newCounter
  return { ok: true }
}

export function removePasskey(account, credentialId) {
  const existing = Array.isArray(account.webauthnCredentials) ? account.webauthnCredentials : []
  const next = existing.filter((item) => item.id !== credentialId)
  if (next.length === existing.length) return false
  account.webauthnCredentials = next
  return true
}
