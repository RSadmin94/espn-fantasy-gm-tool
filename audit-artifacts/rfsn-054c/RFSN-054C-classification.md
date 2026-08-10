# RFSN-054C — Human readability classification

Not a token bump. Each surface was classified:

1. **Already readable** → leave alone
2. **Too small** (<12px, or 12px used as body copy) → increase size
3. **Readable size, low contrast** → keep size, raise contrast (`ink-secondary` / drop `white/40` / `muted-foreground`)

Token floors from 054B stay: `--text-2xs` 12px, `--text-label` 13px, `--text-caption` 14px. `TYPE_KICKER` contrast only (`ink-tertiary` → `ink-secondary`). Page titles and large metrics unchanged. `density.ts` unchanged. `HistoricalShareCard.tsx` PNG chrome unchanged (053G hash).

## Bucket 1 — leave alone

Titles, primary metrics, 054B-remapped Advisor / Dossier / Rivalry Center / Gallery / Viewer / Commissioner / Stories / HoF / Records / Transactions / Trades / Matchups / TabBar / Live Draft Control values (already ≥ label/body). Championship Path, Standings, Schedule. Share-card PNG chrome. Nav group titles using `text-nav-kicker`.

## Bucket 2 — too small (size up)

| Surface | Element | Before | After |
|---|---|---|---|
| Home / League Wire widget | 9px game badge; 10px meta/caption/nav | 9–10px | `TYPE_BADGE` / `TYPE_META` / `TYPE_CAPTION` |
| Home pulse / jump hints | Record/Standing/Next matchup; jump hint; season | 10–11px | `TYPE_KICKER` / `TYPE_META` / `TYPE_CAPTION` |
| Owner DNA insight | Archetype / trait / blind spot / twin kickers | 10px | `TYPE_KICKER` |
| Recent events | Timestamp / players / season | 10–11px | `TYPE_META` / `TYPE_CAPTION` |
| Timeline strip | Year / medal / row label | 10–11px | `TYPE_META` / `TYPE_BADGE` / `TYPE_CAPTION` |
| League health | Scoring-accuracy body at 12px | 2xs body | `TYPE_CAPTION` |
| Keepers / Draft History / Settings / PR / Briefing / Player Intel / Season Explorer / Rivals hub / Draft hub | 9–11px badges, captions, axis labels | 9–11px | `TYPE_BADGE` / `TYPE_KICKER` / `TYPE_CAPTION` / `text-label` |
| Championship Path / Acquisition Impact | 11px white/45 labels | 11px | 12px kicker + contrast |
| Rivalry dossier chart ticks | 9/10/11 | 9–11px | 12/12/13 |
| League settings live/missing | 9px | 9px | `TYPE_BADGE` |

## Bucket 3 — contrast only (size kept)

| Surface | Element | Change |
|---|---|---|
| `TYPE_KICKER` / `.type-kicker` | 12px kickers | `ink-tertiary` → `ink-secondary` |
| Rivalry dossier / Owner Comparison | `MUTED` constant | `muted-foreground` → `ink-secondary` |
| AppShell nav kickers / email / ESPN footer | 12px | `muted-foreground` → `ink-secondary` |
| Dashboard health/marquee/welcome/primitives/League hub | 12px labels + text-sm section titles | muted → `ink-secondary` |
| Home subtitle; wire loser name/score | 12–14px | muted → `ink-secondary` |
| RFSN Draft Order / Pick Clock / Ticker “Up next” | 12–13px | `white/40` / `ink-tertiary` → `ink-secondary` |
| Power Rankings `MUTED` | 12.5px explainer + legend | muted → `ink-secondary` |
| Acquisition Impact 12px stat labels | 12px | `white/45` → `ink-secondary` |

## Screenshots (1440×900, 100% zoom)

Before: `audit-artifacts/rfsn-054c/screenshots-before/` (Preview `buildTime=2026-08-10T02:47:32.049Z`). After: recapture after Preview deploy. Required list: Home, Advisor, Dossier, Gallery, Viewer, Stories, League Wire (Home widget + Stories), Commissioner, HoF, Records, Transactions, Trade Analyzer, Live/Mock Draft, Matchups, Rivalries.
