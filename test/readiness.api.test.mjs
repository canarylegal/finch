import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateSync } from 'otplib'
import { startTestServer } from './helpers.mjs'

describe('production-readiness regressions', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let server

  before(async () => {
    server = await startTestServer()
    await server.seedAdminWorkspace({
      adminEmail: 'ready-admin@example.com',
      adminPassword: 'ready-admin-password',
      employeeEmail: 'ready-employee@example.com',
      employeePassword: 'ready-employee-password',
    })
  })

  after(async () => {
    await server.stop()
  })

  test('enrolled TOTP under optional policy challenges password login', async () => {
    const login = await server.login('ready-admin@example.com', 'ready-admin-password')
    assert.equal(login.status, 200)
    assert.equal(login.payload.requires2fa, undefined)
    assert.ok(login.payload.account)
    let cookie = login.cookie

    const setup = await server.api('/api/auth/2fa/setup', {
      method: 'POST',
      cookie,
      body: {},
    })
    assert.equal(setup.status, 200)
    assert.ok(setup.payload.secret)

    const code = generateSync({ secret: setup.payload.secret })
    const confirm = await server.api('/api/auth/2fa/confirm', {
      method: 'POST',
      cookie,
      body: { code },
    })
    assert.equal(confirm.status, 200)
    assert.equal(confirm.payload.account.totpEnabled, true)

    await server.api('/api/auth/logout', { method: 'POST', cookie, body: {} })

    const challenge = await server.login('ready-admin@example.com', 'ready-admin-password')
    assert.equal(challenge.status, 200)
    assert.equal(challenge.payload.requires2fa, true)
    const pendingData = await server.api('/api/app-data', { cookie: challenge.cookie })
    assert.equal(pendingData.status, 401)
  })

  test('logout invalidates copied session cookie', async () => {
    // Fresh employee login (no MFA) so we hold a full account session cookie.
    const login = await server.login('ready-employee@example.com', 'ready-employee-password')
    assert.equal(login.status, 200)
    assert.ok(login.payload.account)
    const cookie = login.cookie

    const before = await server.api('/api/app-data', { cookie })
    assert.equal(before.status, 200)

    const logout = await server.api('/api/auth/logout', {
      method: 'POST',
      cookie,
      body: {},
    })
    assert.equal(logout.status, 200)

    const after = await server.api('/api/app-data', { cookie })
    assert.equal(after.status, 401)
  })

  test('employee amendment of approved leave persists', async () => {
    // Clear MFA from the prior optional-enrollment test so admin can save without a challenge.
    await server.patchStore((store) => {
      const admin = store.accounts.find((item) => item.email === 'ready-admin@example.com')
      if (admin) {
        admin.totpEnabled = false
        admin.totpSecret = null
        admin.totpPendingSecret = null
        admin.totpRecoveryHashes = []
        admin.sessionVersion = (admin.sessionVersion || 0) + 1
      }
    })

    const adminLogin = await server.login('ready-admin@example.com', 'ready-admin-password')
    assert.equal(adminLogin.status, 200)
    assert.ok(adminLogin.payload.account)
    const adminCookie = adminLogin.cookie

    const seeded = await server.putAppData(adminCookie, (data) => ({
      ...data,
      employees: [
        {
          id: 1,
          name: 'Ready Admin',
          initials: 'RA',
          role: 'Admin',
          entitlement: 25,
          entitlementUnit: 'days',
          rollOver: 0,
          workingDays: [1, 2, 3, 4, 5],
          entitlementMode: 'proRata',
          color: 'sage',
          status: 'Active',
          startDate: '2026-01-01',
          probationEndDate: null,
        },
        {
          id: 2,
          name: 'Ready Employee',
          initials: 'RE',
          role: 'Associate',
          entitlement: 25,
          entitlementUnit: 'days',
          rollOver: 0,
          workingDays: [1, 2, 3, 4, 5],
          entitlementMode: 'proRata',
          color: 'peach',
          status: 'Active',
          startDate: '2026-01-01',
          probationEndDate: null,
        },
      ],
      requests: [],
    }))
    assert.equal(seeded.status, 200)

    await server.patchStore((store) => {
      const employeeAccount = store.accounts.find(
        (item) => item.email === 'ready-employee@example.com',
      )
      assert.ok(employeeAccount)
      employeeAccount.employeeId = 2
      const adminAccount = store.accounts.find((item) => item.email === 'ready-admin@example.com')
      assert.ok(adminAccount)
      adminAccount.employeeId = 1
    })

    const employeeLogin = await server.login(
      'ready-employee@example.com',
      'ready-employee-password',
    )
    assert.equal(employeeLogin.status, 200)
    const employeeCookie = employeeLogin.cookie

    const submitted = await server.putAppData(employeeCookie, (data) => ({
      ...data,
      requests: [
        {
          id: 7001,
          employeeId: 2,
          type: 'Annual leave',
          start: '2026-07-01',
          end: '2026-07-02',
          days: 2,
          status: 'Pending',
          note: 'holiday',
        },
      ],
    }))
    assert.equal(submitted.status, 200)

    const approved = await server.putAppData(adminCookie, (data) => ({
      ...data,
      requests: (data.requests || []).map((item) =>
        item.employeeId === 2 && item.status === 'Pending'
          ? { ...item, status: 'Approved' }
          : item,
      ),
    }))
    assert.equal(approved.status, 200)

    const amended = await server.putAppData(employeeCookie, (data) => ({
      ...data,
      requests: (data.requests || []).map((item) =>
        item.employeeId === 2 && item.status === 'Approved'
          ? {
              ...item,
              pendingAmendment: {
                start: '2026-07-08',
                end: '2026-07-09',
                dates: '8–9 Jul 2026',
                days: 2,
                duration: '2 days',
                note: 'moved week',
                startHalf: 'full',
                endHalf: 'full',
                proposedAt: '2026-06-01T12:00:00.000Z',
              },
            }
          : item,
      ),
    }))
    assert.equal(amended.status, 200)

    const adminView = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(adminView.status, 200)
    const request = (adminView.payload.requests || []).find(
      (item) => item.employeeId === 2 && item.status === 'Approved',
    )
    assert.ok(request, 'approved leave must remain')
    assert.ok(request.pendingAmendment, 'pendingAmendment must persist for admin review')
    assert.equal(request.pendingAmendment.note, 'moved week')
    assert.equal(request.start, '2026-07-01')
  })
})
