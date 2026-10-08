import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateSync } from 'otplib'
import { startTestServer } from './helpers.mjs'

describe('Finch auth API', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let server
  /** @type {string} */
  let totpSecret = ''

  before(async () => {
    server = await startTestServer()
  })

  after(async () => {
    await server.stop()
  })

  test('health reports json store', async () => {
    const result = await server.api('/api/health')
    assert.equal(result.status, 200)
    assert.equal(result.payload.ok, true)
    assert.equal(result.payload.store, 'json')
  })

  test('master recovery creates primary admin', async () => {
    const login = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'master-test-login', password: 'master-test-password' },
    })
    assert.equal(login.status, 200)
    assert.equal(login.payload.recovery, true)
    const recoveryCookie = server.cookieHeader(login.cookies)

    const created = await server.api('/api/recovery/accounts', {
      method: 'POST',
      cookie: recoveryCookie,
      body: {
        email: 'admin@example.com',
        displayName: 'Primary Admin',
        password: 'initial-password-1',
        role: 'admin',
        organisationName: 'Test Co',
      },
    })
    assert.equal(created.status, 201)
    assert.equal(created.payload.account.isPrimary, true)
    assert.ok(created.payload.account.tenantId)
    assert.ok(created.payload.tenant?.id)

    const employee = await server.api('/api/recovery/accounts', {
      method: 'POST',
      cookie: recoveryCookie,
      body: {
        email: 'employee@example.com',
        displayName: 'Employee User',
        password: 'employee-password-1',
        role: 'employee',
        tenantId: created.payload.tenant.id,
      },
    })
    assert.equal(employee.status, 201)
    assert.equal(employee.payload.account.role, 'employee')
    assert.equal(employee.payload.account.tenantId, created.payload.tenant.id)

    await server.api('/api/auth/logout', { method: 'POST', cookie: recoveryCookie, body: {} })
  })

  test('employee can change password while signed in', async () => {
    const login = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'employee@example.com', password: 'employee-password-1' },
    })
    assert.equal(login.status, 200)
    assert.ok(login.payload.account)
    const cookie = server.cookieHeader(login.cookies)

    const tooShort = await server.api('/api/auth/change-password', {
      method: 'POST',
      cookie,
      body: { currentPassword: 'employee-password-1', newPassword: 'short' },
    })
    assert.equal(tooShort.status, 400)

    const wrongCurrent = await server.api('/api/auth/change-password', {
      method: 'POST',
      cookie,
      body: { currentPassword: 'not-the-password', newPassword: 'employee-password-2' },
    })
    assert.equal(wrongCurrent.status, 401)

    const changed = await server.api('/api/auth/change-password', {
      method: 'POST',
      cookie,
      body: { currentPassword: 'employee-password-1', newPassword: 'employee-password-2' },
    })
    assert.equal(changed.status, 200)
    assert.equal(changed.payload.ok, true)

    await server.api('/api/auth/logout', { method: 'POST', cookie, body: {} })

    const oldLogin = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'employee@example.com', password: 'employee-password-1' },
    })
    assert.equal(oldLogin.status, 401)

    const newLogin = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'employee@example.com', password: 'employee-password-2' },
    })
    assert.equal(newLogin.status, 200)
    assert.ok(newLogin.payload.account)
  })

  test('forgot-password requires SMTP', async () => {
    const result = await server.api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'employee@example.com' },
    })
    assert.equal(result.status, 503)
    assert.match(String(result.payload.error || ''), /email is not configured/i)
  })

  test('password-setup rejects invalid token', async () => {
    const result = await server.api('/api/auth/password-setup?token=not-a-real-token')
    assert.equal(result.status, 400)
  })

  test('signup creates a separate organisation', async () => {
    const result = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'newadmin@example.com',
        displayName: 'New Admin',
        password: 'signup-password-1',
        companyName: 'Second Co',
      },
    })
    assert.equal(result.status, 201)
    assert.equal(result.payload.account.email, 'newadmin@example.com')
    assert.ok(result.payload.tenant?.id)
    assert.notEqual(result.payload.account.tenantId, undefined)
  })

  test('signup rejects duplicate email across organisations', async () => {
    const result = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'admin@example.com',
        displayName: 'Dup Admin',
        password: 'signup-password-2',
        companyName: 'Dup Co',
      },
    })
    assert.equal(result.status, 409)
  })

  test('admin must enrol TOTP then can verify on next login', async () => {
    const login = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'initial-password-1' },
    })
    assert.equal(login.status, 200)
    assert.equal(login.payload.mustSetup2fa, true)
    let cookie = server.cookieHeader(login.cookies)

    const setup = await server.api('/api/auth/2fa/setup', {
      method: 'POST',
      cookie,
      body: {},
    })
    assert.equal(setup.status, 200)
    assert.ok(setup.payload.secret)
    totpSecret = setup.payload.secret

    const code = generateSync({ secret: totpSecret })
    const confirm = await server.api('/api/auth/2fa/confirm', {
      method: 'POST',
      cookie,
      body: { code },
    })
    assert.equal(confirm.status, 200)
    assert.equal(confirm.payload.account.totpEnabled, true)
    assert.ok(confirm.payload.recoveryCodes.length > 0)
    cookie = server.cookieHeader(confirm.cookies) || cookie

    await server.api('/api/auth/logout', { method: 'POST', cookie, body: {} })

    const challenge = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'initial-password-1' },
    })
    assert.equal(challenge.status, 200)
    assert.equal(challenge.payload.requires2fa, true)
    const pendingCookie = server.cookieHeader(challenge.cookies)

    const badCode = await server.api('/api/auth/2fa/verify', {
      method: 'POST',
      cookie: pendingCookie,
      body: { code: '000000' },
    })
    assert.equal(badCode.status, 401)

    const totp = generateSync({ secret: totpSecret })
    const verified = await server.api('/api/auth/2fa/verify', {
      method: 'POST',
      cookie: pendingCookie,
      body: { code: totp },
    })
    assert.equal(verified.status, 200)
    assert.ok(verified.payload.account)
  })

  test('recovery can clear MFA and reset password', async () => {
    const master = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'master-test-login', password: 'master-test-password' },
    })
    assert.equal(master.status, 200)
    const recoveryCookie = server.cookieHeader(master.cookies)

    const tenants = await server.api('/api/recovery/tenants', { cookie: recoveryCookie })
    assert.equal(tenants.status, 200)
    const tenant = tenants.payload.tenants.find((item) => item.name === 'Test Co')
    assert.ok(tenant)

    const list = await server.api(
      `/api/recovery/accounts?tenantId=${encodeURIComponent(String(tenant.id))}`,
      { cookie: recoveryCookie },
    )
    assert.equal(list.status, 200)
    const admin = list.payload.accounts.find((item) => item.email === 'admin@example.com')
    assert.ok(admin)
    assert.equal(admin.totpEnabled, true)

    const cleared = await server.api(`/api/recovery/accounts/${admin.id}`, {
      method: 'PATCH',
      cookie: recoveryCookie,
      body: { clearTwoFactor: true, clearPasskeys: true, password: 'recovery-reset-99' },
    })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.payload.account.totpEnabled, false)

    await server.api('/api/auth/logout', { method: 'POST', cookie: recoveryCookie, body: {} })

    const login = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'recovery-reset-99' },
    })
    assert.equal(login.status, 200)
    assert.equal(login.payload.mustSetup2fa, true)
  })

  test('recovery can delete a non-primary account', async () => {
    const master = await server.api('/api/auth/login', {
      method: 'POST',
      body: { email: 'master-test-login', password: 'master-test-password' },
    })
    const recoveryCookie = server.cookieHeader(master.cookies)
    const tenants = await server.api('/api/recovery/tenants', { cookie: recoveryCookie })
    const tenant = tenants.payload.tenants.find((item) => item.name === 'Test Co')
    assert.ok(tenant)

    const list = await server.api(
      `/api/recovery/accounts?tenantId=${encodeURIComponent(String(tenant.id))}`,
      { cookie: recoveryCookie },
    )
    const employee = list.payload.accounts.find((item) => item.email === 'employee@example.com')
    assert.ok(employee)

    const deleted = await server.api(`/api/recovery/accounts/${employee.id}`, {
      method: 'DELETE',
      cookie: recoveryCookie,
    })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.payload.ok, true)

    const after = await server.api(
      `/api/recovery/accounts?tenantId=${encodeURIComponent(String(tenant.id))}`,
      { cookie: recoveryCookie },
    )
    assert.equal(
      after.payload.accounts.some((item) => item.email === 'employee@example.com'),
      false,
    )
  })
})
