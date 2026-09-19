import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import {
  DEMO_ACCOUNT_HINTS,
  DEMO_PASSWORD,
  authenticate,
  saveSession,
  type Account,
} from '../auth'
import { toIsoDate } from '../calendarUtils'
import { APP_TODAY } from '../domain'

export function LoginPage({
  accounts,
  onSignedIn,
}: {
  accounts: Account[]
  onSignedIn: (account: Account) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await authenticate(accounts, email, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      saveSession({ accountId: result.account.id, signedInAt: toIsoDate(APP_TODAY) })
      onSignedIn(result.account)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <div className="brand-mark">
            <FinchMark />
          </div>
          <span>
            finch<span className="brand-dot">.</span>
          </span>
        </div>
        <h1>Sign in</h1>
        <p className="login-lede">Use your Northstar Studio account to open Finch.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            <ChevronRight size={15} />
          </button>
        </form>
        <div className="login-demo">
          <strong>Demo accounts</strong>
          <p>Password for all accounts: <code>{DEMO_PASSWORD}</code></p>
          <ul>
            {DEMO_ACCOUNT_HINTS.map((hint) => (
              <li key={hint.email}>
                <button
                  type="button"
                  className="login-demo-fill"
                  onClick={() => {
                    setEmail(hint.email)
                    setPassword(DEMO_PASSWORD)
                    setError('')
                  }}
                >
                  <span>{hint.displayName}</span>
                  <small>
                    {hint.role} · {hint.email}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
