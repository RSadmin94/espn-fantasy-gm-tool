# GM War Room — RC1 / v4.0 Engineering Handoff (Claude & Implementers)

**Purpose:** This document is the **single implementation guide** for moving GM War Room toward **Release Candidate 1 (RC1)** under the **v4.0 Master Certification** standard. It is written so **Claude Code (or any engineer)** can implement without re-running the full audit.

**Authoritative specs (read first):**

- **Truth doctrine (existing):** [`docs/HISTORICAL_DATA_TRUTH_DOCTRINE.md`](./HISTORICAL_DATA_TRUTH_DOCTRINE.md) — especially championship and matchup rules.
- **Draft history canon:** [`docs/DRAFT_HISTORY_CANONICAL.md`](./DRAFT_HISTORY_CANONICAL.md)
- **v4.0 certification standard:** Treat the user-provided **v4.0 Master Certification** text as law for PASS/FAIL. This handoff translates it into **code-level tasks**.

**What this doc is not:** A feature wishlist, a redesign manifesto, or a second audit. Scope is **trust fixes** only.

---

## 1. Mission (RC1)

Ship a build where a logged-in user sees **consistent** championships, **correct** focal identity, **correct** league naming, **provable** draft tendencies (or explicit “insufficient data”), **non-duplicated** legends with explainability metadata, and **CI** that blocks regressions on three golden leagues.

---

## 2. Non-negotiable rules (implement exactly)

| ID | Rule | Implementation meaning |
|----|------|---------------------------|
| **R1** | ESPN wins on conflict | When reconciling cache vs DB, **prefer latest ESPN-derived truth** after sync; surface `asOf` / layer in UI if both exist during transition. |
| **R2** | Draft History wins | Any “Draft DNA” claim must cite **`gm_draft_picks`** rows (or explicitly hidden). |
| **R3** | Medals win championships | **`league_medals`** is **primary** for titles/champion seasons/reigning/drought **everywhere user-visible**. `teams.finalStanding === 1` is **fallback only** when medal missing, logged, and labeled in UI. |
| **R4** | Active profile wins | Focal owner/team/franchise from **`resolveActiveProfile()`** only. **No** Clerk-name fuzzy match for “my team”. **No** “first owner in list” default. |
| **R5** | One concept = one definition | Each user-facing label ID maps to **one** formula + **one** primary table path (see registries). |
| **R6** | League independence | No production logic keyed to **457622**, **158918**, **480452315**, “Atlantas Finest”, or hardcoded owner/team IDs. Golden leagues are **test fixtures / CI**, not code branches. |

---

## 3. Current defects (assume true — do not re-prove)

These are the **release blockers** you must clear for RC1:

> **PR0 (prerequisite — data classification) — `isPlayoff` persistence misclassification.**
> ESPN sends `playoffTierType: "NONE"` for regular-season games; the old write path treated any non-empty tier string as playoff, so every regular-season row was stored `isPlayoff=1`. This empties HoF **Records, Rivalries, Season records, and Owner W/L** (all filter `isPlayoff=0`) and blocks the §4.10 golden-CI test.
> **Status: code fixed** — shared helper `server/matchupPlayoffTier.ts` (`!== "NONE"` semantics); all write paths migrated (`espnPersistence.ts:355`, `routers.ts:642`, `routers.ts:3474`).
> **158918: data backfilled & validated** — 931 RS / 168 playoff, 819 completed RS games; Records + Rivalries populate; `scripts/_pr0_isplayoff_validate.mts 158918` → **PASS**.
> **480452315: still needs the rawMatchup backfill** (safe — tier present on all 387 rows).
> **Do NOT rawMatchup-backfill 457622** — its `rawMatchup.playoffTierType` is null on ~94% of rows (flags came from a different correct ingestion path; a rawMatchup backfill would corrupt them).

1. **Championship authority split** — `whyHaventIWon.ts` and `championshipPath.ts` use `finalStanding` as primary champion signal; HoF / parts of career path use medals.
2. **Active profile split** — `OwnerProfiles.tsx` defaults to first owner; `useLeagueContext.ts` infers “my team” via Clerk string matching.
3. **League identity leaks** — ``League ${id}`` fallbacks; `LeagueDataHealth.tsx` hardcodes “Atlantas Finest FF”; dev defaults `457622` in server paths.
4. **Draft DNA** — tendencies can appear without pick-level proof payload.
5. **Legend collisions** — e.g. “Trade Shark” computed in owner awards, `leagueDNA.ts`, `analytics.ts`, `reputationService.ts` with **different** meanings.
6. **No metric registry** — metrics lack declared `(table, procedure, filters, asOf)`.
7. **No golden CI** — three leagues not enforced on every merge.

---

## 4. Target architecture (minimum for RC1)

### 4.1 `ChampionshipAuthorityService` (NEW)

**Location:** `server/championshipAuthority.ts` (name may be `championshipAuthorityService.ts` — pick one, use consistently).

**Responsibilities:**

- Input: `{ db, leagueId, profileOwnerKey? }` and optionally `medalRows` if caller already loaded them.
- Output (example shape — adjust to fit types):

```ts
export type ChampionshipAuthorityResult = {
  /** Count of seasons where this ownerKey is resolved champion from medals */
  titles: number;
  /** Sorted season list */
  championSeasons: number[];
  /** Latest completed season in data model (define explicitly) */
  latestCompletedSeason: number | null;
  /** True if latestCompletedSeason is in championSeasons */
  isReigningChampion: boolean;
  /** For drought: seasons since last title (define vs "seasons played") */
  titleDroughtSeasons: number | null;
  /** Per-season champion teamId for Path benchmarks (if derivable) */
  championTeamIdBySeason: Map<number, number>;
  /** Diagnostics for CI */
  diagnostics: {
    unresolvedChampionMedals: Array<{ season: number; label: string }>;
    fallbackFinalStandingUsed: boolean;
  };
};
```

**Implementation strategy (shortest path):**

1. **Reuse** medal → owner resolution from `server/ownerProfileService.ts`:
   - `resolveMedalTeamToOwnerKey(season, teamLabel, allLeagueGmRows, nameToOwnerId)`
   - `computeOwnerProfileRecordBundle` already stitches medals into `isChampion` / counts — **either** call that bundle for the focal owner **or** extract the medal pass into a shared function used by both bundle and authority (avoid drift).
2. **Fallback:** If a season has **no** medal champion row but has `teams.finalStanding === 1`, resolve that row **only** after emitting diagnostic; never silently prefer standings when medal exists.

**Consumers to migrate (P0):**

| File | Change |
|------|--------|
| `server/whyHaventIWon.ts` | Replace `titles` / `championSeasons` derived from `finalStanding` with authority output. |
| `server/championshipPath.ts` | Replace `champions = teams.filter(finalStanding===1)` with **medal-resolved champion teamIds** for benchmark seasons. |
| `server/careerReportService.ts` | Ensure title-related fields use the same authority (may already be close via bundle — **diff and unify**). |
| `server/routers.ts` | Any dashboard or owner list field showing titles must call authority or a tRPC wrapper, not ad hoc SQL. |

**Tests:** Add `server/championshipAuthority.test.ts` with:

- Fixture league: medal champion ≠ `finalStanding` champion for a season → authority must follow **medal**.
- Season with medal missing → fallback path exercised once.

---

### 4.2 `MetricRegistry` (NEW, MVP)

**Location:** `server/metricRegistry.ts`

**Goal:** Central list of **Tier-1** metrics for RC1 (start with ~15, expand later).

Each entry:

```ts
type MetricDefinition = {
  id: string; // stable snake_case, e.g. "career_trades_completed"
  displayName: string;
  sourceTable: string; // e.g. "transactions" | "gm_matchups" | "league_medals" | "gm_draft_picks"
  procedure: string; // e.g. "routers.ts:owners.ownerList activity rollup" — human readable OK for RC1
  filters: string; // e.g. "isPlayoff=0 for RS W-L"
  /** ISO string from max(updatedAt) or sync timestamp; nullable until pipeline fixed */
  asOf: string | null;
};
```

**Wire gradually:** Owner awards, Activity DNA responses, HoF cards can attach `metricId` in JSON without UI redesign — but RC1 **must** have at least one `trpc` procedure, e.g. `metrics.explain({ metricId, ownerKey })`, returning the row definition + `asOf`.

---

### 4.3 `LegendRegistry` (NEW, MVP)

**Location:** `server/legendRegistry.ts`

**Goal:** Map **`legendId` → `{ metricIds[], formula, tier }`** where `tier` is:

- `historical` — provable from Tier-1 tables
- `projection` — sim / odds (must not share chip styles with historical)
- `narrative` — reputation / LLM (must be labeled)

**RC1 collision resolution (minimum):**

| Display string | Problem | RC1 approach |
|----------------|---------|--------------|
| **Trade Shark** | 3+ meanings | Pick **one** canonical `legendId` (recommend: **lifetime trade count rank** from `transactions` or single rollup table). Rename others in API to `trade_shark_narrative` / `trade_shark_dna_tempo` **or** remove duplicate strings from UI. |
| **Best Drafter** | Awards vs Draft Reality | Rename one in UI/API (`early_rb_wr_volume_leader` vs `sim_draft_grade_leader`). |

Do **not** add new badge types in RC1 — only **disambiguate** or **merge**.

---

### 4.4 Active profile client layer (NEW + edits)

**New:** `client/src/hooks/useFocalProfile.ts`

- Reads `trpc.me.activeProfile` (existing pattern on other pages).
- Returns `{ ownerKey, ownerName, teamId, franchiseName, isSetupComplete, ready }`.
- **`ready`** means: active league loaded AND `selectedOwnerKey` present AND valid for current `owners.ownerList`.

**Edit:** `client/src/pages/OwnerProfiles.tsx`

- On `ownerListHydrated`, if `selectedOwnerKey` is null, set to **`me.activeProfile.selectedOwnerKey`** when `isSetupComplete`, else keep explicit “select owner” empty state ( **never** auto-pick `active[0]` for logged-in setup-complete users).

**Edit:** `client/src/hooks/useLeagueContext.ts`

- Remove `resolveMyTeam(teams, clues)` as the source of truth for `myTeamId`.
- Instead: use `useFocalProfile` + a tiny query `trpc.teams.myTeamForSeason` **or** derive from `owners.ownerList` row matching `selectedOwnerKey` for `season` from context.

If `selectedTeamId` is null in DB, show a **non-fuzzy** banner: “Select your team in Settings” — do not guess.

---

### 4.5 League identity (quick + necessary)

| File | Action |
|------|--------|
| `client/src/pages/LeagueDataHealth.tsx` | Replace hardcoded “Atlantas Finest FF” with `activeLeague.leagueName` or `getActive`. |
| `client/src/components/AppShell.tsx`, `Dashboard.tsx`, `HallOfFame.tsx` | If `leagueName` empty after sync: show **“League name pending sync”**, not raw ID, in **primary** chrome. Raw ID OK in **debug** footer only if needed. |
| `server/db.ts` | Gate `457622` dev fallback: only when `NODE_ENV === "development"` AND `process.env.ALLOW_DEV_LEAGUE_FALLBACK === "1"`. |
| `server/espnService.ts`, `server/weeklyStatsService.ts` | Remove silent production default to `457622`; fail fast or require env in dev only. |
| `client/src/pages/ConnectESPN.tsx` | Replace visible `457622` example with a **generic** placeholder (e.g. `123456`) to satisfy R6 scanners. |

---

### 4.6 Draft DNA validation (R2)

**Server:** `server/leagueDNA.ts` / DNA router responses

- Add `claims: Array<{ id: string; text: string; pickIds: number[]; seasons: number[]; confidence: number }>` (shape flexible).
- **Rule:** If supporting picks empty → **omit claim** from API (or `suppressed: true` with reason for debug).

**Client:** wherever DNA strings render, show “insufficient draft history” if `claims` missing for that section.

---

### 4.7 Draft History sorts (R2 surface)

**File:** `client/src/pages/DraftHistory.tsx`

- Add UI sort controls: Team, Owner, Position, Round, Pick, Season.
- Implement as **client-side sort** on loaded rows for RC1 (fastest); server-side sort can be RC2 if payload is huge.

---

### 4.8 Keeper certification (v4 §19)

**File:** `server/routers.ts` — `espn.keeperPool`

- After resolving league settings (`leagueCapabilities` / ESPN settings), if keeper slots per team == 0:
  - Return `{ disabled: true, keeperSlotsPerTeam: 0, pool: [], ... }`.
- Always include `keeperSlotsPerTeam` and `computedAt` (ISO).

**Files:** `client/.../KeeperAdvisor.tsx`, Draft War Room keeper sections, nav/routes

- If `disabled`, hide routes or show read-only explanation.

---

### 4.9 Commissioner Hub edge case

**File:** `client/src/lib/activityDnaExtremes.ts`

- If only one scored owner, return `{ most, least: null }` and let UI say “Not enough owners with activity DNA scores”.

---

### 4.10 Golden league CI (release gate)

**Add:** `tests/golden/leagues.test.ts` (or `scripts/cert-golden-leagues.mts` invoked in CI)

- Use **frozen JSON fixtures** checked into `tests/fixtures/golden/` for **158918**, **457622**, **480452315** — small, focused on:
  - Title counts from medals == authority output
  - Focal owner key normalization
  - RS record sample from `gm_matchups` filter `isPlayoff=0` (**depends on PR0** — fixtures for 480452315 will be empty until its backfill runs)
- **Do not** call live ESPN in default CI (flaky). Staging job optional.

**Wire:** `.github/workflows/ci.yml` (or new `golden.yml`) — `pnpm test tests/golden`.

---

## 5. Dependency order (what to build first)

```text
isPlayoff classification fix + 158918 backfill (PR0 — DONE)
  → unblocks HoF Records / Rivalries / Season records / Owner W-L + golden CI
  → (follow-up: rawMatchup-backfill 480452315; never 457622)

ChampionshipAuthority (server)
  → whyHaventIWon + championshipPath + career alignment
      → enables consistent "titles" everywhere

MetricRegistry MVP (server) + metrics.explain (tRPC)
  → owner awards + badges attach metricId

LegendRegistry MVP (server)
  → rename / alias duplicate labels

useFocalProfile (client) + OwnerProfiles + useLeagueContext
  → identity PASS

League identity string cleanup + db/env guards
  → league independence PASS

Draft DNA claims + Draft History sorts
  → draft truth PASS

keeperPool disabled + UI hide
  → keeper PASS

Golden fixtures + CI
  → release gate PASS
```

**Parallelization:** ChampionshipAuthority (server) and League identity / useFocalProfile (client) can run in parallel after interfaces are agreed.

---

## 6. Key existing code pointers (do not cargo-cult — read before edit)

| Concern | Where to read |
|---------|----------------|
| Medal → owner | `server/ownerProfileService.ts` — `resolveMedalTeamToOwnerKey`, `computeOwnerProfileRecordBundle` |
| HoF payload | `server/hallOfFameService.ts` — `buildHallOfFamePayload` |
| Why titles bug | `server/whyHaventIWon.ts` — search `finalStanding` |
| Path champions bug | `server/championshipPath.ts` — `champions = teams.filter` |
| Activity DNA | `server/activityDnaService.ts` |
| GM DNA duplicate | `server/leagueDNA.ts`, `server/analytics.ts` |
| Owner awards | `server/routers.ts` — search `ownerAwards`, `Trade Shark` |
| Reputation | `server/reputationService.ts` |
| Profile UI default | `client/src/pages/OwnerProfiles.tsx` — `useEffect` first owner |
| League context | `client/src/hooks/useLeagueContext.ts` — `resolveMyTeam` |
| Phase X.9 validation | `scripts/_phase_x9_exec_once.mts` — useful for local “coverage / medals / draft reality” sanity after changes |

---

## 7. Database tables (mental model)

| Table | RC1 use |
|-------|---------|
| `league_medals` | **Primary** championships |
| `gm_matchups` | RS records / rivalries — **`isPlayoff = 0`** for RS per doctrine |
| `gm_teams` / `teams` | Rosters, PF, **fallback** champion only via authority |
| `gm_draft_picks` | Draft History + DNA claims |
| `transactions` | Canonical target for trades/waivers long-term; today some features use `transactionCounter` on raw team JSON — registry should document actual path used in RC1 |
| `league_connections` | `leagueName`, active league |

---

## 8. Testing checklist (before merge)

- [ ] `pnpm test` (or project equivalent) — include new `championshipAuthority.test.ts` + golden tests.
- [ ] `pnpm check` / `tsc --noEmit` if project uses it.
- [ ] Manual: log in → **Owner Profiles** opens on **your** owner without picker click.
- [ ] Manual: **Why Haven’t I Won** titles match **HoF** for same user.
- [ ] Manual: **Championship Path** champion benchmark seasons align with medals.
- [ ] Run `npx tsx scripts/_phase_x9_exec_once.mts` if DB available — verify Section B unresolved stays 0 for golden league fixtures.

---

## 9. Explicit non-goals (RC2)

- New AI storytelling, new simulations, new badge families, large chart experiments.
- Full “opinion vs truth” visual system beyond minimal labels/section headers.
- Exhaustive metric registry for every minor stat.

---

## 10. PR strategy (keep reviewable)

0. **PR0 — `isPlayoff` classification + 158918 backfill + validation script** (DONE; remaining follow-up: rawMatchup-backfill 480452315).
1. **PR1 — ChampionshipAuthority + Why + Path** (server-only + tests).
2. **PR2 — Active profile + league identity** (client + small server).
3. **PR3 — Registries MVP + legend renames** (server + thin client tooltip).
4. **PR4 — Draft DNA claims + Draft History sorts + keeper disabled**.
5. **PR5 — Golden CI**.

Smaller PRs = faster Claude/human review.

---

## 11. Prompt snippet for Claude Code

Paste when starting work:

> Follow `docs/RC1_V4_CLAUDE_DEV_HANDOFF.md`. Do not add features. Implement trust fixes only: (1) `ChampionshipAuthority` + migrate `whyHaventIWon.ts` and `championshipPath.ts` off `finalStanding` as primary, (2) active profile focal per `resolveActiveProfile`, (3) remove hardcoded league strings and 457622 prod defaults, (4) MVP metric/legend registries, (5) golden fixtures CI. Reuse `ownerProfileService` medal resolution. After each change, run targeted tests you touch.

---

## 12. Estimated effort (for planning only)

| Track | Calendar (1 senior eng) |
|-------|---------------------------|
| Championship + tests | ~1 week |
| Identity + league chrome | ~1 week |
| Registries + collisions | ~1 week |
| Draft DNA + sorts + keeper | ~1 week |
| Golden CI | ~3–5 days |

**Total:** ~4–6 weeks calendar; parallelize to ~3–4 weeks with two engineers.

---

*Document version: 1.0 — RC1 / v4.0 engineering handoff. Update in-repo when blockers change.*
