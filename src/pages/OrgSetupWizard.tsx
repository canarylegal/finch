import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CompanySettings } from '../domain'

export function OrgSetupWizard({
  company,
  onComplete,
}: {
  company: CompanySettings
  onComplete: (next: CompanySettings) => void
}) {
  const [name, setName] = useState(company.name || '')
  const [leaveYearStart, setLeaveYearStart] = useState(company.leaveYearStart || 'January')
  const [leaveYearEnd, setLeaveYearEnd] = useState(company.leaveYearEnd || 'December')
  const [error, setError] = useState('')

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Company name is required')
      return
    }
    onComplete({
      ...company,
      name: name.trim(),
      leaveYearStart,
      leaveYearEnd,
      leaveYearConfigured: true,
      leaveYearConfiguredAt: company.leaveYearConfiguredAt ?? new Date().toISOString().slice(0, 10),
    })
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <span className="eyebrow">Organisation setup</span>
        <h1>Set up your organisation</h1>
        <p className="login-lede">
          Finch is locked until company details and leave year are configured.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Company name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Leave year starts
            <select value={leaveYearStart} onChange={(event) => setLeaveYearStart(event.target.value)}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            Leave year ends
            <select value={leaveYearEnd} onChange={(event) => setLeaveYearEnd(event.target.value)}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="button button-primary">
            Save and continue
            <ChevronRight size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}
