import { AVATAR_COLORS, appToday, companyInitials, type CompanySettings, type DocumentFolder, type Employee } from './domain'
import { createDefaultFoldersForEmployee } from './employeeDocuments'
import type { Account } from './auth'
import { toIsoDate } from './calendarUtils'

export function buildEmployeeForAccount(
  account: Account,
  company: CompanySettings,
  nextId: number,
): Employee {
  const unit = company.defaultEntitlementUnit === 'hours' ? 'days' : company.defaultEntitlementUnit
  return {
    id: nextId,
    name: account.displayName,
    initials: account.initials || companyInitials(account.displayName) || 'EE',
    role: account.jobTitle?.trim() || (account.role === 'admin' ? 'Admin' : 'Team member'),
    entitlement: company.defaultEntitlement,
    entitlementUnit: unit,
    rollOver: 0,
    workingDays: [...(company.defaultWorkingDays?.length ? company.defaultWorkingDays : [1, 2, 3, 4, 5])],
    entitlementMode: 'proRata',
    color: AVATAR_COLORS[(nextId - 1) % AVATAR_COLORS.length],
    status: account.status === 'Inactive' ? 'Inactive' : 'Active',
    startDate: company.leaveYearConfiguredAt ?? toIsoDate(appToday()),
    probationEndDate: null,
  }
}

/**
 * Every sign-in account gets a linked employee record (admins included).
 * Creates missing employees and repairs dangling employeeId links.
 */
export function ensureEmployeesForAccounts({
  accounts,
  employees,
  company,
  documentFolders,
}: {
  accounts: Account[]
  employees: Employee[]
  company: CompanySettings
  documentFolders: DocumentFolder[]
}): {
  accounts: Account[]
  employees: Employee[]
  documentFolders: DocumentFolder[]
  changedAccountIds: number[]
} {
  let nextEmployees = [...employees]
  let nextFolders = [...documentFolders]
  let nextId = Math.max(0, ...nextEmployees.map((item) => item.id)) + 1
  const changedAccountIds: number[] = []

  const nextAccounts = accounts.map((account) => {
    if (account.employeeId != null) {
      const linked = nextEmployees.find((item) => item.id === account.employeeId)
      if (linked) return account
    }

    const employee = buildEmployeeForAccount(account, company, nextId)
    nextEmployees = [...nextEmployees, employee]
    nextFolders = [...nextFolders, ...createDefaultFoldersForEmployee(nextId, nextFolders)]
    changedAccountIds.push(account.id)
    nextId += 1
    return { ...account, employeeId: employee.id }
  })

  return {
    accounts: nextAccounts,
    employees: nextEmployees,
    documentFolders: nextFolders,
    changedAccountIds,
  }
}
