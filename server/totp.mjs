import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

const BCRYPT_ROUNDS = 12
const RECOVERY_CODE_COUNT = 8

export function policyRequiresTwoFactor(policy, role) {
  if (policy === 'all') return true
  if (policy === 'admins' && role === 'admin') return true
  return false
}

export function createTotpSecret() {
  return generateSecret()
}

export function buildTotpUri({ secret, email, issuer = 'Finch' }) {
  return generateURI({
    issuer,
    label: email,
    secret,
  })
}

export async function totpQrDataUrl(uri) {
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  })
}

export async function verifyTotpCode(secret, code) {
  const token = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) return false
  try {
    const result = await verify({ secret, token })
    return Boolean(result?.valid)
  } catch {
    return false
  }
}

function generateRecoveryCode() {
  // 8 chars, unambiguous alphabet
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

export async function createRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode())
  const hashes = await Promise.all(codes.map((code) => bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_ROUNDS)))
  return { codes, hashes }
}

export function normalizeRecoveryCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export async function consumeRecoveryCode(account, code) {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length < 8) return false
  const hashes = Array.isArray(account.totpRecoveryHashes) ? account.totpRecoveryHashes : []
  for (let i = 0; i < hashes.length; i += 1) {
    const ok = await bcrypt.compare(normalized, hashes[i])
    if (ok) {
      account.totpRecoveryHashes = hashes.filter((_, index) => index !== i)
      return true
    }
  }
  return false
}

export function publicTotpStatus(account) {
  return {
    totpEnabled: Boolean(account.totpEnabled && account.totpSecret),
    recoveryCodesRemaining: Array.isArray(account.totpRecoveryHashes)
      ? account.totpRecoveryHashes.length
      : 0,
  }
}
