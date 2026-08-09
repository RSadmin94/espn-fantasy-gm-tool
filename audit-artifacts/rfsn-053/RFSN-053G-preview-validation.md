# RFSN-053G preview validation

- Host: https://sprint-8-preview.fantasyfootballrivals.com
- League: ESPN 457622
- Git: `0c5d94a` · deploy `d3518077`
- buildTime: 2026-08-09T20:34:42.594Z
- Result: **9/9** (0 fail)
- Renderer: `ShareCardRenderer` → `[data-share-card-root]` → Playwright PNG (`rfsn-053g-1`)
- PNG dir: `audit-artifacts/rfsn-053/png-053g-preview`

| Probe | Verdict | Notes |
| --- | --- | --- |
| PNG no-mercy landscape | PASS | `no-mercy.png` cache=miss 1920×1080 · badge NO MERCY · 22 GAMES |
| PNG heartbreak portrait | PASS | `heartbreak.png` cache=miss 1080×1920 · badge HEARTBREAK · 4 GAMES |
| PNG championship square | PASS | `championship.png` cache=miss 1080×1080 · honest 0 GAMES |
| PNG blood-rival landscape | PASS | `blood-rival.png` cache=miss 1920×1080 |
| PNG cashier landscape | PASS | `cashier.png` cache=miss 1920×1080 · badge CASHIER · 70 GAMES |
| PNG league record | PASS | `championship-championships.png` cache=miss · LEAGUE RECORD + CHAMPIONSHIP |
| PNG hall of fame | PASS | same file cache=hit (repeat export) |
| PNG Advisor gallery | PASS | `no-mercy.png` cache=miss · `/my-team/advisor` |
| PNG Rivalry | PASS | `blood-rival-rod-vs-marlon.png` cache=miss · square |

Visual: HTML preview matches PNG. No clipping. No font substitution. Badges present. Layouts export at 1× pixel targets. Not Production. No AI. No video. No public share pages.
