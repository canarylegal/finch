import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { AbsencesPage, PayrollReportsPage, RecordAbsenceModal } from './AbsencesAndPayroll'
import { formatMonthYear, MiniMonthCalendar } from './components/MiniMonthCalendar'
import { buildMonthGrid, dateInRange, toIsoDate } from './calendarUtils'
import {
  daysUntilLeaveYearEnd,
  formatLeaveYearLabel,
  getLeaveYearPeriod,
  type LeaveYearPeriod,
} from './leaveYear'
import {
  employeeRequestsSorted,
  formatAbsenceRange,
  formatTimelineDate,
  leaveYearResetItem,
  upcomingApprovedLeave,
} from './dashboardHelpers'
import {
  DEFAULT_NOTIFICATION_EVENTS,
  normalizeNotificationEvents,
  NOTIFICATION_EVENT_IDS,
  NOTIFICATION_EVENT_LABELS,
  type NotificationEvents,
} from './notifications'
import {
  ABSENCE_TYPE_LABELS,
  ENGLAND_WALES_BANK_HOLIDAYS_2026,
  PAYROLL_DISCLAIMER,
  absenceTypeColor,
  bankHolidaysForRegion,
  countWeekdaysInRange,
  countWorkingDaysInRange,
  DEFAULT_WORKING_DAYS,
  describePayPeriodSchedule,
  formatDisplayDate,
  formatWorkingWeek,
  initialAbsences,
  normalizeWorkingDays,
  parseIsoDate,
  WEEKDAY_LABELS,
  WORKING_WEEK_PRESETS,
  type AbsenceRecord,
  type BankHoliday,
  type BankHolidayRegion,
} from './payroll'
import { loadFinchAppData, saveFinchAppData } from './storage'
import {
  annualLeaveTaken,
  bookableEntitlement,
  describeBookableEntitlement,
  effectiveEntitlement,
  entitlementBasisLabel,
  entitlementInputHelper,
  formatBalanceAmount,
  overAllowanceMessage,
  parseDurationDays,
  proRataPercentage,
  remainingAnnualLeave,
  totalLeaveAllowance,
  type CompanyEntitlementSettings,
  type EntitlementMode,
} from './leaveBalance'
import './App.css'

type RequestStatus = 'Pending' | 'Approved' | 'Declined'
type SettingsTab = 'company' | 'leave' | 'notifications' | 'security' | 'payroll'
type TwoFactorPolicy = 'all' | 'admins' | 'optional'

type LeaveRequest = {
  id: number
  name: string
  initials: string
  color: string
  dates: string
  duration: string
  note: string
  status: RequestStatus
  start?: string
  end?: string
}

type Employee = {
  id: number
  name: string
  initials: string
  role: string
  entitlement: number
  entitlementUnit: 'days' | 'hours'
  rollOver: number
  workingDays: number[]
  entitlementMode: EntitlementMode
  color: string
  status: 'Active' | 'Inactive'
}

type CompanySettings = {
  name: string
  logoUrl: string | null
  leaveYearStart: string
  leaveYearEnd: string
  defaultRollOver: boolean
  defaultEntitlement: number
  defaultEntitlementUnit: 'days' | 'hours'
  defaultWorkingDays: number[]
  entitlementIncludesBankHolidays: boolean
  emailNotifications: boolean
  notificationEvents: NotificationEvents
  twoFactorRequired: TwoFactorPolicy
  payrollEmail: string
  autoSendPayrollReport: boolean
  autoSendDayOfMonth: number
  payPeriodStartDay: number
  bankHolidayRegion: BankHolidayRegion
}

type MenuItem = {
  label: string
  onClick: () => void
  danger?: boolean
}


const initialEmployees: Employee[] = [
  { id: 1, name: 'Sophie Carter', initials: 'SC', role: 'Product designer', entitlement: 25, entitlementUnit: 'days', rollOver: 0, workingDays: [1, 2, 3, 4, 5], entitlementMode: 'proRata', color: 'sage', status: 'Active' },
  { id: 2, name: 'Jamie Wilson', initials: 'JW', role: 'Content strategist', entitlement: 25, entitlementUnit: 'days', rollOver: 0, workingDays: [1, 2, 3, 4, 5], entitlementMode: 'proRata', color: 'peach', status: 'Active' },
  { id: 3, name: 'Maya Patel', initials: 'MP', role: 'Operations lead', entitlement: 28, entitlementUnit: 'days', rollOver: 2, workingDays: [1, 2, 3, 4], entitlementMode: 'proRata', color: 'lavender', status: 'Active' },
  { id: 4, name: 'Oliver Reed', initials: 'OR', role: 'Engineer', entitlement: 25, entitlementUnit: 'days', rollOver: 0, workingDays: [2, 3, 4, 5, 6], entitlementMode: 'proRata', color: 'mint', status: 'Active' },
]

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const initialRequests: LeaveRequest[] = [
  {
    id: 1,
    name: 'Jamie Wilson',
    initials: 'JW',
    color: 'peach',
    dates: '8–12 Sep 2026',
    duration: '5 days',
    note: 'Family holiday',
    status: 'Pending',
  },
  {
    id: 2,
    name: 'Maya Patel',
    initials: 'MP',
    color: 'lavender',
    dates: '24 Sep 2026',
    duration: '1 day',
    note: 'Personal day',
    status: 'Pending',
  },
  {
    id: 3,
    name: 'Oliver Reed',
    initials: 'OR',
    color: 'mint',
    dates: '30 Sep–2 Oct 2026',
    duration: '3 days',
    note: 'City break',
    status: 'Pending',
  },
]

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My leave', icon: CalendarDays },
  { label: 'Policies', icon: BookOpen },
  { label: 'Documents', icon: FileText },
]

const adminNavItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Requests', icon: Clock3 },
  { label: 'Absences', icon: HeartPulse },
  { label: 'Team calendar', icon: CalendarDays },
  { label: 'Payroll reports', icon: ScrollText },
  { label: 'Employees', icon: Users },
  { label: 'Policies', icon: BookOpen },
  { label: 'Settings', icon: Settings },
]

const defaultCompanySettings: CompanySettings = {
  name: 'Northstar Studio',
  logoUrl: null,
  leaveYearStart: 'January',
  leaveYearEnd: 'December',
  defaultRollOver: false,
  defaultEntitlement: 25,
  defaultEntitlementUnit: 'days',
  defaultWorkingDays: [1, 2, 3, 4, 5],
  entitlementIncludesBankHolidays: false,
  emailNotifications: true,
  notificationEvents: DEFAULT_NOTIFICATION_EVENTS,
  twoFactorRequired: 'admins',
  payrollEmail: '',
  autoSendPayrollReport: false,
  autoSendDayOfMonth: 3,
  payPeriodStartDay: 10,
  bankHolidayRegion: 'england-wales',
}

function readPersistedState() {
  const stored = loadFinchAppData()
  if (!stored) return null
  const company = {
    ...defaultCompanySettings,
    ...stored.company,
    defaultWorkingDays: normalizeWorkingDays(stored.company.defaultWorkingDays),
    entitlementIncludesBankHolidays:
      stored.company.entitlementIncludesBankHolidays ?? defaultCompanySettings.entitlementIncludesBankHolidays,
    notificationEvents: normalizeNotificationEvents(stored.company.notificationEvents),
  }
  return {
    employees: stored.employees.map((employee) => ({
      ...employee,
      workingDays: normalizeWorkingDays(employee.workingDays),
      entitlementMode: employee.entitlementMode ?? 'custom',
    })),
    absences: stored.absences,
    company,
    bankHolidays: stored.bankHolidays,
    requests: stored.requests,
  }
}

function companyEntitlementSettings(company: CompanySettings): CompanyEntitlementSettings {
  return {
    defaultEntitlement: company.defaultEntitlement,
    defaultEntitlementUnit: company.defaultEntitlementUnit,
    defaultWorkingDays: company.defaultWorkingDays,
    entitlementIncludesBankHolidays: company.entitlementIncludesBankHolidays,
  }
}

function EntitlementBasisNote({ includesBankHolidays }: { includesBankHolidays: boolean }) {
  return (
    <p className="field-helper entitlement-basis-note">
      <strong>{entitlementBasisLabel(includesBankHolidays)}.</strong> {entitlementInputHelper(includesBankHolidays)}
    </p>
  )
}

const APP_TODAY = new Date(2026, 7, 31)

function FinchMark() {
  return (
    <svg className="finch-mark" viewBox="0 0 48 48" role="img" aria-label="Finch">
      <path
        className="finch-body"
        d="M29.8 7.1c7.1 1.4 11.4 7.4 10.1 15.6-1.4 8.5-7.4 14.2-16.6 15.3l-3.4-8.2c-4.6-.1-8.2-1.4-10.3-3.7 3.1-.4 5.9-2.1 8-5.3 2.4-3.7 3.8-8.1 6.7-11.3 1.7-1.9 3.6-2.8 5.5-2.4Z"
      />
      <path
        className="finch-wing"
        d="m12 25.1 8.2 7.7 12.3-14.4-11.3 4.2-4.8-2.9c-2.2-1.3-4.5-.4-4.4 1.4 0 1.4.8 2.5 0 4Z"
      />
      <path className="finch-beak" d="m39.2 17.2 5.1 2.9-5.5 2.4Z" />
      <path className="finch-leg" d="m25 34.1 2.7 6.4M30.3 33.4l3.3 5.8" />
      <path className="finch-perch" d="M6.5 41h35" />
      <circle className="finch-eye" cx="34.7" cy="13.5" r="1.1" />
    </svg>
  )
}

function MoreMenu({
  items,
  label = 'More options',
  placement = 'bottom',
  buttonClassName = 'more-button',
}: {
  items: MenuItem[]
  label?: string
  placement?: 'top' | 'bottom'
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="more-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className={`action-menu ${placement === 'top' ? 'action-menu-top' : ''}`} role="menu">
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.label}
              className={item.danger ? 'danger' : ''}
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceSwitcher({
  companyName,
  companyAvatar,
  logoUrl,
  isAdmin,
  onOpenSettings,
  onSwitchView,
  onNotify,
}: {
  companyName: string
  companyAvatar: string
  logoUrl: string | null
  isAdmin: boolean
  onOpenSettings: () => void
  onSwitchView: () => void
  onNotify: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="workspace-switcher-wrap" ref={wrapRef}>
      <button
        type="button"
        className="workspace-switcher"
        aria-label="Switch workspace"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        {logoUrl ? (
          <img className="company-logo" src={logoUrl} alt="" />
        ) : (
          <div className="company-avatar">{companyAvatar}</div>
        )}
        <div>
          <strong>{companyName}</strong>
          <span>Personal workspace</span>
        </div>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="action-menu workspace-menu" role="menu">
          <div className="workspace-menu-current">
            <strong>{companyName}</strong>
            <span>Current workspace</span>
          </div>
          {isAdmin ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenSettings()
                setOpen(false)
              }}
            >
              Workspace settings
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => onNotify('Only admins can change workspace settings')}
            >
              Workspace settings
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSwitchView()
              setOpen(false)
            }}
          >
            Switch to {isAdmin ? 'employee' : 'admin'} view
          </button>
        </div>
      )}
    </div>
  )
}

const AVATAR_COLORS = ['sage', 'peach', 'lavender', 'mint'] as const

function WorkingDaysPicker({
  value,
  onChange,
}: {
  value: number[]
  onChange: (days: number[]) => void
}) {
  const normalized = normalizeWorkingDays(value)

  const toggleDay = (day: number) => {
    if (normalized.includes(day)) {
      const next = normalized.filter((item) => item !== day)
      if (next.length === 0) return
      onChange(next)
      return
    }
    onChange(normalizeWorkingDays([...normalized, day]))
  }

  return (
    <div className="working-days-field">
      <span className="field-label">Working days</span>
      <p className="field-helper">
        Used for leave requests, absence duration, and payroll working-time calculations.
      </p>
      <div className="working-week-presets">
        {WORKING_WEEK_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`preset-chip ${
              preset.days.join(',') === normalized.join(',') ? 'is-active' : ''
            }`}
            onClick={() => onChange([...preset.days])}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="working-day-toggle-row">
        {WEEKDAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            className={`working-day-toggle ${normalized.includes(day) ? 'is-active' : ''}`}
            aria-pressed={normalized.includes(day)}
            onClick={() => toggleDay(day)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="working-week-summary">{formatWorkingWeek(normalized)}</span>
    </div>
  )
}

function EmployeeEditModal({
  employee,
  company,
  bankHolidays,
  onClose,
  onSave,
}: {
  employee: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onClose: () => void
  onSave: (employee: Employee) => void
}) {
  const [draft, setDraft] = useState(employee)
  const entitlementSettings = companyEntitlementSettings(company)
  const calculatedEntitlement = effectiveEntitlement(draft, entitlementSettings)
  const proRataPercent = proRataPercentage(draft, entitlementSettings)
  const bookableSummary = describeBookableEntitlement(draft, entitlementSettings, bankHolidays)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Employee profile</span>
            <h2 id="employee-edit-title">Edit {employee.name}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Full name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            Job title
            <input
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            />
          </label>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          <div className="form-row">
            <label>
              Annual entitlement
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.entitlement}
                disabled={draft.entitlementMode === 'proRata'}
                onChange={(event) =>
                  setDraft({ ...draft, entitlement: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              Unit
              <select
                value={draft.entitlementUnit}
                disabled={draft.entitlementMode === 'proRata'}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    entitlementUnit: event.target.value as 'days' | 'hours',
                  })
                }
              >
                <option value="days">Days</option>
                <option value="hours">Hours</option>
              </select>
            </label>
          </div>
          <div className="entitlement-mode-field">
            <span className="field-label">Allowance method</span>
            <div className="radio-list">
              <label className="radio-row">
                <input
                  type="radio"
                  name={`entitlement-mode-${employee.id}`}
                  checked={draft.entitlementMode === 'proRata'}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      entitlementMode: 'proRata',
                      entitlementUnit: company.defaultEntitlementUnit,
                    })
                  }
                />
                <span>
                  Pro-rata from company default ({company.defaultEntitlement}{' '}
                  {company.defaultEntitlementUnit} full-time)
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name={`entitlement-mode-${employee.id}`}
                  checked={draft.entitlementMode === 'custom'}
                  onChange={() => setDraft({ ...draft, entitlementMode: 'custom' })}
                />
                <span>Custom allowance</span>
              </label>
            </div>
            {draft.entitlementMode === 'proRata' && (
              <div className="pro-rata-summary">
                <strong>
                  {calculatedEntitlement} {company.defaultEntitlementUnit}
                </strong>
                <span>
                  {proRataPercent}% of full-time · based on {formatWorkingWeek(draft.workingDays)}
                </span>
                {company.entitlementIncludesBankHolidays && <span>{bookableSummary}</span>}
              </div>
            )}
            {draft.entitlementMode === 'custom' && company.entitlementIncludesBankHolidays && (
              <div className="pro-rata-summary">
                <span>{bookableSummary}</span>
              </div>
            )}
          </div>
          <label>
            Manual roll-over ({draft.entitlementUnit})
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft.rollOver}
              onChange={(event) =>
                setDraft({ ...draft, rollOver: Number(event.target.value) || 0 })
              }
            />
          </label>
          <WorkingDaysPicker
            value={draft.workingDays}
            onChange={(workingDays) => setDraft({ ...draft, workingDays })}
          />
          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as Employee['status'] })
              }
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() =>
              onSave({
                ...draft,
                initials: companyInitials(draft.name) || draft.initials,
                entitlementUnit:
                  draft.entitlementMode === 'proRata'
                    ? company.defaultEntitlementUnit
                    : draft.entitlementUnit,
              })
            }
          >
            Save employee
          </button>
        </div>
      </div>
    </div>
  )
}

function AddEmployeeModal({
  company,
  bankHolidays,
  onClose,
  onSave,
}: {
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onClose: () => void
  onSave: (employee: Omit<Employee, 'id' | 'initials' | 'color'>) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [entitlement, setEntitlement] = useState(company.defaultEntitlement)
  const [entitlementUnit, setEntitlementUnit] = useState(company.defaultEntitlementUnit)
  const [entitlementMode, setEntitlementMode] = useState<EntitlementMode>('proRata')
  const [rollOver, setRollOver] = useState(0)
  const [workingDays, setWorkingDays] = useState<number[]>([...DEFAULT_WORKING_DAYS])

  const draftEmployee: Employee = {
    id: 0,
    name: name.trim() || 'New employee',
    initials: 'NE',
    role: role.trim(),
    entitlement,
    entitlementUnit,
    rollOver,
    workingDays: normalizeWorkingDays(workingDays),
    entitlementMode,
    color: 'sage',
    status: 'Active',
  }
  const entitlementSettings = companyEntitlementSettings(company)
  const calculatedEntitlement = effectiveEntitlement(draftEmployee, entitlementSettings)
  const proRataPercent = proRataPercentage(draftEmployee, entitlementSettings)
  const bookableSummary = describeBookableEntitlement(draftEmployee, entitlementSettings, bankHolidays)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">People directory</span>
            <h2 id="add-employee-title">Add employee</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Full name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Jordan Lee"
            />
          </label>
          <label>
            Job title
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="e.g. Marketing manager"
            />
          </label>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          <div className="form-row">
            <label>
              Annual entitlement
              <input
                type="number"
                min={0}
                step={0.5}
                value={entitlement}
                disabled={entitlementMode === 'proRata'}
                onChange={(event) => setEntitlement(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Unit
              <select
                value={entitlementUnit}
                disabled={entitlementMode === 'proRata'}
                onChange={(event) =>
                  setEntitlementUnit(event.target.value as 'days' | 'hours')
                }
              >
                <option value="days">Days</option>
                <option value="hours">Hours</option>
              </select>
            </label>
          </div>
          <div className="entitlement-mode-field">
            <span className="field-label">Allowance method</span>
            <div className="radio-list">
              <label className="radio-row">
                <input
                  type="radio"
                  name="add-employee-entitlement-mode"
                  checked={entitlementMode === 'proRata'}
                  onChange={() => {
                    setEntitlementMode('proRata')
                    setEntitlementUnit(company.defaultEntitlementUnit)
                  }}
                />
                <span>
                  Pro-rata from company default ({company.defaultEntitlement}{' '}
                  {company.defaultEntitlementUnit} full-time)
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="add-employee-entitlement-mode"
                  checked={entitlementMode === 'custom'}
                  onChange={() => setEntitlementMode('custom')}
                />
                <span>Custom allowance</span>
              </label>
            </div>
            {entitlementMode === 'proRata' && (
              <div className="pro-rata-summary">
                <strong>
                  {calculatedEntitlement} {company.defaultEntitlementUnit}
                </strong>
                <span>
                  {proRataPercent}% of full-time · based on {formatWorkingWeek(workingDays)}
                </span>
                {company.entitlementIncludesBankHolidays && <span>{bookableSummary}</span>}
              </div>
            )}
            {entitlementMode === 'custom' && company.entitlementIncludesBankHolidays && (
              <div className="pro-rata-summary">
                <span>{bookableSummary}</span>
              </div>
            )}
          </div>
          <label>
            Manual roll-over ({entitlementUnit})
            <input
              type="number"
              min={0}
              step={0.5}
              value={rollOver}
              onChange={(event) => setRollOver(Number(event.target.value) || 0)}
            />
          </label>
          <WorkingDaysPicker value={workingDays} onChange={setWorkingDays} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!name.trim() || !role.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                role: role.trim(),
                entitlement,
                entitlementUnit:
                  entitlementMode === 'proRata' ? company.defaultEntitlementUnit : entitlementUnit,
                rollOver,
                workingDays: normalizeWorkingDays(workingDays),
                entitlementMode,
                status: 'Active',
              })
            }
          >
            Add employee <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmployeeLeaveHistoryModal({
  employee,
  company,
  bankHolidays,
  leaveYear,
  absences,
  requests,
  onClose,
}: {
  employee: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  onClose: () => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const contractAllowance = effectiveEntitlement(employee, entitlementSettings)
  const bookableAllowance = bookableEntitlement(employee, entitlementSettings, bankHolidays)
  const employeeAbsences = absences
    .filter((record) => record.employeeId === employee.id)
    .sort((a, b) => b.start.localeCompare(a.start))

  const employeeRequests = requests
    .filter((request) => request.name === employee.name)
    .sort((a, b) => b.dates.localeCompare(a.dates))

  const annualLeaveTakenAmount = annualLeaveTaken(
    absences,
    employee.id,
    employee.workingDays,
    leaveYear,
  )

  const remaining = remainingAnnualLeave(
    employee,
    entitlementSettings,
    bankHolidays,
    absences,
    requests,
    leaveYear,
  )

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide modal-tall"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Leave history</span>
            <h2 id="leave-history-title">{employee.name}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <div className="leave-summary-row leave-history-summary">
            <div>
              <span className="card-label">
                {company.entitlementIncludesBankHolidays ? 'Contract total' : 'Entitlement'}
              </span>
              <div className="summary-number">
                {contractAllowance} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
            {company.entitlementIncludesBankHolidays && (
              <div>
                <span className="card-label">Bookable</span>
                <div className="summary-number">
                  {bookableAllowance} <span>{employee.entitlementUnit}</span>
                </div>
              </div>
            )}
            <div>
              <span className="card-label">Taken</span>
              <div className="summary-number">
                {annualLeaveTakenAmount} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
            <div>
              <span className="card-label">Remaining</span>
              <div
                className={`summary-number coral-number ${remaining < 0 ? 'negative-number' : ''}`}
              >
                {remaining} <span>{employee.entitlementUnit}</span>
              </div>
            </div>
          </div>
          <EntitlementBasisNote includesBankHolidays={company.entitlementIncludesBankHolidays} />
          {employee.entitlementMode === 'proRata' && (
            <p className="field-helper">
              Pro-rated from {company.defaultEntitlement} {company.defaultEntitlementUnit} full-time
              ({proRataPercentage(employee, entitlementSettings)}%).
            </p>
          )}
          {employee.rollOver > 0 && (
            <p className="field-helper">
              Includes {employee.rollOver} {employee.entitlementUnit} manual roll-over.
            </p>
          )}

          <div className="section-heading leave-history-heading">
            <div>
              <h2>Recorded absences</h2>
              <p>All absence entries on file for this employee</p>
            </div>
          </div>
          {employeeAbsences.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No absences recorded</strong>
              <span>Absences you record will appear here.</span>
            </div>
          ) : (
            employeeAbsences.map((record) => (
              <div className="request-row leave-history-row" key={record.id}>
                <div className="request-copy">
                  <strong>
                    {formatDisplayDate(record.start)}
                    {record.end !== record.start ? ` – ${formatDisplayDate(record.end)}` : ''}
                  </strong>
                  <span>
                    {ABSENCE_TYPE_LABELS[record.type]} · {record.amount}{' '}
                    {employee.entitlementUnit}
                    {record.note ? ` · ${record.note}` : ''}
                  </span>
                </div>
                <span className={`absence-pill absence-pill-${record.type}`}>
                  {ABSENCE_TYPE_LABELS[record.type]}
                </span>
              </div>
            ))
          )}

          {employeeRequests.length > 0 && (
            <>
              <div className="section-heading leave-history-heading">
                <div>
                  <h2>Leave requests</h2>
                  <p>Submitted requests awaiting or following approval</p>
                </div>
              </div>
              {employeeRequests.map((request) => (
                <div className="request-row leave-history-row" key={request.id}>
                  <div
                    className={`request-icon ${
                      request.status === 'Pending'
                        ? 'request-icon-pending'
                        : request.status === 'Approved'
                          ? 'request-icon-approved'
                          : 'request-icon-declined'
                    }`}
                  >
                    {request.status === 'Pending' ? (
                      <Clock3 size={16} />
                    ) : request.status === 'Approved' ? (
                      <Check size={16} />
                    ) : (
                      <X size={16} />
                    )}
                  </div>
                  <div className="request-copy">
                    <strong>{request.dates}</strong>
                    <span>
                      Annual leave · {request.duration}
                      {request.note ? ` · ${request.note}` : ''}
                    </span>
                  </div>
                  <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminAddLeaveModal({
  employees,
  onClose,
  onSubmit,
}: {
  employees: Employee[]
  onClose: () => void
  onSubmit: (payload: {
    employeeId: number
    start: string
    end: string
    label: string
  }) => void
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? 0)
  const [startDate, setStartDate] = useState('2026-09-18')
  const [endDate, setEndDate] = useState('2026-09-19')
  const [label, setLabel] = useState('Annual leave')
  const selectedEmployee = employees.find((item) => item.id === employeeId)
  const dayCount = useMemo(
    () =>
      selectedEmployee
        ? countWorkingDaysInRange(startDate, endDate, selectedEmployee.workingDays)
        : countWeekdaysInRange(startDate, endDate),
    [startDate, endDate, selectedEmployee],
  )

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-leave-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Team calendar</span>
            <h2 id="admin-leave-title">Add leave</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Employee
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(Number(event.target.value))}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Leave type
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option>Annual leave</option>
              <option>Unpaid leave</option>
              <option>Other</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              First day
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Last day
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          <div className="days-preview">
            <CalendarDays size={17} />
            <span>This entry uses</span>
            <strong>
              {dayCount} working {dayCount === 1 ? 'day' : 'days'}
            </strong>
          </div>
          {selectedEmployee && (
            <p className="field-helper">
              Based on {selectedEmployee.name}&apos;s working pattern ({formatWorkingWeek(selectedEmployee.workingDays)}).
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onSubmit({ employeeId, start: startDate, end: endDate, label })}
            disabled={!employeeId || !startDate || !endDate || endDate < startDate}
          >
            Add leave <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const persisted = readPersistedState()
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeNav, setActiveNav] = useState('Overview')
  const [requests, setRequests] = useState(persisted?.requests ?? initialRequests)
  const [employees, setEmployees] = useState(persisted?.employees ?? initialEmployees)
  const [absences, setAbsences] = useState<AbsenceRecord[]>(persisted?.absences ?? initialAbsences)
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>(
    persisted?.bankHolidays ?? ENGLAND_WALES_BANK_HOLIDAYS_2026,
  )
  const [company, setCompany] = useState<CompanySettings>(
    persisted?.company ?? defaultCompanySettings,
  )
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [isAdminLeaveModalOpen, setIsAdminLeaveModalOpen] = useState(false)
  const [isRecordAbsenceOpen, setIsRecordAbsenceOpen] = useState(false)
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [leaveHistoryEmployee, setLeaveHistoryEmployee] = useState<Employee | null>(null)
  const [toast, setToast] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    saveFinchAppData({ employees, absences, company, bankHolidays, requests })
  }, [employees, absences, company, bankHolidays, requests])

  const pendingCount = requests.filter((request) => request.status === 'Pending').length
  const leaveYear = useMemo(
    () => getLeaveYearPeriod(APP_TODAY, company.leaveYearStart, company.leaveYearEnd),
    [company.leaveYearStart, company.leaveYearEnd],
  )
  const currentNav = isAdmin ? adminNavItems : navItems
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const addAbsence = (record: Omit<AbsenceRecord, 'id' | 'recordedAt'>) => {
    setAbsences((current) => [
      ...current,
      {
        ...record,
        id: Math.max(0, ...current.map((item) => item.id)) + 1,
        recordedAt: toIsoDate(new Date()),
      },
    ])
  }

  const updateRequest = (id: number, status: RequestStatus) => {
    const request = requests.find((item) => item.id === id)
    const employee = employees.find((item) => item.name === request?.name)

    if (status === 'Approved' && request && employee) {
      const days = parseDurationDays(request.duration)
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        days,
        id,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage(employee.name, Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    setRequests((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    )

    if (status === 'Approved' && request && employee) {
      const days = parseDurationDays(request.duration)
      addAbsence({
        employeeId: employee.id,
        type: 'annual_leave',
        start: request.start ?? toIsoDate(new Date()),
        end: request.end ?? request.start ?? toIsoDate(new Date()),
        amount: days,
        note: request.note || 'Approved leave request',
        recordedBy: 'Alex Morgan',
      })
    }

    notify(status === 'Approved' ? 'Leave request approved' : 'Leave request declined')
  }

  const submitLeaveRequest = (payload: {
    start: string
    end: string
    days: number
    note: string
    leaveType: string
  }) => {
    const employee = employees.find((item) => item.name === 'Sophie Carter')
    if (!employee) return

    if (payload.leaveType === 'Annual leave') {
      const remainingAfter = remainingAnnualLeave(
        employee,
        companyEntitlementSettings(company),
        bankHolidays,
        absences,
        requests,
        leaveYear,
        payload.days,
      )
      if (remainingAfter < 0) {
        const proceed = window.confirm(
          overAllowanceMessage('You', Math.abs(remainingAfter), employee.entitlementUnit),
        )
        if (!proceed) return
      }
    }

    const startLabel = formatDisplayDate(payload.start)
    const endLabel = formatDisplayDate(payload.end)
    const dates =
      payload.start === payload.end ? startLabel : `${startLabel} – ${endLabel}`

    setRequests((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((item) => item.id)) + 1,
        name: employee.name,
        initials: employee.initials,
        color: employee.color,
        dates,
        duration: `${payload.days} ${payload.days === 1 ? 'day' : 'days'}`,
        note: payload.note,
        status: 'Pending',
        start: payload.start,
        end: payload.end,
      },
    ])
    setIsLeaveModalOpen(false)
    notify('Leave request sent to Alex')
  }

  const handleNavigation = (label: string) => {
    setActiveNav(label)
    setMobileNavOpen(false)
  }

  const saveEmployee = (employee: Employee) => {
    setEmployees((current) =>
      current.map((item) => (item.id === employee.id ? employee : item)),
    )
    setEditingEmployee(null)
    notify(`${employee.name} updated`)
  }

  const addEmployee = (payload: Omit<Employee, 'id' | 'initials' | 'color'>) => {
    setEmployees((current) => {
      const nextId = Math.max(0, ...current.map((item) => item.id)) + 1
      const employee: Employee = {
        ...payload,
        id: nextId,
        initials: companyInitials(payload.name) || 'EE',
        color: AVATAR_COLORS[(nextId - 1) % AVATAR_COLORS.length],
      }
      return [...current, employee]
    })
    setIsAddEmployeeOpen(false)
    notify(`${payload.name} added`)
  }

  const addTeamLeave = (payload: {
    employeeId: number
    start: string
    end: string
    label: string
  }) => {
    const employee = employees.find((item) => item.id === payload.employeeId)
    if (!employee) return

    addAbsence({
      employeeId: employee.id,
      type: 'annual_leave',
      start: payload.start,
      end: payload.end,
      amount: countWorkingDaysInRange(payload.start, payload.end, employee.workingDays),
      note: payload.label,
      recordedBy: 'Alex Morgan',
    })
    setIsAdminLeaveModalOpen(false)
    notify(`Leave added for ${employee.name}`)
  }

  const recordAbsence = (record: Omit<AbsenceRecord, 'id' | 'recordedAt'>) => {
    addAbsence(record)
    setIsRecordAbsenceOpen(false)
    notify('Absence recorded')
  }

  const saveCompanySettings = (next: CompanySettings) => {
    setCompany(next)
    notify('Settings saved')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <FinchMark />
          </div>
          <span>
            finch<span className="brand-dot">.</span>
          </span>
        </div>

        <WorkspaceSwitcher
          companyName={company.name}
          companyAvatar={companyInitials(company.name)}
          logoUrl={company.logoUrl}
          isAdmin={isAdmin}
          onOpenSettings={() => {
            setIsAdmin(true)
            setActiveNav('Settings')
            setMobileNavOpen(false)
          }}
          onSwitchView={() => {
            setIsAdmin(!isAdmin)
            setActiveNav('Overview')
            notify(isAdmin ? 'Switched to employee view' : 'Switched to admin view')
          }}
          onNotify={notify}
        />

        <div className="sidebar-label">{isAdmin ? 'Manage' : 'Workspace'}</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {currentNav.map(({ label, icon: Icon }) => (
            <button
              type="button"
              className={`nav-item ${activeNav === label ? 'active' : ''}`}
              key={label}
              onClick={() => handleNavigation(label)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {label === 'Requests' && pendingCount > 0 && (
                <span className="nav-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item"
            onClick={() => notify('Help centre coming soon')}
          >
            <Bell size={17} />
            <span>Help centre</span>
          </button>
          <div className="user-chip">
            <div className="avatar avatar-sage">{isAdmin ? 'AM' : 'SC'}</div>
            <div>
              <strong>{isAdmin ? 'Alex Morgan' : 'Sophie Carter'}</strong>
              <span>{isAdmin ? 'Master admin' : 'Product designer'}</span>
            </div>
            <MoreMenu
              placement="top"
              buttonClassName="more-button sidebar-more-button"
              label="Account menu"
              items={
                isAdmin
                  ? [
                      { label: 'My profile', onClick: () => notify('Profile settings opened') },
                      {
                        label: 'Workspace settings',
                        onClick: () => {
                          setIsAdmin(true)
                          setActiveNav('Settings')
                          setMobileNavOpen(false)
                        },
                      },
                      {
                        label: 'Switch to employee view',
                        onClick: () => {
                          setIsAdmin(false)
                          setActiveNav('Overview')
                          notify('Switched to employee view')
                        },
                      },
                      { label: 'Sign out', onClick: () => notify('Signed out'), danger: true },
                    ]
                  : [
                      { label: 'My profile', onClick: () => notify('Profile settings opened') },
                      { label: 'My leave', onClick: () => setActiveNav('My leave') },
                      {
                        label: 'Switch to admin view',
                        onClick: () => {
                          setIsAdmin(true)
                          setActiveNav('Overview')
                          notify('Switched to admin view')
                        },
                      },
                      { label: 'Sign out', onClick: () => notify('Signed out'), danger: true },
                    ]
              }
            />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>{company.name}</span>
            <ChevronRight size={15} />
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => notify('You are all caught up')}
            >
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <button
              type="button"
              className={`role-switch ${isAdmin ? 'admin-mode' : ''}`}
              onClick={() => {
                setIsAdmin(!isAdmin)
                setActiveNav('Overview')
                notify(isAdmin ? 'Switched to employee view' : 'Switched to admin view')
              }}
            >
              <span className="role-indicator" />
              {isAdmin ? 'Admin view' : 'Employee view'}
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        {activeNav === 'Overview' &&
          (isAdmin ? (
            <AdminDashboard
              requests={requests}
              employees={employees}
              absences={absences}
              company={company}
              bankHolidays={bankHolidays}
              leaveYear={leaveYear}
              pendingCount={pendingCount}
              onUpdateRequest={updateRequest}
              onAddEmployee={() => setIsAddEmployeeOpen(true)}
              onNavigate={handleNavigation}
              onNotify={notify}
            />
          ) : (
            <EmployeeDashboard
              employee={employees.find((item) => item.name === 'Sophie Carter')}
              absences={absences}
              requests={requests}
              company={company}
              bankHolidays={bankHolidays}
              leaveYear={leaveYear}
              onRequestLeave={() => setIsLeaveModalOpen(true)}
              onNavigate={handleNavigation}
              onNotify={notify}
            />
          ))}
        {activeNav === 'Requests' && isAdmin && (
          <AdminRequests
            requests={requests}
            employees={employees}
            absences={absences}
            company={company}
            bankHolidays={bankHolidays}
            leaveYear={leaveYear}
            onUpdateRequest={updateRequest}
          />
        )}
        {activeNav === 'Absences' && isAdmin && (
          <AbsencesPage
            employees={employees}
            absences={absences}
            onRecordAbsence={() => setIsRecordAbsenceOpen(true)}
          />
        )}
        {activeNav === 'Team calendar' && isAdmin && (
          <TeamCalendar
            employees={employees}
            absences={absences}
            bankHolidays={bankHolidays}
            onAddLeave={() => setIsAdminLeaveModalOpen(true)}
            onNotify={notify}
          />
        )}
        {activeNav === 'Payroll reports' && isAdmin && (
          <PayrollReportsPage
            employees={employees}
            absences={absences}
            bankHolidays={bankHolidays}
            payrollEmail={company.payrollEmail}
            payPeriodStartDay={company.payPeriodStartDay}
            onNotify={notify}
          />
        )}
        {activeNav === 'Employees' && isAdmin && (
          <Employees
            employees={employees}
            company={company}
            bankHolidays={bankHolidays}
            onEditEmployee={setEditingEmployee}
            onAddEmployee={() => setIsAddEmployeeOpen(true)}
            onViewLeaveHistory={setLeaveHistoryEmployee}
            onUpdateEmployee={(employee) => {
              setEmployees((current) =>
                current.map((item) => (item.id === employee.id ? employee : item)),
              )
              notify(`${employee.name} ${employee.status === 'Active' ? 'reactivated' : 'marked inactive'}`)
            }}
          />
        )}
        {activeNav === 'Policies' && <Policies onNotify={notify} />}
        {activeNav === 'Documents' && !isAdmin && <Documents onNotify={notify} />}
        {activeNav === 'My leave' && !isAdmin && (
          <MyLeave
            employee={employees.find((item) => item.name === 'Sophie Carter')}
            absences={absences}
            requests={requests}
            company={company}
            bankHolidays={bankHolidays}
            leaveYear={leaveYear}
            onRequestLeave={() => setIsLeaveModalOpen(true)}
          />
        )}
        {activeNav === 'Settings' && isAdmin && (
          <SettingsPage
            company={company}
            bankHolidays={bankHolidays}
            onSave={saveCompanySettings}
            onBankHolidaysChange={setBankHolidays}
            onNotify={notify}
          />
        )}
      </main>

      {isLeaveModalOpen && (
        <LeaveModal
          employee={employees.find((item) => item.name === 'Sophie Carter')}
          company={company}
          bankHolidays={bankHolidays}
          absences={absences}
          requests={requests}
          leaveYear={leaveYear}
          onClose={() => setIsLeaveModalOpen(false)}
          onSubmit={submitLeaveRequest}
        />
      )}
      {isAdminLeaveModalOpen && (
        <AdminAddLeaveModal
          employees={employees.filter((employee) => employee.status === 'Active')}
          onClose={() => setIsAdminLeaveModalOpen(false)}
          onSubmit={addTeamLeave}
        />
      )}
      {isRecordAbsenceOpen && (
        <RecordAbsenceModal
          employees={employees.filter((employee) => employee.status === 'Active')}
          onClose={() => setIsRecordAbsenceOpen(false)}
          onSubmit={recordAbsence}
        />
      )}
      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          company={company}
          bankHolidays={bankHolidays}
          onClose={() => setEditingEmployee(null)}
          onSave={saveEmployee}
        />
      )}
      {isAddEmployeeOpen && (
        <AddEmployeeModal
          company={company}
          bankHolidays={bankHolidays}
          onClose={() => setIsAddEmployeeOpen(false)}
          onSave={addEmployee}
        />
      )}
      {leaveHistoryEmployee && (
        <EmployeeLeaveHistoryModal
          employee={leaveHistoryEmployee}
          company={company}
          bankHolidays={bankHolidays}
          absences={absences}
          requests={requests}
          leaveYear={leaveYear}
          onClose={() => setLeaveHistoryEmployee(null)}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function EmployeeDashboard({
  employee,
  absences,
  requests,
  company,
  bankHolidays,
  leaveYear,
  onRequestLeave,
  onNavigate,
  onNotify,
}: {
  employee?: Employee
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  onRequestLeave: () => void
  onNavigate: (nav: string) => void
  onNotify: (message: string) => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const remaining = employee
    ? remainingAnnualLeave(employee, entitlementSettings, bankHolidays, absences, requests, leaveYear)
    : 0
  const totalEntitlement = employee ? totalLeaveAllowance(employee, entitlementSettings, bankHolidays) : 0
  const pendingCount = employee
    ? requests.filter((request) => request.name === employee.name && request.status === 'Pending')
        .length
    : 0
  const percentRemaining =
    totalEntitlement > 0 ? Math.round((remaining / totalEntitlement) * 100) : 0
  const daysUntilReset = daysUntilLeaveYearEnd(APP_TODAY, leaveYear.end)
  const upcomingLeave = employee ? upcomingApprovedLeave(employee.id, absences, APP_TODAY) : []
  const employeeRequestRows = employee ? employeeRequestsSorted(requests, employee.name).slice(0, 3) : []
  const leaveYearEnd = leaveYearResetItem(leaveYear)
  const lastPending = employee
    ? requests
        .filter((request) => request.name === employee.name && request.status === 'Pending')
        .at(-1)
    : undefined

  return (
    <div className="page">
      <PageHeader
        eyebrow="Monday, 31 August 2026"
        title="Good morning, Sophie"
        description="Here’s a quick look at your time away and company updates."
        action={
          <button type="button" className="button button-primary" onClick={onRequestLeave}>
            <Plus size={17} />
            Request time off
          </button>
        }
      />

      <section className="employee-stats">
        <div className="card balance-card">
          <div className="card-topline">
            <span className="card-label">Holiday remaining</span>
            <span className="soft-icon soft-icon-coral">
              <CalendarDays size={17} />
            </span>
          </div>
          <div className={`balance-number ${remaining < 0 ? 'negative-number' : ''}`}>
            {employee ? (Number.isInteger(remaining) ? remaining : Math.round(remaining * 10) / 10) : '—'}{' '}
            <span>{employee?.entitlementUnit ?? 'days'}</span>
          </div>
          <div className="balance-meta">
            <span>of {totalEntitlement} {employee?.entitlementUnit ?? 'days'}</span>
            <strong>{percentRemaining}% remaining</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill coral-fill"
              style={{ width: `${Math.min(100, Math.max(0, percentRemaining))}%` }}
            />
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate('My leave')}
          >
            View breakdown <ChevronRight size={15} />
          </button>
        </div>
        <div className="card simple-stat">
          <div className="card-topline">
            <span className="card-label">Leave year</span>
            <span className="soft-icon soft-icon-lavender">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="stat-big">
            {daysUntilReset} <span>days</span>
          </div>
          <p>until your allowance resets</p>
          <div className="stat-footer">
            <span>{formatLeaveYearLabel(leaveYear)}</span>
            <CalendarDays size={15} />
          </div>
        </div>
        <div className="card simple-stat">
          <div className="card-topline">
            <span className="card-label">Pending requests</span>
            <span className="soft-icon soft-icon-mint">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="stat-big">
            {pendingCount} <span>{pendingCount === 1 ? 'request' : 'requests'}</span>
          </div>
          <p>{pendingCount === 0 ? 'nothing waiting for approval' : 'waiting for approval'}</p>
          <div className="stat-footer">
            <span>{lastPending ? `Last submitted ${lastPending.dates}` : 'No pending requests'}</span>
            <ChevronRight size={15} />
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="card upcoming-card">
          <div className="section-heading">
            <div>
              <h2>Upcoming leave</h2>
              <p>Your approved time away</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNavigate('My leave')}
            >
              View calendar <ChevronRight size={15} />
            </button>
          </div>
          <div className="leave-timeline">
            {upcomingLeave.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>No upcoming leave</strong>
                <span>Approved time away will appear here.</span>
              </div>
            ) : (
              upcomingLeave.map((record) => {
                const start = formatTimelineDate(record.start)
                return (
                  <div className="timeline-item" key={record.id}>
                    <div className="date-block">
                      <strong>{start.day}</strong>
                      <span>{start.month}</span>
                    </div>
                    <div className="timeline-line">
                      <span />
                    </div>
                    <div className="leave-detail">
                      <strong>Annual leave</strong>
                      <span>{formatAbsenceRange(record.start, record.end)}</span>
                    </div>
                    <span className="status approved">Approved</span>
                  </div>
                )
              })
            )}
            <div className="timeline-item">
              <div className="date-block muted-date">
                <strong>{leaveYearEnd.day}</strong>
                <span>{leaveYearEnd.month}</span>
              </div>
              <div className="timeline-line">
                <span />
              </div>
              <div className="leave-detail muted-detail">
                <strong>New leave year</strong>
                <span>Your balance will refresh on {leaveYearEnd.label}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card requests-card">
          <div className="section-heading">
            <div>
              <h2>My requests</h2>
              <p>Recent leave activity</p>
            </div>
            <MoreMenu
              items={[
                { label: 'Show pending only', onClick: () => onNavigate('My leave') },
                { label: 'Show approved only', onClick: () => onNavigate('My leave') },
                { label: 'Export history', onClick: () => onNotify('Export started') },
              ]}
            />
          </div>
          {employeeRequestRows.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No requests yet</strong>
              <span>Your leave requests will appear here.</span>
            </div>
          ) : (
            employeeRequestRows.map((request) => (
              <div className="request-row" key={request.id}>
                <div
                  className={`request-icon ${
                    request.status === 'Pending'
                      ? 'request-icon-pending'
                      : request.status === 'Approved'
                        ? 'request-icon-approved'
                        : 'request-icon-declined'
                  }`}
                >
                  {request.status === 'Pending' ? (
                    <Clock3 size={16} />
                  ) : request.status === 'Approved' ? (
                    <Check size={16} />
                  ) : (
                    <X size={16} />
                  )}
                </div>
                <div className="request-copy">
                  <strong>{request.dates}</strong>
                  <span>Annual leave · {request.duration}</span>
                </div>
                <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
              </div>
            ))
          )}
          <button
            type="button"
            className="full-link"
            onClick={() => onNavigate('My leave')}
          >
            View all requests <ChevronRight size={15} />
          </button>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="card policy-preview">
          <div className="section-heading">
            <div>
              <h2>Company policies</h2>
              <p>Keep up to date with the latest guidance</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNotify('Policies opened')}
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          <div className="policy-row">
            <div className="document-icon">
              <FileText size={17} />
            </div>
            <div>
              <strong>Annual leave policy</strong>
              <span>Updated 12 May 2026</span>
            </div>
            <ChevronRight size={16} />
          </div>
          <div className="policy-row">
            <div className="document-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
              <strong>Data protection & privacy</strong>
              <span>Updated 4 Feb 2026</span>
            </div>
            <ChevronRight size={16} />
          </div>
        </div>
        <div className="card reminder-card">
          <div className="reminder-blob">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="eyebrow">Friendly reminder</span>
            <h2>Take your time</h2>
            <p>You have 12.5 days left to use before 31 December 2026.</p>
          </div>
          <button type="button" className="button button-dark" onClick={onRequestLeave}>
            Plan some leave <ChevronRight size={15} />
          </button>
        </div>
      </section>
    </div>
  )
}

function AdminDashboard({
  requests,
  employees,
  absences,
  company,
  bankHolidays,
  leaveYear,
  pendingCount,
  onUpdateRequest,
  onAddEmployee,
  onNavigate,
  onNotify,
}: {
  requests: LeaveRequest[]
  employees: Employee[]
  absences: AbsenceRecord[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  pendingCount: number
  onUpdateRequest: (id: number, status: RequestStatus) => void
  onAddEmployee: () => void
  onNavigate: (nav: string) => void
  onNotify: (message: string) => void
}) {
  const pendingRequests = requests.filter((request) => request.status === 'Pending')
  const entitlementSettings = companyEntitlementSettings(company)
  const calendarDate = APP_TODAY

  return (
    <div className="page admin-page">
      <PageHeader
        eyebrow="Monday, 31 August 2026"
        title="Good morning, Alex"
        description="Here’s what needs your attention today."
        action={
          <button
            type="button"
            className="button button-primary"
            onClick={onAddEmployee}
          >
            <Plus size={17} />
            Add employee
          </button>
        }
      />
      <section className="admin-stats">
        <div className="card admin-stat-highlight">
          <div className="admin-stat-icon">
            <Clock3 size={18} />
          </div>
          <div>
            <span className="card-label">Needs your attention</span>
            <div className="admin-number">
              {pendingCount}{' '}
              <span>pending {pendingCount === 1 ? 'request' : 'requests'}</span>
            </div>
          </div>
          <ChevronRight size={17} />
        </div>
        <div className="card admin-stat">
          <span className="card-label">Team members</span>
          <div className="admin-stat-value">8</div>
          <span className="stat-trend">+2 this quarter</span>
        </div>
        <div className="card admin-stat">
          <span className="card-label">Away this week</span>
          <div className="admin-stat-value">2</div>
          <span className="stat-trend neutral">Across the team</span>
        </div>
        <div className="card admin-stat">
          <span className="card-label">Open documents</span>
          <div className="admin-stat-value">14</div>
          <span className="stat-trend neutral">No action needed</span>
        </div>
      </section>

      <section className="admin-content-grid">
        <div className="card pending-panel">
          <div className="section-heading">
            <div>
              <h2>
                Pending requests <span className="heading-count">{pendingCount}</span>
              </h2>
              <p>Review and respond to your team’s requests</p>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onNavigate('Requests')}
            >
              View all <ChevronRight size={15} />
            </button>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Check size={20} />
              </div>
              <strong>All caught up</strong>
              <span>There are no leave requests waiting for review.</span>
            </div>
          ) : (
            pendingRequests.map((request) => {
              const employee = employees.find((item) => item.name === request.name)
              const balanceAfter = employee
                ? remainingAnnualLeave(
                    employee,
                    entitlementSettings,
                    bankHolidays,
                    absences,
                    requests,
                    leaveYear,
                    parseDurationDays(request.duration),
                    request.id,
                  )
                : null

              return (
              <div className="admin-request" key={request.id}>
                <div className={`avatar avatar-${request.color}`}>{request.initials}</div>
                <div className="admin-request-main">
                  <strong>{request.name}</strong>
                  <span>
                    {request.dates} <i>·</i> {request.duration}
                  </span>
                  <small>{request.note}</small>
                </div>
                <div className="request-balance">
                  <span>Balance after</span>
                  <strong className={balanceAfter !== null && balanceAfter < 0 ? 'negative-number' : ''}>
                    {employee && balanceAfter !== null
                      ? formatBalanceAmount(balanceAfter, employee.entitlementUnit)
                      : '—'}
                  </strong>
                </div>
                <div className="request-actions">
                  <button
                    type="button"
                    className="approve-button"
                    onClick={() => onUpdateRequest(request.id, 'Approved')}
                  >
                    <Check size={15} />
                    Approve
                  </button>
                  <button
                    type="button"
                    className="decline-button"
                    onClick={() => onUpdateRequest(request.id, 'Declined')}
                  >
                    <X size={15} />
                    Decline
                  </button>
                </div>
              </div>
              )
            })
          )}
          {pendingRequests.length > 0 && (
            <div className="panel-footer">
              <span>Employees are notified when you respond (email delivery coming soon).</span>
              <button
                type="button"
                className="text-button"
                onClick={() => onNavigate('Settings')}
              >
                Notification settings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="card mini-calendar-card">
          <div className="section-heading">
            <div>
              <h2>{formatMonthYear(calendarDate)}</h2>
              <p>Team calendar</p>
            </div>
            <MoreMenu
              label="Calendar options"
              items={[
                { label: 'Go to team calendar', onClick: () => onNavigate('Team calendar') },
                { label: 'Export month', onClick: () => onNotify('Calendar export started') },
              ]}
            />
          </div>
          <MiniMonthCalendar
            viewDate={calendarDate}
            today={APP_TODAY}
            absences={absences}
            bankHolidays={bankHolidays}
            employees={employees.map((item) => ({
              id: item.id,
              name: item.name,
              color: item.color,
            }))}
          />
        </div>
      </section>

      <section className="card admin-tasks">
        <div className="section-heading">
          <div>
            <h2>Upcoming actions</h2>
            <p>Stay ahead of key people moments</p>
          </div>
          <button type="button" className="quiet-button" onClick={() => onNotify('Tasks view coming soon')}>
            Manage tasks <ChevronRight size={15} />
          </button>
        </div>
        <div className="task-list">
          <div className="task-item">
            <div className="task-date">
              <strong>15</strong>
              <span>SEP</span>
            </div>
            <div>
              <strong>Jamie Wilson’s probation ends</strong>
              <span>In 15 days · Set a reminder to schedule their review</span>
            </div>
            <span className="task-pill urgent">Soon</span>
            <MoreMenu
              items={[
                { label: 'Schedule review', onClick: () => onNotify('Review reminder created') },
                { label: 'Mark complete', onClick: () => onNotify('Task marked complete') },
                { label: 'Snooze', onClick: () => onNotify('Reminder snoozed for 7 days') },
              ]}
            />
          </div>
          <div className="task-item">
            <div className="task-date">
              <strong>02</strong>
              <span>OCT</span>
            </div>
            <div>
              <strong>Quarterly check-ins</strong>
              <span>4 team members · Not started</span>
            </div>
            <span className="task-pill">To do</span>
            <MoreMenu
              items={[
                { label: 'Start check-ins', onClick: () => onNotify('Check-in cycle started') },
                { label: 'Assign owners', onClick: () => onNotify('Owner assignment opened') },
                { label: 'Mark complete', onClick: () => onNotify('Task marked complete') },
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function AdminRequests({
  requests,
  employees,
  absences,
  company,
  bankHolidays,
  leaveYear,
  onUpdateRequest,
}: {
  requests: LeaveRequest[]
  employees: Employee[]
  absences: AbsenceRecord[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  onUpdateRequest: (id: number, status: RequestStatus) => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Leave management"
        title="Requests"
        description="Review, approve, and keep a record of team leave."
      />
      <div className="card full-panel">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input placeholder="Search requests" />
          </div>
          <button type="button" className="filter-button">
            All statuses <ChevronDown size={15} />
          </button>
          <button type="button" className="filter-button">
            This year <ChevronDown size={15} />
          </button>
        </div>
        {requests.map((request) => {
          const employee = employees.find((item) => item.name === request.name)
          const balanceAfter =
            request.status === 'Pending' && employee
              ? remainingAnnualLeave(
                  employee,
                  entitlementSettings,
                  bankHolidays,
                  absences,
                  requests,
                  leaveYear,
                  parseDurationDays(request.duration),
                  request.id,
                )
              : null

          return (
          <div className="admin-request" key={request.id}>
            <div className={`avatar avatar-${request.color}`}>{request.initials}</div>
            <div className="admin-request-main">
              <strong>{request.name}</strong>
              <span>
                {request.dates} <i>·</i> {request.duration}
              </span>
              <small>{request.note}</small>
            </div>
            {balanceAfter !== null && (
              <div className="request-balance">
                <span>Balance after</span>
                <strong className={balanceAfter < 0 ? 'negative-number' : ''}>
                  {formatBalanceAmount(balanceAfter, employee!.entitlementUnit)}
                </strong>
              </div>
            )}
            <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
            {request.status === 'Pending' && (
              <div className="request-actions">
                <button
                  type="button"
                  className="approve-button"
                  onClick={() => onUpdateRequest(request.id, 'Approved')}
                >
                  <Check size={15} />
                  Approve
                </button>
                <button
                  type="button"
                  className="decline-button"
                  onClick={() => onUpdateRequest(request.id, 'Declined')}
                >
                  <X size={15} />
                  Decline
                </button>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamCalendar({
  employees,
  absences,
  bankHolidays,
  onAddLeave,
  onNotify,
}: {
  employees: Employee[]
  absences: AbsenceRecord[]
  bankHolidays: BankHoliday[]
  onAddLeave: () => void
  onNotify: (message: string) => void
}) {
  const [viewDate, setViewDate] = useState(new Date(2026, 8, 1))
  const today = new Date(2026, 7, 31)
  const cells = useMemo(() => buildMonthGrid(viewDate), [viewDate])
  const bankHolidayByDate = useMemo(() => {
    const map = new Map<string, BankHoliday>()
    for (const holiday of bankHolidays) {
      map.set(holiday.date, holiday)
    }
    return map
  }, [bankHolidays])

  const eventsForDay = (date: Date) =>
    absences.filter((record) => dateInRange(date, record.start, record.end))

  const bankHolidayForDay = (date: Date) => bankHolidayByDate.get(toIsoDate(date))

  const bankHolidaysInView = useMemo(
    () =>
      bankHolidays.filter((holiday) => {
        const holidayDate = parseIsoDate(holiday.date)
        return (
          holidayDate.getFullYear() === viewDate.getFullYear() &&
          holidayDate.getMonth() === viewDate.getMonth()
        )
      }),
    [bankHolidays, viewDate],
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="Team visibility"
        title="Team calendar"
        description="See leave across your company at a glance."
        action={
          <button type="button" className="button button-primary" onClick={onAddLeave}>
            <Plus size={17} />
            Add leave
          </button>
        }
      />
      <div className="card calendar-large">
        <div className="calendar-large-header">
          <button
            type="button"
            className="circle-button"
            aria-label="Previous month"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <h2>{formatMonthYear(viewDate)}</h2>
          <button
            type="button"
            className="circle-button"
            aria-label="Next month"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
        <div className="large-calendar-grid">
          <div className="large-calendar-days">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
            {cells.map((cell) => {
              const dayEvents = eventsForDay(cell.date)
              const bankHoliday = bankHolidayForDay(cell.date)
              const isToday = toIsoDate(cell.date) === toIsoDate(today)
              return (
                <div
                  className={`large-day ${!cell.inMonth ? 'outside-month' : ''} ${isToday ? 'today-cell' : ''} ${bankHoliday ? 'has-bank-holiday' : ''}`}
                  key={toIsoDate(cell.date)}
                >
                  <span>{cell.day}</span>
                  {bankHoliday && (
                    <em
                      className="calendar-event yellow-event calendar-event-holiday"
                      title={bankHoliday.name}
                    >
                      Bank holiday · {bankHoliday.name}
                    </em>
                  )}
                  {dayEvents.map((event) => {
                    const employee = employees.find((item) => item.id === event.employeeId)
                    const label = ABSENCE_TYPE_LABELS[event.type]
                    const color = absenceTypeColor(event.type)
                    return (
                      <em
                        key={event.id}
                        className={`calendar-event ${color}-event`}
                        title={`${employee?.name ?? 'Employee'} · ${label}`}
                      >
                        {employee?.name.split(' ')[0] ?? 'Team'} · {label}
                      </em>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        <div className="calendar-legend calendar-legend-large">
          <span>
            <i className="legend-dot yellow-dot" />
            Bank holiday
          </span>
          <span>
            <i className="legend-dot coral-dot" />
            Annual leave
          </span>
          <span>
            <i className="legend-dot lavender-dot" />
            Sick leave
          </span>
        </div>
        <div className="calendar-footer-note">
          <span>
            {absences.length} absence entries · {bankHolidaysInView.length} bank{' '}
            {bankHolidaysInView.length === 1 ? 'holiday' : 'holidays'} this month
          </span>
          <button type="button" className="text-button" onClick={() => onNotify('Showing all leave entries')}>
            View list <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Employees({
  employees,
  company,
  bankHolidays,
  onEditEmployee,
  onAddEmployee,
  onViewLeaveHistory,
  onUpdateEmployee,
}: {
  employees: Employee[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onEditEmployee: (employee: Employee) => void
  onAddEmployee: () => void
  onViewLeaveHistory: (employee: Employee) => void
  onUpdateEmployee: (employee: Employee) => void
}) {
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
                { label: 'View leave history', onClick: () => onViewLeaveHistory(employee) },
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

function Policies({ onNotify }: { onNotify: (message: string) => void }) {
  const policyCards = [
    ['Annual leave policy', 'Updated 12 May 2026', 'How we request, approve, and plan annual leave.', 'coral'],
    ['Data protection & privacy', 'Updated 4 Feb 2026', 'How we look after personal and company information.', 'lavender'],
    ['Sickness & absence', 'Updated 18 Jan 2026', 'What to do when you need time away unexpectedly.', 'mint'],
  ]
  return (
    <div className="page">
      <PageHeader
        eyebrow="Company library"
        title="Policies"
        description="A shared home for the guidance that keeps everyone aligned."
        action={
          <button type="button" className="button button-primary" onClick={() => onNotify('Upload policy flow coming soon')}>
            <Plus size={17} />
            Add policy
          </button>
        }
      />
      <div className="policy-hero">
        <div className="policy-hero-icon">
          <BookOpen size={22} />
        </div>
        <div>
          <span className="eyebrow">For everyone</span>
          <h2>Policies, all in one place</h2>
          <p>Keep your team informed with the latest company guidance and ways of working.</p>
        </div>
        <div className="policy-hero-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="document-grid">
        {policyCards.map(([title, date, description, color]) => (
          <button
            type="button"
            className="document-card"
            key={title}
            onClick={() => onNotify(`${title} opened`)}
          >
            <div className={`document-large-icon ${color}`}>
              <FileText size={21} />
            </div>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span>
                {date} <ChevronRight size={14} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Documents({ onNotify }: { onNotify: (message: string) => void }) {
  const documents = [
    'Employee handbook',
    'Annual leave policy',
    'Data protection & privacy',
    'Health & safety guidance',
  ]
  return (
    <div className="page">
      <PageHeader
        eyebrow="Your files"
        title="Documents"
        description="Company documents shared with you."
      />
      <div className="card full-panel">
        <div className="document-list-heading">
          <span>Document</span>
          <span>Last updated</span>
          <span />
        </div>
        {documents.map((name, index) => (
          <button
            type="button"
            className="document-list-row"
            key={name}
            onClick={() => onNotify(`${name} opened`)}
          >
            <div className="document-list-title">
              <div className="document-icon">
                <FileText size={17} />
              </div>
              <strong>{name}</strong>
            </div>
            <span>{['12 May 2026', '4 Feb 2026', '4 Feb 2026', '18 Jan 2026'][index]}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}

function MyLeave({
  employee,
  absences,
  requests,
  company,
  bankHolidays,
  leaveYear,
  onRequestLeave,
}: {
  employee?: Employee
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  onRequestLeave: () => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const taken = employee ? annualLeaveTaken(absences, employee.id, employee.workingDays, leaveYear) : 0
  const remaining = employee
    ? remainingAnnualLeave(employee, entitlementSettings, bankHolidays, absences, requests, leaveYear)
    : 0
  const allowance = employee
    ? bookableEntitlement(employee, entitlementSettings, bankHolidays)
    : 0
  const totalEntitlement = employee
    ? totalLeaveAllowance(employee, entitlementSettings, bankHolidays)
    : 0
  const employeeRequests = employee
    ? requests
        .filter((request) => request.name === employee.name)
        .sort((a, b) => b.dates.localeCompare(a.dates))
    : []

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your time away"
        title="My leave"
        description="Plan ahead and keep track of every request."
        action={
          <button type="button" className="button button-primary" onClick={onRequestLeave}>
            <Plus size={17} />
            Request time off
          </button>
        }
      />
      <div className="card full-panel">
        <div className="leave-summary-row">
          <div>
            <span className="card-label">2026 entitlement</span>
            <div className="summary-number">
              {totalEntitlement} <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
            {employee?.entitlementMode === 'proRata' && (
              <p className="field-helper inline-helper">
                {allowance} pro-rated
                {employee.rollOver > 0 ? ` + ${employee.rollOver} roll-over` : ''}
                {company.entitlementIncludesBankHolidays ? ' bookable days' : ''}
              </p>
            )}
            {company.entitlementIncludesBankHolidays && employee && (
              <p className="field-helper inline-helper">
                {effectiveEntitlement(employee, entitlementSettings)} {employee.entitlementUnit}{' '}
                incl. bank holidays
              </p>
            )}
          </div>
          <div>
            <span className="card-label">Taken</span>
            <div className="summary-number">
              {taken} <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
          </div>
          <div>
            <span className="card-label">Remaining</span>
            <div className={`summary-number coral-number ${remaining < 0 ? 'negative-number' : ''}`}>
              {employee ? (Number.isInteger(remaining) ? remaining : Math.round(remaining * 10) / 10) : '—'}{' '}
              <span>{employee?.entitlementUnit ?? 'days'}</span>
            </div>
          </div>
        </div>
        <div className="section-heading leave-history-heading">
          <div>
            <h2>Leave history</h2>
            <p>All your requests for this leave year</p>
          </div>
        </div>
        {employeeRequests.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No leave requests yet</strong>
            <span>Requests you submit will appear here.</span>
          </div>
        ) : (
          employeeRequests.map((request) => (
            <div className="request-row leave-history-row" key={request.id}>
              <div
                className={`request-icon ${
                  request.status === 'Pending'
                    ? 'request-icon-pending'
                    : request.status === 'Approved'
                      ? 'request-icon-approved'
                      : 'request-icon-declined'
                }`}
              >
                {request.status === 'Pending' ? (
                  <Clock3 size={16} />
                ) : request.status === 'Approved' ? (
                  <Check size={16} />
                ) : (
                  <X size={16} />
                )}
              </div>
              <div className="request-copy">
                <strong>{request.dates}</strong>
                <span>Annual leave · {request.duration}</span>
              </div>
              <span className={`status ${request.status.toLowerCase()}`}>{request.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SettingsPage({
  company,
  bankHolidays,
  onSave,
  onBankHolidaysChange,
  onNotify,
}: {
  company: CompanySettings
  bankHolidays: BankHoliday[]
  onSave: (settings: CompanySettings) => void
  onBankHolidaysChange: (holidays: BankHoliday[]) => void
  onNotify: (message: string) => void
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('company')
  const [draft, setDraft] = useState(company)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(company)
  }, [company])

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'company', label: 'Company settings' },
    { id: 'leave', label: 'Leave policies' },
    { id: 'payroll', label: 'Payroll reports' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security & access' },
  ]

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDraft((current) => ({ ...current, logoUrl: String(reader.result) }))
      onNotify('Company logo updated')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace control"
        title="Settings"
        description={`Configure how ${company.name} manages leave and access.`}
      />
      <div className="settings-layout">
        <div className="settings-menu">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`settings-menu-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="card settings-card">
          {activeTab === 'company' && (
            <>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Company profile</h2>
                  <p>Update the name and logo shown across Finch.</p>
                </div>
                <div className="company-profile-fields">
                  <label>
                    Company name
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </label>
                  <div className="logo-upload-block">
                    <span className="field-label">Company logo</span>
                    <div className="logo-preview-row">
                      {draft.logoUrl ? (
                        <img className="logo-preview" src={draft.logoUrl} alt="" />
                      ) : (
                        <div className="logo-preview logo-preview-fallback">
                          {companyInitials(draft.name) || 'CO'}
                        </div>
                      )}
                      <div className="logo-upload-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          Upload logo
                        </button>
                        {draft.logoUrl && (
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => setDraft({ ...draft, logoUrl: null })}
                          >
                            Remove logo
                          </button>
                        )}
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={handleLogoUpload}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-divider" />
              <div className="settings-section">
                <div>
                  <h2>Leave year</h2>
                  <p>Set the period used to calculate everyone’s entitlement.</p>
                </div>
                <div className="settings-fields">
                  <label>
                    Starts
                    <select
                      value={draft.leaveYearStart}
                      onChange={(event) =>
                        setDraft({ ...draft, leaveYearStart: event.target.value })
                      }
                    >
                      <option>January</option>
                      <option>April</option>
                      <option>July</option>
                    </select>
                  </label>
                  <label>
                    Ends
                    <select
                      value={draft.leaveYearEnd}
                      onChange={(event) => setDraft({ ...draft, leaveYearEnd: event.target.value })}
                    >
                      <option>December</option>
                      <option>March</option>
                      <option>June</option>
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}

          {activeTab === 'leave' && (
            <>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Entitlement basis</h2>
                  <p>Choose how the figures below relate to bank holidays.</p>
                </div>
                <div className="radio-list">
                  <label className="radio-row">
                    <input
                      type="radio"
                      name="entitlement-basis"
                      checked={!draft.entitlementIncludesBankHolidays}
                      onChange={() =>
                        setDraft({ ...draft, entitlementIncludesBankHolidays: false })
                      }
                    />
                    <span>
                      <strong>Excluding bank holidays</strong> — enter bookable leave only
                    </span>
                  </label>
                  <label className="radio-row">
                    <input
                      type="radio"
                      name="entitlement-basis"
                      checked={draft.entitlementIncludesBankHolidays}
                      onChange={() =>
                        setDraft({ ...draft, entitlementIncludesBankHolidays: true })
                      }
                    />
                    <span>
                      <strong>Including bank holidays</strong> — enter the contract total
                    </span>
                  </label>
                </div>
                <EntitlementBasisNote includesBankHolidays={draft.entitlementIncludesBankHolidays} />
              </div>
              <div className="settings-divider" />
              <div className="settings-section">
                <div>
                  <h2>Default entitlement</h2>
                  <p>Full-time annual allowance used to pro-rate part-time employees.</p>
                </div>
                <div className="settings-fields">
                  <label>
                    Amount
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={draft.defaultEntitlement}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          defaultEntitlement: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      value={draft.defaultEntitlementUnit}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          defaultEntitlementUnit: event.target.value as 'days' | 'hours',
                        })
                      }
                    >
                      <option value="days">Days</option>
                      <option value="hours">Hours</option>
                    </select>
                  </label>
                </div>
                <EntitlementBasisNote includesBankHolidays={draft.entitlementIncludesBankHolidays} />
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <WorkingDaysPicker
                  value={draft.defaultWorkingDays}
                  onChange={(defaultWorkingDays) => setDraft({ ...draft, defaultWorkingDays })}
                />
                <p className="field-helper">
                  Part-time allowances are calculated as a proportion of working days (rounded to
                  the nearest half day).
                </p>
              </div>
              <div className="settings-divider" />
              <div className="settings-section">
                <div>
                  <h2>Default roll-over</h2>
                  <p>Roll-over is off by default. You can add it manually for individual employees.</p>
                </div>
                <button
                  type="button"
                  className={`toggle ${draft.defaultRollOver ? 'on' : 'off'}`}
                  aria-label={draft.defaultRollOver ? 'Roll-over enabled' : 'Roll-over disabled'}
                  onClick={() =>
                    setDraft({ ...draft, defaultRollOver: !draft.defaultRollOver })
                  }
                >
                  <i />
                </button>
              </div>
            </>
          )}

          {activeTab === 'payroll' && (
            <>
              <div className="payroll-notice settings-payroll-notice">{PAYROLL_DISCLAIMER}</div>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Payroll email</h2>
                  <p>Reports will be sent to this address when automated delivery is enabled.</p>
                </div>
                <label>
                  Email address
                  <input
                    type="email"
                    value={draft.payrollEmail}
                    onChange={(event) => setDraft({ ...draft, payrollEmail: event.target.value })}
                    placeholder="payroll@example.com"
                  />
                </label>
              </div>
              <div className="settings-divider" />
              <div className="settings-section">
                <div>
                  <h2>Automated payroll reports</h2>
                  <p>Email a CSV report after each monthly pay period closes.</p>
                </div>
                <button
                  type="button"
                  className={`toggle ${draft.autoSendPayrollReport ? 'on' : 'off'}`}
                  aria-label={
                    draft.autoSendPayrollReport
                      ? 'Automated payroll reports enabled'
                      : 'Automated payroll reports disabled'
                  }
                  onClick={() =>
                    setDraft({ ...draft, autoSendPayrollReport: !draft.autoSendPayrollReport })
                  }
                >
                  <i />
                </button>
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Pay period schedule</h2>
                  <p>{describePayPeriodSchedule(draft.payPeriodStartDay)}</p>
                </div>
                <label>
                  Pay period starts on day
                  <select
                    value={draft.payPeriodStartDay}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        payPeriodStartDay: Number(event.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                        {day === 1 ? ' (calendar month)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Automated report timing</h2>
                  <p>Send the payroll report this many days after each pay period ends.</p>
                </div>
                <label>
                  Send report on day
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={draft.autoSendDayOfMonth}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        autoSendDayOfMonth: Number(event.target.value) || 1,
                      })
                    }
                  />
                </label>
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Bank holidays</h2>
                  <p>Used in payroll reports. England &amp; Wales 2026 is loaded by default.</p>
                </div>
                <label>
                  Region
                  <select
                    value={draft.bankHolidayRegion}
                    onChange={(event) => {
                      const region = event.target.value as BankHolidayRegion
                      setDraft({ ...draft, bankHolidayRegion: region })
                      if (region !== 'custom') {
                        onBankHolidaysChange(bankHolidaysForRegion(region))
                      }
                    }}
                  >
                    <option value="england-wales">England &amp; Wales</option>
                    <option value="scotland">Scotland</option>
                    <option value="ni">Northern Ireland</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="bank-holiday-list">
                  {bankHolidays.map((holiday) => (
                    <div className="bank-holiday-row" key={holiday.date}>
                      <span>{formatDisplayDate(holiday.date)}</span>
                      <strong>{holiday.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'notifications' && (
            <>
              <div className="settings-callout">
                <strong>Email delivery is not live yet.</strong>
                <p>
                  Finch stores your notification preferences locally, but no emails are sent from
                  this app today. Sending mail requires a backend with SMTP credentials (or a
                  service such as SendGrid or Amazon SES). That setup is planned for a later
                  release.
                </p>
              </div>
              <div className="settings-section">
                <div>
                  <h2>Email notifications</h2>
                  <p>When email is enabled, send mail when leave requests are submitted or reviewed.</p>
                </div>
                <button
                  type="button"
                  className={`toggle ${draft.emailNotifications ? 'on' : 'off'}`}
                  aria-label={
                    draft.emailNotifications
                      ? 'Email notifications enabled'
                      : 'Email notifications disabled'
                  }
                  onClick={() =>
                    setDraft({ ...draft, emailNotifications: !draft.emailNotifications })
                  }
                >
                  <i />
                </button>
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Notification events</h2>
                  <p>Choose which events trigger an email.</p>
                </div>
                <div className="checkbox-list">
                  {NOTIFICATION_EVENT_IDS.map((eventId) => (
                    <label key={eventId} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.notificationEvents[eventId]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            notificationEvents: {
                              ...draft.notificationEvents,
                              [eventId]: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>{NOTIFICATION_EVENT_LABELS[eventId]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Two-factor authentication</h2>
                  <p>Choose who must use password + 2FA, including passkeys.</p>
                </div>
                <div className="radio-list">
                  {([
                    ['all', 'Required for everyone'],
                    ['admins', 'Required for admins only'],
                    ['optional', 'Optional for all users'],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="radio-row">
                      <input
                        type="radio"
                        name="twoFactorRequired"
                        checked={draft.twoFactorRequired === value}
                        onChange={() => setDraft({ ...draft, twoFactorRequired: value })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="settings-divider" />
              <div className="settings-section">
                <div>
                  <h2>Admin accounts</h2>
                  <p>Manage who can approve leave, edit settings, and upload documents.</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => onNotify('Admin management opened')}
                >
                  Manage admins
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            className="button button-primary save-settings"
            onClick={() => onSave(draft)}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

function LeaveModal({
  employee,
  company,
  bankHolidays,
  leaveYear,
  absences,
  requests,
  onClose,
  onSubmit,
}: {
  employee?: Employee
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  absences: AbsenceRecord[]
  requests: LeaveRequest[]
  onClose: () => void
  onSubmit: (payload: {
    start: string
    end: string
    days: number
    note: string
    leaveType: string
  }) => void
}) {
  const entitlementSettings = companyEntitlementSettings(company)
  const [startDate, setStartDate] = useState('2026-09-18')
  const [endDate, setEndDate] = useState('2026-09-19')
  const [leaveType, setLeaveType] = useState('Annual leave')
  const [note, setNote] = useState('')
  const dayCount = useMemo(
    () =>
      employee
        ? countWorkingDaysInRange(startDate, endDate, employee.workingDays)
        : countWeekdaysInRange(startDate, endDate),
    [startDate, endDate, employee],
  )
  const remainingAfter =
    employee && leaveType === 'Annual leave' && dayCount > 0
      ? remainingAnnualLeave(employee, entitlementSettings, bankHolidays, absences, requests, leaveYear, dayCount)
      : null
  const overAllowance = remainingAfter !== null && remainingAfter < 0

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">New request</span>
            <h2 id="leave-title">Request time off</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <label>
            Leave type
            <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
              <option>Annual leave</option>
              <option>Unpaid leave</option>
              <option>Other</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              First day
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              Last day
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="days-preview">
            <CalendarDays size={17} />
            <span>This request uses</span>
            <strong>
              {dayCount > 0
                ? `${dayCount} working ${dayCount === 1 ? 'day' : 'days'}`
                : '—'}
            </strong>
          </div>
          {employee && leaveType === 'Annual leave' && dayCount > 0 && remainingAfter !== null && (
            <div className={`allowance-preview ${overAllowance ? 'allowance-preview-warning' : ''}`}>
              <span>Balance after this request</span>
              <strong className={overAllowance ? 'negative-number' : ''}>
                {formatBalanceAmount(remainingAfter, employee.entitlementUnit)}
              </strong>
              {overAllowance && (
                <p>You will be asked to confirm before submitting because this exceeds your allowance.</p>
              )}
            </div>
          )}
          <label>
            Note <span className="optional">(optional)</span>
            <textarea
              placeholder="Add a note for Alex..."
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={dayCount <= 0}
            onClick={() =>
              onSubmit({
                start: startDate,
                end: endDate,
                days: dayCount,
                note,
                leaveType,
              })
            }
          >
            Send request <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
