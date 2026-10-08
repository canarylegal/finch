import crypto from 'node:crypto'
import { ensureTenantAppData, findAccountById } from './tenants.mjs'

export const AUDIT_LOG_LIMIT = 500

export function createAuditEvent({
  actorAccountId = null,
  actorName,
  action,
  summary,
  entityType,
  entityId,
  id,
  at,
}) {
  return {
    id: typeof id === 'string' && id ? id : `aud-${crypto.randomUUID()}`,
    at: typeof at === 'string' && at ? at : new Date().toISOString(),
    actorAccountId: typeof actorAccountId === 'number' ? actorAccountId : null,
    actorName: String(actorName || 'Unknown').trim() || 'Unknown',
    action,
    entityType,
    entityId,
    summary: String(summary || '').trim() || action,
  }
}

export function mergeAuditEvents(existing, incoming) {
  const byId = new Map()
  for (const list of [existing, incoming]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      if (typeof item.id !== 'string' || typeof item.at !== 'string') continue
      if (typeof item.summary !== 'string' || typeof item.action !== 'string') continue
      byId.set(item.id, {
        id: item.id,
        at: item.at,
        actorAccountId: typeof item.actorAccountId === 'number' ? item.actorAccountId : null,
        actorName: String(item.actorName || 'Unknown'),
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        summary: item.summary,
      })
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, AUDIT_LOG_LIMIT)
}

export function appendAuditEvent(store, event, tenantId) {
  let resolvedTenantId = tenantId
  if (resolvedTenantId == null && event?.actorAccountId != null) {
    resolvedTenantId = findAccountById(store, event.actorAccountId)?.tenantId
  }
  if (resolvedTenantId == null) {
    throw new Error('appendAuditEvent requires tenantId')
  }
  const appData = ensureTenantAppData(store, resolvedTenantId)
  appData.auditEvents = mergeAuditEvents(appData.auditEvents, [event])
}
