# RFSN-056A — Production validation

| | |
| --- | --- |
| Git | cherry-pick **`1aa6d28`** of `31b6e69` onto `release/promote-provider-expansion-dff6154` |
| Railway | env `production` · deploy **`b246f95f`** SUCCESS · `commitHash=1aa6d28` (Git, not CLI) |
| Health | `buildTime=2026-08-09T11:19:47.170Z` (`gitSha` still stale `06b35ba`) |
| League | ESPN **457622** ATLANTAS FINEST FF · season **2026** |

## Founder smoke

`RFSN_056A_HOST=www.fantasyfootballrivals.com` · Executed filter:

| Check | Result |
| --- | --- |
| Raw / trade rows | 481 / 437 |
| Executed clusters displayed | **5/5** |
| `f273e8dd` | 11↔23 · 12 assets (not 4-team voter blob) |
| `d3731d04` | 1↔18 kept (was hidden `no_assets`) |
| Also shown | `d2a71389` 1↔27 · `c5c130dd` 17↔22 · `b2da5b7a` 1↔18 |
| Filtered | 7 `trade_decline` only |

Matches Preview. Grading unchanged.

## Honest leftover

Four executed headers still lack pick/player items (visible recaps, assets unavailable). Optional follow-up, not a display-filter miss.
