import type { CompanySettings } from './domain'
import { defaultCompanySettings } from './domain'
import type { Account } from './auth'
import type { AbsenceRecord, BankHoliday } from './payroll'
import type { LeaveAdjustment } from './leaveAdjustments'
import type { LeaveYearClosure } from './leaveYearClose'
import type { LeaveRequest, PortalMessage, ExpenseClaim } from './domain'
import type { Employee } from './domain'

export type FinchRuntimeData = {
  accounts: Account[]
  employees: Employee[]
  absences: AbsenceRecord[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  requests: LeaveRequest[]
  portalMessages: PortalMessage[]
  documentFolders: import('./domain').DocumentFolder[]
  employeeDocuments: import('./domain').EmployeeDocument[]
  expenseClaims: ExpenseClaim[]
  vatReceipts: import('./vatReceipts').VatReceipt[]
  taskDismissals: import('./hrTasks').TaskDismissal[]
  policies: import('./domain').PolicyDocument[]
  leaveAdjustments: LeaveAdjustment[]
  leaveYearClosures: LeaveYearClosure[]
}

export function emptyRuntimeData(): FinchRuntimeData {
  return {
    accounts: [],
    employees: [],
    absences: [],
    company: { ...defaultCompanySettings },
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
