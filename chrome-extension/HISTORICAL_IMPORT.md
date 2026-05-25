# Historical league import (extension)

1. Keep **https://fantasy.espn.com** open in a tab while signed in (session cookies). Sign in at **gmwarroom.online** for tRPC. The extension does **not** attach ESPN cookies from the service worker; historical ESPN JSON is fetched from a **content script** on fantasy.espn.com using `credentials: "include"`.
2. **Discover seasons** — fixed list **2009 through the current calendar year** (no HTML scrape; avoids phantom future years and duplicates).
3. **TEST IMPORT (2010)** — background asks the fantasy.espn.com tab’s content script to `fetch` the combined ESPN JSON, then optional weekly `mMatchup`, then POSTs `espn.ingestHistoricalSeasonPayload` (War Room cookies via DNR). If import fails, open the service worker console for URL/status; if you see `no_espn_tab`, open or reload a fantasy.espn.com tab after updating the extension.
4. **FULL IMPORT** — runs 2010 first (if present), then remaining seasons from the list (each filtered to ≤ current year); stops after two consecutive failures.

Backend: `espn.ingestHistoricalSeasonPayload` (protected) writes `espn_raw_cache` and normalizes via `runEspnCombinedPersist` / existing `upsert*` helpers only.
