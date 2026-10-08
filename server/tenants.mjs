import { emptyAppData, emptyCompany } from './appDataShape.mjs'

export const STORE_VERSION = 2

function slugify(name) {
  const base = String(name || 'organisation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'organisation'
}

export function emptyTenant({ id, name }) {
  const label = String(name || 'Organisation').trim() || 'Organisation'
  return {
    id,
    name: label,
    slug: slugify(label),
    status: 'Active',
    createdAt: new Date().toISOString(),
  }
}

/** Ensure counters never reuse ids that already exist in the store. */
export function reconcileIdCounters(store) {
  let maxAccountId = 0
  for (const account of store.accounts || []) {
    const id = Number(account?.id)
    if (Number.isFinite(id) && id > maxAccountId) maxAccountId = id
  }
  let maxTenantId = 0
  for (const tenant of store.tenants || []) {
    const id = Number(tenant?.id)
    if (Number.isFinite(id) && id > maxTenantId) maxTenantId = id
  }
  store.nextAccountId = Math.max(Number(store.nextAccountId) || 1, maxAccountId + 1)
  store.nextTenantId = Math.max(Number(store.nextTenantId) || 1, maxTenantId + 1)
  return store
}

/**
 * Migrate legacy single-company store shape to multi-tenant in place.
 * Safe to call on every read.
 */
export function normalizeStore(store) {
  if (!store || typeof store !== 'object') {
    return {
      storeVersion: STORE_VERSION,
      nextTenantId: 1,
      nextAccountId: 1,
      tenants: [],
      accounts: [],
      appDataByTenant: {},
    }
  }

  if (store.storeVersion >= STORE_VERSION && Array.isArray(store.tenants) && store.appDataByTenant) {
    if (!Array.isArray(store.accounts)) store.accounts = []
    if (typeof store.nextAccountId !== 'number') store.nextAccountId = 1
    if (typeof store.nextTenantId !== 'number') store.nextTenantId = 1
    return reconcileIdCounters(store)
  }

  // Legacy v1: { accounts, appData, nextAccountId }
  const legacyAccounts = Array.isArray(store.accounts) ? store.accounts : []
  const legacyAppData = store.appData && typeof store.appData === 'object' ? store.appData : emptyAppData()
  const companyName = legacyAppData.company?.name?.trim() || 'Organisation'
  const tenantId = 1

  store.storeVersion = STORE_VERSION
  store.nextTenantId = Math.max(2, Number(store.nextTenantId) || 2)
  store.nextAccountId = Math.max(
    1,
    Number(store.nextAccountId) || 1,
    ...legacyAccounts.map((item) => Number(item?.id) || 0).map((id) => id + 1),
  )
  store.tenants = [
    emptyTenant({ id: tenantId, name: companyName }),
  ]
  store.accounts = legacyAccounts.map((account) => ({
    ...account,
    tenantId: typeof account.tenantId === 'number' ? account.tenantId : tenantId,
  }))
  store.appDataByTenant = {
    [String(tenantId)]: {
      ...emptyAppData(),
      ...legacyAppData,
      company: {
        ...emptyCompany(),
        ...(legacyAppData.company || {}),
      },
    },
  }
  delete store.appData
  return reconcileIdCounters(store)
}

export function listTenants(store) {
  normalizeStore(store)
  return store.tenants.filter((tenant) => tenant && tenant.status !== 'Inactive')
}

export function getTenant(store, tenantId) {
  normalizeStore(store)
  const id = Number(tenantId)
  return store.tenants.find((tenant) => tenant.id === id) || null
}

export function ensureTenantAppData(store, tenantId) {
  normalizeStore(store)
  const key = String(tenantId)
  if (!store.appDataByTenant[key]) {
    store.appDataByTenant[key] = emptyAppData()
  }
  return store.appDataByTenant[key]
}

export function accountsForTenant(store, tenantId) {
  normalizeStore(store)
  const id = Number(tenantId)
  return store.accounts.filter((account) => account.tenantId === id)
}

export function findAccountByEmail(store, email) {
  normalizeStore(store)
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  return store.accounts.find((account) => account.email === normalized) || null
}

export function findAccountById(store, accountId) {
  normalizeStore(store)
  return store.accounts.find((account) => account.id === Number(accountId)) || null
}

export function createTenant(store, { name }) {
  normalizeStore(store)
  const tenant = emptyTenant({ id: store.nextTenantId++, name })
  // Ensure unique slug
  const used = new Set(store.tenants.map((item) => item.slug))
  let slug = tenant.slug
  let n = 2
  while (used.has(slug)) {
    slug = `${tenant.slug}-${n}`
    n += 1
  }
  tenant.slug = slug
  store.tenants.push(tenant)
  store.appDataByTenant[String(tenant.id)] = emptyAppData()
  return tenant
}

export function publicTenant(tenant) {
  if (!tenant) return null
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status || 'Active',
    createdAt: tenant.createdAt || null,
  }
}

export function tenantDisplayName(store, tenantId) {
  const tenant = getTenant(store, tenantId)
  const appData = ensureTenantAppData(store, tenantId)
  return appData.company?.name?.trim() || tenant?.name || 'Finch'
}
