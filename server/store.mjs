import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { emptyAppData, emptyCompany } from './appDataShape.mjs'
import { normalizeStore } from './tenants.mjs'

export { emptyAppData, emptyCompany }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.resolve(
  (process.env.FINCH_DATA_DIR || '').trim() || path.join(ROOT, 'data'),
)
const STORE_PATH = path.join(DATA_DIR, 'finch-store.json')

let pool = null
let backend = 'json'
/** Serialize read-modify-write so concurrent API handlers cannot clobber each other. */
let storeGate = Promise.resolve()

function withStoreGate(work) {
  const run = storeGate.then(work, work)
  storeGate = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function databaseUrl() {
  return (process.env.DATABASE_URL || '').trim()
}

export function defaultStore() {
  return {
    storeVersion: 2,
    nextTenantId: 1,
    nextAccountId: 1,
    tenants: [],
    accounts: [],
    appDataByTenant: {},
  }
}

function ensureJsonFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultStore(), null, 2))
  }
}

function readJsonStore() {
  ensureJsonFile()
  return normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')))
}

function writeJsonStore(store) {
  ensureJsonFile()
  const tmp = `${STORE_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, STORE_PATH)
}

function assertAccountEmailUniqueness(store) {
  const seen = new Set()
  for (const account of store.accounts || []) {
    const email = String(account?.email || '')
      .trim()
      .toLowerCase()
    if (!email) continue
    if (seen.has(email)) {
      const error = new Error(`Duplicate account email: ${email}`)
      error.code = 'duplicate_email'
      throw error
    }
    seen.add(email)
  }
}

async function ensurePostgresSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS finch_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS finch_account_emails (
      email TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL
    )
  `)
}

async function syncAccountEmailLedger(client, store) {
  assertAccountEmailUniqueness(store)
  await client.query('DELETE FROM finch_account_emails')
  for (const account of store.accounts || []) {
    const email = String(account?.email || '')
      .trim()
      .toLowerCase()
    if (!email) continue
    await client.query(
      `INSERT INTO finch_account_emails (email, account_id, tenant_id)
       VALUES ($1, $2, $3)`,
      [email, Number(account.id), Number(account.tenantId)],
    )
  }
}

async function migrateJsonIntoPostgres(client) {
  const existing = await client.query('SELECT 1 FROM finch_store WHERE id = 1')
  if (existing.rowCount > 0) return false

  let payload = defaultStore()
  if (fs.existsSync(STORE_PATH)) {
    try {
      payload = normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')))
      console.log('Migrating data/finch-store.json into Postgres')
    } catch (error) {
      console.warn('Could not read finch-store.json for migration:', error?.message || error)
    }
  }

  await client.query(
    `INSERT INTO finch_store (id, payload, updated_at) VALUES (1, $1::jsonb, NOW())`,
    [JSON.stringify(payload)],
  )
  await syncAccountEmailLedger(client, payload)
  return true
}

export async function initStore() {
  const DATABASE_URL = databaseUrl()
  if (!DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required when NODE_ENV=production')
    }
    backend = 'json'
    ensureJsonFile()
    console.log('Store backend: JSON file (set DATABASE_URL for Postgres)')
    return { backend }
  }

  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 10),
  })
  const client = await pool.connect()
  try {
    await ensurePostgresSchema(client)
    await migrateJsonIntoPostgres(client)
  } finally {
    client.release()
  }
  backend = 'postgres'
  console.log('Store backend: Postgres')
  return { backend }
}

export function getStoreBackend() {
  return backend
}

export async function readStore() {
  return readStoreUnlocked()
}

async function readStoreUnlocked() {
  if (backend === 'json' || !pool) {
    return readJsonStore()
  }

  const result = await pool.query('SELECT payload FROM finch_store WHERE id = 1')
  if (result.rowCount === 0) {
    const fresh = defaultStore()
    await writeStoreUnlocked(fresh)
    return fresh
  }
  return normalizeStore(result.rows[0].payload)
}

export async function writeStore(store) {
  return withStoreGate(async () => writeStoreUnlocked(store))
}

async function writeStoreUnlocked(store) {
  const normalized = normalizeStore(store)
  assertAccountEmailUniqueness(normalized)

  if (backend === 'json' || !pool) {
    writeJsonStore(normalized)
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO finch_store (id, payload, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(normalized)],
    )
    await syncAccountEmailLedger(client, normalized)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Atomically read, mutate, and write the store.
 * Prefer this over readStore()+writeStore() when concurrent requests may race.
 * Postgres path locks the store row for the duration of the mutation.
 */
export async function updateStore(mutator) {
  return withStoreGate(async () => {
    if (backend === 'json' || !pool) {
      const store = await readStoreUnlocked()
      const result = await mutator(store)
      await writeStoreUnlocked(store)
      return result
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        'SELECT payload FROM finch_store WHERE id = 1 FOR UPDATE',
      )
      let store
      if (result.rowCount === 0) {
        store = defaultStore()
      } else {
        store = normalizeStore(result.rows[0].payload)
      }
      const mutationResult = await mutator(store)
      const normalized = normalizeStore(store)
      assertAccountEmailUniqueness(normalized)
      await client.query(
        `INSERT INTO finch_store (id, payload, updated_at)
         VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [JSON.stringify(normalized)],
      )
      await syncAccountEmailLedger(client, normalized)
      await client.query('COMMIT')
      return mutationResult
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
}

export async function closeStore() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export function jsonStorePath() {
  return STORE_PATH
}

export function dataDir() {
  return DATA_DIR
}
