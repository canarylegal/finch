import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  logoutRequest,
  recoveryCreateAccount,
  recoveryListAccounts,
  recoveryUpdateAccount,
  type PublicAccount,
} from '../api'

export function RecoveryConsole({ onSignedOut }: { onSignedOut: () => void }) {
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const refresh = async () => {
    const result = await recoveryListAccounts()
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAccounts(result.data.accounts)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const createFirstOrNext = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await recoveryCreateAccount({
        email,
        displayName,
        password,
        role: 'admin',
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEmail('')
      setDisplayName('')
      setPassword('')
      setMessage(
        accounts.length === 0
          ? 'Primary admin created. They can sign in and set up the organisation.'
          : 'Admin account created.',
      )
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const patchAccount = async (id: number, payload: Record<string, unknown>) => {
    setError('')
    setMessage('')
    const result = await recoveryUpdateAccount(id, payload)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage('Account updated')
    await refresh()
  }

  return (
    <div className="login-shell">
      <div className="login-panel recovery-panel">
        <span className="eyebrow">Master recovery</span>
        <h1>Recovery console</h1>
        <p className="login-lede">
          Create the first admin or manage accounts. Organisation setup is done by an admin after
          sign-in.
        </p>

        {accounts.length === 0 ? (
          <form className="login-form" onSubmit={createFirstOrNext}>
            <strong>Create primary admin</strong>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                required
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            {message && <p className="field-helper">{message}</p>}
            <button type="submit" className="button button-primary" disabled={busy}>
              Create primary admin
              <ChevronRight size={15} />
            </button>
          </form>
        ) : (
          <>
            <div className="recovery-account-list">
              {accounts.map((account) => (
                <div className="account-admin-row" key={account.id}>
                  <div>
                    <strong>
                      {account.displayName}
                      {account.isPrimary ? ' (primary)' : ''}
                    </strong>
                    <span>
                      {account.email} · {account.role}
                      {account.status === 'Inactive' ? ' · inactive' : ''}
                    </span>
                  </div>
                  <div className="account-admin-actions">
                    {account.role === 'admin' ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => patchAccount(account.id, { role: 'employee' })}
                      >
                        Make employee
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => patchAccount(account.id, { role: 'admin' })}
                      >
                        Make admin
                      </button>
                    )}
                    {account.status === 'Active' ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => patchAccount(account.id, { status: 'Inactive' })}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => patchAccount(account.id, { status: 'Active' })}
                      >
                        Reactivate
                      </button>
                    )}
                    {!account.isPrimary && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => patchAccount(account.id, { isPrimary: true })}
                      >
                        Make primary
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form className="login-form" onSubmit={createFirstOrNext}>
              <strong>Add admin account</strong>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={10}
                  required
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              {message && <p className="field-helper">{message}</p>}
              <button type="submit" className="button button-primary" disabled={busy}>
                Create admin
              </button>
            </form>
          </>
        )}

        <button
          type="button"
          className="button button-secondary"
          onClick={async () => {
            await logoutRequest()
            onSignedOut()
          }}
        >
          Sign out of recovery
        </button>
      </div>
    </div>
  )
}
