# Historical league import (extension)

1. Sign in at **fantasy.espn.com** (SWID + espn_s2) and **gmwarroom.online** (same as Sync).
2. **Discover seasons** — uses a fixed list **2009 through the current calendar year** (no HTML scrape; avoids phantom future years and duplicates). ESPN cookies are still required so the extension can confirm you are logged in.
3. **TEST IMPORT (2010)** — fetches the combined ESPN JSON for 2010, optional weekly `mMatchup` if the schedule is empty, then POSTs `espn.ingestHistoricalSeasonPayload` (War Room session cookies via DNR, same pattern as `saveCredentials`). On failure, check the service worker console for the exact URL and HTTP status.
4. **FULL IMPORT** — runs 2010 first (if present), then remaining seasons from the list (each filtered to ≤ current year); stops after two consecutive failures.

Backend: `espn.ingestHistoricalSeasonPayload` (protected) writes `espn_raw_cache` and normalizes via `runEspnCombinedPersist` / existing `upsert*` helpers only.
