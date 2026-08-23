# Admin Console — production verification

Do **not** treat this document as authorization to deploy. Follow it **after** a reviewed production deploy.

Migration `0036_admin_console.sql` is applied by the process start migration runner (`server/runMigrations.ts`) when `DATABASE_URL` is set. It is **not** applied by this checklist.

## Usage-day timezone

Daily token accounting uses the **UTC calendar day** (00:00–24:00 UTC). In-memory UTC-day counters and persisted `usage_events` LLM rows are both considered.

Policy precedence (first matching deny wins):

1. `SUSPENDED` / `AI_DISABLED` (skipped for the application owner)
2. Feature disabled / maintenance / `restrictTo`
3. Rate-limit cooldown + throttle rolling-24h budget
4. Per-account `dailyTokenLimit` (UTC day)
5. `ALLOW`

There is no per-account feature-block row. Status `restricted` is a 0.2× throttle, not a feature deny. Org monthly AI budget is dashboard/alerting only.

`SUSPENDED` blocks the signed-in product at `publicProcedure` (except `me.session`) and `protectedProcedure`. The owner account cannot be suspended. The client also hides the product outlet when `me.session.isSuspended` is true.

---

## A. Deployment health

1. Railway deployment succeeds.
2. `pnpm start` completes.
3. Migration runner reports `0036` successfully applied.
4. `/api/health` returns healthy.

## B. Owner test

Using the actual owner account:

1. Sign in.
2. Open `/admin`.
3. Confirm redirect to `/admin/overview`.
4. Open Users.
5. Open Usage & Cost.
6. Open Features.
7. Open Settings.
8. Open Audit.
9. Verify an owner-only mutation works on a **safe test setting** (monthly AI budget).
10. Restore the changed setting.

Also confirm: Settings → Admin and the app gear Admin Console link land in the console; **Back to app** returns to `/dashboard`.

Owner safeguards (each must fail in the UI and return tRPC `FORBIDDEN`; no success audit row):

- Suspend self
- Remove own owner role
- Disable own AI
- Apply throttle / WATCH to self

## C. Normal-user test

Using a known normal account:

1. Admin nav absent (no console sidebar, gear entry, or Settings Admin entry).
2. `/admin` denied (not the console).
3. `/admin/users` denied.
4. Direct `adminConsole.*` tRPC calls return `FORBIDDEN`.

## D. Google account switching test

1. Sign in with Google Account A.
2. Sign out.
3. Select Google sign-in.
4. Confirm the account picker appears.
5. Select Account B.
6. Confirm Account A league/user data does not appear.

## E. Usage-control test

Using a safe test account (not the owner):

1. WATCH → AI still works.
2. Apply throttle → verify the 20% rolling-24h budget limit.
3. Apply a daily token limit → verify UTC-day enforcement (at/over the cap denied).
4. Remove the limit.
5. Confirm audit rows exist for the mutations.

Also: Disable AI → LLM denied; Suspended → product APIs denied except `me.session`. Restore the account.

## F. Feature restriction test

1. Restrict a **safe LLM-backed** feature (example: Advisor) with `restrictTo=owner` or disable it.
2. Verify a normal account is denied in the UI (`FeatureRouteGate` / session blocked-features).
3. Verify direct AI/backend access is also denied (`evaluateLlmAccess` inside `invokeLLM`).
4. Restore the feature.
5. Confirm an audit row.

Admin-only `restrictTo=admin` allows `role=admin` and the owner; it denies normal users.

---

## Non-LLM feature-control gaps (partial enforcement)

Global feature overrides are stored for every catalog feature. **LLM calls** are gated in `invokeLLM` / `invokeLLMStream`. **UI routes** use `me.session` blocked-features + `FeatureRouteGate`.

Non-LLM tRPC routers are **not** globally wrapped. If a feature’s primary page would still load data after being shown as disabled, Admin Features labels it **Partial enforcement**.

| Catalog id | LLM-backed (`aiFeatureId`) | Enforcement |
|---|---|---|
| advisor, draft-commentary, keeper-advisor, draft-war-room, trades, rfsn, rivalries, owner-profiles, league-dna, league-history, complete-rivalry-documentaries, historic-trade-intelligence | yes | UI + LLM. Other non-LLM tRPC on the same page may still respond if called directly. |
| dashboard, rosters, matchups, post-draft-evaluation, championship-path, the-cast, power-rankings, acquisition-impact, standings, commissioner-command-center, hall-of-fame, transactions, why-havent-i-won, championship-reports, deep-league-records | no | **Partial** — UI/session only |

Shared `aiFeatureId` values (example: `DRAFT_ANALYSIS` on keeper-advisor and draft-war-room) map to **one** product id at the LLM boundary (last catalog row wins). Restricting one of those product ids may not uniquely address every call site that shares the AI id.

## Admin UI honesty

| Surface | Control | Status |
|---|---|---|
| `/admin/users/:userId` | status, disable AI, daily token limit, roles | Enforced + audited. Owner protected. |
| `/admin/features` | On / Maint / Off / Admin / Owner | Persisted + audited. LLM+UI for mapped features. **Partial enforcement** badge when `aiFeatureId` is null. |
| `/admin/settings` | Monthly AI budget | Stored; used for Usage & Cost / health. **Does not hard-block LLM.** |
| `/admin/settings` | Maintenance message | **Not yet enforced** — control disabled. |

---

## Local gates (pre-deploy)

```text
pnpm check
pnpm test server/_core/adminAccess.test.ts server/adminConsole/adminConsole.access.test.ts server/adminConsole/accountControls.policy.test.ts server/adminConsole/featureFlags.test.ts server/adminConsole/aiAccessPolicy.test.ts server/rateLimiter.usageControls.test.ts client/src/pages/admin/AdminConsole.contract.test.ts
pnpm build
```

Browser owner/non-owner verification against production has **not** been completed until sections A–F are executed post-deploy.
