import nodemailer from 'nodemailer'
import {
  accountsForTenant,
  ensureTenantAppData,
  tenantDisplayName,
} from './tenants.mjs'

const EVENT_IDS = new Set([
  'leaveRequestSubmitted',
  'leaveRequestReviewed',
  'expenseClaimSubmitted',
  'expenseClaimReviewed',
  'probationEnding',
  'documentUpdated',
])

export function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim()
  const from = (process.env.SMTP_FROM || '').trim()
  const secure = ['1', 'true', 'yes', 'on'].includes(
    (process.env.SMTP_SECURE || '').trim().toLowerCase(),
  )
  const configured = Boolean(host && from)
  return {
    configured,
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    pass,
    from,
    secure,
  }
}

export function mailStatusPublic() {
  const cfg = getSmtpConfig()
  return {
    configured: cfg.configured,
    from: cfg.configured ? cfg.from : null,
  }
}

let transporter = null
let transporterKey = ''

function getTransporter() {
  const cfg = getSmtpConfig()
  if (!cfg.configured) return null
  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}|${cfg.from}`
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    })
    transporterKey = key
  }
  return transporter
}

export async function sendMail({ to, subject, text, attachments }) {
  const cfg = getSmtpConfig()
  if (!cfg.configured) {
    return { ok: false, reason: 'smtp_not_configured' }
  }
  const recipients = Array.isArray(to)
    ? [...new Set(to.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
    : [String(to || '').trim().toLowerCase()].filter(Boolean)
  if (recipients.length === 0) {
    return { ok: false, reason: 'no_recipients' }
  }

  const transport = getTransporter()
  if (!transport) {
    return { ok: false, reason: 'smtp_not_configured' }
  }

  await transport.sendMail({
    from: cfg.from,
    to: recipients.join(', '),
    subject,
    text,
    attachments: Array.isArray(attachments) ? attachments : undefined,
  })
  return { ok: true, recipients }
}

function activeAdmins(store, tenantId, { excludeAccountId } = {}) {
  return accountsForTenant(store, tenantId).filter(
    (account) =>
      account.role === 'admin' &&
      account.status === 'Active' &&
      account.id !== excludeAccountId &&
      account.email,
  )
}

function accountForEmployee(store, tenantId, employeeId) {
  if (employeeId == null) return null
  return (
    accountsForTenant(store, tenantId).find(
      (account) =>
        account.employeeId === Number(employeeId) &&
        account.status === 'Active' &&
        account.email,
    ) || null
  )
}

function shouldSendEvent(company, eventId) {
  if (!company?.emailNotifications) return false
  const events = company.notificationEvents || {}
  return Boolean(events[eventId])
}

function buildMessage(eventId, companyLabel, details) {
  const employeeName = String(details.employeeName || 'An employee').trim()
  const dates = String(details.dates || '').trim()
  const amountLabel = String(details.amountLabel || '').trim()
  const status = String(details.status || '').trim()
  const documentTitle = String(details.documentTitle || 'A document').trim()
  const probationDate = String(details.probationDate || '').trim()

  switch (eventId) {
    case 'leaveRequestSubmitted':
      return {
        subject: `[${companyLabel}] Leave request from ${employeeName}`,
        text: [
          `${employeeName} submitted a leave request.`,
          dates ? `Dates: ${dates}` : null,
          '',
          'Open Finch to review it.',
        ]
          .filter((line) => line !== null)
          .join('\n'),
      }
    case 'leaveRequestReviewed':
      return {
        subject: `[${companyLabel}] Leave request ${status.toLowerCase()}`,
        text: [
          `Your leave request was ${status.toLowerCase()}.`,
          dates ? `Dates: ${dates}` : null,
          '',
          'Open Finch to view the details.',
        ]
          .filter((line) => line !== null)
          .join('\n'),
      }
    case 'expenseClaimSubmitted':
      return {
        subject: `[${companyLabel}] Expense claim from ${employeeName}`,
        text: [
          `${employeeName} submitted an expense claim.`,
          amountLabel ? `Amount: ${amountLabel}` : null,
          '',
          'Open Finch to review it.',
        ]
          .filter((line) => line !== null)
          .join('\n'),
      }
    case 'expenseClaimReviewed':
      return {
        subject: `[${companyLabel}] Expense claim ${status.toLowerCase()}`,
        text: [
          `Your expense claim was ${status.toLowerCase()}.`,
          amountLabel ? `Amount: ${amountLabel}` : null,
          '',
          'Open Finch to view the details.',
        ]
          .filter((line) => line !== null)
          .join('\n'),
      }
    case 'probationEnding':
      return {
        subject: `[${companyLabel}] Probation ending — ${employeeName}`,
        text: [
          `${employeeName}'s probation period is ending soon.`,
          probationDate ? `Date: ${probationDate}` : null,
          '',
          'Open Finch to review upcoming people actions.',
        ]
          .filter((line) => line !== null)
          .join('\n'),
      }
    case 'documentUpdated':
      return {
        subject: `[${companyLabel}] Document updated — ${documentTitle}`,
        text: [
          `${documentTitle} was uploaded or updated for ${employeeName}.`,
          '',
          'Open Finch to view documents.',
        ].join('\n'),
      }
    default:
      return null
  }
}

/**
 * Resolve recipients and send a notification email for a known event.
 * Recipients are always derived from the store — never from the client body.
 */
export async function dispatchNotificationEmail({
  store,
  actor,
  eventId,
  employeeId,
  details = {},
}) {
  if (!EVENT_IDS.has(eventId)) {
    return { ok: false, reason: 'invalid_event' }
  }

  const tenantId = actor?.tenantId
  if (tenantId == null) {
    return { ok: false, reason: 'forbidden' }
  }

  const company = ensureTenantAppData(store, tenantId).company || {}
  if (!shouldSendEvent(company, eventId)) {
    return { ok: false, reason: 'disabled_by_settings' }
  }

  const cfg = getSmtpConfig()
  if (!cfg.configured) {
    return { ok: false, reason: 'smtp_not_configured' }
  }

  const label = tenantDisplayName(store, tenantId)
  const message = buildMessage(eventId, label, details)
  if (!message) {
    return { ok: false, reason: 'invalid_event' }
  }

  let recipients = []
  if (
    eventId === 'leaveRequestSubmitted' ||
    eventId === 'expenseClaimSubmitted' ||
    eventId === 'probationEnding' ||
    eventId === 'documentUpdated'
  ) {
    recipients = activeAdmins(store, tenantId, { excludeAccountId: actor?.id }).map(
      (item) => item.email,
    )
  } else if (eventId === 'leaveRequestReviewed' || eventId === 'expenseClaimReviewed') {
    if (actor?.role !== 'admin') {
      return { ok: false, reason: 'forbidden' }
    }
    const subjectAccount = accountForEmployee(store, tenantId, employeeId)
    if (subjectAccount?.email) recipients = [subjectAccount.email]
  }

  if (recipients.length === 0) {
    return { ok: false, reason: 'no_recipients' }
  }

  try {
    const result = await sendMail({
      to: recipients,
      subject: message.subject,
      text: message.text,
    })
    if (!result.ok) return result
    return { ok: true, recipients: result.recipients, subject: message.subject }
  } catch (error) {
    console.error('SMTP send failed:', error?.message || error)
    return { ok: false, reason: 'send_failed', error: String(error?.message || 'Send failed') }
  }
}

export function reasonMessage(reason) {
  switch (reason) {
    case 'smtp_not_configured':
      return 'Email skipped — SMTP is not configured on the server'
    case 'disabled_by_settings':
      return 'Email skipped — notifications are turned off'
    case 'no_recipients':
      return 'Email skipped — no matching recipients'
    case 'forbidden':
      return 'Email skipped — not allowed'
    case 'invalid_event':
      return 'Email skipped — unknown event'
    case 'send_failed':
      return 'Email failed to send'
    default:
      return 'Email skipped'
  }
}
