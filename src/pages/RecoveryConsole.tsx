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
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [justCreatedPrimary, setJustCreatedPrimary] = useState(false)

  const primary = accounts.find((account) => account.isPrimary)
  const hasAccounts = accounts.length > 0

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

  const signOut = async () => {
    await logoutRequest()
    onSignedOut()
  }

  const createFirstOrNext = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    const creatingPrimary = accounts.length === 0
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
      if (creatingPrimary) {
        setJustCreatedPrimary(true)
        setShowAddAdmin(false)
        setMessage('')
      } else {
        setMessage('Admin account created.')
        setShowAddAdmin(false)
      }
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
          {hasAccounts
            ? 'Manage admin accounts, or sign out so the primary admin can set up the organisation.'
            : 'Create the primary admin account. Organisation setup is done by that admin after they sign in.'}
        </p>

        {!hasAccounts ? (
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
            <button type="submit" className="button button-primary" disabled={busy}>
              Create primary admin
              <ChevronRight size={15} />
            </button>
          </form>
        ) : (
          <>
            {(justCreatedPrimary || primary) && (
              <div className="recovery-next-step">
                <strong>
                  {justCreatedPrimary
                    ? 'Primary admin created'
                    : 'Primary admin is ready'}
                </strong>
                <p>
                  {primary
                    ? `${primary.displayName} (${primary.email}) can sign in and set up the organisation.`
                    : 'An admin can sign in and set up the organisation.'}{' '}
                  Creating further admins is optional.
                </p>
                <div className="recovery-next-actions">
                  <button type="button" className="button button-primary" onClick={() => void signOut()}>
                    Sign out of recovery
                    <ChevronRight size={15} />
                  </button>
                  {!showAddAdmin && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setShowAddAdmin(true)
                        setError('')
                        setMessage('')
                      }}
                    >
                      Create another admin
                    </button>
                  )}
                </div>
              </div>
            )}

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

            {showAddAdmin && (
              <form className="login-form" onSubmit={createFirstOrNext}>
                <strong>Create another admin</strong>
                <p className="field-helper">Optional — only needed if you want a second admin before sign-out.</p>
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
                <div className="recovery-next-actions">
                  <button type="submit" className="button button-primary" disabled={busy}>
                    Create admin
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setShowAddAdmin(false)
                      setEmail('')
                      setDisplayName('')
                      setPassword('')
                      setError('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {message && !showAddAdmin && <p className="field-helper">{message}</p>}
            {error && !showAddAdmin && <p className="login-error">{error}</p>}
          </>
        )}

        {!hasAccounts && (
          <button type="button" className="button button-secondary" onClick={() => void signOut()}>
            Sign out of recovery
          </button>
        )}
      </div>
    </div>
  )
}
