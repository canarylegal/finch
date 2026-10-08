import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { normalizeStore, STORE_VERSION } from '../server/tenants.mjs'

describe('normalizeStore multi-tenant migration', () => {
  test('upgrades legacy v1 store into tenants + appDataByTenant', () => {
    const legacy = {
      nextAccountId: 3,
      accounts: [
        {
          id: 1,
          email: 'admin@legacy.test',
          displayName: 'Admin',
          role: 'admin',
          isPrimary: true,
          status: 'Active',
        },
        {
          id: 2,
          email: 'staff@legacy.test',
          displayName: 'Staff',
          role: 'employee',
          status: 'Active',
        },
      ],
      appData: {
        company: { name: 'Legacy Solicitors', leaveYearConfigured: true },
        employees: [{ id: 1, name: 'Admin' }],
      },
    }

    const store = normalizeStore(legacy)
    assert.equal(store.storeVersion, STORE_VERSION)
    assert.equal(store.tenants.length, 1)
    assert.equal(store.tenants[0].name, 'Legacy Solicitors')
    assert.equal(store.accounts.every((account) => account.tenantId === 1), true)
    assert.ok(store.appDataByTenant['1'])
    assert.equal(store.appDataByTenant['1'].company.name, 'Legacy Solicitors')
    assert.equal(store.appData, undefined)
    assert.equal(store.nextTenantId >= 2, true)
  })

  test('is idempotent for already-migrated stores', () => {
    const migrated = normalizeStore({
      nextAccountId: 2,
      accounts: [{ id: 1, email: 'a@b.test', tenantId: 1 }],
      appData: { company: { name: 'Once' } },
    })
    const again = normalizeStore(structuredClone(migrated))
    assert.deepEqual(again.tenants, migrated.tenants)
    assert.equal(again.accounts[0].tenantId, 1)
    assert.equal(again.appDataByTenant['1'].company.name, 'Once')
  })
})
