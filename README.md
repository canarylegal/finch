# Finch

Small-business HR portal for leave, expenses, documents, and payroll exports.

## Stack

- React + Vite frontend
- Express API (`server/`)
- Postgres in production (`DATABASE_URL`)
- Optional JSON file store for local development without Postgres
- Caddy reverse proxy for HTTPS on a single VPS

## Quick start (development)

```bash
cp .env.example .env
# set SESSION_SECRET, MASTER_ADMIN_LOGIN, MASTER_ADMIN_PASSWORD
npm install
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:8787  

Without `DATABASE_URL`, the API stores data in `data/finch-store.json`.

### Local Postgres (optional)

```bash
docker compose up -d db
# add to .env:
# DATABASE_URL=postgres://finch:YOUR_PASSWORD@127.0.0.1:5432/finch
npm run dev
```

On first connect, any existing `data/finch-store.json` is imported into Postgres once.

## Production on a VPS (Docker + Caddy)

1. Point DNS for your domain at the VPS.
2. Copy the repo and create `.env` from `.env.example`.
3. Set at least:
   - `FINCH_DOMAIN`
   - `POSTGRES_PASSWORD` (URL-safe characters recommended)
   - `DATABASE_URL=postgres://finch:PASSWORD@db:5432/finch` (host must be `db` on the Compose network)
   - `SESSION_SECRET` (16+ chars)
   - `MASTER_ADMIN_LOGIN` / `MASTER_ADMIN_PASSWORD`
   - SMTP vars if you want email notifications
4. If any `.env` value contains `$`, escape it as `$$` — Compose interpolates `.env` and will otherwise treat `$…` as a variable.
5. Start:

```bash
docker compose up -d --build
```

Caddy terminates HTTPS and proxies to the app. The app requires `DATABASE_URL` when `NODE_ENV=production`.

### Services

| Service | Role |
|---------|------|
| `db` | Postgres 16 |
| `app` | Finch API + built SPA |
| `caddy` | HTTPS reverse proxy |
| `backup` | Rolling `pg_dump` every `BACKUP_INTERVAL_SECONDS` (default 24h) |

## Backups

Local dumps land in `data/backups/` (or the `finch_data` volume under `/app/data/backups` in Docker). Older files are pruned with `BACKUP_KEEP` (default 14).

```bash
npm run backup
```

### Optional off-box copy (S3-compatible)

External upload is **optional**. If `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are unset, backups stay local only.

```env
S3_BUCKET=my-bucket
S3_PREFIX=finch-backups/
S3_REGION=auto
S3_ENDPOINT=https://s3.example.com   # for MinIO / R2 / etc.
S3_FORCE_PATH_STYLE=true             # often needed for MinIO
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Restore example:

```bash
pg_restore --clean --if-exists --dbname "$DATABASE_URL" data/backups/finch-….dump
```

## Email

Set `SMTP_HOST` and `SMTP_FROM` (plus auth if required). Notification preferences live under Settings → Notifications. Without SMTP, Finch skips sending and shows an in-app notice.

## Security notes

- Session cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production (`COOKIE_SECURE`)
- `TRUST_PROXY=1` when behind Caddy/nginx so secure cookies and rate limits see the real client IP
- Login rate limit: `LOGIN_RATE_LIMIT` (default 30 / 15 minutes)
- **TOTP 2FA** for accounts (Settings → Security): org policy `all` / `admins` / `optional`, plus personal enrol/disable and recovery codes
- Master recovery 2FA: set `MASTER_ADMIN_REQUIRE_2FA=true` and `MASTER_ADMIN_TOTP_SECRET` (base32)
- Master recovery login is env-based (`MASTER_ADMIN_*`); keep it long and private

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + Vite |
| `npm run build` | Typecheck + production SPA |
| `npm start` | Serve API (+ `dist/` if built) |
| `npm run backup` | One-shot Postgres dump |
| `npm run lint` | Oxlint |

## Recovery bootstrap

1. Sign in with `MASTER_ADMIN_LOGIN` / `MASTER_ADMIN_PASSWORD`.
2. Create the first admin account.
3. Complete the organisation wizard as that admin.

## Post-deploy smoke

After `docker compose up -d --build` on a VPS:

1. Open `https://$FINCH_DOMAIN` and confirm HTTPS (Caddy).
2. Master recovery login works; create/sign-in as admin with 2FA as required by policy.
3. Submit a leave request as an employee → approve as admin → balances/calendar update.
4. Submit an expense claim with a receipt → approve/reject.
5. Admin → Payroll reports: download CSV for the current period.
6. Admin → VAT receipts: upload one receipt, confirm VAT, export CSV.
7. With SMTP set: trigger a notification and confirm delivery (or check server logs if skipped).
8. Confirm a backup file appears under the data volume (`/app/data/backups` in the `backup` service).
9. Optional: restore a dump into a spare database once before relying on backups.
