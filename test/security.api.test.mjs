import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startTestServer } from './helpers.mjs'

describe('app-data authorization', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let server
  let adminCookie = ''
  let employeeCookie = ''

  before(async () => {
    server = await startTestServer()
    await server.seedAdminWorkspace({
      adminEmail: 'sec-admin@example.com',
      adminPassword: 'sec-admin-password',
      employeeEmail: 'sec-employee@example.com',
      employeePassword: 'sec-employee-password',
    })

    // Link employee profile + plant confidential document as admin.
    const adminLogin = await server.login('sec-admin@example.com', 'sec-admin-password')
    assert.equal(adminLogin.status, 200)
    adminCookie = adminLogin.cookie

    const seed = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: adminCookie,
      body: {
        company: {
          name: 'Secure Co',
          leaveYearConfigured: true,
          leaveYearStart: 'January',
          leaveYearEnd: 'December',
          payrollEmail: 'payroll@secure.test',
          twoFactorRequired: 'optional',
        },
        employees: [
          {
            id: 1,
            name: 'Test Admin',
            initials: 'TA',
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
            name: 'Test Employee',
            initials: 'TE',
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
        documentFolders: [
          {
            id: 10,
            employeeId: 2,
            name: 'Employment documents',
            visibility: 'shared',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 11,
            employeeId: 2,
            name: 'HR file',
            visibility: 'internal',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        employeeDocuments: [
          {
            id: 100,
            employeeId: 2,
            folderId: 10,
            title: 'Contract',
            category: 'contract',
            fileName: 'contract.txt',
            fileType: 'text/plain',
            fileDataUrl: 'data:text/plain;base64,c2hhcmVk',
            updatedAt: '2026-01-01T00:00:00.000Z',
            accent: 'sage',
          },
          {
            id: 101,
            employeeId: 2,
            folderId: 11,
            title: 'Confidential review',
            category: 'other',
            fileName: 'secret.txt',
            fileType: 'text/plain',
            fileDataUrl: 'data:text/plain;base64,c2VjcmV0',
            updatedAt: '2026-01-01T00:00:00.000Z',
            accent: 'coral',
          },
        ],
        absences: [],
        bankHolidays: [],
        requests: [],
        portalMessages: [],
        expenseClaims: [],
        vatReceipts: [{ id: 1, label: 'admin-only' }],
        taskDismissals: [],
        policies: [],
        leaveAdjustments: [],
        leaveYearClosures: [],
        auditEvents: [],
        _auditAppend: [
          {
            id: 'aud-seed-1',
            at: '2026-01-01T00:00:00.000Z',
            action: 'settings.updated',
            summary: 'seed',
            entityType: 'company',
          },
        ],
      },
    })
    assert.equal(seed.status, 200)

    // Link employee account to employee id 2
    await server.patchStore((store) => {
      const employeeAccount = store.accounts.find((item) => item.email === 'sec-employee@example.com')
      assert.ok(employeeAccount)
      employeeAccount.employeeId = 2
      const adminAccount = store.accounts.find((item) => item.email === 'sec-admin@example.com')
      assert.ok(adminAccount)
      adminAccount.employeeId = 1
    })

    const employeeLogin = await server.login('sec-employee@example.com', 'sec-employee-password')
    assert.equal(employeeLogin.status, 200)
    employeeCookie = employeeLogin.cookie
  })

  after(async () => {
    await server.stop()
  })

  test('employee cannot read internal documents or other privileged collections', async () => {
    const result = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(result.status, 200)

    const folders = result.payload.documentFolders || []
    const docs = result.payload.employeeDocuments || []
    assert.equal(folders.some((folder) => folder.visibility === 'internal'), false)
    assert.equal(
      docs.some((doc) => doc.title === 'Confidential review' || doc.id === 101),
      false,
    )
    assert.ok(docs.some((doc) => doc.id === 100), 'shared own document remains visible')

    assert.deepEqual(result.payload.vatReceipts, [])
    assert.deepEqual(result.payload.auditEvents, [])
    assert.equal(result.payload.company?.payrollEmail, '')
    assert.equal((result.payload.employees || []).length, 1)
    assert.equal(result.payload.employees[0].id, 2)
    assert.equal((result.payload.accounts || []).length, 1)
    assert.equal(result.payload.accounts[0].email, 'sec-employee@example.com')
  })

  test('employee cannot change company settings or rewrite audit events', async () => {
    const beforeAdmin = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(beforeAdmin.status, 200)
    const beforePayroll = beforeAdmin.payload.company.payrollEmail
    const beforeAudit = beforeAdmin.payload.auditEvents || []

    const employeeView = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(employeeView.status, 200)

    const attack = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        company: {
          ...employeeView.payload.company,
          name: 'Hijacked Co',
          payrollEmail: 'attacker@evil.test',
        },
        auditEvents: [
          {
            id: 'aud-seed-1',
            at: '2026-01-01T00:00:00.000Z',
            actorAccountId: 2,
            actorName: 'Attacker',
            action: 'settings.updated',
            summary: 'rewritten',
            entityType: 'company',
          },
        ],
        _auditAppend: [
          {
            id: 'aud-forged-1',
            at: '2026-01-02T00:00:00.000Z',
            action: 'settings.updated',
            summary: 'forged',
            entityType: 'company',
          },
        ],
        vatReceipts: [{ id: 99, label: 'should-not-stick' }],
      },
    })
    assert.equal(attack.status, 200)

    const afterAdmin = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(afterAdmin.status, 200)
    assert.equal(afterAdmin.payload.company.name, 'Secure Co')
    assert.equal(afterAdmin.payload.company.payrollEmail, beforePayroll)
    assert.equal(
      (afterAdmin.payload.vatReceipts || []).some((item) => item.id === 99),
      false,
    )
    const audit = afterAdmin.payload.auditEvents || []
    assert.ok(audit.some((item) => item.id === 'aud-seed-1' && item.summary === 'seed'))
    assert.equal(audit.some((item) => item.id === 'aud-forged-1'), false)
    assert.equal(beforeAudit.length <= audit.length, true)
  })

  test('employee cannot re-share an internal folder id to expose HR documents', async () => {
    const employeeView = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(employeeView.status, 200)
    assert.equal(
      (employeeView.payload.employeeDocuments || []).some((doc) => doc.id === 101),
      false,
    )

    const attack = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        documentFolders: [
          {
            id: 11,
            employeeId: 2,
            name: 'HR file',
            visibility: 'shared',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        employeeDocuments: employeeView.payload.employeeDocuments || [],
      },
    })
    assert.equal(attack.status, 200)

    const afterEmployee = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(afterEmployee.status, 200)
    assert.equal(
      (afterEmployee.payload.documentFolders || []).some((folder) => folder.id === 11),
      false,
    )
    assert.equal(
      (afterEmployee.payload.employeeDocuments || []).some(
        (doc) => doc.id === 101 || doc.title === 'Confidential review',
      ),
      false,
    )

    const afterAdmin = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(afterAdmin.status, 200)
    const internal = (afterAdmin.payload.documentFolders || []).find((folder) => folder.id === 11)
    assert.ok(internal)
    assert.equal(internal.visibility, 'internal')
  })

  test('employee cannot steal another employee request id to read their messages', async () => {
    // Add a second employee with a pending request + private thread.
    const adminView = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(adminView.status, 200)
    const seeded = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: adminCookie,
      body: {
        ...adminView.payload,
        employees: [
          ...(adminView.payload.employees || []),
          {
            id: 3,
            name: 'Other Employee',
            initials: 'OE',
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
        requests: [
          ...(adminView.payload.requests || []),
          {
            id: 501,
            employeeId: 3,
            type: 'Annual leave',
            start: '2026-06-01',
            end: '2026-06-02',
            days: 2,
            status: 'Pending',
            note: 'private trip',
          },
        ],
        portalMessages: [
          ...(adminView.payload.portalMessages || []),
          {
            id: 9001,
            employeeId: 3,
            requestId: 501,
            author: 'employee',
            authorName: 'Other Employee',
            body: 'secret conversation about medical leave',
            createdAt: '2026-05-01T10:00:00.000Z',
          },
        ],
      },
    })
    assert.equal(seeded.status, 200)

    const employeeView = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(employeeView.status, 200)
    assert.equal(
      (employeeView.payload.portalMessages || []).some((message) => message.id === 9001),
      false,
    )

    const attack = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        requests: [
          {
            id: 501,
            employeeId: 2,
            type: 'Annual leave',
            start: '2026-07-01',
            end: '2026-07-01',
            days: 1,
            status: 'Pending',
            note: 'spoof',
          },
        ],
        portalMessages: employeeView.payload.portalMessages || [],
      },
    })
    assert.equal(attack.status, 200)

    const afterEmployee = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(afterEmployee.status, 200)
    // Collision is remapped to a fresh id — submission is kept, victim id is not claimed.
    assert.equal(
      (afterEmployee.payload.requests || []).some((request) => request.id === 501),
      false,
    )
    assert.ok(
      (afterEmployee.payload.requests || []).some(
        (request) => request.employeeId === 2 && request.note === 'spoof',
      ),
    )
    assert.ok(Array.isArray(attack.payload.idRemap?.requests))
    assert.ok(attack.payload.idRemap.requests.some((item) => item.from === 501 && item.to !== 501))
    assert.equal(
      (afterEmployee.payload.portalMessages || []).some(
        (message) =>
          message.id === 9001 ||
          String(message.body || '').includes('secret conversation'),
      ),
      false,
    )

    const afterAdmin = await server.api('/api/app-data', { cookie: adminCookie })
    assert.equal(afterAdmin.status, 200)
    const victimRequest = (afterAdmin.payload.requests || []).find((request) => request.id === 501)
    assert.ok(victimRequest)
    assert.equal(victimRequest.employeeId, 3)
    assert.ok(
      (afterAdmin.payload.portalMessages || []).some((message) => message.id === 9001),
    )
  })

  test('stale employee save does not delete a pending expense created elsewhere', async () => {
    const employeeView = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(employeeView.status, 200)

    // Tab A creates a pending expense.
    const created = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        expenseClaims: [
          ...(employeeView.payload.expenseClaims || []),
          {
            id: 8801,
            employeeId: 2,
            status: 'Pending',
            title: 'tab-a expense',
            amount: 15,
            date: '2026-09-10',
          },
        ],
      },
    })
    assert.equal(created.status, 200)
    assert.ok(
      (created.payload.data.expenseClaims || []).some(
        (claim) => claim.title === 'tab-a expense' || claim.id === 8801,
      ),
    )

    // Tab B saves an older snapshot that omits that expense — must not delete it.
    const stale = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        expenseClaims: employeeView.payload.expenseClaims || [],
      },
    })
    assert.equal(stale.status, 200)

    const after = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(after.status, 200)
    assert.ok(
      (after.payload.expenseClaims || []).some(
        (claim) => claim.title === 'tab-a expense' || claim.id === 8801,
      ),
      'pending expense from other tab must survive stale save',
    )
  })

  test('employee leave/expense creates colliding with another id are remapped and returned', async () => {
    const adminView = await server.api('/api/app-data', { cookie: adminCookie })
    const seeded = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: adminCookie,
      body: {
        ...adminView.payload,
        requests: [
          ...(adminView.payload.requests || []).filter((item) => item.employeeId !== 2),
          {
            id: 1,
            employeeId: 1,
            type: 'Annual leave',
            start: '2026-08-01',
            end: '2026-08-01',
            days: 1,
            status: 'Pending',
            note: 'admin owned id 1',
          },
        ],
        expenseClaims: [
          ...(adminView.payload.expenseClaims || []).filter((item) => item.employeeId !== 2),
          {
            id: 1,
            employeeId: 1,
            status: 'Pending',
            title: 'admin expense',
            amount: 10,
            date: '2026-08-01',
          },
        ],
      },
    })
    assert.equal(seeded.status, 200)

    const employeeView = await server.api('/api/app-data', { cookie: employeeCookie })
    assert.equal(employeeView.status, 200)

    const create = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: employeeCookie,
      body: {
        ...employeeView.payload,
        requests: [
          {
            id: 1,
            employeeId: 2,
            type: 'Annual leave',
            start: '2026-09-01',
            end: '2026-09-01',
            days: 1,
            status: 'Pending',
            note: 'employee leave',
          },
        ],
        expenseClaims: [
          {
            id: 1,
            employeeId: 2,
            status: 'Pending',
            title: 'employee expense',
            amount: 22,
            date: '2026-09-01',
          },
        ],
      },
    })
    assert.equal(create.status, 200)
    assert.ok(create.payload.data)
    assert.ok(
      (create.payload.data.requests || []).some(
        (request) => request.note === 'employee leave' && request.id !== 1,
      ),
    )
    assert.ok(
      (create.payload.data.expenseClaims || []).some(
        (claim) => claim.title === 'employee expense' && claim.id !== 1,
      ),
    )
    assert.ok(create.payload.idRemap.requests.some((item) => item.from === 1))
    assert.ok(create.payload.idRemap.expenseClaims.some((item) => item.from === 1))

    const adminAfter = await server.api('/api/app-data', { cookie: adminCookie })
    assert.ok(
      (adminAfter.payload.requests || []).some(
        (request) => request.id === 1 && request.employeeId === 1,
      ),
    )
    assert.ok(
      (adminAfter.payload.expenseClaims || []).some(
        (claim) => claim.id === 1 && claim.employeeId === 1,
      ),
    )
  })

  test('password change revokes previous sessions', async () => {
    const secondLogin = await server.login('sec-employee@example.com', 'sec-employee-password')
    assert.equal(secondLogin.status, 200)
    const oldCookie = secondLogin.cookie

    const changed = await server.api('/api/auth/change-password', {
      method: 'POST',
      cookie: employeeCookie,
      body: {
        currentPassword: 'sec-employee-password',
        newPassword: 'sec-employee-password-2',
      },
    })
    assert.equal(changed.status, 200)
    // Caller receives a refreshed session cookie.
    const freshCookie = server.cookieHeader(changed.cookies) || employeeCookie

    const stale = await server.api('/api/app-data', { cookie: oldCookie })
    assert.equal(stale.status, 401)

    const fresh = await server.api('/api/app-data', { cookie: freshCookie })
    assert.equal(fresh.status, 200)

    employeeCookie = freshCookie
  })
})

describe('multi-tenant isolation', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let server

  before(async () => {
    server = await startTestServer()
  })

  after(async () => {
    await server.stop()
  })

  test('organisations cannot read or write each other app data', async () => {
    const alphaSignup = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'alpha-admin@example.com',
        displayName: 'Alpha Admin',
        password: 'alpha-password-12',
        companyName: 'Alpha Ltd',
      },
    })
    assert.equal(alphaSignup.status, 201)
    const alphaCookie = server.cookieHeader(alphaSignup.cookies)
    const alphaTenantId = alphaSignup.payload.account.tenantId
    assert.ok(alphaTenantId)

    const betaSignup = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'beta-admin@example.com',
        displayName: 'Beta Admin',
        password: 'beta-password-12',
        companyName: 'Beta Ltd',
      },
    })
    assert.equal(betaSignup.status, 201)
    const betaCookie = server.cookieHeader(betaSignup.cookies)
    const betaTenantId = betaSignup.payload.account.tenantId
    assert.ok(betaTenantId)
    assert.notEqual(alphaTenantId, betaTenantId)

    const alphaSeed = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: alphaCookie,
      body: {
        company: {
          name: 'Alpha Ltd',
          leaveYearConfigured: true,
          leaveYearStart: 'January',
          leaveYearEnd: 'December',
          payrollEmail: 'payroll@alpha.test',
          twoFactorRequired: 'optional',
        },
        employees: [
          {
            id: 1,
            name: 'Alpha Admin',
            initials: 'AA',
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
        ],
        documentFolders: [],
        employeeDocuments: [],
        absences: [],
        bankHolidays: [],
        requests: [],
        portalMessages: [],
        expenseClaims: [],
        vatReceipts: [{ id: 1, label: 'alpha-secret' }],
        taskDismissals: [],
        policies: [],
        leaveAdjustments: [],
        leaveYearClosures: [],
        auditEvents: [],
      },
    })
    assert.equal(alphaSeed.status, 200)

    const betaView = await server.api('/api/app-data', { cookie: betaCookie })
    assert.equal(betaView.status, 200)
    assert.equal(betaView.payload.company?.name, 'Beta Ltd')
    assert.notEqual(betaView.payload.company?.payrollEmail, 'payroll@alpha.test')
    assert.deepEqual(betaView.payload.vatReceipts, [])
    assert.equal((betaView.payload.employees || []).length, 0)
    assert.equal(
      (betaView.payload.accounts || []).some((item) => item.email === 'alpha-admin@example.com'),
      false,
    )

    const betaOverwrite = await server.api('/api/app-data', {
      method: 'PUT',
      cookie: betaCookie,
      body: {
        ...betaView.payload,
        company: {
          ...(betaView.payload.company || {}),
          name: 'Beta Ltd',
          leaveYearConfigured: true,
          leaveYearStart: 'January',
          leaveYearEnd: 'December',
          payrollEmail: 'payroll@beta.test',
          twoFactorRequired: 'optional',
        },
        vatReceipts: [{ id: 2, label: 'beta-only' }],
      },
    })
    assert.equal(betaOverwrite.status, 200)

    const alphaAfter = await server.api('/api/app-data', { cookie: alphaCookie })
    assert.equal(alphaAfter.status, 200)
    assert.equal(alphaAfter.payload.company.name, 'Alpha Ltd')
    assert.equal(alphaAfter.payload.company.payrollEmail, 'payroll@alpha.test')
    assert.ok((alphaAfter.payload.vatReceipts || []).some((item) => item.label === 'alpha-secret'))
    assert.equal(
      (alphaAfter.payload.vatReceipts || []).some((item) => item.label === 'beta-only'),
      false,
    )
    assert.equal(
      (alphaAfter.payload.accounts || []).some((item) => item.email === 'beta-admin@example.com'),
      false,
    )
  })

  test('password change cannot overwrite a concurrent signup', async () => {
    const alphaSignup = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'stale-alpha@example.com',
        displayName: 'Stale Alpha',
        password: 'stale-password-a1',
        companyName: 'Stale Alpha Ltd',
      },
    })
    assert.equal(alphaSignup.status, 201)
    const alphaCookie = server.cookieHeader(alphaSignup.cookies)

    // Begin password change auth against the pre-signup world, then race a signup.
    const [passwordChange, betaSignup] = await Promise.all([
      server.api('/api/auth/change-password', {
        method: 'POST',
        cookie: alphaCookie,
        body: {
          currentPassword: 'stale-password-a1',
          newPassword: 'stale-password-a2',
        },
      }),
      server.api('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'stale-beta@example.com',
          displayName: 'Stale Beta',
          password: 'stale-password-b1',
          companyName: 'Stale Beta Ltd',
        },
      }),
    ])
    assert.equal(passwordChange.status, 200)
    assert.equal(betaSignup.status, 201)

    const betaCookie = server.cookieHeader(betaSignup.cookies)
    const betaData = await server.api('/api/app-data', { cookie: betaCookie })
    assert.equal(betaData.status, 200)
    assert.equal(betaData.payload.company?.name, 'Stale Beta Ltd')

    // A later signup must not reuse beta's identities.
    const gammaSignup = await server.api('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'stale-gamma@example.com',
        displayName: 'Stale Gamma',
        password: 'stale-password-c1',
        companyName: 'Stale Gamma Ltd',
      },
    })
    assert.equal(gammaSignup.status, 201)
    assert.notEqual(gammaSignup.payload.account.id, betaSignup.payload.account.id)
    assert.notEqual(gammaSignup.payload.account.tenantId, betaSignup.payload.account.tenantId)

    const betaStill = await server.api('/api/app-data', { cookie: betaCookie })
    assert.equal(betaStill.status, 200)
    assert.equal(betaStill.payload.company?.name, 'Stale Beta Ltd')
  })

  test('concurrent signups allocate distinct tenants and keep sessions isolated', async () => {
    const [first, second] = await Promise.all([
      server.api('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'race-a@example.com',
          displayName: 'Race A',
          password: 'race-password-a1',
          companyName: 'Race A Ltd',
        },
      }),
      server.api('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'race-b@example.com',
          displayName: 'Race B',
          password: 'race-password-b1',
          companyName: 'Race B Ltd',
        },
      }),
    ])
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.notEqual(first.payload.account.id, second.payload.account.id)
    assert.notEqual(first.payload.account.tenantId, second.payload.account.tenantId)
    assert.notEqual(first.payload.tenant.id, second.payload.tenant.id)

    const firstCookie = server.cookieHeader(first.cookies)
    const secondCookie = server.cookieHeader(second.cookies)
    const firstData = await server.api('/api/app-data', { cookie: firstCookie })
    const secondData = await server.api('/api/app-data', { cookie: secondCookie })
    assert.equal(firstData.status, 200)
    assert.equal(secondData.status, 200)
    assert.equal(firstData.payload.company?.name, 'Race A Ltd')
    assert.equal(secondData.payload.company?.name, 'Race B Ltd')
  })

  test('legacy single-tenant store migrates on read', async () => {
    await server.patchStore((store) => {
      // Force legacy v1 shape; next server read should normalize.
      delete store.storeVersion
      delete store.tenants
      delete store.nextTenantId
      delete store.appDataByTenant
      store.appData = {
        company: {
          name: 'Legacy Firm',
          leaveYearConfigured: true,
          twoFactorRequired: 'optional',
        },
        employees: [],
        documentFolders: [],
        employeeDocuments: [],
        absences: [],
        bankHolidays: [],
        requests: [],
        portalMessages: [],
        expenseClaims: [],
        vatReceipts: [],
        taskDismissals: [],
        policies: [],
        leaveAdjustments: [],
        leaveYearClosures: [],
        auditEvents: [],
      }
      for (const account of store.accounts || []) {
        delete account.tenantId
      }
    })

    const login = await server.login('alpha-admin@example.com', 'alpha-password-12')
    assert.equal(login.status, 200)
    assert.equal(login.payload.mustSetup2fa, undefined)
    assert.ok(login.payload.account.tenantId)

    const data = await server.api('/api/app-data', { cookie: login.cookie })
    assert.equal(data.status, 200)
    assert.equal(data.payload.company?.name, 'Legacy Firm')
  })
})
