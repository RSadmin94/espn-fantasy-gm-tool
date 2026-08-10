# RFSN-054B — Desktop Typography Accessibility (Preview)

**Status:** Live Preview only. Not Production. Not density. Not a layout redesign.

## Environments

| | |
| --- | --- |
| Git | `0319cbc` on `feature/provider-expansion` |
| Railway | Git deploy `7bc37a74` SUCCESS (not CLI) |
| Preview health | `buildTime=2026-08-10T01:12:42.709Z` (gitSha still stale `dff6154`) |
| Production | unchanged `798aa8a` / `buildTime=2026-08-09T14:32:05.217Z` |

## Typography tokens

| Token | Before (051C) | After (054B) | Role |
| --- | --- | --- | --- |
| `--text-2xs` | 11px (`0.6875rem`) | **12px** (`0.75rem`) | tiny metadata / badges / kickers |
| `--text-label` | 12px (`0.75rem`) | **13px** (`0.8125rem`) | labels / table headers / secondary stats |
| `--text-caption` | 13px (`0.8125rem`) | **14px** (`0.875rem`) | secondary body / help |
| `TYPE_SECTION` | — | **15px** | section titles |

Page titles (`PageHeader` h1) and large metrics (`text-xl` / `text-2xl` / `text-3xl`) unchanged. `density.ts` unchanged. Share-card PNG chrome unchanged.

## Files changed

- `client/src/index.css` — token floors + composite comment
- `client/src/lib/typeScale.ts` + `typeScale.test.ts`
- Owner Dossier: `OwnerProfiles.tsx`, `ActivityDnaCard.tsx`
- Rivalries: `RivalryCenter.tsx`
- GM Advisor: `Advisor.tsx`
- Historical Matchups / Viewer: `HistoricalMatchupGalleryPage.tsx`, `HistoricalMatchupViewer.tsx`, `MatchupGalleryFilters.tsx`, `MatchupGalleryCard.tsx`, `MatchupGalleryPresets.tsx`, `AdvisorMatchupGalleryEmbed.tsx`
- Matchup Viewer (live): `Matchups.tsx`
- League Records / HoF: `HallOfFame.tsx`
- Commissioner: `CommissionerCommandCenter.tsx`
- Stories: `LeagueWireNewsroom.tsx`
- Live/Mock Draft: `LiveDraftControlPanel.tsx` (type only; 054A strip layout unchanged)
- Transactions: `Transactions.tsx`
- Trade Analyzer: `Trades.tsx`
- Tab labels: `TabBar.tsx`
- Narration voice label: `HistoricalNarrationPanel.tsx` (on-screen only; PNG renderer untouched)
- `scripts/_rfsn054b_preview_shots.mts`

## Components affected (high priority)

Owner Dossier labels/body/tabs/list metadata; Activity DNA labels; Rivalry Center 10–11px chrome; Advisor threat kicker; Matchup gallery filters/viewer metadata; Hall of Fame / Records section labels; Commissioner 12px labels; Stories tabs/subtitles; Live Draft Control values; Transactions filter labels; Trade winner label; global TabBar.

## Validation

| Gate | Result |
| --- | --- |
| Typecheck `tsc --noEmit` | PASS |
| Focused tests (`typeScale`, 054A strip, RfsnHeader, HistoricalMatchupViewer) | PASS 13/13 |
| `npm run build` | PASS |
| Preview Git deploy | SUCCESS `7bc37a74` / `0319cbc` |
| Desktop widths 1920 / 1600 / 1440 / 1366 | overflowX false on captured routes |
| Owner Dossier name + 99–99 record + large metrics | left unchanged |

## Screenshots

Local artifacts (PNG folder not committed — large):

- Before: `audit-artifacts/rfsn-054b/screenshots-before/` (`buildTime=2026-08-10T00:35:48.767Z`, 4s settle; some spinners)
- After: `audit-artifacts/rfsn-054b/screenshots-after/` (`buildTime=2026-08-10T01:12:42.709Z`)

After dossier opened at all four widths (`/rivals/owners/id:{AE295BDF-…}`). Executive Summary / Legacy Rank / Intelligence Score / Overall Record / Current Season Snapshot visible. Owner name + 126–85 metrics unchanged. `overflowX=false` on every captured route × 1920/1600/1440/1366.

## STOP

Git Preview only. No Production. No spacing/layout/density changes.
