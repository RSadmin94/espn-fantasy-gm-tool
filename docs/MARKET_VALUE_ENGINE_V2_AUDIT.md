# Market Value Engine V2 — Audit & Findings

**Status:** Findings only · no code changed · nothing committed/pushed/deployed
**Date:** 2026-06-19
**Scope:** Upgrade the *existing* player-valuation pipeline into a phase-aware Market
Value Engine. Do **not** build a second engine.
**Method:** Read `docs/ARCHITECTURE.md`, audited the live valuation code paths, and
verified every data source directly against the production DB (league `457622`, 2026)
before proposing anything. All "available/missing" claims below are verified, not assumed.

---

## 0. Headline finding (read this first)

**The current valuation engine is single-signal: it runs entirely on `avgPoints`
(season average fantasy points per game).** VORP, ROS value, scarcity bonus, and keeper
bonus are all derived from `avgPoints`. `projectedTotal` is carried on the player object
but **ignored**. `trendLabel` is hardcoded to `"Stable"`.

**Consequence, verified in production:** 2026 `avgPoints = 0` for every player (no games
played yet — `gm_weekly_player_stats` shows 2026 avg points = 0.00). So **right now, in the
preseason, the Trade Analyzer values every player at ≈ replacement noise.** The approved
weighting model fixes exactly this: preseason value should come from ADP + projection +
history + keeper, none of which the current engine uses. This is the strongest argument for
V2 and it is live today.

---

## 1. Current architecture

### Entry point
`tradeAnalyze` mutation — `server/routers.ts:9386` → builds player rows from the cached
ESPN payload, then calls into `server/analytics.ts`, then `buildTradeIntelligence`
(`server/tradeIntelligence.ts`) for the report layer.

### The valuation core — `server/analytics.ts`
The number every downstream feature uses is `compositeValue` from `calcTradeValue`
(`analytics.ts:745`):

```
compositeValue = rosValue + (vorp * 5) + keeperBonus + scarcityBonus
```

| Input | Source function | What it actually is |
|---|---|---|
| `rosValue` | `calcROSValue` (`:681`) | `avgPoints × weeksRemaining × injuryDiscount × scheduleMultiplier` |
| `vorp` | `calcVORP` (`:119`) | `avgPoints − positionalReplacementAvg` |
| `keeperBonus` | `calcKeeperEfficiency` (`:325`) | `roundSavings × 15` (uses ESPN `keeperValue`) |
| `scarcityBonus` | `calcPositionalScarcity` (`:178`) | `scarcityScore × 0.3` |

**Every term traces back to `avgPoints`** except keeperBonus (ESPN keeper cost) and
scarcityBonus (roster counts). There is **no ADP, no projection, no trend, no consistency,
no opportunity/usage** anywhere in the value.

### `PlayerRow` (the shape the engine consumes) already carries unused signal
`server/analytics.ts` `PlayerRow`: `seasonPoints`, `avgPoints`, **`projectedTotal`**
(ignored), `keeperValue`, `keeperValueFuture`, `injuryStatus`, **`appliedStats`** (raw ESPN
stat map — ignored). So projection and raw stats are *already in hand* at valuation time and
simply not used.

### Data flow (matches ARCHITECTURE.md §2)
ESPN combined payload → `espn_raw_cache` → normalized at read time (`normalizeRosters`) →
`PlayerRow[]` → `calcTradeValue`. The engine reads live from the cache, **not** from the
`players`/`gm_*` tables (those are for other features).

---

## 2. Available data sources (verified populated)

Verified against league `457622`, 2026 — **n = 139 rostered players**:

| Signal | Source (verified) | Coverage | Notes |
|---|---|---|---|
| **ADP** | `player.draftRanksByRankType.PPR.rank` + `auctionValue` in the combined cache | **139/139 (100%)** | Also a secondary store: `gm_player_registry` (2,050 rows; `adp`/`espnRank`/`auctionValue`/`percentOwned`/`adpChange` populated for ~700) |
| **Projection** | `player.stats[statSourceId=1]` (`appliedTotal`) in the cache | **129/139 (93%)** | ESPN projection. Both a per-period split and a season split exist in the payload |
| **Production (points)** | `gm_weekly_player_stats.pointsScored` | 75,376 rows; **2021–2025 real** (~11–12 ppg); 2026 = 0 (unplayed) | The basis for production, trend, consistency, historical |
| **Opportunity / volume (raw)** | `player.stats[statSourceId=0].stats` raw statIds (passAtt, rushAtt, targets, receptions, etc.) in the cache | Present in payload | **Not extracted** to any table today, but it's there to mine |
| **Usage proxy** | `player.ownership.percentOwned` / `percentStarted` in the cache | 139/139 (100%) | Rostership %, *not* snap share (see §3) |
| **Keeper value** | roster entry `keeperValue` / `keeperValueFuture` in the cache | 87/139 (63%, i.e. players with a keeper cost) | Already used by `calcKeeperEfficiency` |
| **Consistency** | derivable: stddev of `gm_weekly_player_stats.pointsScored` | computable from above | Not stored; cheap to compute |
| **Trend** | derivable: recent N weeks vs season in `gm_weekly_player_stats` | computable from above | Currently hardcoded `"Stable"` |
| **Historical** | `gm_weekly_player_stats` 2021–2025 + season caches 2009–2026 | broad | See join caveat in §3 |
| **Injury / schedule** | `player.injuryStatus`; schedule strength already plumbed into `calcROSValue` | good | Already used |

**Bottom line:** every input the approved weighting model needs for the **preseason** and
**in-season points-based** buckets is already populated in the ESPN combined cache. V2 is
mostly an *integration + weighting* job, not a data-acquisition job.

---

## 3. Missing data / real gaps (verified)

1. **True usage — snap %, target share, route participation — is NOT available.**
   The rich `weekly_player_stats` table (schema *does* define `targets`, `snapCount`,
   `snapPct`, `receptions`, `rushingAttempts`…) **does not exist in the live database** — it
   was never `db:push`ed (same failure mode ARCHITECTURE.md §10 describes for the intelligence
   tables). The table that *does* exist, `gm_weekly_player_stats`, stores **points only**
   (`pointsScored`, `isStarter`, `rosterSlotId`) — no usage columns.
   → "Usage" in V2 must rely on `ownership.percentOwned` (a weak proxy) unless we (a) extract
   raw volume statIds from the cached payload, or (b) add an external feed.

2. **External feeds are advertised but empty.** `fantasy_data_cache` is commented as holding
   "FantasyPros ECR/ADP + PFR, Vegas odds." Verified contents: **only `espn:` keys (33 rows).**
   No FantasyPros, PFR, or Vegas data is populated. Treat those as *not available*.

3. **Historical-to-current player join is broken on a naive `playerId` match.** A direct join
   of the 2026 roster (ESPN `player.id`) to `gm_weekly_player_stats` 2025 returned
   **0 / 139 matches.** The weekly-stats `playerId` space does not line up with the cache's
   ESPN ids. The Historical and Consistency components depend on solving this — via the
   `gm_player_registry` crosswalk (`espnPlayerId` ↔ `normalizedName`) or name normalization.
   See `docs/playerid-crosswalk-decision.md`. **This is the #1 implementation risk.**

4. **The `players` table is not a usable source.** 2,448 rows, but `projectedTotalPoints`,
   `percentOwned`, `averagePoints` columns are **all empty**, and `rawPlayer` is an ~88-char
   stub (not the full ESPN object). Read player signal from the **combined cache**, not here.

5. **`adp_trend_snapshots` is empty (0 rows).** ADP-change-over-time is not available yet;
   `gm_player_registry.adpChange` is the only adp-movement signal, partial.

6. **`gm_player_registry` ADP is current-season only and ~34% filled** (700/2,050). Fine as a
   convenience/lookup, but the cache's per-player `draftRanksByRankType` is the authoritative,
   100%-covered ADP source for the active roster.

---

## 4. Proposed implementation (upgrade, single engine)

**Principle:** one engine, one value number, preserved output shape. `calcTradeValue` keeps
its signature and its `compositeValue`/`valueBreakdown` outputs so Trade Intelligence, Trade
Aging, and the report layer keep working untouched. We replace its *internals*.

### 4.1 New module: `server/marketValue.ts`
- `getValuationPhase(season, currentWeek)` → returns a weight vector from the approved model:

  | Phase | ADP | Proj | Production | Historical | Keeper | Trend |
  |---|---|---|---|---|---|---|
  | Preseason (wk 0) | 40 | 35 | — | 15 | 10 | — |
  | Weeks 1–4 | 20 | 30 | 35 | 10 | — | 5 |
  | Weeks 5–8 | 5 | 25 | 50 | 10 | — | 10 |
  | Week 9+ | 0 | 20 | 60 | 10 | — | 10 |

- `calcMarketValue(player, ctx)` → `{ value0to100, components, breakdown }`.
  Each component is **normalized to a common 0–100 (or z-score) scale within position**
  before weighting — raw inputs are not additive (ADP is an inverse ordinal rank; projection
  and production are points; ownership is a percent). Normalization is the core of correctness.

- **Production is a composite, not just points** (your explicit requirement):
  - Points: per-game `pointsScored` (weighted recent-half heavier).
  - Opportunity/volume: optional v2.1 — extract `rushAtt`/`targets`/`passAtt` from the cache's
    raw stat block; ship v2.0 without it if we want speed.
  - Consistency: `1 − normalized(stddev)` of weekly points (rewards reliable floors).
  - Trend: slope of last 3–4 weeks vs season baseline (replaces hardcoded `"Stable"`).
  - Usage: `ownership.percentStarted` as the available proxy (snap share unavailable, §3.1).

- **Graceful degradation (required):** if a component has no data for a player (e.g. a rookie
  with no history, or preseason with no production), drop that weight and **re-normalize the
  remaining weights to 100%** so the player isn't penalized to zero. This is what keeps the
  engine honest preseason and for rookies.

### 4.2 Wiring
- `calcTradeValue` delegates to `calcMarketValue` and maps the result into the existing
  `TradeValueResult` shape.
- `tradeAnalyze` (`routers.ts`) passes `currentWeek` (derive from `status.scoringPeriodId`
  in the cache) and loads the per-player weekly history + registry crosswalk into `ctx`.
- No schema migration required for v2.0. (Optional v2.1: a normalized `opportunity` column.)

---

## 5. Real player examples (live 2026 data, league 457622)

Preseason inputs pulled from the production cache today:

| Player | Pos | ADP (PPR) | ESPN proj | Owned % | Keeper rd |
|---|---|---|---|---|---|
| Christian McCaffrey | RB | **5** | 19.5 | 99.8 | 1 |
| Trey McBride | TE | 22 | 15.1 | 99.7 | 2 |
| Chase Brown | RB | 25 | 16.4 | 98.4 | 11 |
| Chris Olave | WR | 26 | 14.4 | 98.3 | 5 |
| Dak Prescott | QB | 144 | 31.2 | 90.7 | 6 |

**Current engine, today (preseason):** all five value to ≈ 0 — `avgPoints` is 0 because 2026
hasn't been played, so `rosValue ≈ 0`, `vorp ≈ 0`. The analyzer can't tell McCaffrey from a
waiver flier right now.

**V2 preseason (40 ADP / 35 Proj / 15 Hist / 10 Keeper):** McCaffrey (ADP 5, top projection)
ranks far above Dak (ADP 144) — correct. Chase Brown's deep keeper cost (round 11) adds keeper
value that a pure-ADP read misses, nudging him above similarly-ADP'd Olave for *trade* purposes.
That positional/keeper-aware ordering is exactly what Trade Intelligence needs to stop looking
broken in the offseason — which is when most trades actually get discussed.

---

## 6. Files impacted

| File | Change | Risk |
|---|---|---|
| `server/marketValue.ts` | **NEW** — phase weights, per-component normalizers, `calcMarketValue`, graceful degradation | isolated |
| `server/analytics.ts` | `calcTradeValue` delegates to `calcMarketValue`; keep exports + output shape; feed `projectedTotal`/`appliedStats` through | medium — central function, but shape preserved |
| `server/routers.ts` | `tradeAnalyze`: derive `currentWeek`, load weekly history + registry crosswalk into ctx | low |
| `server/tradeIntelligence.ts` | optional — surface the new component breakdown in the report | low |
| `server/marketValue.test.ts` | **NEW** — component + phase + degradation tests | n/a |
| `gm_player_registry` (read) | crosswalk for historical join | data, not code |
| **No schema migration** for v2.0 | all inputs already populated | — |

Out of scope / explicitly NOT touched: ESPN fetch, Chrome extension, sync orchestration,
normalization pipeline, Trade Aging UI, the season auto-select fix.

---

## 7. Validation plan

1. **Unit tests** (`marketValue.test.ts`): each normalizer (ADP inverse-rank, projection,
   production, consistency, trend); phase switching at wk 0/3/7/11; graceful re-normalization
   when a component is absent.
2. **Preseason sanity (live 2026):** compute V2 for all 139 roster players; assert the ranking
   correlates strongly with ADP (≈40% weight by design) and ESPN projection, and that no
   player collapses to 0 from missing production. Spot-check the five players in §5.
3. **Phase transition:** simulate weeks 1→16 on 2025 data; confirm production's share of the
   value rises and ADP's falls per the table, with no discontinuities.
4. **Historical join proof:** confirm the crosswalk lifts the 2025 history match rate from
   0/139 to near-complete before trusting the Historical component.
5. **Regression:** Trade Aging + Trade Intelligence still render — `compositeValue` present,
   same shape, verdicts on known 2025 reconstructed trades stay sane.
6. **Gate:** `pnpm check` (0 TS errors) + full `pnpm test` green before any commit.

---

## Open decisions for Rod
1. **v2.0 scope:** ship without raw opportunity/volume extraction (faster, points+consistency+
   trend for production), or include volume extraction from the cache now (richer, more work)?
2. **Usage:** accept `percentStarted` as the usage proxy for v2.0 (snap share is unavailable),
   or defer "usage" entirely until an external feed exists?
3. **Historical join:** use the `gm_player_registry` crosswalk, or a simpler name-normalized
   join, for the MVP?
