import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { EntitlementBasisNote } from '../components/EntitlementBasisNote'
import { PageHeader } from '../components/PageHeader'
import { WorkingDaysPicker } from '../components/WorkingDaysPicker'
import {
  activeAdminCount,
  type Account,
  type AccountRole,
} from '../auth'
import { companyInitials, type CompanySettings, type SettingsTab } from '../domain'
import {
  bankHolidaysOverlappingMandatoryRanges,
  confirmationForLeaveYear,
  leaveYearKey,
  mandatoryBookingSignature,
  nextMandatoryRangeId,
  upsertMandatoryConfirmation,
  type MandatoryLeaveConfirmation,
  type MandatoryLeaveRange,
} from '../mandatoryLeave'
import { formatLeaveYearLabel, type LeaveYearPeriod } from '../leaveYear'
import { NOTIFICATION_EVENT_IDS, NOTIFICATION_EVENT_LABELS } from '../notifications'
import {
  changePasswordRequest,
  confirmTwoFactor,
  disableTwoFactor,
  fetchNotificationStatus,
  fetchTwoFactorStatus,
  setupTwoFactor,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnRemovePasskey,
  type PublicAccount,
} from '../api'
import {
  browserSupportsWebAuthn,
  startRegistration,
} from '@simplewebauthn/browser'
import {
  PAYROLL_DISCLAIMER,
  bankHolidaysForRegion,
  describePayPeriodSchedule,
  formatDisplayDate,
  type BankHoliday,
  type BankHolidayRegion,
} from '../payroll'

export function SettingsPage({
  company,
  bankHolidays,
  leaveYear,
  initialTab = 'company',
  accounts,
  currentAccountId,
  onSave,
  onBankHolidaysChange,
  onNotify,
  onOpenLeaveYears,
  onUpdateAccount,
  onAddAccount,
  onSessionAccountUpdated,
}: {
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  initialTab?: SettingsTab
  accounts: Account[]
  currentAccountId: number
  onSave: (settings: CompanySettings) => void
  onBankHolidaysChange: (holidays: BankHoliday[]) => void
  onNotify: (message: string) => void
  onOpenLeaveYears?: () => void
  onUpdateAccount: (account: Account) => void
  onAddAccount: (payload: {
    email: string
    displayName: string
    role: AccountRole
    jobTitle?: string
  }) => Promise<string | null>
  onSessionAccountUpdated?: (account: PublicAccount) => void
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [draft, setDraft] = useState(company)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccountEmail, setNewAccountEmail] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountRole, setNewAccountRole] = useState<AccountRole>('employee')
  const [addAccountBusy, setAddAccountBusy] = useState(false)
  const [mailStatus, setMailStatus] = useState<{ configured: boolean; from: string | null } | null>(
    null,
  )
  const currentAccount = accounts.find((item) => item.id === currentAccountId)
  const currentIsPrimary = Boolean(currentAccount?.isPrimary)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchNotificationStatus()
      if (cancelled) return
      if (result.ok) setMailStatus(result.data)
      else setMailStatus({ configured: false, from: null })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setDraft(company)
  }, [company])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const yearKey = leaveYearKey(leaveYear)
  const confirmation = confirmationForLeaveYear(draft.mandatoryLeaveConfirmations, leaveYear)
  const [noneThisYear, setNoneThisYear] = useState(confirmation?.noneThisYear ?? false)
  const [ranges, setRanges] = useState<MandatoryLeaveRange[]>(confirmation?.ranges ?? [])
  const effectiveBankHolidays =
    bankHolidays.length > 0
      ? bankHolidays
      : bankHolidaysForRegion(draft.bankHolidayRegion)

  useEffect(() => {
    const current = confirmationForLeaveYear(draft.mandatoryLeaveConfirmations, leaveYear)
    setNoneThisYear(current?.noneThisYear ?? false)
    setRanges(current?.ranges ?? [])
  }, [draft.mandatoryLeaveConfirmations, leaveYear])

  useEffect(() => {
    if (bankHolidays.length === 0) {
      onBankHolidaysChange(bankHolidaysForRegion(draft.bankHolidayRegion))
    }
  }, [bankHolidays.length, draft.bankHolidayRegion, onBankHolidaysChange])

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

  const validMandatoryRanges = ranges.filter(
    (range) => range.start && range.end && range.start <= range.end,
  )
  const overlappingBankHolidays =
    !noneThisYear
      ? bankHolidaysOverlappingMandatoryRanges(validMandatoryRanges, effectiveBankHolidays)
      : []

  const commitSave = (mandatoryLeaveConfirmations: MandatoryLeaveConfirmation[]) => {
    onSave({
      ...draft,
      defaultEntitlementUnit:
        draft.defaultEntitlementUnit === 'hours' ? 'days' : draft.defaultEntitlementUnit,
      mandatoryLeaveConfirmations,
    })
  }

  const saveSettings = () => {
    let mandatoryLeaveConfirmations = draft.mandatoryLeaveConfirmations
    let nextConfirmations = mandatoryLeaveConfirmations
    let mandatoryChanged = false

    if (activeTab === 'leave') {
      const previous = confirmationForLeaveYear(draft.mandatoryLeaveConfirmations, leaveYear)
      const nextDraft = {
        leaveYearKey: yearKey,
        noneThisYear,
        ranges: noneThisYear ? [] : validMandatoryRanges,
        confirmedAt: previous?.confirmedAt ?? new Date().toISOString(),
      }
      const shouldPersist =
        noneThisYear || validMandatoryRanges.length > 0 || Boolean(previous)
      const contentChanged =
        mandatoryBookingSignature(previous) !== mandatoryBookingSignature(nextDraft)

      if (shouldPersist && contentChanged) {
        nextConfirmations = upsertMandatoryConfirmation(draft.mandatoryLeaveConfirmations, {
          ...nextDraft,
          confirmedAt: new Date().toISOString(),
        })
        mandatoryChanged = true
      }

      if (mandatoryChanged) {
        mandatoryLeaveConfirmations = nextConfirmations
      }
    }

    commitSave(mandatoryLeaveConfirmations)
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
                  <p>Set the period used to calculate everyone’s entitlement. This must be confirmed before employees can request leave.</p>
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
                <p className="field-helper">
                  Current period: {formatLeaveYearLabel(leaveYear)}
                  {draft.leaveYearConfigured ? ' · Confirmed' : ' · Not confirmed yet'}
                </p>
                <div className="settings-inline-actions">
                  {!draft.leaveYearConfigured && (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => {
                        const next = {
                          ...draft,
                          leaveYearConfigured: true,
                          leaveYearConfiguredAt:
                            draft.leaveYearConfiguredAt ??
                            new Date().toISOString().slice(0, 10),
                        }
                        setDraft(next)
                        onSave({
                          ...next,
                          mandatoryLeaveConfirmations: draft.mandatoryLeaveConfirmations,
                        })
                      }}
                    >
                      Confirm leave year
                    </button>
                  )}
                  {draft.leaveYearConfigured && onOpenLeaveYears && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={onOpenLeaveYears}
                    >
                      Review leave year close
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'leave' && (
            <>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Mandatory annual leave</h2>
                  <p>
                    For {formatLeaveYearLabel(leaveYear)}. Saving books approved annual leave for
                    every active employee on these dates. Bank holidays inside a range are skipped
                    automatically and do not reduce entitlement. To exempt someone, cancel their
                    booking from Requests.
                  </p>
                </div>
                {!draft.leaveYearConfigured ? (
                  <p className="field-helper">
                    Confirm your leave year under Company settings before setting mandatory dates.
                  </p>
                ) : (
                  <>
                    <div className="radio-list">
                      <label className="radio-row">
                        <input
                          type="radio"
                          name="mandatory-leave-mode"
                          checked={noneThisYear}
                          onChange={() => {
                            setNoneThisYear(true)
                            setRanges([])
                          }}
                        />
                        <span>
                          <strong>None this leave year</strong> — no company-required shutdown
                        </span>
                      </label>
                      <label className="radio-row">
                        <input
                          type="radio"
                          name="mandatory-leave-mode"
                          checked={!noneThisYear}
                          onChange={() => setNoneThisYear(false)}
                        />
                        <span>
                          <strong>Set mandatory dates</strong> — creates approved leave for the whole team
                        </span>
                      </label>
                    </div>
                    {!noneThisYear && (
                      <div className="mandatory-range-list">
                        {ranges.map((range, index) => (
                          <div className="mandatory-range-row" key={range.id}>
                            <label>
                              From
                              <input
                                type="date"
                                value={range.start}
                                onChange={(event) =>
                                  setRanges((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, start: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              To
                              <input
                                type="date"
                                value={range.end}
                                onChange={(event) =>
                                  setRanges((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, end: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Label <span className="optional">(optional)</span>
                              <input
                                value={range.label ?? ''}
                                placeholder="Christmas shutdown"
                                onChange={(event) =>
                                  setRanges((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, label: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="icon-button danger-icon-button"
                              aria-label="Remove range"
                              onClick={() =>
                                setRanges((current) =>
                                  current.filter((_, itemIndex) => itemIndex !== index),
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => {
                            setRanges((current) => [
                              ...current,
                              {
                                id: nextMandatoryRangeId(current),
                                start: '',
                                end: '',
                                label: '',
                              },
                            ])
                          }}
                        >
                          <Plus size={15} />
                          Add date range
                        </button>
                        {overlappingBankHolidays.length > 0 && (
                          <div className="setup-banner setup-banner-info mandatory-bank-holiday-warning">
                            <div>
                              <strong>Bank holidays will be skipped</strong>
                              <span>
                                {overlappingBankHolidays
                                  .map((holiday) => holiday.name)
                                  .join(', ')}{' '}
                                fall inside your ranges and won’t be booked as annual leave.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="settings-divider" />
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
                    </select>
                  </label>
                </div>
                <p className="field-helper">
                  Leave booking currently uses working days. Hours-based entitlement will come later.
                </p>
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
                  <p>
                    {draft.defaultRollOver
                      ? 'Leave year close will propose carrying unused leave into the next year. Admins can still edit each opening balance, and individual employees can override roll-over.'
                      : 'Leave year close will propose zero opening for unused leave by default (deficits are still proposed). Admins can still edit each opening balance, and individual employees can enable roll-over.'}
                  </p>
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
                  <p>
                    When enabled, Finch emails a CSV plus summary after each pay period ends (once
                    SMTP is configured). Manual send from Payroll reports still works anytime.
                  </p>
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
                  {effectiveBankHolidays.map((holiday) => (
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
                {mailStatus?.configured ? (
                  <>
                    <strong>Email delivery is active.</strong>
                    <p>
                      Finch sends notification emails via the server SMTP settings
                      {mailStatus.from ? ` (from ${mailStatus.from})` : ''}. Recipients are
                      resolved from account emails — admins for submissions, the employee for
                      reviews.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Email delivery is not configured yet.</strong>
                    <p>
                      Preferences below are saved and will apply once outbound email is set up on
                      the server. Until then, Finch shows in-app notices only — invites and password
                      reset emails will not send.
                    </p>
                  </>
                )}
              </div>
              <div className="settings-section">
                <div>
                  <h2>Email notifications</h2>
                  <p>When enabled, Finch emails the events selected below.</p>
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
                  <h2>Two-factor policy</h2>
                  <p>Choose who must use an authenticator app when signing in.</p>
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
                <p className="field-helper">
                  People covered by the policy must enrol a passkey or authenticator before they can
                  use Finch. Optional mode lets anyone turn 2FA on for their own account.
                </p>
              </div>
              <div className="settings-divider" />
              <ChangePasswordPanel onNotify={onNotify} />
              <div className="settings-divider" />
              <TwoFactorAccountPanel
                onNotify={onNotify}
                onAccountUpdated={(account) => {
                  onSessionAccountUpdated?.(account)
                }}
              />
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Approvals</h2>
                  <p>
                    Organisation-wide rule for leave and expense review. It applies to every
                    non-primary admin — not per account.
                  </p>
                </div>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.adminsCanApproveOwnRequests}
                    disabled={!currentIsPrimary}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        adminsCanApproveOwnRequests: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Allow non-primary admins to approve their own requests</strong>
                    <span className="field-helper">
                      {currentIsPrimary
                        ? 'Off by default. Changing this affects all non-primary admins. Primary admins can always review their own requests.'
                        : 'Only the primary admin can change this setting.'}
                    </span>
                  </span>
                </label>
              </div>
              <div className="settings-divider" />
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Accounts</h2>
                  <p>
                    Manage who can sign in and approve leave. Every account includes an employee
                    profile automatically — use the Admin / Employee switch in the top bar to move
                    between views.
                  </p>
                </div>
                <div className="account-admin-list">
                  {accounts.map((account) => {
                    const isSelf = account.id === currentAccountId
                    const isPrimary = Boolean(account.isPrimary)
                    const isLastAdmin =
                      account.role === 'admin' &&
                      account.status === 'Active' &&
                      activeAdminCount(accounts) <= 1
                    return (
                      <div className="account-admin-row" key={account.id}>
                        <div className="account-admin-copy">
                          <strong>
                            {account.displayName}
                            {isSelf ? ' (you)' : ''}
                            {isPrimary ? ' · primary' : ''}
                          </strong>
                          <span>
                            {account.email} · {account.role}
                            {account.mustSetPassword ? ' · invite pending' : ''}
                            {account.status === 'Inactive' ? ' · inactive' : ''}
                          </span>
                        </div>
                        <div className="account-admin-actions">
                          {account.role === 'admin' ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={isLastAdmin || isPrimary}
                              title={
                                isPrimary
                                  ? 'Transfer primary ownership before removing admin'
                                  : isLastAdmin
                                    ? 'Keep at least one active admin'
                                    : undefined
                              }
                              onClick={() =>
                                onUpdateAccount({ ...account, role: 'employee' })
                              }
                            >
                              Make employee
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => onUpdateAccount({ ...account, role: 'admin' })}
                            >
                              Make admin
                            </button>
                          )}
                          {account.status === 'Active' ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={isSelf || isLastAdmin || isPrimary}
                              title={
                                isPrimary
                                  ? 'Cannot deactivate the primary admin'
                                  : isSelf
                                    ? 'You cannot deactivate your own account'
                                    : isLastAdmin
                                      ? 'Keep at least one active admin'
                                      : undefined
                              }
                              onClick={() =>
                                onUpdateAccount({ ...account, status: 'Inactive' })
                              }
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() =>
                                onUpdateAccount({ ...account, status: 'Active' })
                              }
                            >
                              Activate
                            </button>
                          )}
                          {currentIsPrimary && !isPrimary && (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() =>
                                onUpdateAccount({ ...account, isPrimary: true, role: 'admin' })
                              }
                            >
                              Make primary
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {!showAddAccount ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowAddAccount(true)}
                  >
                    <Plus size={15} />
                    Invite account
                  </button>
                ) : (
                  <div className="account-add-form">
                    <strong className="account-add-heading">Invite account</strong>
                    <p className="field-helper">
                      Sends a set-password link by email. Prefer People → Add employee for new
                      hires.
                    </p>
                    <label>
                      Email
                      <input
                        type="email"
                        value={newAccountEmail}
                        onChange={(event) => setNewAccountEmail(event.target.value)}
                      />
                    </label>
                    <label>
                      Display name
                      <input
                        value={newAccountName}
                        onChange={(event) => setNewAccountName(event.target.value)}
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={newAccountRole}
                        onChange={(event) =>
                          setNewAccountRole(event.target.value as AccountRole)
                        }
                      >
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    {newAccountRole === 'admin' && currentIsPrimary && (
                      <label className="toggle-row account-add-approval-policy">
                        <input
                          type="checkbox"
                          checked={draft.adminsCanApproveOwnRequests}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              adminsCanApproveOwnRequests: event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>Allow non-primary admins to approve their own requests</strong>
                          <span className="field-helper">
                            Organisation-wide setting for all non-primary admins — not only this
                            account. Primary admins can always approve their own.
                          </span>
                        </span>
                      </label>
                    )}
                    <div className="account-admin-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setShowAddAccount(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={addAccountBusy}
                        onClick={async () => {
                          setAddAccountBusy(true)
                          const error = await onAddAccount({
                            email: newAccountEmail,
                            displayName: newAccountName,
                            role: newAccountRole,
                          })
                          setAddAccountBusy(false)
                          if (error) {
                            onNotify(error)
                            return
                          }
                          if (
                            newAccountRole === 'admin' &&
                            currentIsPrimary &&
                            draft.adminsCanApproveOwnRequests !==
                              company.adminsCanApproveOwnRequests
                          ) {
                            onSave({
                              ...draft,
                              defaultEntitlementUnit:
                                draft.defaultEntitlementUnit === 'hours'
                                  ? 'days'
                                  : draft.defaultEntitlementUnit,
                            })
                          }
                          setShowAddAccount(false)
                          setNewAccountEmail('')
                          setNewAccountName('')
                          setNewAccountRole('employee')
                        }}
                      >
                        Send invite
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            className="button button-primary save-settings"
            onClick={saveSettings}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangePasswordPanel({ onNotify }: { onNotify: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }
    setBusy(true)
    try {
      const result = await changePasswordRequest(currentPassword, newPassword)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onNotify('Password updated')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section settings-section-stack">
      <div>
        <h2>Password</h2>
        <p>Change the password you use to sign in.</p>
      </div>
      <form className="totp-setup-panel" onSubmit={(event) => void submit(event)}>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}

function TwoFactorAccountPanel({
  onNotify,
  onAccountUpdated,
}: {
  onNotify: (message: string) => void
  onAccountUpdated: (account: PublicAccount) => void
}) {
  const [status, setStatus] = useState<{
    totpEnabled: boolean
    recoveryCodesRemaining: number
    passkeyCount: number
    passkeys: { id: string; name: string; createdAt: string | null; backedUp: boolean }[]
    secondFactorEnabled: boolean
    required: boolean
  } | null>(null)
  const [mode, setMode] = useState<'idle' | 'setup' | 'disable' | 'codes' | 'removePasskey'>('idle')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passkeyToRemove, setPasskeyToRemove] = useState<string | null>(null)
  const passkeysSupported = browserSupportsWebAuthn()

  const refresh = async () => {
    const result = await fetchTwoFactorStatus()
    if (result.ok) {
      setStatus({
        totpEnabled: result.data.totpEnabled,
        recoveryCodesRemaining: result.data.recoveryCodesRemaining,
        passkeyCount: result.data.passkeyCount,
        passkeys: result.data.passkeys,
        secondFactorEnabled: result.data.secondFactorEnabled,
        required: result.data.required,
      })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const beginSetup = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await setupTwoFactor()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSecret(result.data.secret)
      setQrDataUrl(result.data.qrDataUrl)
      setCode('')
      setMode('setup')
    } finally {
      setBusy(false)
    }
  }

  const confirmSetup = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await confirmTwoFactor(code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setRecoveryCodes(result.data.recoveryCodes)
      onAccountUpdated(result.data.account)
      setMode('codes')
      await refresh()
      onNotify('Authenticator enabled')
    } finally {
      setBusy(false)
    }
  }

  const addPasskey = async () => {
    setError('')
    setBusy(true)
    try {
      const options = await webauthnRegisterOptions()
      if (!options.ok) {
        setError(options.error)
        return
      }
      const credential = await startRegistration({ optionsJSON: options.data as never })
      const result = await webauthnRegisterVerify(credential, 'Passkey')
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAccountUpdated(result.data.account)
      if (result.data.recoveryCodes?.length) {
        setRecoveryCodes(result.data.recoveryCodes)
        setMode('codes')
      } else {
        setMode('idle')
      }
      await refresh()
      onNotify('Passkey added')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey setup was cancelled'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await disableTwoFactor(password, code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAccountUpdated(result.data.account)
      setMode('idle')
      setPassword('')
      setCode('')
      await refresh()
      onNotify('Authenticator disabled')
    } finally {
      setBusy(false)
    }
  }

  const removeSelectedPasskey = async () => {
    if (!passkeyToRemove) return
    setError('')
    setBusy(true)
    try {
      const result = await webauthnRemovePasskey(passkeyToRemove, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAccountUpdated(result.data.account)
      setMode('idle')
      setPassword('')
      setPasskeyToRemove(null)
      await refresh()
      onNotify('Passkey removed')
    } finally {
      setBusy(false)
    }
  }

  const canDisableAuthenticator =
    status &&
    status.totpEnabled &&
    !(status.required && status.passkeyCount === 0)

  return (
    <div className="settings-section settings-section-stack">
      <div>
        <h2>Your second factor</h2>
        <p>Use a passkey and/or an authenticator app for sign-in after your password.</p>
      </div>
      {status && (
        <p className="field-helper">
          {status.secondFactorEnabled
            ? [
                status.passkeyCount
                  ? `${status.passkeyCount} passkey${status.passkeyCount === 1 ? '' : 's'}`
                  : null,
                status.totpEnabled ? 'authenticator on' : null,
                status.totpEnabled
                  ? `${status.recoveryCodesRemaining} recovery code${status.recoveryCodesRemaining === 1 ? '' : 's'} left`
                  : status.passkeyCount
                    ? `${status.recoveryCodesRemaining} recovery code${status.recoveryCodesRemaining === 1 ? '' : 's'} left`
                    : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : status.required
              ? 'Required for your role — add a passkey or authenticator below.'
              : 'Not enabled on this account.'}
        </p>
      )}

      {mode === 'idle' && (
        <>
          <div>
            <h3 className="settings-subheading">Passkeys</h3>
            {status?.passkeys?.length ? (
              <ul className="passkey-list">
                {status.passkeys.map((item) => (
                  <li key={item.id} className="passkey-row">
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.createdAt
                          ? `Added ${new Date(item.createdAt).toLocaleDateString('en-GB')}`
                          : 'Added'}
                        {item.backedUp ? ' · synced' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => {
                        setPasskeyToRemove(item.id)
                        setPassword('')
                        setError('')
                        setMode('removePasskey')
                      }}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-helper">No passkeys on this account yet.</p>
            )}
            {passkeysSupported ? (
              <div className="account-admin-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void addPasskey()}
                >
                  Add passkey
                </button>
              </div>
            ) : (
              <p className="field-helper">This browser does not support passkeys.</p>
            )}
          </div>

          <div className="settings-divider" />

          <div>
            <h3 className="settings-subheading">Authenticator app</h3>
            <div className="account-admin-actions">
              {!status?.totpEnabled ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void beginSetup()}
                >
                  Enable authenticator
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy || !canDisableAuthenticator}
                  title={
                    !canDisableAuthenticator
                      ? 'Required by organisation policy — add a passkey first'
                      : undefined
                  }
                  onClick={() => {
                    setMode('disable')
                    setError('')
                    setCode('')
                    setPassword('')
                  }}
                >
                  Disable authenticator
                </button>
              )}
            </div>
          </div>
          {error && <p className="login-error">{error}</p>}
        </>
      )}

      {mode === 'setup' && (
        <div className="totp-setup-panel">
          {qrDataUrl && <img className="totp-qr" src={qrDataUrl} alt="Authenticator QR code" width={180} height={180} />}
          <p className="field-helper">
            Manual key: <code>{secret}</code>
          </p>
          <label>
            Confirmation code
            <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
          </label>
          {error && <p className="login-error">{error}</p>}
          <div className="account-admin-actions">
            <button type="button" className="button button-secondary" onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void confirmSetup()}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {mode === 'codes' && (
        <div className="totp-setup-panel">
          <p className="field-helper">Save these recovery codes now — they won’t be shown again.</p>
          <ul className="totp-recovery-list">
            {recoveryCodes.map((item) => (
              <li key={item}>
                <code>{item}</code>
              </li>
            ))}
          </ul>
          <button type="button" className="button button-primary" onClick={() => setMode('idle')}>
            Done
          </button>
        </div>
      )}

      {mode === 'disable' && (
        <div className="totp-setup-panel">
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            Authenticator or recovery code
            <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
          </label>
          {error && <p className="login-error">{error}</p>}
          <div className="account-admin-actions">
            <button type="button" className="button button-secondary" onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void disable()}>
              Disable
            </button>
          </div>
        </div>
      )}

      {mode === 'removePasskey' && (
        <div className="totp-setup-panel">
          <p className="field-helper">Confirm your password to remove this passkey.</p>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <div className="account-admin-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setMode('idle')
                setPasskeyToRemove(null)
                setPassword('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void removeSelectedPasskey()}
            >
              Remove passkey
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
