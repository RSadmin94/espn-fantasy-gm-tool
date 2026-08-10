# RFSN-054D — Targeted Font Readability (Preview)

**Status:** Live Preview. Not Production. Founder visual review required before promote.

**Host:** `https://sprint-8-preview.fantasyfootballrivals.com`  
**Git:** `9d67df5` on `feature/provider-expansion`  
**Railway:** Git deploy `345767c7` SUCCESS NIXPACKS (not CLI)  
**buildTime:** `2026-08-10T07:14:01.824Z`  
**Founder:** ESPN `457622`

## Scope

Four surfaces only. No global token bump. No density/logic/redesign.

| Surface | Route | Mechanism |
| --- | --- | --- |
| Trade Intelligence | `/my-team/trades` | `[data-rfsn-054d]` + `TYPE_READABLE_SECTION` on card titles |
| GM Advisor | `/my-team/advisor` | `[data-rfsn-054d]` + `TYPE_READABLE_SECTION` on kickers / Ask header |
| Championship Path | `/my-team/championship-path` | `[data-rfsn-054d]` + explicit `TYPE_READABLE_*` remaps (arbitrary px) |
| Draft History | `/draft/history` | `[data-rfsn-054d]` |

## Tokens / classes

Global 054B/054C unchanged: `TYPE_BADGE` 12px · `TYPE_META` 13px · `TYPE_CAPTION` 14px · `TYPE_SECTION` 15px.

Scoped only under `[data-rfsn-054d]`:

| Role | Floor | How |
| --- | --- | --- |
| Metadata | 13px | `.text-2xs` / `.type-badge` / `.type-kicker` → `--rfsn-054d-meta` · `TYPE_READABLE_META` |
| Labels / chips / filters / headers | 14px | `.text-xs` / `.text-label` / `.type-meta` → `--rfsn-054d-label` · `TYPE_READABLE_LABEL` |
| Body / supporting / table cells | 15px | `.text-sm` / `.text-caption` → `--rfsn-054d-body` · `TYPE_READABLE_BODY` |
| Section headers | 16px | `TYPE_READABLE_SECTION` (`text-base`) |

Championship Path also raised low-contrast `white/55` / `ink-tertiary` supporting copy to `ink-secondary`. Page titles and large metrics unchanged. `density.ts` untouched. Historical Gallery / narration panel / share-card PNG chrome untouched.

## Files changed

- `client/src/lib/typeScale.ts` — `TYPE_READABLE_*`
- `client/src/lib/typeScale.test.ts`
- `client/src/index.css` — `[data-rfsn-054d]` scoped floors
- `client/src/pages/Trades.tsx`
- `client/src/pages/Advisor.tsx`
- `client/src/pages/ChampionshipDiagnosis.tsx`
- `client/src/pages/DraftHistory.tsx`
- `audit-artifacts/rfsn-054d/RFSN-054D-classification.md`
- `scripts/_rfsn054d_preview_shots.mts`

## Validation

| Gate | Result |
| --- | --- |
| `typeScale.test.ts` + Advisor 052L/053D/053E | PASS 15/15 |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS |
| overflowX 1366 / 1440 / 1600 / 1920 × 4 routes | **false** all 16 |
| 1440 before/after screenshots | `audit-artifacts/rfsn-054d/screenshots-{before,after}/` |

Advisor after-shot caught a loading spinner; overflow still false. Founder should review loaded chat + suggested chips.

## Production

**READY after founder visual review.** Do not promote until asked. 055 stays Preview only.
