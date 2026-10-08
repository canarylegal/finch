import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startTestServer } from './helpers.mjs'

describe('audit persistence (V1-F1)', () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>>} */
  let server
  let cookie = ''

  before(async () => {
    server = await startTestServer()
    await server.seedAdminWorkspace({
      adminEmail: 'race@example.com',
      adminPassword: 'race-password-12',
    })
    const login = await server.login('race@example.com', 'race-password-12')
    assert.equal(login.status, 200)
    assert.ok(login.payload.account)
    cookie = login.cookie
  })

  after(async () => {
    await server.stop()
  })

  test('concurrent app-data saves: one wins, retry keeps both audits', async () => {
    const base = await server.api('/api/app-data', { cookie })
    assert.equal(base.status, 200)
    const company = base.payload.company
    const revision = base.payload.revision

    const approvalAppend = [
      {
        id: 'aud-approval-race-1',
        at: '2026-09-22T00:45:00.000Z',
        action: 'expense.approved',
        summary: 'Race Admin approved expense for Cafe (£12.34)',
        entityType: 'expense_claim',
        entityId: 99,
      },
    ]
    const settingsAppend = [
      {
        id: 'aud-settings-race-1',
        at: '2026-09-22T00:46:00.000Z',
        action: 'settings.updated',
        summary: 'Race Admin updated organisation settings',
        entityType: 'company',
      },
    ]

    const [first, second] = await Promise.all([
      server.api('/api/app-data', {
        method: 'PUT',
        cookie,
        body: {
          ...base.payload,
          company,
          auditEvents: [],
          _auditAppend: approvalAppend,
          _revision: revision,
        },
      }),
      server.api('/api/app-data', {
        method: 'PUT',
        cookie,
        body: {
          ...base.payload,
          company: { ...company, payrollEmail: 'payroll@example.com' },
          auditEvents: [],
          _auditAppend: settingsAppend,
          _revision: revision,
        },
      }),
    ])
    assert.deepEqual([first.status, second.status].sort(), [200, 409])

    const loserWasSettings = second.status === 409
    const latest = await server.api('/api/app-data', { cookie })
    assert.equal(latest.status, 200)

    const retried = await server.api('/api/app-data', {
      method: 'PUT',
      cookie,
      body: {
        ...latest.payload,
        company: {
          ...latest.payload.company,
          ...(loserWasSettings ? { payrollEmail: 'payroll@example.com' } : {}),
        },
        auditEvents: [],
        _auditAppend: loserWasSettings ? settingsAppend : approvalAppend,
        _revision: latest.payload.revision,
      },
    })
    assert.equal(retried.status, 200)

    const after = await server.api('/api/app-data', { cookie })
    assert.equal(after.status, 200)
    const ids = (after.payload.auditEvents || []).map((item) => item.id)
    assert.ok(ids.includes('aud-approval-race-1'), 'approval audit must survive')
    assert.ok(ids.includes('aud-settings-race-1'), 'settings audit must be present')
  })
})
