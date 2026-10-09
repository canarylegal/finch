import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import { signupFirstAdmin, type PublicAccount } from '../api'

/** Create-organisation form (same shell as sign-in). */
export function LandingPage({
  onBack,
  onSignedIn,
}: {
  onBack: () => void
  onSignedIn: (account: PublicAccount) => void
}) {
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

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <FinchMark />
          <span>finch.</span>
        </div>
        <h1>Create your organisation</h1>
        <p className="login-lede">
          Start a new Finch workspace. You will be the primary admin and can invite your team after
          leave year setup.
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
          <div className="login-actions-row">
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Get started'}
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={onBack}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
