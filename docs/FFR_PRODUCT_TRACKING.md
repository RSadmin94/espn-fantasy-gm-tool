# FFR product tracking

Single product tracker for Fantasy Football Rivals features. Do not create a second tracker.

## RFSN-061 — Trade Finder v1

| Field | Value |
| --- | --- |
| Status | Preview candidate (this change set) |
| Surface | Trade Intelligence `/trades` → Trade Finder tab |
| Endpoint | `tradeFinder.find` |
| Engine | `server/tradeFinder/` (deterministic) |
| Formula | Need/surplus: `server/tradeFinder/needSurplus.ts`. Score weights: `server/tradeFinder/weights.ts`. |
| Player value | Existing Market Value Engine V2 + `calcTradeValue` (`server/marketValue.ts`, `server/analytics.ts`) |
| Pick value / fairness | Existing `server/tradePickValueAuthority.ts` (`compareGivenSideTotals`, `fairnessGradeFromGainRatio`) |
| Roster / lineup | ESPN combined cache via `normalizeRosters` / `normalizeTeams`; slots from `settings.rosterSettings.lineupSlotCounts` |
| Identity | ESPN `playerId` (same canonical id as Trade Analyzer). No new identity system. |
| Behavior | Optional, from `reconstructCompletedTrades` + `computeOwnerIntelligence`. Labels NONE/WEAK/MODERATE/STRONG only when completed-trade counts exist. |
| AI | Optional batched `TRADE_ANALYSIS` narrative after ranking. Cannot change values, order, legality, or invent acceptance probability. Failure → deterministic why/risk. |
| Cache | `memCache` 90s keyed by league/season/team/filters/entitlement |
| Advisory | Does not submit trades to ESPN or Sleeper |

### Need / surplus formula

```
needScore     = 0.25*slotFillNeed + 0.50*starterQualityNeed + 0.15*depthNeed + 0.10*injuryNeed
  starterQualityNeed uses 65% weakest dedicated starter + 35% average
surplusScore  = 0.45*extraCountScore + 0.35*depthQualityScore + 0.20*redundancyScore
NEED    if needScore ≥ 40 and needScore ≥ surplusScore + 8
SURPLUS if surplusScore ≥ 40 and surplusScore ≥ needScore + 8
else NEUTRAL
```

Replacement at each position is the median dedicated-starter quality across the league.

### Trade score (initial weights)

```
userGain 30% + partnerGain 20% + fairness 20% + userNeedFit 10% + partnerNeedFit 10% + depth 10%
+ optional behavior ±4% (must not dominate)
```

### Known limitations

- Draft picks: optional, upcoming `draft_picks` year only, max one pick per side as a balancer. Full pick packages → RFSN-061B.
- No calibrated acceptance probability (by design).
- Dynasty/keeper economics are disclosed, not fully priced.
- Superflex/IDP/DST supported when slots exist; exotic IR/taxi scoring is limited.
- Sleeper leagues only work if the same ESPN-shaped combined cache is populated. Provider auth is unchanged.

### Recommended RFSN-061B

- Richer pick packages and mid-season pick trading
- Calibrated acceptance only if a labeled historical model exists
- Taxi/IR/keeper-cost in the need model
- Sleeper-native roster payload if ESPN-shaped cache is absent
