import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  deepEqual,
  describeConflicts,
  mergeAppData,
  mergeCollection,
  mergeObject,
} from '../src/syncMerge.ts'

describe('syncMerge three-way merge', () => {
  test('unrelated collection edits merge cleanly', () => {
    const base = {
      revision: 1,
      company: { name: 'Acme', payrollEmail: '' },
      employees: [
        { id: 1, name: 'Ada', entitlement: 25 },
        { id: 2, name: 'Ben', entitlement: 25 },
      ],
      requests: [],
      absences: [],
      bankHolidays: [],
      portalMessages: [],
      documentFolders: [],
      employeeDocuments: [],
      expenseClaims: [],
      vatReceipts: [],
      taskDismissals: [],
      policies: [],
      leaveAdjustments: [],
      leaveYearClosures: [],
      accounts: [],
      auditEvents: [],
    }
    const local = {
      ...base,
      employees: [
        { id: 1, name: 'Ada', entitlement: 25 },
        { id: 2, name: 'Ben', entitlement: 28 },
      ],
    }
    const server = {
      ...base,
      revision: 2,
      employees: [
        { id: 1, name: 'Ada', entitlement: 30 },
        { id: 2, name: 'Ben', entitlement: 25 },
      ],
    }

    const result = mergeAppData(base, local, server)
    assert.equal(result.clean, true)
    assert.deepEqual(result.merged.employees, [
      { id: 1, name: 'Ada', entitlement: 30 },
      { id: 2, name: 'Ben', entitlement: 28 },
    ])
    // Must not resurrect server-stale entitlement for Ada from local.
    assert.equal(
      result.merged.employees.find((item) => item.id === 1).entitlement,
      30,
    )
  })

  test('overlapping edits on the same employee are reported as conflicts', () => {
    const base = { employees: [{ id: 1, name: 'Ada', entitlement: 25 }] }
    const local = { employees: [{ id: 1, name: 'Ada', entitlement: 28 }] }
    const server = { employees: [{ id: 1, name: 'Ada', entitlement: 30 }] }
    const result = mergeCollection(base.employees, local.employees, server.employees, 'employees')
    assert.equal(result.conflicts.length, 1)
    assert.equal(result.merged[0].entitlement, 30)
    assert.match(describeConflicts(result.conflicts).join(' '), /employees/)
  })

  test('company field merge keeps unrelated local and server edits', () => {
    const result = mergeObject(
      { name: 'Acme', payrollEmail: 'old@x.test', defaultEntitlement: 25 },
      { name: 'Acme', payrollEmail: 'new@x.test', defaultEntitlement: 25 },
      { name: 'Acme Ltd', payrollEmail: 'old@x.test', defaultEntitlement: 25 },
      'company',
    )
    assert.equal(result.conflicts.length, 0)
    assert.equal(result.merged.name, 'Acme Ltd')
    assert.equal(result.merged.payrollEmail, 'new@x.test')
  })

  test('full snapshot overwrite risk is avoided for salary vs leave example', () => {
    const base = {
      company: { name: 'Firm' },
      employees: [
        { id: 1, name: 'A', salary: 40000, entitlement: 25 },
        { id: 2, name: 'B', salary: 35000, entitlement: 25 },
      ],
      requests: [],
      absences: [],
      bankHolidays: [],
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
    // B changed leave for employee 2 only, still carrying A's old salary in the snapshot.
    const local = {
      ...base,
      employees: [
        { id: 1, name: 'A', salary: 40000, entitlement: 25 },
        { id: 2, name: 'B', salary: 35000, entitlement: 30 },
      ],
    }
    // A changed salary for employee 1.
    const server = {
      ...base,
      revision: 2,
      employees: [
        { id: 1, name: 'A', salary: 42000, entitlement: 25 },
        { id: 2, name: 'B', salary: 35000, entitlement: 25 },
      ],
    }
    const result = mergeAppData(base, local, server)
    assert.equal(result.clean, true)
    assert.equal(result.merged.employees.find((item) => item.id === 1).salary, 42000)
    assert.equal(result.merged.employees.find((item) => item.id === 2).entitlement, 30)
  })

  test('deepEqual distinguishes nested changes', () => {
    assert.equal(deepEqual({ a: [1, 2] }, { a: [1, 2] }), true)
    assert.equal(deepEqual({ a: [1, 2] }, { a: [1, 3] }), false)
  })
})
