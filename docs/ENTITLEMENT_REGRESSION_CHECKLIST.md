# Entitlement Regression Checklist

Two independent axes. Both must pass before paywall launch.

| Axis | Question | How to verify |
|------|----------|---------------|
| **Axis 1 — Entitlement** | Is premium content gated (Free vs Rivals Pro)? | Dev entitlement override Free/Pro; compare payloads. See [Axis 1](#axis-1--entitlement-free-vs-rivals-pro). |
| **Axis 2 — Scope / Ownership** | Can a user read data for leagues/owners they are not connected to? | Foreign `leagueId` / `ownerId` in **both** override states. See [Axis 2](#axis-2--scope--ownership). |

**Scripts**

- Axis 1 gate shapes: `npx tsx scripts/_validate_entitlement_gates.mts`
- Axis 1 prod smoke: `npx tsx scripts/_verify_prod_entitlements.mts [gitShaPrefix]`
- Axis 2 ownership: `npx tsx scripts/_validate_axis2_ownership.mts` (requires auth + env; see script header)

Related spec: `docs/FREEMIUM_GATING_SPEC.md` §11 (server-side redaction).

---

## Axis 1 — Entitlement (Free vs Rivals Pro)

> Proves people pay for what they get.

### Purpose

Verify that Fantasy Football Rivals returns **teaser** payloads for free users and **full** payloads for Rivals Pro (or dev override Pro), with redaction enforced **server-side** — not UI-only.

### Test setup

- Authenticated developer account with league **457622** connected.
- Toggle **development entitlement override** (Settings) between Free and Rivals Pro.
- Do **not** change Stripe, league connection, ESPN credentials, or owner identity between toggles.

### Pass criteria

- Free: one proof item + locked count / empty premium fields (per `FREEMIUM_GATING_SPEC` Proof/Pain/Promise).
- Pro: full payload for the same endpoint + same league context.
- Redaction in response body, not just hidden in UI.

### Fail criteria

- Full premium payload visible to free users in any field (including nested).
- Pro and Free identical on a feature marketed as Pro-only.

### Axis 1 results (last run)

See Sprint 3 Step 2 gating table (feature registry capabilities + pro routes). Summary:

| Area | Status | Notes |
|------|--------|-------|
| Rivalry documentary gates | PASS (unit) | `_validate_entitlement_gates.mts` |
| Notorious trades gate | PASS (unit) | teaser count only for free |
| Draft War Room | **LEAK (Axis 1)** | `getDraftWarRoomData` ungated `publicProcedure` |
| GM Advisor chat | PASS | `subscribedProcedure` |
| GM Advisor history | **LEAK (Axis 1)** | `protectedProcedure` only |

Re-run Axis 1 after any gating change.

---

## Axis 2 — Scope / Ownership

> Proves that *no matter the plan*, a user can only read data for leagues and owners they are actually connected to.

### Purpose

Verify that Fantasy Football Rivals enforces **tenant isolation** at the API layer.

Axis 1 asks: *is premium content gated?*  
Axis 2 asks: *can an authenticated user read data that isn't theirs?*

These are different code paths. A clean Axis 1 result proves nothing about Axis 2. Ownership must be enforced **independently of entitlement** — a paying Rivals Pro subscriber still cannot read a stranger's league.

---

### The Core Rule for Axis 2

Entitlement is irrelevant here. The gate is **ownership**, and it must hold in **both** override states.

For every scoped endpoint:

1. Identify a `leagueId` / `ownerId` / `userId` that the test account is **NOT** connected to (a "foreign" ID).
2. Call the endpoint with that foreign ID while override = **Free** → expect blocked / empty.
3. Call the same endpoint with that foreign ID while override = **Rivals Pro** → **still** expect blocked / empty.
4. Inspect the actual server response body. The foreign league's data must not appear in any field, in either state.

If Free is blocked but Pro returns the foreign data, that is the leak. Ownership is failing and entitlement is masking it.

---

### Test Setup

Use the same authenticated developer account.

**Connected league (yours):** `457622`

**Foreign target (NOT connected to your account):** Use any league ID your account has never linked — e.g. a fabricated ID, or a second real league you do not own. The point is: your account has no relationship to it.

**Important:** Prefer a foreign ID that **has data in the system** but is **not** in your `league_connections`. Empty-because-absent is inconclusive (see trap below).

Toggle the development entitlement override between Free and Rivals Pro as in Axis 1. Do not change Stripe, the user row, the league connection, ESPN credentials, or owner identity.

---

### Scope Type Matters

Endpoints isolate on different keys. Test against the right one:

| Scope Type | Key the caller supplies | Foreign-access test |
|------------|-------------------------|---------------------|
| League-scoped | `leagueId` | Request a league you aren't connected to. |
| Owner-scoped | `ownerId` (within a league) | Request another owner inside a league you can't see. |
| User-scoped | implied calling `userId` | Attempt to read another user's private record. |

---

### Axis 2 Regression Table (procedure list)

| Capability | Endpoint / Procedure | Scope Key | Foreign-ID Expected Response (BOTH Free and Pro) |
|------------|----------------------|-----------|--------------------------------------------------|
| Trade Analyzer | `tradeAnalyze` | leagueId | Blocked / empty. No foreign league players, totals, or analysis in any field. |
| Draft War Room | `getDraftWarRoomData` | leagueId | 403 / empty. No foreign draft board, rankings, or keeper intel. |
| Rivalry Documentary Statements | `rivalryStory.statements` | leagueId | Blocked / empty. No foreign statements, not even a cold open. |
| Rivalry Receipts | `rivalryStory.receipts` | leagueId | Empty array. No foreign receipt IDs, scores, margins, or evidence. |
| Rivalry Story Pair | `rivalryStory.pair` | leagueId | Blocked. No foreign pair metadata or block list. |
| Rivalry Story For Owner | `rivalryStory.forOwner` | ownerId | Blocked. Cannot request stories for an owner in a league you can't see. |
| Notorious Trades | `completedTradeIntel.notoriousTradesReport` | leagueId | Blocked / empty. No foreign trade report. |
| Owner Trade History | `completedTradeIntel.ownerTradeHistory` | ownerId | Blocked / empty. No foreign owner's trade ledger. |
| Rivalry Trade Ledger | `completedTradeIntel.rivalryTradeLedger` | leagueId | Blocked / empty. No foreign ledger. |
| League History Deep Records | HoF / record procedure | leagueId | Blocked. No foreign record book, titles, or leaderboard. |
| Owner All-Time Records | `ownerAllTimeRecords` | ownerId | Blocked. No foreign owner's all-time records. |
| Why Haven't I Won | `leagueIntel.whyHaventIWon` | leagueId/owner | Blocked. No foreign reason stack or title path. |
| Playoff Position Split | `leagueIntel.playoffPositionSplit` | leagueId | Blocked. No foreign split analysis. |
| Championship Diagnosis | Championship diagnosis stack | leagueId/owner | Blocked. No foreign diagnosis. |
| Championship Path | Championship path procedure | leagueId/owner | Blocked. No foreign path. |
| League DNA | League DNA procedure | leagueId | Blocked. No foreign dossier. |
| Acquisition Impact | Acquisition impact procedure | leagueId | Blocked. No foreign leaderboards or impact rankings. |
| GM Advisor History | `advisor.history` | userId | Blocked / empty. Cannot read another user's advice history. |
| GM Advisor Memory | `advisor.getMemory` | userId | Blocked / empty. Cannot read another user's memory payload. |

> **GM Advisor Chat (`advisor.chat`):** primarily an entitlement gate (Axis 1). Also confirm scope — memory/context pulled into chat must belong to the **calling user only**.

---

### Pass Criteria (Axis 2)

A capability passes only if:

- Foreign-ID request returns blocked or empty in **both** Free and Rivals Pro states.
- No foreign league, owner, or user data appears in any field of the response body — including hidden or nested fields.
- The block happens **server-side**, not because the UI declined to render it.
- Your own connected league (`457622`) still returns correctly in the same run (endpoint isn't broken for everyone).

---

### Fail Criteria (Axis 2)

A capability fails if:

- Pro state returns foreign data that Free state blocked → entitlement is masking a missing ownership check.
- Any foreign data appears in a hidden or nested field.
- The endpoint returns foreign data and relies on the frontend to hide it.
- The block depends on the foreign ID "not existing" rather than on an ownership check (would leak once the foreign ID is real).

---

### One Trap to Avoid

A foreign ID that returns empty *because the league doesn't exist in your database* is **not** a passing test — it's **inconclusive**. The endpoint may be returning empty because there's no data to find, not because it checked ownership and refused. To prove the gate, the foreign target should be an ID that **does** have data in the system but is **not connected to your account**. Empty-because-refused is a PASS; empty-because-absent tells you nothing.

---

### Final Report Format (Axis 2)

| Capability | Foreign-Free Result | Foreign-Pro Result | Status |
|------------|---------------------|--------------------|--------|
| Trade Analyzer | Blocked | Blocked | PASS |
| Owner Trade History | Blocked | **Returned data** | FAIL |

Any FAIL must include:

- endpoint
- scope key (`leagueId` / `ownerId` / `userId`)
- field that leaked
- whether the block was attempted server-side or not at all
- proposed fix

---

### Axis 2 Run Results (2026-06-27)

**Method:** Static code-path audit of every procedure in the regression table, plus unauthenticated prod HTTP probes (`457622` vs `1589110`). Local authenticated run blocked (DB connection timeout in agent env). **Re-run with `scripts/_validate_axis2_ownership.mts` on a dev machine with Clerk session + foreign league that has DB rows.**

**Code finding:** There is **no** shared `assertUserLeagueAccess()` helper in `server/` today. `resolveActiveLeagueId()` accepts a caller-supplied `inputLeagueId` at step 1 **without** checking `league_connections` (see `server/db.ts`).

| Capability | Endpoint | Foreign-Free Result | Foreign-Pro Result | Status | Note |
|------------|----------|---------------------|--------------------|--------|------|
| Trade Analyzer | `tradeAnalyze` | Blocked (implicit) | Blocked (implicit) | **PASS*** | No client `leagueId`; resolves from user's active connection only. *Confirm with auth + foreign season attempt.* |
| Draft War Room | `draftWarRoom.getDraftWarRoomData` | Blocked (implicit) | Blocked (implicit) | **PASS*** | Ignores client league; uses `resolveActiveLeagueId` for user. *Axis 1 still ungated for own league.* |
| Rivalry Statements | `rivalryStory.statements` | **Returns data** | **Returns data** | **FAIL** | Accepts `input.leagueId` with **no ownership check**. Prod: unauth call to `457622` returns cold open. |
| Rivalry Receipts | `rivalryStory.receipts` | Empty (entitlement) | Full if Pro | **FAIL** | Same `input.leagueId`; no ownership gate. Pro would return foreign receipts. |
| Rivalry Story Pair | `rivalryStory.pair` | **Returns teaser** | **Returns full** | **FAIL** | No ownership check; prod unauth gets gated teaser for `457622`. |
| Rivalry For Owner | `rivalryStory.forOwner` | **Returns stories** | **Returns stories** | **FAIL** | `input.leagueId` + `focalOwnerKey` with no connection check. |
| Notorious Trades | `completedTradeIntel.notoriousTradesReport` | Empty (entitlement) | Full if Pro | **FAIL** | `loadTradesForLeague(input.leagueId)` with no ownership check. |
| Owner Trade History | `completedTradeIntel.ownerTradeHistory` | Empty/teaser | Full if Pro | **FAIL** | Foreign `leagueId` + owner identifier; no connection check. |
| Rivalry Trade Ledger | `completedTradeIntel.rivalryTradeLedger` | Empty/teaser | Full if Pro | **FAIL** | Same pattern as notorious trades. |
| HoF Deep Records | `espn.hallOfFame` | Blocked (implicit) | Blocked (implicit) | **PASS*** | Resolves league from user profile only; no foreign `leagueId` input. |
| Owner All-Time Records | `espn.ownerAllTimeRecords` | Blocked (implicit) | Blocked (implicit) | **INCONCLUSIVE** | User-scoped league resolution; returns full W-L for active league with **no entitlement gate** (Axis 1 gap). Foreign league not injectable via input. |
| Why Haven't I Won | `leagueIntel.whyHaventIWon` | Blocked (implicit) | Blocked (implicit) | **PASS*** | `computeWhyHaventIWon(userId)` — no foreign league input. |
| Playoff Position Split | `leagueIntel.playoffPositionSplit` | Blocked (implicit) | Blocked (implicit) | **PASS*** | User-scoped. |
| Championship Diagnosis | `leagueIntel.careerReport` | Blocked (implicit) | Blocked (implicit) | **PASS*** | User-scoped. |
| Championship Path | `leagueIntel.championshipPath` | Blocked (implicit) | Blocked (implicit) | **PASS*** | User-scoped. |
| League DNA | `dna.myProfile` / `activityDna.league` | Blocked (implicit) | Blocked (implicit) | **PASS*** | `buildManagerRawData(userId)` / active league only. |
| Acquisition Impact | `leagueIntel.acquisitionImpact` | Blocked (implicit) | Blocked (implicit) | **PASS*** | User-scoped. |
| Advisor History | `advisor.history` | Blocked (implicit) | Blocked (implicit) | **PASS*** | Keyed to `ctx.user.id` only. |
| Advisor Memory | `advisor.getMemory` | Blocked (implicit) | Blocked (implicit) | **PASS*** | Keyed to `ctx.user.id` only. |
| Advisor Chat context | `advisor.chat` | N/A | N/A | **PASS*** | Uses calling user's id for history/memory (`advisorContextBuilder`). |

**Proposed fix (priority):** Add `assertUserLeagueAccess(userId, leagueId)` (query `league_connections` for `(userId, leagueId)`) and call it at the top of every procedure that accepts a client-supplied `leagueId` — **`rivalryStoryRouter`**, **`completedTradeIntelRouter`**, and any caller passing `input.leagueId` into `resolveActiveLeagueId()` without a prior check. Return `FORBIDDEN` (not empty teaser) when the league is not connected.

**Prod probe note:** `1589110` returned NOT_FOUND / empty trade report (no rows) — inconclusive for ownership vs absent data. Use a foreign league known to exist in `gm_teams` but not in your connections for a definitive live pass/fail.

---

### Axis 2 Implementation (2026-06-27)

**Changes shipped:**

- `server/leagueAccess.ts` — `userHasLeagueAccess()` + `assertUserLeagueAccess()` (throws `TRPCError` code **`FORBIDDEN`**)
- `server/rivalryStoryRouter.ts` — all 4 procedures → `protectedProcedure`; assert at top of each handler
- `server/completedTradeIntelRouter.ts` — all 3 procedures → `protectedProcedure`; assert at top of each handler
- `server/db.ts` — `resolveActiveLeagueId()` asserts ownership when client supplies `inputLeagueId` and `ctx.user.id` is present
- Unit tests: `server/leagueAccess.test.ts`, updated router tests (42/42 pass)
- Live validation: `scripts/_validate_axis2_ownership.mts`

**Post-deploy re-run:** Set `USER_ID`, `CONNECTED_LEAGUE=457622`, and a foreign league with DB rows but no `league_connections` row. Expect **`FORBIDDEN`** (not empty teaser) in both Free and Pro override states.
