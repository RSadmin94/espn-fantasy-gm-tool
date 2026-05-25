# Historical league import (extension)

1. Sign in at **fantasy.espn.com** (SWID + espn_s2) and **gmwarroom.online** (same as Sync).
2. **Discover seasons** — reads `football/league/history?leagueId=…` with your ESPN cookies.
3. **TEST IMPORT (2010)** — fetches the combined ESPN JSON for 2010, optional weekly `mMatchup` if the schedule is empty, then POSTs `espn.ingestHistoricalSeasonPayload` (War Room session cookies via DNR, same pattern as `saveCredentials`).
4. **FULL IMPORT** — runs 2010 first (if present), then remaining discovered seasons; stops after two consecutive failures.

Backend: `espn.ingestHistoricalSeasonPayload` (protected) writes `espn_raw_cache` and normalizes via `runEspnCombinedPersist` / existing `upsert*` helpers only.
