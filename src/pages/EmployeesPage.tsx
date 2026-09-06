import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { MoreMenu } from '../components/MoreMenu'
import { PageHeader } from '../components/PageHeader'
import { companyEntitlementSettings, type CompanySettings, type Employee } from '../domain'
import {
  bookableEntitlement,
  effectiveEntitlement,
  proRataPercentage,
} from '../leaveBalance'
import { formatWorkingWeek, type BankHoliday } from '../payroll'

type EmployeesProps = {
  employees: Employee[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onEditEmployee: (employee: Employee) => void
  onAddEmployee: () => void
  onViewLeaveHistory: (employee: Employee) => void
  onRecordAdjustment: (employee: Employee) => void
  onManageDocuments: (employee: Employee) => void
  onUpdateEmployee: (employee: Employee) => void
}

export function Employees({
  employees,
  company,
  bankHolidays,
  onEditEmployee,
  onAddEmployee,
  onViewLeaveHistory,
  onRecordAdjustment,
  onManageDocuments,
  onUpdateEmployee,
}: EmployeesProps) {
  const [search, setSearch] = useState('')
  const entitlementSettings = companyEntitlementSettings(company)
  const filtered = employees.filter((employee) =>
    employee.name.toLowerCase().includes(search.toLowerCase()) ||
    employee.role.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="People directory"
        title="Employees"
        description="Manage people, contracts, and individual leave settings."
        action={
          <button type="button" className="button button-primary" onClick={onAddEmployee}>
            <Plus size={17} />
            Add employee
          </button>
        }
      />
      <div className="card full-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder="Search employees"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <span className="employee-count">{employees.length} employees</span>
        </div>
        {filtered.map((employee) => (
          <div className="employee-row" key={employee.id}>
            <div className={`avatar avatar-${employee.color}`}>{employee.initials}</div>
            <div className="employee-main">
              <strong>{employee.name}</strong>
              <span>{employee.role}</span>
            </div>
            <div className="employee-leave">
              <span>Working pattern</span>
              <strong>{formatWorkingWeek(employee.workingDays)}</strong>
            </div>
            <div className="employee-leave">
              <span>Annual entitlement</span>
              <strong>
                {bookableEntitlement(employee, entitlementSettings, bankHolidays)}{' '}
                {employee.entitlementUnit}
                {employee.rollOver > 0 ? ` (+${employee.rollOver} roll-over)` : ''}
              </strong>
              {employee.entitlementMode === 'proRata' && (
                <small>Pro-rata · {proRataPercentage(employee, entitlementSettings)}% FTE</small>
              )}
              {company.entitlementIncludesBankHolidays && (
                <small>
                  {effectiveEntitlement(employee, entitlementSettings)} {employee.entitlementUnit}{' '}
                  incl. bank holidays
                </small>
              )}
            </div>
            <span className={`employee-status ${employee.status === 'Inactive' ? 'inactive' : ''}`}>
              <i />
              {employee.status}
            </span>
            <MoreMenu
              label={`Actions for ${employee.name}`}
              items={[
                { label: 'Edit details', onClick: () => onEditEmployee(employee) },
                { label: 'Adjust leave entitlement', onClick: () => onEditEmployee(employee) },
                { label: 'Record leave adjustment', onClick: () => onRecordAdjustment(employee) },
                { label: 'View leave history', onClick: () => onViewLeaveHistory(employee) },
                { label: 'Manage documents', onClick: () => onManageDocuments(employee) },
                {
                  label: employee.status === 'Active' ? 'Deactivate employee' : 'Reactivate employee',
                  danger: employee.status === 'Active',
                  onClick: () =>
                    onUpdateEmployee({
                      ...employee,
                      status: employee.status === 'Active' ? 'Inactive' : 'Active',
                    }),
                },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
