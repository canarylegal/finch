import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
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

  return { baseUrl, api, cookieHeader, stop, dataDir }
}
