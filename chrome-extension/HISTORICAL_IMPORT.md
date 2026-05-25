# Historical league import (extension)

1. Keep a **fantasy football** tab open: **`https://fantasy.espn.com/football/...`** (league, lobby, etc.) while signed in — same origin as the FFL API. Sign in at **gmwarroom.online** for tRPC. Historical ESPN JSON is fetched from **`content.js`** on that tab using `credentials: "include"` (the service worker does not call ESPN directly).
2. **Discover seasons** — fixed list **2009 through the current calendar year** (no HTML scrape; avoids phantom future years and duplicates).
3. **TEST IMPORT (2010)** — background asks the **football** tab’s content script to `fetch` the combined ESPN JSON, then optional weekly `mMatchup`, then POSTs `espn.ingestHistoricalSeasonPayload` (War Room cookies via DNR). If you see **`Open your ESPN fantasy league page first, then retry.`**, open a league page under **`/football/`** and reload it after updating the extension.
4. **FULL IMPORT** — runs 2010 first (if present), then remaining seasons from the list (each filtered to ≤ current year); stops after two consecutive failures.

Backend: `espn.ingestHistoricalSeasonPayload` (protected) writes `espn_raw_cache` and normalizes via `runEspnCombinedPersist` / existing `upsert*` helpers only.
