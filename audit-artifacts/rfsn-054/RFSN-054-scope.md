# RFSN-054 — UI Density & Scanability

**Status:** Implemented locally. Preview/Production only after Git push + scan.  
**Not typography.** 051A–E stay closed. This increment is spacing rhythm only.

## Goal

Predictable whitespace on dense GM surfaces so the app feels calmer to scan — not larger type, not a layout redesign.

## Rhythm (4px base)

| Token | Class | Use |
| --- | --- | --- |
| Chip | `px-2.5 py-1.5` · `gap-1.5` | Filter chips, compact controls, badges |
| Cluster | `gap-2` | Related metadata groups |
| Row | `px-3.5 py-3` · `space-y-3` | List rows, table cells, label-under-value (`mt-2`) |
| Card | `p-4` · `gap-3` | Compact cards / tile grids |
| Section | `gap-4` · `p-5` | Major section cards / stat tiles |

Source: `client/src/lib/density.ts`.

## In scope

### Draft
- Taller filter chips (chip token)
- Pool row + ADP / MV / Points separation (row + meta)
- Live control + recent picks + pick clock (card + chip)
- Draft board cells (card + card-gap; no `gap-px`)
- Owner DNA + roster-needs tiles (card + card-gap)
- Your Teams cards + roster chips (card + chip)

### Stories
- Live Wire cell padding + recap `line-clamp-2` (card + meta)
- Article headline / preview / byline spacing (section inset + meta)

### Commissioner
- Stat tiles (section inset + meta)
- Activity snapshot + transaction rows (row stack / row-y)
- Section grids (section gap)
- Table primitive row height (row-y)

### Championship Path
- HeroStat inset + pts/game meta (card + meta)

## Explicitly not included

- Typography / color system / pinch-zoom (051)
- Advisor, Rivalries, live Matchups
- Matchup Gallery (053)
- Marketing assets
- Historical engine

## Scan plan (Preview)

1. Draft Mock  
2. Draft Live  
3. Stories  
4. Commissioner  
5. Championship Path  

Promote to Production only if the scan feels noticeably more comfortable and nothing regresses.
