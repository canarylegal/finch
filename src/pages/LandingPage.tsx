import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import { signupFirstAdmin, type PublicAccount } from '../api'

export function LandingPage({
  companyName,
  onSignIn,
  onSignedIn,
}: {
  companyName: string
  onSignIn: () => void
  onSignedIn: (account: PublicAccount) => void
}) {
  const [signingUp, setSigningUp] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await signupFirstAdmin({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
        companyName: orgName.trim() || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onSignedIn(result.data.account)
    } finally {
      setBusy(false)
    }
  }

  if (signingUp) {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <div className="login-brand">
            <FinchMark />
            <span>finch.</span>
          </div>
          <h1>Create your organisation</h1>
          <p className="login-lede">
            Start a new Finch workspace. You will be the primary admin and can invite your team
            after leave year setup.
          </p>
          <form className="login-form" onSubmit={handleSignup}>
            <label>
              Company name
              <input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="e.g. Canary Legal"
                autoFocus
              />
            </label>
            <label>
              Your name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <label>
              Work email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                required
              />
            </label>
            <p className="field-helper">At least 10 characters.</p>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Get started'}
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setSigningUp(false)
                setError('')
              }}
            >
              Back
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="landing-shell">
      <header className="landing-top">
        <div className="landing-brand">
          <FinchMark />
          <span>finch.</span>
        </div>
        <div className="landing-top-actions">
          <button type="button" className="button button-secondary" onClick={onSignIn}>
            Sign in
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setSigningUp(true)}
          >
            Get started
          </button>
        </div>
      </header>
      <main className="landing-hero">
        <p className="landing-eyebrow">Leave, people, and expenses — together</p>
        <h1>HR that stays out of the way.</h1>
        <p className="landing-lede">
          Finch helps small UK teams book leave, track absences, and file expenses without a
          sprawling HR suite. Each organisation gets its own isolated workspace on a shared
          Finch service.
        </p>
        <div className="landing-cta-row">
          <button
            type="button"
            className="button button-primary"
            onClick={() => setSigningUp(true)}
          >
            Try Finch
            <ChevronRight size={15} />
          </button>
          <button type="button" className="button button-secondary" onClick={onSignIn}>
            {companyName ? `Sign in to ${companyName}` : 'Sign in'}
          </button>
        </div>
        <ul className="landing-points">
          <li>Annual leave with half-days, approvals, and clear balances</li>
          <li>Expenses with receipt upload and payroll-friendly exports</li>
          <li>Invite your team — they set their own password</li>
        </ul>
      </main>
    </div>
  )
}
