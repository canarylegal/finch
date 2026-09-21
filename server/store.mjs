import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const STORE_PATH = path.join(DATA_DIR, 'finch-store.json')

let pool = null
let backend = 'json'

function databaseUrl() {
  return (process.env.DATABASE_URL || '').trim()
}

export function emptyCompany() {
  return {
    name: '',
    logoUrl: null,
    leaveYearStart: 'January',
    leaveYearEnd: 'December',
    leaveYearConfigured: false,
    leaveYearConfiguredAt: null,
    mandatoryLeaveConfirmations: [],
    defaultRollOver: false,
    defaultEntitlement: 25,
    defaultEntitlementUnit: 'days',
    defaultWorkingDays: [1, 2, 3, 4, 5],
    entitlementIncludesBankHolidays: false,
    emailNotifications: true,
    notificationEvents: {
      leaveRequestSubmitted: true,
      leaveRequestReviewed: true,
      expenseClaimSubmitted: true,
      expenseClaimReviewed: true,
      probationEnding: true,
      documentUpdated: true,
    },
    twoFactorRequired: 'admins',
    payrollEmail: '',
    autoSendPayrollReport: false,
    autoSendDayOfMonth: 3,
    lastAutoPayrollSentPeriodEnd: null,
    payPeriodStartDay: 10,
    bankHolidayRegion: 'england-wales',
    adminsCanApproveOwnRequests: false,
  }
}

export function emptyAppData() {
  return {
    employees: [],
    absences: [],
    company: emptyCompany(),
    bankHolidays: [],
    requests: [],
    portalMessages: [],
    documentFolders: [],
    employeeDocuments: [],
    expenseClaims: [],
    vatReceipts: [],
    taskDismissals: [],
    policies: [],
    leaveAdjustments: [],
    leaveYearClosures: [],
  }
}

export function defaultStore() {
  return {
    accounts: [],
    appData: emptyAppData(),
    nextAccountId: 1,
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
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
}

function writeJsonStore(store) {
  ensureJsonFile()
  const tmp = `${STORE_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, STORE_PATH)
}

async function ensurePostgresSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS finch_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function migrateJsonIntoPostgres(client) {
  const existing = await client.query('SELECT 1 FROM finch_store WHERE id = 1')
  if (existing.rowCount > 0) return false

  let payload = defaultStore()
  if (fs.existsSync(STORE_PATH)) {
    try {
      payload = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
      console.log('Migrating data/finch-store.json into Postgres')
    } catch (error) {
      console.warn('Could not read finch-store.json for migration:', error?.message || error)
    }
  }

  await client.query(
    `INSERT INTO finch_store (id, payload, updated_at) VALUES (1, $1::jsonb, NOW())`,
    [JSON.stringify(payload)],
  )
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
  if (backend === 'json' || !pool) {
    return readJsonStore()
  }

  const result = await pool.query('SELECT payload FROM finch_store WHERE id = 1')
  if (result.rowCount === 0) {
    const fresh = defaultStore()
    await writeStore(fresh)
    return fresh
  }
  return result.rows[0].payload
}

export async function writeStore(store) {
  if (backend === 'json' || !pool) {
    writeJsonStore(store)
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
      [JSON.stringify(store)],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
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
