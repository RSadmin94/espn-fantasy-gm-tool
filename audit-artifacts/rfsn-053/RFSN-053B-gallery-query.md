# RFSN-053B — Gallery query contract

**Status:** Query + unit tests + `matchupGallery.query` tRPC only. No UI. Nothing deployed.
**Stop for review.** Do not start 053C until this contract is accepted.

---

## Exit criteria (user)

Same query must correctly return:

| Probe | Result |
| --- | --- |
| Rod’s 50+ point wins | PASS — 5 No Mercy wins (phase=all), 4 RS-only. `gameType=blowout`, summary names Rod, never “all-time”. |
| One-point wins/losses | PASS — decimal band 0.50–1.49. Rod 1 win (2014, 0.80) + 1 loss (2015, 0.80). Tie and 1.50 excluded. |
| All meetings vs a named owner | PASS — Rod vs Bruce only; LOZELL rows excluded. |
| Playoff-only games | PASS — 5 `phase=playoffs` rows. |
| Season ranges | PASS — Rod 50+ in 2011–2012 → 2 games, no 2023. |
| Highest / lowest scoring | PASS — highest leads 210 (2018); lowest leads 78 (2019); `scoreMin: 200` → Rod’s 210 game. |
| Closest games | PASS — leads 0.40 (Demetri/LOZELL 2020); ties excluded. |
| Championship-game candidates when tier evidence supports | PASS — only 2018 WINNERS_BRACKET title (Rod vs LOZELL W16). 3rd-place excluded. |
| Clean empty states | PASS — `missing_dataset`, `unresolved_owner`, `unresolved_opponent`, `no_matching_games`, `insufficient_playoff_tier`. |

**Vitest:** `server/matchupGalleryQuery.test.ts` — **16/16 PASS**.

---

## Contract

Pure: `queryMatchupGallery(games, filter) → GalleryQueryResult`

tRPC: `matchupGallery.query` loads completed `gmMatchups` + Owner Identity, then runs the pure query.

| Field | Rule |
| --- | --- |
| `noMercy` / `marginMin: 50` + win | Same 50-pt threshold as League Wire blowout. |
| `onePoint` | `exactMarginBand(1, precision)` from matchupMarginAnalytics. |
| `ownerName` / `opponentName` | First/last token match (“Rod”, “LOZELL”). Not substring (“rod” ≠ Broderick). |
| `phase` | `regular` \| `playoffs` \| `all` (default **all** — cards label RS vs PO). |
| `championshipGames` | Proven WINNERS_BRACKET title games only. Unknown-tier ratio > 0.1 → **empty**, not fake titles. |
| Summary | Coverage-scoped years. Never “all-time”. |
| `seeAllHref` | `/league/history/matchups?…` for 053C. |

Empty reasons: `missing_dataset` | `unresolved_owner` | `unresolved_opponent` | `no_matching_games` | `insufficient_playoff_tier`.

---

## Files

- `server/matchupGalleryQuery.ts` — types + pure query
- `server/matchupGalleryQuery.test.ts` — 16 contract tests
- `server/matchupGalleryRouter.ts` — `loadGalleryGames` + `matchupGallery.query`
- `server/routers.ts` — `matchupGallery: matchupGalleryRouter`

---

## Not in 053B

Gallery UI, Advisor visual return, Historical Viewer, screenshots, deploy, git push.

**RFSN-053B complete. Stop.** 053C can build `MatchupGallery` on this contract.
