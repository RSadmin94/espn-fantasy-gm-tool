# Trade Analyzer — Season Auto-Selection

**Status:** ✅ RESOLVED · deployed
**Filed:** 2026-06-18
**Resolved:** 2026-06-19 · commit `ac8fb7a` · branch `cursor/frontend-rebuild-stage1-9b20`
**Type:** UI behavior only (no logic/engine/intelligence changes)
**Priority:** High — it makes a working feature *look* broken

---

## Why this matters

This is not a bug in Trade Intelligence. It's worse: it creates the *illusion*
that Trade Intelligence (and the whole Trade Analyzer) is broken, right at the
moment a new user is forming their first impression. That's a conversion-killer
for a feature that just took several iterations to ship.

### Current user experience
```
Open Trade Analyzer
  ↓
Season defaults to 2025
  ↓
League data actually lives in 2026
  ↓
No teams appear in the team pickers
  ↓
User assumes the Trade Analyzer is broken
```

## Problem
The Trade Analyzer season selector defaults to 2025 even when the active
league's roster/draft data exists primarily (or only) in 2026. Until the user
manually switches the season to 2026, the team pickers come up empty.

## Desired behavior
Default the season selector to the **latest season that actually contains
roster/draft data for the active league**.

## Fallback
If a latest data-bearing season can't be determined, keep the current default
behavior (no regression).

## Validation
- `457622` (ATLANTAS FINEST FF) defaults to **2026**
- `480452315` (Atlantas Finest Dynasty) defaults to **2026**
- `158918` (Teco's) defaults to its **latest available season**
- In all three, team pickers populate immediately on page load with no manual
  season change required

## Explicit non-goals (do NOT touch)
- No changes to trade logic
- No changes to the value engine
- No changes to Trade Intelligence
- UI / default-selection behavior only

## Notes / context
- Observed during the post-deploy QA of commit `3cec870` (Trade Intelligence
  report rendering fix). The rendering fix itself is correct and live; this is a
  separate, pre-existing default-season issue surfaced by that QA.
- Likely lives in the Trade Analyzer page's initial season state
  (`client/src/pages/Trades.tsx`) plus whatever supplies the league's available
  seasons. Confirm the available-seasons source before wiring the default.

---

## Resolution (2026-06-19)

### Root cause
`Trades.tsx` initialized `season` from `useState(defaultSeason)`, but on first
render `leagueKeyReady` is `false` (auth/user still loading), so `cachedSeasons`
and `allSeasons` are both `[]` and `defaultSeason` fell through to the hardcoded
`2025` fallback. The existing correction effect only moved the user off that value
**if the current season was not in `cachedSeasons`**. For ATLANTAS FINEST FF
(`457622`), 2025 *is* a cached season, so the guard passed and the selector stayed
pinned to 2025 instead of advancing to 2026. For leagues whose newest data is 2026,
the team pickers came up empty because no 2026 teams were queried.

### Fix
File: `client/src/pages/Trades.tsx` (UI only — no logic/engine/intelligence change).
Replaced the season-correction effect with a per-league one-time auto-select:

- Added `initedLeagueRef` (a `useRef<string | null>`) to track which league we've
  already defaulted a season for.
- On the first render where `cachedSeasons` is non-empty for the active league,
  set `season = Math.max(...cachedSeasons)` — the latest data-bearing season.
- Re-defaults automatically when `leagueContextKey` changes (league switch).
- After the initial default, a manual season change is preserved; the effect only
  overrides if the chosen season is no longer synced (then it snaps to the latest).
- Fallback unchanged: if `cachedSeasons` never resolves, behavior is identical to
  before (no regression), and the existing "Season not synced" hint still shows.

### Validation (production, post-deploy `ac8fb7a`)
Deploy confirmed live via `GET https://gmwarroom.online/api/health` →
`gitSha=ac8fb7a63e9b…`, branch `cursor/frontend-rebuild-stage1-9b20`, status `ok`
(this is the same SHA the dashboard build footer reads).

Latest data-bearing season per league, verified directly against the production
cache (union of `espn_raw_cache` + `espn_season_cache` + `fantasy_data_cache`,
mirroring `getAllCachedSeasons`):

| League | Cached seasons | Defaults to |
|---|---|---|
| `457622` (ATLANTAS FINEST FF) | 2009–2026 (18) | **2026** ✅ |
| `480452315` (Atlantas Finest Dynasty) | 2023–2026 (4) | **2026** ✅ |
| `158918` (Teco's) | 2018–2026 (9) | **2026** (latest available) ✅ |

In all three, the default equals `max(cachedSeasons)`, which is by construction a
synced season — the exact condition that enables the team-picker query, so teams
load on first paint with no manual season change.

- `pnpm check` → 0 TypeScript errors.
- "Manual season change stays manual": verified by code path (ref guards
  re-defaulting to once-per-league; manual selection only overridden if the chosen
  season is unsynced). Not exercised in a live signed-in browser.

### Tests / regression risk
Default-selection behavior only; trade logic, the value engine, and Trade
Intelligence are untouched. No regression to the no-data fallback path.
