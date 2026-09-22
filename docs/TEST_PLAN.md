# Finch test plan (v1)

Automated API tests live in `test/` and run with `npm test`. UI-only checks need a browser against the deployed app (TrueNAS / `https://finch.canarylegalsoftware.co.uk`).

## Automated (API) — run without UI

| # | Case | Covered by |
|---|------|------------|
| A1 | Health endpoint + JSON store | `test/auth.api.test.mjs` |
| A2 | Master recovery login + create primary admin / employee | same |
| A3 | Signed-in change password (validation + success + old password rejected) | same |
| A4 | Forgot-password without SMTP returns 503 | same |
| A5 | Admin 2FA enrol (setup → confirm) and login challenge verify | same |
| A6 | Recovery clear MFA + password reset | same |
| A7 | Recovery delete account | same |
| A8 | Concurrent app-data saves retain audit appends (V1-F1) | `test/audit.persistence.test.mjs` |

Run: `npm test`

## UI / browser — must be done manually

| # | Case | Notes |
|---|------|--------|
| U1 | HTTPS loads Finch via Cloudflare / domain | Certificate + tunnel |
| U2 | Login layout: Sign in \| Sign in with passkey, Forgot password centred | Visual |
| U3 | Sign in with passkey (passwordless) from main screen | Needs enrolled passkey |
| U4 | Password login → authenticator code challenge (no passkey button on that step) | |
| U5 | Forgot password emails temporary password | Needs SMTP; check Proton inbox |
| U6 | Settings → Security → **Password**: change password form works | New |
| U7 | Settings → Security → **Your second factor**: add passkey | WebAuthn prompt |
| U8 | Settings → Security: enable authenticator (QR), save recovery codes | |
| U9 | Settings → Security: disable authenticator when a passkey remains (or policy allows) | |
| U10 | Settings → Security: remove passkey with password confirm | |
| U11 | Master recovery console: reset password / Reset MFA / Make primary / Delete | |
| U12 | Leave: employee submit → admin approve → calendar/balance update | |
| U13 | Expense: submit with receipt → approve/reject | |
| U14 | Payroll CSV download + email report (if SMTP) | |
| U15 | VAT receipts upload / confirm / export | |
| U16 | Audit log shows password change, 2FA, recovery actions | |
| U17 | Notifications prefs + delivery for a leave event | |
| U18 | Org settings / primary admin transfer (password confirm) | |
| U19 | Mobile login: action buttons stack cleanly | Narrow viewport |
| U20 | Backup: non-empty dump under `/mnt/pool/finch/data/backups` | Ops check |

## Deferred / not in v1 automated suite

- WebAuthn ceremony end-to-end in CI (needs browser + virtual authenticator)
- SMTP delivery content assertions (needs mail catcher)
- Postgres-backed store tests (suite uses JSON via `FINCH_DATA_DIR`)
- Full restore drill of `pg_dump` into a spare DB
