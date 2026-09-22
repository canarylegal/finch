export type AuditAction =
  | 'leave.approved'
  | 'leave.declined'
  | 'leave.cancelled'
  | 'expense.approved'
  | 'expense.declined'
  | 'settings.updated'
  | 'account.created'
  | 'account.updated'
  | 'auth.totp.enabled'
  | 'auth.totp.disabled'
  | 'auth.passkey.added'
  | 'auth.passkey.removed'
  | 'auth.password.changed'
  | 'auth.password.reset_email'
  | 'recovery.account.updated'
  | 'recovery.account.deleted'

export type AuditEvent = {
  id: string
  at: string
  actorAccountId: number | null
  actorName: string
  action: AuditAction
  entityType?: string
  entityId?: string | number
  summary: string
}

export const AUDIT_LOG_LIMIT = 500

export function nextAuditId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `aud-${crypto.randomUUID()}`
  }
  return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createAuditEvent(input: {
  actorAccountId?: number | null
  actorName: string
  action: AuditAction
  summary: string
  entityType?: string
  entityId?: string | number
  at?: string
  id?: string
}): AuditEvent {
  return {
    id: input.id ?? nextAuditId(),
    at: input.at ?? new Date().toISOString(),
    actorAccountId: input.actorAccountId ?? null,
    actorName: input.actorName.trim() || 'Unknown',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
  }
}

export function mergeAuditEvents(
  existing: AuditEvent[] | unknown,
  incoming: AuditEvent[] | unknown,
): AuditEvent[] {
  const byId = new Map<string, AuditEvent>()
  for (const list of [existing, incoming]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const event = item as AuditEvent
      if (typeof event.id !== 'string' || typeof event.at !== 'string') continue
      if (typeof event.summary !== 'string' || typeof event.action !== 'string') continue
      byId.set(event.id, {
        id: event.id,
        at: event.at,
        actorAccountId:
          typeof event.actorAccountId === 'number' ? event.actorAccountId : null,
        actorName: String(event.actorName || 'Unknown'),
        action: event.action as AuditAction,
        entityType: event.entityType,
        entityId: event.entityId,
        summary: event.summary,
      })
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, AUDIT_LOG_LIMIT)
}

export function appendAuditEvent(
  events: AuditEvent[] | unknown,
  event: AuditEvent,
): AuditEvent[] {
  return mergeAuditEvents(events, [event])
}

export function formatAuditWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function auditActionLabel(action: AuditAction | string) {
  switch (action) {
    case 'leave.approved':
      return 'Leave approved'
    case 'leave.declined':
      return 'Leave declined'
    case 'leave.cancelled':
      return 'Leave cancelled'
    case 'expense.approved':
      return 'Expense approved'
    case 'expense.declined':
      return 'Expense declined'
    case 'settings.updated':
      return 'Settings updated'
    case 'account.created':
      return 'Account created'
    case 'account.updated':
      return 'Account updated'
    case 'auth.totp.enabled':
      return 'Authenticator enabled'
    case 'auth.totp.disabled':
      return 'Authenticator disabled'
    case 'auth.passkey.added':
      return 'Passkey added'
    case 'auth.passkey.removed':
      return 'Passkey removed'
    case 'auth.password.changed':
      return 'Password changed'
    case 'auth.password.reset_email':
      return 'Password reset emailed'
    case 'recovery.account.updated':
      return 'Recovery account update'
    case 'recovery.account.deleted':
      return 'Recovery account deleted'
    default:
      return action
  }
}
