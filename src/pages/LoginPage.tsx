import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import { loginWithPassword, type PublicAccount } from '../api'

export function LoginPage({
  onSignedIn,
  onRecoverySignedIn,
}: {
  onSignedIn: (account: PublicAccount) => void
  onRecoverySignedIn: () => void
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
      const result = await loginWithPassword(email, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.recovery) {
        onRecoverySignedIn()
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
          <div className="brand-mark">
            <FinchMark />
          </div>
          <span>
            finch<span className="brand-dot">.</span>
          </span>
        </div>
        <h1>Sign in</h1>
        <p className="login-lede">Sign in with your Finch account.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="text"
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
      </div>
    </div>
  )
}
