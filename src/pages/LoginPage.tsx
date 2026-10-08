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
  requestPasswordReset,
  setupTwoFactor,
  verifyTwoFactorCode,
  webauthnLoginOptions,
  webauthnLoginVerify,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  type PublicAccount,
} from '../api'

type Step = 'credentials' | 'forgot' | 'totp' | 'setupChoice' | 'setup' | 'recoveryCodes'

export function LoginPage({
  onSignedIn,
  onRecoverySignedIn,
  initialEmail = '',
  onBackToLanding,
}: {
  onSignedIn: (account: PublicAccount) => void
  onRecoverySignedIn: () => void
  initialEmail?: string
  onBackToLanding?: () => void
}) {
  const [email, setEmail] = useState(initialEmail)
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
  const [forgotMessage, setForgotMessage] = useState('')
  const passkeysSupported = browserSupportsWebAuthn()

  useEffect(() => {
    void (async () => {
      const me = await fetchMe()
      if (!me.ok) return
      if (me.data.kind === 'pending_2fa') {
        setPendingAccount(me.data.account)
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

  const handleForgotPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setForgotMessage('')
    setBusy(true)
    try {
      const result = await requestPasswordReset(email)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setForgotMessage(result.data.message)
    } finally {
      setBusy(false)
    }
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

  const handlePasskeyLogin = async () => {
    setError('')
    if (!email.trim()) {
      setError('Enter your email to sign in with a passkey')
      return
    }
    setBusy(true)
    try {
      const options = await webauthnLoginOptions(email)
      if (!options.ok) {
        setError(options.error)
        return
      }
      const credential = await startAuthentication({ optionsJSON: options.data as never })
      const result = await webauthnLoginVerify(email, credential)
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
              <div className="login-actions-row">
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
                {passkeysSupported && (
                  <button
                    type="button"
                    className="button button-secondary login-passkey-btn"
                    disabled={busy}
                    onClick={() => void handlePasskeyLogin()}
                  >
                    Sign in with passkey
                  </button>
                )}
              </div>
            </form>
            <div className="login-forgot-wrap">
              <button
                type="button"
                className="login-forgot-link"
                disabled={busy}
                onClick={() => {
                  setStep('forgot')
                  setError('')
                  setForgotMessage('')
                  setPassword('')
                }}
              >
                Forgot password?
              </button>
              {onBackToLanding && (
                <>
                  <span className="login-forgot-sep">·</span>
                  <button
                    type="button"
                    className="login-forgot-link"
                    disabled={busy}
                    onClick={onBackToLanding}
                  >
                    About Finch
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'forgot' && (
          <>
            <h1>Reset password</h1>
            <p className="login-lede">
              We will email a one-time link so you can choose a new password. If you have lost access
              to two-factor authentication, contact your organisation admin after resetting — they
              can clear MFA so you can enrol again.
            </p>
            <form className="login-form" onSubmit={handleForgotPassword}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              {forgotMessage && <p className="field-helper">{forgotMessage}</p>}
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Email reset link'}
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setStep('credentials')
                  setError('')
                  setForgotMessage('')
                }}
              >
                Back to sign in
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
                : 'Enter an authenticator or recovery code to continue.'}
            </p>
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
