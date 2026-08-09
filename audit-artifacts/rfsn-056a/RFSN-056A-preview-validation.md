# RFSN-056A — Preview validation

**Stop after Preview. Not Production.**

| | |
| --- | --- |
| Git | `31b6e69` on `feature/provider-expansion` |
| Railway | env `sprint-8-preview` · deploy `408fa8c3` SUCCESS · `commitHash=31b6e69` (Git, not CLI) |
| Health | `buildTime=2026-08-09T10:45:03.298Z` (`gitSha` still stale `dff6154`) |
| League | ESPN **457622** ATLANTAS FINEST FF · season **2026** |
| Tests | `shared/transactionDisplay.test.ts` 15/15 · `espnTrade2026.test.ts` 32/32 |

## Founder check (Executed filter)

| | Pre-fix (cache only) | Post-fix Preview |
| --- | --- | --- |
| Raw rows | 417 | **481** (live orphan repair + proposal fetch) |
| Trade rows | 373 | 437 |
| TRADE_UPHOLD / ACCEPT | 3 / 8 rows | **6 / 11** |
| Executed clusters shown | **1** | **5** |
| `f273e8dd` parties | 1/4/11/23 (voters merged) | **11/23** + 12 assets |
| `d3731d04` 1↔18 | dropped `no_assets` | **kept** (assets still unavailable) |
| Filtered | 8 (no_assets + fewer teams) | **7 declines only** |

Executed recaps now displayed:

1. `f273e8dd` 11↔23 — full picks  
2. `d3731d04` 1↔18 — headers (assets unavailable)  
3. `d2a71389` 1↔27 — headers (newly imported)  
4. `c5c130dd` 17↔22 — headers  
5. `b2da5b7a` 1↔18 — headers  

UI pipeline panel: raw trade rows / displayed / filtered + reason. Grading unchanged.

## Honest leftover

Activity-feed relink did not attach pick/player items to 4 orphan executed headers. Trades are visible; recap sides may say assets unavailable until ESPN returns items or a later reconstruction pass. Not a display-filter miss.

## Production

Do not promote until explicitly asked.
