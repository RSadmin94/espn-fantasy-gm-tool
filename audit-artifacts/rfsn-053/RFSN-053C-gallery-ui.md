# RFSN-053C — Historical Matchup Gallery UI

**Status:** Production-quality gallery on the 053B query contract. Preview after validation. No Production. No screenshot engine. No AI stories. No Advisor changes.

---

## Routes

| Route | Page |
| --- | --- |
| `/league/history/matchups` | Default gallery |
| `/league/history/matchups/no-mercy` | No Mercy preset (`owner` when available, `marginMin: 50`, `result: win`) |
| `/league/history/matchups/:matchupId` | Historical Matchup Viewer V1 |

Nav: League History → Matchups. League hub card present.

---

## Layout

Header: Historical Matchups · coverage years · result count · applied filters · quick presets.

### Quick presets

All Games · No Mercy Rule · One-Point Games · Closest Games · Championship Games · Playoff Games · Highest Scores · Lowest Scores · Biggest Blowouts

### Filters

Owner · Opponent · Season · Season range · Week · Regular Season · Playoffs · Championship only · Margin min/max · Score min/max · Win only · Loss only

All filters compile through `matchupGallery.query`. No client-side re-filter.

---

## Matchup card

Season · week · Regular Season / Playoffs · winner · loser · final score · margin · owner names · team names.

Badges from contract fields only: **NO MERCY** · **ONE POINT** · **PLAYOFF** · **CHAMPIONSHIP** · **CLOSEST**.

Buttons: View Matchup · Share (placeholder copies URL) · Screenshot (disabled placeholder).

---

## Viewer V1

`/league/history/matchups/:matchupId` via additive `matchupGallery.get` (does not change query semantics).

Shows score, winner/loser, season, week, margin, owners, league metadata, **player lineups + bench** when `gmWeeklyPlayerStats` (or legacy `weekly_player_stats` roster) is recorded. Honest note when lineups are missing. No timeline playback.

---

## Empty states

Distinct copy for:

- `missing_dataset`
- `unresolved_owner`
- `unresolved_opponent`
- `no_matching_games`
- `insufficient_playoff_tier`

Never collapsed to “No results.”

---

## Design

Reuse existing cards, typography tokens (`TYPE_BADGE`), and RFSN-054 density (`SPACE_CHIP` / `SPACE_CARD` / `SPACE_SECTION_Y`). No new visual language. No dense tables.

---

## Files

- `client/src/lib/matchupGalleryUi.ts` + `.test.ts`
- `client/src/components/matchup-gallery/MatchupGallery.tsx`
- `client/src/components/matchup-gallery/MatchupGalleryCard.tsx`
- `client/src/components/matchup-gallery/MatchupGalleryFilters.tsx`
- `client/src/components/matchup-gallery/MatchupGalleryPresets.tsx`
- `client/src/components/matchup-gallery/MatchupGalleryEmpty.tsx`
- `client/src/components/matchup-gallery/MatchupGallery.test.tsx`
- `client/src/components/matchup-gallery/HistoricalMatchupViewer.tsx` + `.test.ts`
- `client/src/pages/league/HistoricalMatchupGalleryPage.tsx`
- `server/matchupGalleryRouter.ts` — `query` + additive `get`
- `server/matchupGalleryViewer.ts` + `.test.ts`
- `client/src/main.tsx` — routes
- `client/src/lib/v2Navigation.ts` — History child + param route
- `client/src/pages/league/LeagueHub.tsx`
- Route tests: `v2Navigation.test.ts`, `v2Routing.test.ts`, `leagueRoutes.test.ts`
- `scripts/rfsn-053c-preview-validation.mts`

053B `queryMatchupGallery` semantics unchanged.

---

## Tests (local)

| Suite | Result |
| --- | --- |
| `matchupGalleryUi.test.ts` | 10/10 |
| `MatchupGallery.test.tsx` | 10/10 |
| `HistoricalMatchupViewer.test.tsx` | 2/2 |
| `matchupGalleryViewer.test.ts` | 2/2 |
| `matchupGalleryQuery.test.ts` (053B regression) | 16/16 |
| `v2Navigation.test.ts` | 15/15 |
| `v2Routing.test.ts` | 12/12 |
| `leagueRoutes.test.ts` | 8/8 |

**Typecheck:** `npx tsc --noEmit` exit 0  
**Build:** `npm run build` exit 0 (`dist/public/assets/index-CB17HEEi.js`)

**Preview:** Git `539dfea` · Railway `ba0bbd5a` · `buildTime=2026-08-09T12:50:42.295Z`  
**Founder ESPN 457622:** 12/12 PASS (No Mercy 22, Rod vs Bruce 19, one-point 34, closest, championship honest empty `insufficient_playoff_tier`, viewer get).  
**Screenshots:** `audit-artifacts/rfsn-053/screenshots-053c-preview/` (1920 / 1440 / 390).

No Production.
