# Deployment Guide — ESPN Fantasy Football GM Tool

Deploy to Railway in one checklist. No manual backend guessing.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| pnpm | any | `npm install -g pnpm` |
| Railway CLI | any | `npm install -g @railway/cli` |
| Git | any | https://git-scm.com |

---

## One-Command Deploy Checklist

### Step 1 — Clone the repo

```powershell
git clone https://github.com/RSadmin94/espn-fantasy-gm-tool.git
cd espn-fantasy-gm-tool
```

### Step 2 — Create a Railway project

1. Go to https://railway.app and sign in
2. Click **New Project → Empty Project**
3. Click **Add a Service → Database → MySQL** — Railway provisions a MySQL instance
4. Copy the `DATABASE_URL` from the MySQL service's **Variables** tab

### Step 3 — Set all environment variables in Railway

In your Railway project, go to **Service → Variables** and add:

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | **YES** | Railway MySQL plugin → Variables tab |
| `JWT_SECRET` | **YES** | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | **YES** | https://console.anthropic.com |
| `ESPN_LEAGUE_ID` | **YES** | Number in your ESPN league URL |
| `ESPN_S2` | **YES** | Browser DevTools → Application → Cookies → `espn_s2` |
| `ESPN_SWID` | **YES** | Browser DevTools → Application → Cookies → `SWID` |
| `CREDENTIAL_ENCRYPTION_KEY` | **YES** | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | optional | Stripe Dashboard → Developers → API keys |
| `VITE_STRIPE_PUBLISHABLE_KEY` | optional | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | optional | Stripe Dashboard → Webhooks |
| `STRIPE_PRICE_ID_MONTHLY` | optional | Stripe Dashboard → Products |
| `THE_ODDS_API_KEY` | optional | https://the-odds-api.com |

> **Tip:** Use `env-template.txt` in the repo root as a reference for all variables.

### Step 4 — Run the preflight check locally

```powershell
# Set your env vars in PowerShell first:
$env:DATABASE_URL = "mysql://..."
$env:JWT_SECRET = "..."
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:ESPN_LEAGUE_ID = "123456"
$env:ESPN_S2 = "AE..."
$env:ESPN_SWID = "{GUID}"
$env:CREDENTIAL_ENCRYPTION_KEY = "..."

# Then run:
node scripts/preflight.mjs
```

The preflight script will:
- Check Node.js version (must be 18+)
- Check pnpm is installed
- Check all required env vars are set
- Check all migration files exist
- Check all key source files exist
- Run `pnpm build` and report any errors

**If preflight passes, you are ready to deploy. If it fails, fix the reported issues first.**

### Step 5 — Deploy to Railway

```powershell
# Login to Railway CLI
railway login

# Link to your Railway project
railway link

# Deploy
railway up
```

Railway will automatically:
1. Run `node scripts/preflight.mjs` (build command)
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm build`
4. Start with `pnpm start`
5. Health-check `/api/health` before marking deployment live

### Step 6 — Verify the deployment

```powershell
node scripts/verify-production.mjs https://your-app.railway.app
```

The verification script checks:
- `/api/health` returns 200 with all checks green
- Database is reachable
- All required env vars are present
- Frontend HTML loads
- tRPC router is responding
- ESPN and Stripe endpoints are registered

---

## Health Endpoint

`GET /api/health` returns:

```json
{
  "status": "ok",
  "timestamp": "2026-05-20T12:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "DATABASE_URL": "ok",
    "JWT_SECRET": "ok",
    "ANTHROPIC_API_KEY": "ok",
    "ESPN_LEAGUE_ID": "ok",
    "ESPN_S2": "ok",
    "ESPN_SWID": "ok",
    "CREDENTIAL_ENCRYPTION_KEY": "ok",
    "database": "ok"
  }
}
```

Returns `200` when all checks pass, `503` when any check fails.

---

## Troubleshooting

Every backend issue maps to one of these four categories:

| Symptom | Category | Fix |
|---|---|---|
| App won't start | **Env var missing** | Run `node scripts/preflight.mjs` |
| Database errors | **Migration missing** | Check `drizzle/migrations/` exists |
| `/api/health` returns 503 | **Health check** | Read `checks` object for which key failed |
| Build fails | **Script failure** | Read the build output — plain-English error |

### Common issues

**`DATABASE_URL` not set**
→ Copy from Railway MySQL plugin → Variables tab

**`ANTHROPIC_API_KEY` invalid**
→ Get from https://console.anthropic.com — must start with `sk-ant-`

**ESPN data not loading**
→ `ESPN_S2` and `ESPN_SWID` cookies expire. Re-copy from browser DevTools.

**Build fails with TypeScript errors**
→ Run `pnpm check` locally to see the errors before deploying

---

## Scripts Reference

| Script | Purpose |
|---|---|
| `node scripts/preflight.mjs` | Pre-deploy check — run before every deploy |
| `node scripts/verify-production.mjs <URL>` | Post-deploy check — run after every deploy |
| `pnpm build` | Build frontend + backend for production |
| `pnpm start` | Start production server |
| `pnpm db:push` | Apply schema changes to database |
| `pnpm test` | Run all tests (756 tests) |

---

## Railway Configuration

The `railway.json` in the repo root configures:
- **Build command:** `node scripts/preflight.mjs && pnpm install --frozen-lockfile && pnpm build`
- **Start command:** `pnpm start`
- **Health check path:** `/api/health`
- **Restart policy:** On failure, max 3 retries
