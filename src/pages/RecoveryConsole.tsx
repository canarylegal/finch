import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  logoutRequest,
  recoveryCreateAccount,
  recoveryCreateTenant,
  recoveryDeleteAccount,
  recoveryListAccounts,
  recoveryListTenants,
  recoveryUpdateAccount,
  type PublicAccount,
  type PublicTenant,
} from '../api'

export function RecoveryConsole({ onSignedOut }: { onSignedOut: () => void }) {
  const [tenants, setTenants] = useState<PublicTenant[]>([])
  const [tenantId, setTenantId] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [passwordResetId, setPasswordResetId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId) || null
  const primary = accounts.find((account) => account.isPrimary)
  const hasAccounts = accounts.length > 0

  const refreshTenants = async () => {
    const result = await recoveryListTenants()
    if (!result.ok) {
      setError(result.error)
      return [] as PublicTenant[]
    }
    setTenants(result.data.tenants)
    return result.data.tenants
  }

  const refreshAccounts = async (id: number) => {
    const result = await recoveryListAccounts(id)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAccounts(result.data.accounts)
  }

  useEffect(() => {
    void (async () => {
      const list = await refreshTenants()
      if (list.length > 0) {
        const nextId = list[0].id
        setTenantId(nextId)
        await refreshAccounts(nextId)
      }
    })()
  }, [])

  const selectTenant = async (id: number) => {
    setTenantId(id)
    setError('')
    setMessage('')
    setShowAddAdmin(false)
    setPasswordResetId(null)
    await refreshAccounts(id)
  }

  const signOut = async () => {
    await logoutRequest()
    onSignedOut()
  }

  const createOrganisation = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await recoveryCreateTenant(orgName.trim() || 'Organisation')
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOrgName('')
      setShowNewOrg(false)
      const list = await refreshTenants()
      const created = result.data.tenant
      setTenantId(created.id)
      await refreshAccounts(created.id)
      setMessage(`Organisation “${created.name}” created. Add a primary admin next.`)
      if (!list.some((item) => item.id === created.id)) {
        setTenants((current) => [...current, created])
      }
    } finally {
      setBusy(false)
    }
  }

  const createAdmin = async (event: FormEvent) => {
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
        tenantId: tenantId ?? undefined,
        organisationName: tenantId == null ? orgName.trim() || 'Organisation' : undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEmail('')
      setDisplayName('')
      setPassword('')
      setShowAddAdmin(false)
      if (result.data.tenant) {
        setTenantId(result.data.tenant.id)
        await refreshTenants()
        await refreshAccounts(result.data.tenant.id)
      } else if (tenantId != null) {
        await refreshAccounts(tenantId)
      }
      setMessage('Admin account created.')
    } finally {
      setBusy(false)
    }
  }

  const patchAccount = async (id: number, payload: Record<string, unknown>, successMessage: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await recoveryUpdateAccount(id, payload)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(successMessage)
      setPasswordResetId(null)
      setNewPassword('')
      if (tenantId != null) await refreshAccounts(tenantId)
    } finally {
      setBusy(false)
    }
  }

  const deleteAccount = async (account: PublicAccount) => {
    const label = `${account.displayName} (${account.email})`
    if (
      !window.confirm(
        `Delete ${label} permanently?\n\nThis cannot be undone. Their employee profile (if linked) is left in place.`,
      )
    ) {
      return
    }
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await recoveryDeleteAccount(account.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(`Deleted ${label}.`)
      if (passwordResetId === account.id) {
        setPasswordResetId(null)
        setNewPassword('')
      }
      if (tenantId != null) await refreshAccounts(tenantId)
    } finally {
      setBusy(false)
    }
  }

  const submitPasswordReset = async (event: FormEvent, accountId: number) => {
    event.preventDefault()
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }
    await patchAccount(accountId, { password: newPassword }, 'Password reset.')
  }

  const securityLabel = (account: PublicAccount) => {
    const parts: string[] = []
    if (account.totpEnabled) parts.push('2FA on')
    if ((account.passkeyCount ?? 0) > 0) {
      parts.push(`${account.passkeyCount} passkey${account.passkeyCount === 1 ? '' : 's'}`)
    }
    return parts.length ? parts.join(' · ') : 'no MFA'
  }

  return (
    <div className="login-shell">
      <div className="login-panel recovery-panel">
        <span className="eyebrow">Master recovery</span>
        <h1>Recovery console</h1>
        <p className="login-lede">
          Multi-tenant break-glass tools. Choose an organisation, then manage its accounts.
        </p>

        <div className="recovery-tenant-bar">
          <label>
            Organisation
            <select
              value={tenantId ?? ''}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isFinite(next)) void selectTenant(next)
              }}
              disabled={tenants.length === 0}
            >
              {tenants.length === 0 && <option value="">No organisations yet</option>}
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setShowNewOrg((value) => !value)
              setError('')
              setMessage('')
            }}
          >
            New organisation
          </button>
        </div>

        {showNewOrg && (
          <form className="login-form" onSubmit={createOrganisation}>
            <label>
              Organisation name
              <input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="e.g. Northstar Legal"
                required
              />
            </label>
            <button type="submit" className="button button-primary" disabled={busy}>
              Create organisation
              <ChevronRight size={15} />
            </button>
          </form>
        )}

        {tenantId == null && tenants.length === 0 && !showNewOrg && (
          <form className="login-form" onSubmit={createAdmin}>
            <strong>Create first organisation + primary admin</strong>
            <label>
              Organisation name
              <input value={orgName} onChange={(event) => setOrgName(event.target.value)} />
            </label>
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
              Create organisation &amp; admin
              <ChevronRight size={15} />
            </button>
          </form>
        )}

        {selectedTenant && (
          <>
            <p className="field-helper">
              Managing <strong>{selectedTenant.name}</strong>
              {hasAccounts ? ` · ${accounts.length} account${accounts.length === 1 ? '' : 's'}` : ''}
            </p>

            {!hasAccounts ? (
              <form className="login-form" onSubmit={createAdmin}>
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
                {primary && (
                  <div className="recovery-next-step">
                    <strong>Primary admin is ready</strong>
                    <p>
                      {primary.displayName} ({primary.email}) can sign in and set up the organisation.
                    </p>
                    <div className="recovery-next-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void signOut()}
                      >
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

                {showAddAdmin && (
                  <form className="login-form" onSubmit={createAdmin}>
                    <strong>Create admin</strong>
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
                    <div className="account-admin-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setShowAddAdmin(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="button button-primary" disabled={busy}>
                        Create admin
                      </button>
                    </div>
                  </form>
                )}

                <div className="recovery-account-list">
                  {accounts.map((account) => (
                    <div className="account-admin-row recovery-account-row" key={account.id}>
                      <div className="account-admin-copy">
                        <strong>
                          {account.displayName}
                          {account.isPrimary ? ' (primary)' : ''}
                        </strong>
                        <span>
                          {account.email} · {account.role}
                          {account.status === 'Inactive' ? ' · inactive' : ''} ·{' '}
                          {securityLabel(account)}
                        </span>
                      </div>
                      <div className="account-admin-actions">
                        {account.role === 'admin' ? (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void patchAccount(account.id, { role: 'employee' }, 'Role updated.')
                            }
                          >
                            Make employee
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void patchAccount(account.id, { role: 'admin' }, 'Role updated.')
                            }
                          >
                            Make admin
                          </button>
                        )}
                        {account.status === 'Active' ? (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void patchAccount(
                                account.id,
                                { status: 'Inactive' },
                                'Account deactivated.',
                              )
                            }
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void patchAccount(
                                account.id,
                                { status: 'Active' },
                                'Account reactivated.',
                              )
                            }
                          >
                            Reactivate
                          </button>
                        )}
                        {!account.isPrimary && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void patchAccount(
                                account.id,
                                { isPrimary: true },
                                'Primary admin transferred.',
                              )
                            }
                          >
                            Make primary
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={busy}
                          onClick={() => {
                            setPasswordResetId(account.id)
                            setNewPassword('')
                            setError('')
                            setMessage('')
                          }}
                        >
                          Reset password
                        </button>
                        {(account.totpEnabled || (account.passkeyCount ?? 0) > 0) && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Clear MFA for ${account.displayName}?\n\nThis removes authenticator 2FA and all passkeys so they can sign in with password only.`,
                                )
                              ) {
                                return
                              }
                              void patchAccount(
                                account.id,
                                { clearTwoFactor: true, clearPasskeys: true },
                                'MFA cleared.',
                              )
                            }}
                          >
                            Reset MFA
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary danger-text-button"
                          disabled={busy}
                          onClick={() => void deleteAccount(account)}
                        >
                          Delete
                        </button>
                      </div>
                      {passwordResetId === account.id && (
                        <form
                          className="recovery-inline-form"
                          onSubmit={(event) => void submitPasswordReset(event, account.id)}
                        >
                          <label>
                            New password for {account.email}
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(event) => setNewPassword(event.target.value)}
                              minLength={10}
                              required
                            />
                          </label>
                          <div className="account-admin-actions">
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => setPasswordResetId(null)}
                            >
                              Cancel
                            </button>
                            <button type="submit" className="button button-primary" disabled={busy}>
                              Save password
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}
        {message && <p className="field-helper">{message}</p>}

        <button type="button" className="button button-secondary" onClick={() => void signOut()}>
          Sign out of recovery
        </button>
      </div>
    </div>
  )
}
