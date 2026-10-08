import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
    server.on('error', reject)
  })
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server at ${baseUrl} did not become healthy`)
}

export async function startTestServer(extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'finch-test-'))
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`

  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      FINCH_DATA_DIR: dataDir,
      DATABASE_URL: '',
      SESSION_SECRET: 'test-session-secret-32chars-min!!',
      MASTER_ADMIN_LOGIN: 'master-test-login',
      MASTER_ADMIN_PASSWORD: 'master-test-password',
      MASTER_ADMIN_REQUIRE_2FA: 'false',
      LOGIN_RATE_LIMIT: '1000',
      FORGOT_PASSWORD_RATE_LIMIT: '1000',
      SMTP_HOST: '',
      SMTP_FROM: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  child.stdout.on('data', () => {})

  const exitPromise = new Promise((resolve) => child.on('exit', resolve))

  try {
    await waitForHealth(baseUrl)
  } catch (error) {
    child.kill('SIGTERM')
    await exitPromise
    await rm(dataDir, { recursive: true, force: true })
    throw new Error(`${error.message}\n${stderr}`)
  }

  async function api(pathname, { method = 'GET', body, cookie } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (cookie) headers.Cookie = cookie
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = response.headers.getSetCookie?.() || []
    const legacy = response.headers.get('set-cookie')
    const cookies = setCookie.length ? setCookie : legacy ? [legacy] : []
    const payload = await response.json().catch(() => ({}))
    return { status: response.status, payload, cookies }
  }

  function cookieHeader(cookies) {
    return cookies
      .map((entry) => String(entry).split(';')[0])
      .filter(Boolean)
      .join('; ')
  }

  async function stop() {
    if (!child.killed) child.kill('SIGTERM')
    await exitPromise
    await rm(dataDir, { recursive: true, force: true })
  }

  async function patchStore(mutator) {
    const storePath = path.join(dataDir, 'finch-store.json')
    const store = JSON.parse(await readFile(storePath, 'utf8'))
    mutator(store)
    await writeFile(storePath, JSON.stringify(store, null, 2))
  }

  /** Create primary admin + optional employee; set 2FA policy optional for easier admin login. */
  async function seedAdminWorkspace({
    adminEmail = 'admin@example.com',
    adminPassword = 'admin-password-12',
    employeeEmail = '',
    employeePassword = 'employee-password-12',
  } = {}) {
    const master = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'master-test-login', password: 'master-test-password' },
    })
    const recoveryCookie = cookieHeader(master.cookies)
    const adminCreate = await api('/api/recovery/accounts', {
      method: 'POST',
      cookie: recoveryCookie,
      body: {
        email: adminEmail,
        displayName: 'Test Admin',
        password: adminPassword,
        role: 'admin',
        organisationName: 'Test Co',
      },
    })
    if (adminCreate.status !== 201) {
      throw new Error(`Failed to create admin: ${adminCreate.status}`)
    }
    const tenantId = adminCreate.payload.tenant?.id ?? adminCreate.payload.account?.tenantId
    if (employeeEmail) {
      const employeeCreate = await api('/api/recovery/accounts', {
        method: 'POST',
        cookie: recoveryCookie,
        body: {
          email: employeeEmail,
          displayName: 'Test Employee',
          password: employeePassword,
          role: 'employee',
          tenantId,
        },
      })
      if (employeeCreate.status !== 201) {
        throw new Error(`Failed to create employee: ${employeeCreate.status}`)
      }
    }
    await api('/api/auth/logout', { method: 'POST', cookie: recoveryCookie, body: {} })
    await patchStore((store) => {
      const admin = store.accounts.find((item) => item.email === adminEmail)
      const tenantId = admin?.tenantId
      if (tenantId == null) return
      store.appDataByTenant = store.appDataByTenant || {}
      const key = String(tenantId)
      store.appDataByTenant[key] = store.appDataByTenant[key] || {}
      store.appDataByTenant[key].company = {
        ...(store.appDataByTenant[key].company || {}),
        twoFactorRequired: 'optional',
        leaveYearConfigured: true,
        name: 'Test Co',
      }
    })
  }

  async function login(email, password) {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    return {
      ...result,
      cookie: cookieHeader(result.cookies),
    }
  }

  return { baseUrl, api, cookieHeader, stop, dataDir, patchStore, seedAdminWorkspace, login }
}
