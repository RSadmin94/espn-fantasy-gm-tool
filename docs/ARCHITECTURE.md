# GM War Room — Architecture & Tool-Path Reference

> **READ THIS BEFORE PROPOSING ANY FIX.** This document is the source of truth for how
> data actually flows through GM War Room. Many "obvious" fixes fight the real pipeline
> (e.g. assuming ESPN's API serves old-season drafts, or assuming one league's season
> window applies to every league). Check the relevant section here first, then suggest.
>
> Last verified: 2026-06-10 against league 457622 (full pass, readiness 100).

## 1. Stack & deploy

- **Repo:** `C:\Users\RODERICK\Projects\espn-fantasy-gm-tool` (Windows).
- **Stack:** React + TypeScript + tRPC + Drizzle ORM + MySQL (TiDB) on Railway.
- **Active branch:** `cursor/frontend-rebuild-stage1-9b20` (Railway auto-deploys from this; `origin/main` is never touched).
- **Two deploy routes — do not confuse them:**
  - **Web (client/ + server/):** commit + push → Railway redeploys automatically.
  - **Chrome extension (chrome-extension/):** NOT a Railway deploy. Requires reloading the
    extension in Chrome. Always bump the version in `manifest.json` so the reload is verifiable.
- **Live URL:** gmwarroom.online.

## 2. The golden rule — raw cache, then re-derive

Every ESPN season is fetched as a **combined** payload and stored verbatim in
`espn_raw_cache` (`viewName='combined'`) **before** any structured rows are extracted.
Normalized tables (`matchups`, `teams`/standings, draft picks, transactions,
`gm_weekly_player_stats`) are **re-derived** from that raw cache by the backfill steps.

**Consequence:** any field not extracted today can be re-derived later WITHOUT re-fetching
ESPN. When data looks wrong/missing, the first question is "is it in `espn_raw_cache`?" —
if yes, the fix is a backfill/re-derive, not a re-fetch.

## 3. ESPN endpoints — who calls what

- **Server** (`server/espnService.ts` `getBaseUrlFor`, and `server/weeklyStatsService.ts`):
  uses ONLY the modern host
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}`.
  **There is no `leagueHistory` branch server-side.** Old seasons are requested from this
  same modern endpoint (it serves migrated history for teams/matchups/standings).
- **Server draft** (`fetchDraftRecapSeason`): `https://fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/.../leagues/{id}?view=mDraftDetail` with a Draft Recap referer.
- **Extension** (`chrome-extension/background.js`): fetches with the user's browser ESPN
  cookies (SWID + espn_s2), via DNR header-injection rules scoped to ESPN hosts. It uses the
  modern `seasons/{year}` endpoint, the legacy `fantasy.espn.com/.../leagueHistory/{id}?seasonId={y}`
  endpoint, AND HTML page scrapes (Draft Recap / Standings / Schedule) for legacy seasons.

## 4. The API-vs-scrape split by season (CRITICAL)

ESPN's API does **not** serve complete data back to a league's inception. The boundary,
as encoded in `background.js` (`MSG_HIST_FULL` handler):

| Season range | Draft picks | Teams / Matchups / Standings |
|---|---|---|
| **2018 → current** | ESPN `mDraftDetail` API (`postImportDraftFromEspnApi`) | Modern `seasons/{year}` API → raw cache → backfill |
| **2009 → 2017 (legacy)** | **HTML scrape** of Draft Recap page (`scrapeDraftRecapPage` → `ingestLegacyDraftRecap`, rows tagged `source='legacy_draft_recap'`) | Modern `seasons/{year}` API still returns these (migrated history) → raw cache → backfill. **Verified populated** in Data Health (legacy seasons show teams + matchups). |

Boundary constants live in the `MSG_HIST_FULL` handler in `background.js`:
`LEGACY_SCRAPE_MIN = 2009`, `LEGACY_SCRAPE_MAX = 2017`, `API_MIN = 2018`.

**Why only draft is scraped for old seasons:** ESPN's API returns no draft detail for
pre-2018, but it DOES return teams/matchups/standings for migrated history. So draft is the
only legacy gap, and it is filled by the Draft Recap scrape.

**2009 caveat:** the league may have no ESPN Draft Recap page for its first year; the scrape
attempts it and skips gracefully if absent. Legacy "8/8 with draft data" = 2010–2017.

## 5. Per-league season discovery — the source of truth for ranges

**Never hardcode a season range.** Use `server/leagueHistoryDiscovery.ts` →
`discoverLeagueHistory(leagueId?, userId?)`. It is active-league only (no cross-league
fallback), does no DB writes, and resolves the league's real history in priority order:

1. `status.previousSeasons` read from the cached **combined** payload (no network/creds).
2. One live ESPN `mStatus`/`mSettings` fetch if the cache lacked it.
3. Graceful degrade: `availableSeasons = syncedSeasons`, confidence `low`.

Returns: `availableSeasons` (newest-first, = previousSeasons ∪ seasonId ∪ synced),
`syncedSeasons`, `missingSeasons`, `detectedStartYear`, `teamsSeasons`, `weeklyStatsSeasons`,
`medalSeasons`, `confidence`, `warnings`.

This is why 457622 resolves 2009–2026 and league 480452315 resolves just `[2026]` —
each league gets its true window, no leakage. The older hardcoded `ALL_SEASONS` range was
removed from `espn.allSeasons` for this reason.

## 6. Sync orchestration (`client/src/pages/SyncData.tsx`)

The Sync page hub buttons call these core functions. All season ranges flow from
`discoverHistoryQuery` (= `trpc.espn.discoverLeagueHistory`), not from constants:

- **`runSyncMyLeagueCore`** ("Sync My League"): refetch discovery → `seasons = latest ∪ missingSeasons`
  → `refreshMutation` (ESPN fetch into raw cache) → `backfillNormalized` for those seasons.
- **`runImportLeagueHistoryCore`** ("Import League History"): refetch discovery →
  `refreshMutation({ seasons: availableSeasons, forceRefresh: true })` → `backfillNormalized`
  over the cached result. This is the full-history pull.
- **`runRepairLeagueCore`** ("Repair"): re-derives from existing caches only —
  `backfillNormalized` + `backfillFromRawCache` (no new ESPN fetch unless needed).
- **`handleFixEverything`** ("Fix Everything"): Sync → Repair → medals
  (`handleScrapeLeagueHistoryMedals`) → weekly box scores (`runCaptureWeeklyBoxScoresCore`, the long step).

**Manual / standalone scrape callers** (NOT in the automated flow above):
`handleBrowserSyncStandings(seasons)`, `handleBrowserSyncMatchups(seasons)`,
`handleBrowserSyncOtherSeasons`. They post `GMWR_HIST_STANDINGS` / `GMWR_HIST_MATCHUPS` to the
extension and scrape whatever season array they are handed (no internal year branch).

**Legacy ceiling constants** (top of `SyncData.tsx`) — now mostly redundant because they are
always intersected with `cachedSeasons`/`availableSeasons`, but still present:
`HISTORICAL_COMPLETED_SEASONS` (2009–2025), `RAW_CACHE_BACKFILL_MIN/MAX` (2009/2026),
`HISTORICAL_ENRICHMENT_MIN/MAX` (2010/2025), `BROWSER_SYNC_REMAINING_SEASONS` (2011–2025).
If you touch ranges, prefer discovery output over these.

## 7. Extension message / handler map

Message constants in `chrome-extension/popup.js`; handlers in `chrome-extension/background.js`;
web↔extension relay in `chrome-extension/gmwarroom-bridge.js` (whitelisted message types).

| Message | Purpose | Trigger |
|---|---|---|
| `GMWR_DISCOVER_LEAGUES_2026` | List the SWID's leagues (Fan API) | Popup |
| `GMWR_SYNC_SELECTED_LEAGUES` | Sync chosen leagues | Popup |
| `GMWR_HIST_DISCOVER` | Build season discovery list | Popup |
| `GMWR_HIST_FULL` | Legacy draft scrape (2009–2017) + API draft import (2018+) | **Popup admin only** (not the web flow) |
| `GMWR_HIST_STANDINGS` | Scrape one season's standings page | Web (manual) |
| `GMWR_HIST_MATCHUPS` | Scrape one season's schedule page | Web (manual) |
| `GMWR_CAPTURE_WEEKLY_STATS` | Capture weekly box scores (per week, all teams) | Web ("Fix Everything" step 4) |
| `GMWR_ROSTER_MATRIX_TEST` / `GMWR_ROSTER_2017_POC` | Diagnostics (modern vs leagueHistory endpoint) | Popup debug |
| `GMWR_HIST_STATUS` | Server-side sync status | Web |

## 8. Key tRPC procedures (`server/routers.ts`, `espn` router)

- `espn.cachedSeasons` — season numbers present in cache for the active league.
- `espn.allSeasons` — league-aware (returns cached seasons; the old hardcoded ALL_SEASONS
  range was removed to stop one league's window leaking into others).
- `espn.discoverLeagueHistory` (protected) — wraps `discoverLeagueHistory` (see §5).
- `espn.settings` / `espn.teams` / `espn.standings` — per-season normalized reads.
- `espn.manifests` — refresh manifests + connection status.
- `espn.backfillNormalized` / `espn.backfillFromRawCache` / `espn.reprocessCached` — re-derive
  normalized rows from cache (no ESPN fetch).
- `espn.leagueMedals` — championship medal rows.

## 9. Owner resolution & caching

`server/currentOwnerService.ts` `resolveCurrentOwner` memoizes the focal owner with a
60-minute TTL keyed by **userId only**. `setActiveLeagueForUser` (`server/db.ts`) MUST call
`memCache.invalidate(\`currentOwner:${userId}\`)` after flipping active-league flags, or pages
like Championship Profile / Career Report / Acquisition Impact go stale on league switch.
Client pages resolve the viewer's focal owner from their active profile
(`selectedOwnerKey`), falling back to name-match then first owner — never hardcode "Rod".

### 9.1 Analytics owner names — key off `teams.ownerId`, NOT `weekly.ownerKey`

`gm_weekly_player_stats.ownerKey` is **not** an authoritative owner identity. During
ingestion it can carry stale member GUIDs or synthetic `team:N` fallbacks (when the real
owner couldn't be determined) that have **no matching `teams.ownerId`** in any season. Any
analytics that aggregates per owner directly off `w.ownerKey` will therefore render raw
GUIDs / `team:N` for those rows **and** mis-score them (the `drafted` set is keyed by the
braced member GUID, so a `team:N` key never matches → everything counts as "acquired").

**Rule:** join weekly stats to `teams` on `(leagueId, season, teamId)` and aggregate off
**`t.ownerId`** (the authoritative owner for that team-season). `teams.ownerId` /
`teams.ownerName` are the source of truth for "who owned this team this season" and
`teams.ownerName` is fully populated for the API era (2018+). This both resolves the name
(via the existing `nameByOwner` map keyed by `teams.ownerId`) and merges orphan keys into
the real owner so scores compute correctly. Example: `server/acquisitionImpact.ts` selects
`t.ownerId AS ownerKey`.

Note: the canonical union-find engine in `ownerProfileService.ts` is for **cross-season
person merging** (same human across GUID changes / name variants), not for raw owner-key →
display-name lookup. For "what is this team-season's owner name," go straight to `teams`.

## 10. Known boundaries & gotchas

- **2009:** legacy draft scrape now attempts it (`LEGACY_SCRAPE_MIN = 2009`), but ESPN may
  not have a 2009 Draft Recap page; failures are logged and skipped.
- **Weekly Stats** coverage is a separate pipeline (`GMWR_CAPTURE_WEEKLY_STATS` →
  `gm_weekly_player_stats`), populated by the long "Fix Everything" step — independent of
  matchups/standings.
- **Two active leagues:** `457622` (ATLANTAS FINEST FF, 14-team, 2009–2026, full cache) and
  `480452315` (12-team, 2026 only). Always test multi-league assumptions against the 2026-only one.
- **Intelligence tables — provisioned 2026-06-10.** `weekly_storylines`, `rivalry_scores`,
  `trade_narratives`, `fear_index`, and `reputation_events` were defined in `schema.ts` but had
  never been `db:push`ed to the live DB, so their features (storylines refresh, rivalry, trade
  narratives, fear index, reputation) returned 500s. All five are now created directly in the
  live DB with columns + indexes verified against `schema.ts`; a future `db:push` treats them as
  in-sync. If a new feature table 500s, check it exists in the live DB before anything else.

## 11. Edit & tooling conventions

- Edits are made on Rod's machine via **Desktop Commander** (`edit_block`, or `start_process`
  running Node/PowerShell). Proven file-write pattern for source files:
  `Set-Content -LiteralPath <path> -Encoding UTF8 -Value @'...'@` (single-quoted PowerShell
  here-string — preserves backticks, `${}`, quotes literally).
- Rod is non-technical and directs all implementation; he cannot read diffs. Always run
  `pnpm check` before committing web changes, keep changes scoped, and state plainly what changed.
- Conventional commits; push to `cursor/frontend-rebuild-stage1-9b20`. Extension changes need
  a `manifest.json` version bump + Chrome reload (not a Railway deploy).
