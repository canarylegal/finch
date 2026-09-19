import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import { loginRecovery, loginWithPassword, type PublicAccount } from '../api'

export function LoginPage({
  onSignedIn,
  onRecoverySignedIn,
}: {
  onSignedIn: (account: PublicAccount) => void
  onRecoverySignedIn: () => void
}) {
  const [mode, setMode] = useState<'account' | 'recovery'>('account')
  const [email, setEmail] = useState('')
  const [recoveryLogin, setRecoveryLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'recovery') {
        const result = await loginRecovery(recoveryLogin, password)
        if (!result.ok) {
          setError(result.error)
          return
        }
        onRecoverySignedIn()
        return
      }
      const result = await loginWithPassword(email, password)
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
          <div className="brand-mark">
            <FinchMark />
          </div>
          <span>
            finch<span className="brand-dot">.</span>
          </span>
        </div>
        <h1>{mode === 'recovery' ? 'Recovery sign-in' : 'Sign in'}</h1>
        <p className="login-lede">
          {mode === 'recovery'
            ? 'Master recovery access for break-glass account management.'
            : 'Sign in with your Finch account.'}
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'account' ? (
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
          ) : (
            <label>
              Recovery login
              <input
                type="text"
                autoComplete="username"
                value={recoveryLogin}
                onChange={(event) => setRecoveryLogin(event.target.value)}
                required
              />
            </label>
          )}
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
        <p className="login-switch">
          {mode === 'account' ? (
            <button type="button" className="text-link-button" onClick={() => setMode('recovery')}>
              Master recovery sign-in
            </button>
          ) : (
            <button type="button" className="text-link-button" onClick={() => setMode('account')}>
              Back to account sign-in
            </button>
          )}
        </p>
      </div>
    </div>
  )
}
