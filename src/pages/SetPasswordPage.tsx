import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import { completePasswordSetup, fetchPasswordSetup } from '../api'

export function SetPasswordPage({
  token,
  onDone,
}: {
  token: string
  onDone: (email: string) => void
}) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const result = await fetchPasswordSetup(token)
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEmail(result.data.email)
      setDisplayName(result.data.displayName)
      setPurpose(result.data.purpose)
    })()
  }, [token])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const result = await completePasswordSetup(token, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onDone(result.data.email)
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
        {loading ? (
          <p className="login-lede">Checking your link…</p>
        ) : email ? (
          <>
            <h1>{purpose === 'invite' ? 'Set your password' : 'Choose a new password'}</h1>
            <p className="login-lede">
              {purpose === 'invite'
                ? `Welcome${displayName ? `, ${displayName}` : ''}. Create a password for ${email}.`
                : `Reset the password for ${email}.`}
            </p>
            <form className="login-form" onSubmit={handleSubmit}>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={10}
                  required
                  autoFocus
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  minLength={10}
                  required
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save password'}
                <ChevronRight size={15} />
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Link unavailable</h1>
            <p className="login-lede">{error || 'This set-password link is not valid.'}</p>
            <button type="button" className="button button-primary" onClick={() => onDone('')}>
              Back to sign in
              <ChevronRight size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
