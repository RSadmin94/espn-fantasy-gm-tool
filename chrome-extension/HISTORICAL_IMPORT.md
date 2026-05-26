# Historical league import (extension)

1. Sign in at **fantasy.espn.com** (or **espn.com**) so **SWID** and **espn_s2** exist for this browser profile. Sign in at **gmwarroom.online** for tRPC. ESPN historical JSON is **`fetch`’d from the MV3 service worker** with `credentials: "include"`; **session rules (DNR)** inject **`Cookie`**, **`Accept`**, **`X-Fantasy-Source`**, and **`X-Fantasy-Platform`** (the SW must not set `Cookie` on the `fetch` options).
2. **Discover seasons** — fixed list **2009 through the current calendar year** (no HTML scrape; avoids phantom future years and duplicates).
3. **TEST IMPORT (2010)** — combined ESPN JSON + optional weekly `mMatchup`, then POST **`espn.ingestHistoricalSeasonPayload`** (War Room cookies via separate DNR rules). Check the service worker console for **`[GMWR] ESPN fetch diagnostics`** (`url`, `status`, `contentType`, `hasSwid`, `hasEspnS2`, `dnrRuleInstalled`, `responsePreviewFirst100`, `payloadKeys`).
4. **FULL IMPORT** — if more than one season (or any non-2010 season) is requested, **2010 is imported first**; remaining seasons run only after that gate reports **`success`** or **`skipped`**. Then the rest of the list runs (skipping duplicate 2010); stops after two consecutive failures.

Backend: `espn.ingestHistoricalSeasonPayload` (protected) writes `espn_raw_cache` and normalizes via `runEspnCombinedPersist` / existing `upsert*` helpers only.
