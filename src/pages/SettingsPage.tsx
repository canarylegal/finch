import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { EntitlementBasisNote } from '../components/EntitlementBasisNote'
import { PageHeader } from '../components/PageHeader'
import { WorkingDaysPicker } from '../components/WorkingDaysPicker'
import { companyInitials, type CompanySettings, type SettingsTab } from '../domain'
import {
  confirmationForLeaveYear,
  leaveYearKey,
  nextMandatoryRangeId,
  upsertMandatoryConfirmation,
  type MandatoryLeaveRange,
} from '../mandatoryLeave'
import { formatLeaveYearLabel, type LeaveYearPeriod } from '../leaveYear'
import { NOTIFICATION_EVENT_IDS, NOTIFICATION_EVENT_LABELS } from '../notifications'
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
  onSave,
  onBankHolidaysChange,
  onNotify,
  onOpenLeaveYears,
}: {
  company: CompanySettings
  bankHolidays: BankHoliday[]
  leaveYear: LeaveYearPeriod
  initialTab?: SettingsTab
  onSave: (settings: CompanySettings) => void
  onBankHolidaysChange: (holidays: BankHoliday[]) => void
  onNotify: (message: string) => void
  onOpenLeaveYears?: () => void
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [draft, setDraft] = useState(company)
  const logoInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    const current = confirmationForLeaveYear(draft.mandatoryLeaveConfirmations, leaveYear)
    setNoneThisYear(current?.noneThisYear ?? false)
    setRanges(current?.ranges ?? [])
  }, [draft.mandatoryLeaveConfirmations, leaveYear])

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

  const saveSettings = () => {
    const validRanges = ranges.filter(
      (range) => range.start && range.end && range.start <= range.end,
    )
    const touchedMandatory = noneThisYear || validRanges.length > 0 || Boolean(confirmation)
    const mandatoryLeaveConfirmations = touchedMandatory
      ? upsertMandatoryConfirmation(draft.mandatoryLeaveConfirmations, {
          leaveYearKey: yearKey,
          noneThisYear,
          ranges: noneThisYear ? [] : validRanges,
          confirmedAt: new Date().toISOString(),
        })
      : draft.mandatoryLeaveConfirmations

    onSave({
      ...draft,
      leaveYearConfigured:
        draft.leaveYearConfigured || activeTab === 'company' || activeTab === 'leave',
      mandatoryLeaveConfirmations,
    })
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
            </>
          )}

          {activeTab === 'leave' && (
            <>
              <div className="settings-section settings-section-stack">
                <div>
                  <h2>Mandatory annual leave</h2>
                  <p>
                    For {formatLeaveYearLabel(leaveYear)}. Saving books approved annual leave for
                    every active employee on these dates. To exempt someone, cancel their booking
                    from Requests.
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
                            const startYear = Number(leaveYear.start.slice(0, 4))
                            const endYear = Number(leaveYear.end.slice(0, 4))
                            let decYear = startYear
                            for (const year of [startYear, endYear]) {
                              const probe = `${year}-12-01`
                              if (probe >= leaveYear.start && probe <= leaveYear.end) decYear = year
                            }
                            setRanges((current) => [
                              ...current,
                              {
                                id: nextMandatoryRangeId(current),
                                start: `${decYear}-12-24`,
                                end: `${decYear + 1}-01-01`,
                                label: 'Christmas shutdown',
                              },
                            ])
                          }}
                        >
                          <Plus size={15} />
                          Add date range
                        </button>
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
            onClick={saveSettings}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
