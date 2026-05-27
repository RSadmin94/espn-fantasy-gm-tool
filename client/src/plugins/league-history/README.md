# League History (client plugin)

Self-contained UI for `/history`. **Does not** change server routers, migrations, `DraftHistory`, or `SyncData`.

## Data rules

| Concern | Source |
|--------|--------|
| **Titles** (counts, badges, sort-by-titles) | `trpc.espn.leagueMedals` only (`league_medals` rows). |
| **H2H / rivalries matrix** | `trpc.espn.leagueHistoryH2H` only (backed by `gmMatchups` on the server). |
| **Wins / losses / ties / points / seasons / explorer table order** | `trpc.espn.leagueHistoryStandings` (aggregates W-L-T from matchups server-side; `finalStanding` may appear **only** for placement display / sorting the standings list — **not** for title counts or champion labels). |

## Explicit non-use

- `owner.championships` from `leagueHistoryStandings` is **ignored** (always zero server-side; titles come from medals).
- Champion / runner-up / third **labels** in Season Explorer come **only** from medal strings for that season, never from “first place in standings”.

## No hardcoded league data

No fixed owner names, seasons, records, or title outcomes — everything is derived from the queries above.
