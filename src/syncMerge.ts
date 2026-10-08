/**
 * Three-way merge helpers for Finch app-data conflict recovery.
 * Reapplies only local deltas onto the latest server snapshot.
 */

export type MergeConflict = {
  id: unknown
  collection: string
  local: unknown
  server: unknown
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const recordA = a as Record<string, unknown>
    const recordB = b as Record<string, unknown>
    const keysA = Object.keys(recordA)
    const keysB = Object.keys(recordB)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => deepEqual(recordA[key], recordB[key]))
  }
  return false
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/**
 * Merge one id-keyed collection.
 */
export function mergeCollection(
  baseItems: unknown,
  localItems: unknown,
  serverItems: unknown,
  collection: string,
  idKey = 'id',
): { merged: Record<string, unknown>[]; conflicts: MergeConflict[] } {
  const baseMap = new Map(asArray(baseItems).map((item) => [item?.[idKey], item]))
  const localMap = new Map(asArray(localItems).map((item) => [item?.[idKey], item]))
  const serverMap = new Map(asArray(serverItems).map((item) => [item?.[idKey], item]))
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...serverMap.keys()])
  const merged: Record<string, unknown>[] = []
  const conflicts: MergeConflict[] = []

  for (const id of ids) {
    if (id == null) continue
    const base = baseMap.get(id)
    const local = localMap.get(id)
    const server = serverMap.get(id)

    if (!base && local && !server) {
      merged.push(local)
      continue
    }
    if (!base && !local && server) {
      merged.push(server)
      continue
    }
    if (!base && local && server) {
      if (deepEqual(local, server)) merged.push(local)
      else {
        conflicts.push({ id, collection, local, server })
        merged.push(server)
      }
      continue
    }
    if (base && !local && !server) {
      continue
    }
    if (base && local && !server) {
      if (deepEqual(local, base)) continue
      conflicts.push({ id, collection, local, server: null })
      merged.push(local)
      continue
    }
    if (base && !local && server) {
      if (deepEqual(server, base)) continue
      conflicts.push({ id, collection, local: null, server })
      merged.push(server)
      continue
    }

    const localChanged = !deepEqual(local, base)
    const serverChanged = !deepEqual(server, base)
    if (!localChanged) {
      if (server) merged.push(server)
      continue
    }
    if (!serverChanged) {
      if (local) merged.push(local)
      continue
    }
    if (deepEqual(local, server)) {
      if (local) merged.push(local)
      continue
    }
    conflicts.push({ id, collection, local, server })
    if (server) merged.push(server)
  }

  return { merged, conflicts }
}

/**
 * Field-level merge for plain objects (e.g. company settings).
 */
export function mergeObject(
  baseObj: unknown,
  localObj: unknown,
  serverObj: unknown,
  collection = 'company',
): { merged: Record<string, unknown>; conflicts: MergeConflict[] } {
  const base =
    baseObj && typeof baseObj === 'object' ? (baseObj as Record<string, unknown>) : {}
  const local =
    localObj && typeof localObj === 'object' ? (localObj as Record<string, unknown>) : {}
  const server =
    serverObj && typeof serverObj === 'object' ? (serverObj as Record<string, unknown>) : {}
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)])
  const merged: Record<string, unknown> = { ...server }
  const conflicts: MergeConflict[] = []

  for (const key of keys) {
    const b = base[key]
    const l = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : undefined
    const s = Object.prototype.hasOwnProperty.call(server, key) ? server[key] : undefined
    const localChanged = !deepEqual(l, b)
    const serverChanged = !deepEqual(s, b)
    if (!localChanged) {
      merged[key] = s
      continue
    }
    if (!serverChanged) {
      merged[key] = l
      continue
    }
    if (deepEqual(l, s)) {
      merged[key] = l
      continue
    }
    conflicts.push({ id: key, collection, local: l, server: s })
    merged[key] = s
  }

  return { merged, conflicts }
}

const COLLECTION_KEYS = [
  'employees',
  'absences',
  'bankHolidays',
  'requests',
  'portalMessages',
  'documentFolders',
  'employeeDocuments',
  'expenseClaims',
  'vatReceipts',
  'taskDismissals',
  'policies',
  'leaveAdjustments',
  'leaveYearClosures',
] as const

/**
 * Merge local edits onto the latest server app-data using the last synced base.
 * Does not merge accounts or auditEvents (server-authoritative / append-only).
 */
export function mergeAppData(
  baseData: Record<string, unknown> | null | undefined,
  localData: Record<string, unknown> | null | undefined,
  serverData: Record<string, unknown> | null | undefined,
): {
  merged: Record<string, unknown>
  conflicts: MergeConflict[]
  clean: boolean
} {
  const conflicts: MergeConflict[] = []
  const merged: Record<string, unknown> = {
    ...(serverData || {}),
    revision: serverData?.revision,
  }

  const companyMerge = mergeObject(
    baseData?.company,
    localData?.company,
    serverData?.company,
    'company',
  )
  merged.company = companyMerge.merged
  conflicts.push(...companyMerge.conflicts)

  for (const key of COLLECTION_KEYS) {
    const result = mergeCollection(baseData?.[key], localData?.[key], serverData?.[key], key)
    merged[key] = result.merged
    conflicts.push(...result.conflicts)
  }

  merged.accounts = asArray(serverData?.accounts)
  merged.auditEvents = asArray(serverData?.auditEvents)

  return {
    merged,
    conflicts,
    clean: conflicts.length === 0,
  }
}

export function describeConflicts(conflicts: MergeConflict[]): string[] {
  if (!conflicts.length) return []
  const byCollection = new Map<string, MergeConflict[]>()
  for (const item of conflicts) {
    const list = byCollection.get(item.collection) || []
    list.push(item)
    byCollection.set(item.collection, list)
  }
  return [...byCollection.entries()].map(([collection, items]) => {
    const labels = items.slice(0, 4).map((item) => String(item.id))
    const more = items.length > 4 ? ` (+${items.length - 4} more)` : ''
    return `${collection}: ${labels.join(', ')}${more}`
  })
}
