import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FinchMark } from '../components/FinchMark'
import {
  confirmTwoFactor,
  fetchMe,
  loginWithPassword,
  setupTwoFactor,
  verifyTwoFactorCode,
  type PublicAccount,
} from '../api'

type Step = 'credentials' | 'totp' | 'setup' | 'recoveryCodes'

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
        setBusy(true)
        try {
          const setup = await setupTwoFactor()
          if (!setup.ok) {
            setError(setup.error)
            return
          }
          setSetupSecret(setup.data.secret)
          setSetupQr(setup.data.qrDataUrl)
          setStep('setup')
        } finally {
          setBusy(false)
        }
      }
    })()
  }, [])

  const finishAccount = (account: PublicAccount) => {
    onSignedIn(account)
  }

  const startSetup = async () => {
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
        setStep('totp')
        return
      }
      if ('mustSetup2fa' in result.data && result.data.mustSetup2fa) {
        setPendingAccount(result.data.account)
        const ok = await startSetup()
        if (!ok) return
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
            <h1>Authenticator code</h1>
            <p className="login-lede">
              {challenge === 'master'
                ? 'Enter the code from the master recovery authenticator.'
                : 'Enter the 6-digit code from your authenticator app, or a recovery code.'}
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
                {busy ? 'Verifying…' : 'Continue'}
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

        {step === 'setup' && (
          <>
            <h1>Set up 2FA</h1>
            <p className="login-lede">
              Your organisation requires two-factor authentication
              {pendingAccount?.role === 'admin' ? ' for admins' : ''}. Scan the QR code, then enter
              a code to confirm.
            </p>
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
            </form>
          </>
        )}

        {step === 'recoveryCodes' && pendingAccount && (
          <>
            <h1>Save recovery codes</h1>
            <p className="login-lede">
              Store these codes somewhere safe. Each can be used once if you lose your
              authenticator.
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
