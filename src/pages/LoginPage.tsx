import { useEffect, useState, type FormEvent } from 'react'
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import {
  confirmTwoFactor,
  fetchMe,
  loginWithPassword,
  setupTwoFactor,
  verifyTwoFactorCode,
  webauthnAuthenticateOptions,
  webauthnAuthenticateVerify,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  type PublicAccount,
} from '../api'

type Step = 'credentials' | 'totp' | 'setupChoice' | 'setup' | 'recoveryCodes'

export function LoginPage({
  onSignedIn,
  onRecoverySignedIn,
}: {
  onSignedIn: (account: PublicAccount) => void
  onRecoverySignedIn: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('credentials')
  const [challenge, setChallenge] = useState<'account' | 'master'>('account')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [setupSecret, setSetupSecret] = useState('')
  const [setupQr, setSetupQr] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [pendingAccount, setPendingAccount] = useState<PublicAccount | null>(null)
  const [passkeysAvailable, setPasskeysAvailable] = useState(false)
  const passkeysSupported = browserSupportsWebAuthn()

  useEffect(() => {
    void (async () => {
      const me = await fetchMe()
      if (!me.ok) return
      if (me.data.kind === 'pending_2fa') {
        setPendingAccount(me.data.account)
        setPasskeysAvailable(Boolean(me.data.account.passkeyCount))
        setChallenge('account')
        setStep('totp')
        return
      }
      if (me.data.kind === 'pending_2fa_master') {
        setChallenge('master')
        setStep('totp')
        return
      }
      if (me.data.kind === 'pending_2fa_setup') {
        setPendingAccount(me.data.account)
        setStep('setupChoice')
      }
    })()
  }, [])

  const finishAccount = (account: PublicAccount) => {
    onSignedIn(account)
  }

  const startTotpSetup = async () => {
    const setup = await setupTwoFactor()
    if (!setup.ok) {
      setError(setup.error)
      return false
    }
    setSetupSecret(setup.data.secret)
    setSetupQr(setup.data.qrDataUrl)
    setStep('setup')
    return true
  }

  const handleCredentials = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await loginWithPassword(email, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if ('requires2fa' in result.data && result.data.requires2fa) {
        setChallenge(result.data.challenge)
        if (result.data.account) setPendingAccount(result.data.account)
        setPasskeysAvailable(Boolean(result.data.passkeysAvailable))
        setStep('totp')
        return
      }
      if ('mustSetup2fa' in result.data && result.data.mustSetup2fa) {
        setPendingAccount(result.data.account)
        setStep('setupChoice')
        return
      }
      if ('recovery' in result.data && result.data.recovery) {
        onRecoverySignedIn()
        return
      }
      if ('account' in result.data && result.data.account) {
        finishAccount(result.data.account)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleTotp = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await verifyTwoFactorCode(code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if ('recovery' in result.data && result.data.recovery) {
        onRecoverySignedIn()
        return
      }
      if ('account' in result.data && result.data.account) {
        finishAccount(result.data.account)
      }
    } finally {
      setBusy(false)
    }
  }

  const handlePasskeySignIn = async () => {
    setError('')
    setBusy(true)
    try {
      const options = await webauthnAuthenticateOptions()
      if (!options.ok) {
        setError(options.error)
        return
      }
      const credential = await startAuthentication({ optionsJSON: options.data as never })
      const result = await webauthnAuthenticateVerify(credential)
      if (!result.ok) {
        setError(result.error)
        return
      }
      finishAccount(result.data.account)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey sign-in was cancelled'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const handlePasskeySetup = async () => {
    setError('')
    setBusy(true)
    try {
      const options = await webauthnRegisterOptions()
      if (!options.ok) {
        setError(options.error)
        return
      }
      const credential = await startRegistration({ optionsJSON: options.data as never })
      const result = await webauthnRegisterVerify(credential, 'Login passkey')
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.recoveryCodes?.length) {
        setRecoveryCodes(result.data.recoveryCodes)
        setPendingAccount(result.data.account)
        setStep('recoveryCodes')
        return
      }
      finishAccount(result.data.account)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey setup was cancelled'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmSetup = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await confirmTwoFactor(code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setRecoveryCodes(result.data.recoveryCodes)
      setPendingAccount(result.data.account)
      setStep('recoveryCodes')
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

        {step === 'credentials' && (
          <>
            <h1>Sign in</h1>
            <p className="login-lede">Sign in with your Finch account.</p>
            <form className="login-form" onSubmit={handleCredentials}>
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
          </>
        )}

        {step === 'totp' && (
          <>
            <h1>Verify it’s you</h1>
            <p className="login-lede">
              {challenge === 'master'
                ? 'Enter the code from the master recovery authenticator.'
                : 'Use a passkey, authenticator code, or recovery code to continue.'}
            </p>
            {challenge === 'account' && passkeysAvailable && passkeysSupported && (
              <div className="login-form" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void handlePasskeySignIn()}
                >
                  {busy ? 'Waiting for passkey…' : 'Continue with passkey'}
                </button>
              </div>
            )}
            <form className="login-form" onSubmit={handleTotp}>
              <label>
                Authentication code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Continue with code'}
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setStep('credentials')
                  setCode('')
                  setError('')
                }}
              >
                Back
              </button>
            </form>
          </>
        )}

        {step === 'setupChoice' && (
          <>
            <h1>Set up 2FA</h1>
            <p className="login-lede">
              Your organisation requires two-factor authentication
              {pendingAccount?.role === 'admin' ? ' for admins' : ''}. Choose a passkey or an
              authenticator app.
            </p>
            {error && <p className="login-error">{error}</p>}
            <div className="login-form">
              {passkeysSupported && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void handlePasskeySetup()}
                >
                  {busy ? 'Waiting for passkey…' : 'Use a passkey'}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => void startTotpSetup()}
              >
                Use authenticator app
              </button>
            </div>
          </>
        )}

        {step === 'setup' && (
          <>
            <h1>Set up authenticator</h1>
            <p className="login-lede">Scan the QR code, then enter a code to confirm.</p>
            {setupQr && (
              <img className="totp-qr" src={setupQr} alt="Authenticator QR code" width={220} height={220} />
            )}
            <p className="field-helper totp-secret-helper">
              Can’t scan? Enter this key manually: <code>{setupSecret}</code>
            </p>
            <form className="login-form" onSubmit={handleConfirmSetup}>
              <label>
                Authentication code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Confirming…' : 'Confirm and continue'}
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setStep('setupChoice')
                  setCode('')
                  setError('')
                }}
              >
                Back
              </button>
            </form>
          </>
        )}

        {step === 'recoveryCodes' && pendingAccount && (
          <>
            <h1>Save recovery codes</h1>
            <p className="login-lede">
              Store these codes somewhere safe. Each can be used once if you lose your
              authenticator or passkey.
            </p>
            <ul className="totp-recovery-list">
              {recoveryCodes.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button-primary"
              onClick={() => finishAccount(pendingAccount)}
            >
              I’ve saved these codes
              <ChevronRight size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
