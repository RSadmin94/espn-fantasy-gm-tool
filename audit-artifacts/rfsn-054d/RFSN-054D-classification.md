# RFSN-054D — Targeted classification (four surfaces only)

Not a global token bump. 054B/054C `TYPE_*` floors unchanged. Scoped `[data-rfsn-054d]` + `TYPE_READABLE_*`.

| Bucket | Rule | Action |
| --- | --- | --- |
| Already readable | Page titles, large metrics (`text-2xl`/`text-3xl`/`text-[20px]+`) | Leave |
| Too small | 12px chrome, 12–14px body/labels on these four pages | Size up via scoped floors |
| Readable size, low contrast | Championship supporting `white/55` + `ink-tertiary` | Keep or raise size; contrast → `ink-secondary` |

## Scoped floors (these pages only)

| Role | Floor | Token / CSS |
| --- | --- | --- |
| Metadata | 13px | `TYPE_READABLE_META` / `[data-rfsn-054d] .text-2xs` |
| Labels / chips / filters / table headers | 14px | `TYPE_READABLE_LABEL` / `[data-rfsn-054d] .text-xs` `.text-label` |
| Body / supporting / table cells | 15px | `TYPE_READABLE_BODY` / `[data-rfsn-054d] .text-sm` `.text-caption` |
| Section headers | 16px | `TYPE_READABLE_SECTION` (`text-base`) |

## Surfaces

- `/my-team/trades` — `Trades.tsx` `data-rfsn-054d` + section `TYPE_READABLE_SECTION`
- `/my-team/advisor` — `Advisor.tsx` `data-rfsn-054d` + kickers/Ask header `TYPE_READABLE_SECTION` (gallery embed inherits scope; Historical Gallery page untouched)
- `/my-team/championship-path` — `ChampionshipDiagnosis.tsx` `data-rfsn-054d` + explicit arbitrary-px remaps
- `/draft/history` — `DraftHistory.tsx` `data-rfsn-054d`

Unrelated pages: no `data-rfsn-054d`. `density.ts` untouched. Share-card PNG chrome untouched.
