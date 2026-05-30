# Chrome extension — historical import

1. **DISCOVER** — fixed ESPN season list (2009–current).
2. **STATUS** — `espn.historicalImportStatus` for league coverage.
3. **TEST IMPORT (2010)** — optional HTML draft recap scrape + `espn.ingestParsedDraftPicks` (legacy test path only).
4. **FULL IMPORT (2010–2025)** — per season:
   - Read `SWID` + `espn_s2` from fantasy.espn.com / www.espn.com / lm-api-reads.fantasy.espn.com
   - `espn.importDraftFromEspnApi` with `{ leagueId, season, swid, espnS2 }` (extension session forwarded to server)
   - Server: ESPN **mDraftDetail** → `normalizeDraftPicks()` → **DELETE** all `draft_picks` for league+season → **INSERT** clean rows
   - `rawPick.source = "espn_mDraftDetail"`
   - Logs: `deletedRows`, `insertedRows`, `season`, `sourceUsed`
   - Expect ~14 picks × rounds per season (not hundreds of scrape rows)
5. **STANDINGS / MATCHUPS** — separate scrape ingest paths (unchanged).

**Do not** use `draft_recap_scrape_ingest` for FULL IMPORT — that path appended duplicate HTML rows.
