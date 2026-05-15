# Developer Handoff: ESPN 2026 Trade Tracking & Trade Aging

**Project:** ESPN Fantasy Football GM/Advisor Tool (`espn_ff_gm_tool`)
**Checkpoint:** `5f54e803`
**Date:** May 15, 2026
**Prepared by:** Manus AI

---

## Overview

This document covers three related bodies of work completed in the May 2026 sprint:

1. **2026 Transaction Format Fix** — Updated the normalizer to recognize ESPN's new split-record trade format.
2. **fetchTradeProposals Pipeline** — Added a supplemental ESPN API call to retrieve TRADE_PROPOSAL records that have aged out of the standard recent-activity window.
3. **Trade Aging Tab** — Built a new "Trade Aging" tab in Trade Lab that reconstructs completed trades across all cached seasons and scores each side.

All three items are shipped, tested, and committed. The current checkpoint is `5f54e803`.

---

## 1. Root Cause: ESPN 2026 Trade Format Change

### Legacy Format (2009–2025)

In all seasons prior to 2026, a completed trade produced a **single transaction record** of `type: "TRADE"` with `status: "EXECUTED"`. The `items[]` array on that record contained every player and pick moving in both directions.

```
TRADE (id: abc123, status: EXECUTED)
  items:
    - fromTeamId: 2, toTeamId: 8, playerId: 1234567  ← Mahomes to team 8
    - fromTeamId: 8, toTeamId: 2, playerId: 7654321  ← Jefferson to team 2
```

### 2026 Format (Split Records)

ESPN changed the accepted-trade event into **three separate records**:

| Record Type | Has `items[]`? | Purpose |
|---|---|---|
| `TRADE_PROPOSAL` | **Yes** — contains all player/pick movements | The original offer; created when a trade is proposed |
| `TRADE_UPHOLD` | No | League manager approval; references proposal via `relatedTransactionId` |
| `TRADE_ACCEPT` | No | Counterparty acceptance; references proposal via `relatedTransactionId` |

```
TRADE_PROPOSAL (id: d3731d04, status: PENDING → EXECUTED)
  items:
    - fromTeamId: 5, toTeamId: 1, type: DRAFT_TRADE, overallPickNumber: 7
    - fromTeamId: 1, toTeamId: 5, type: DRAFT_TRADE, overallPickNumber: 39

TRADE_UPHOLD (id: c1986f18, relatedTransactionId: d3731d04, items: [])
TRADE_ACCEPT  (id: acc11111, relatedTransactionId: d3731d04, items: [])
```

Because the original normalizer only emitted rows for `type === "TRADE"`, all three new types were silently dropped. No trade data appeared for 2026.

---

## 2. Fix 1 — Transaction Normalizer (`server/espnService.ts`)

### What changed

`normalizeTransactions()` was updated in two ways:

**a) Header rows for no-item transactions.** Previously, transactions with an empty `items[]` array produced zero output rows. Now, if a transaction has no items but has a recognized type (`TRADE_UPHOLD`, `TRADE_ACCEPT`, or any future header type), a single header row is emitted with `playerId: null` and `playerName: null`. This preserves the `relatedTransactionId` link for downstream consumers.

**b) `relatedTransactionId` passthrough.** Both header rows and item rows now carry the `relatedTransactionId` field from the raw ESPN payload. This is `null` for legacy records and for `TRADE_PROPOSAL` records themselves.

### What changed in `server/providers/espnAdapter.ts`

`mapTxType()` was extended to map the new ESPN type strings:

| ESPN raw type | Normalized type |
|---|---|
| `TRADE` | `"TRADE"` (unchanged) |
| `TRADE_PROPOSAL` | `"TRADE_PROPOSAL"` |
| `TRADE_UPHOLD` | `"TRADE_UPHOLD"` |
| `TRADE_ACCEPT` | `"TRADE_ACCEPT"` |

### Trade-counting filters

All places in the codebase that counted trades by checking `t.type === "TRADE"` were updated to also include `TRADE_UPHOLD` and `TRADE_ACCEPT`:

- `server/liveOpponentProfile.ts` — trade count in opponent GM profile
- `server/analytics.ts` — trade count in manager behavior analytics
- `server/weeklyAssessmentService.ts` — recent-trade detection in weekly report

---

## 3. Fix 2 — fetchTradeProposals Pipeline (`server/espnService.ts`)

### The secondary problem

ESPN's `mTransactions2` view returns only the most recent ~50 transactions. For the 2026 season, the `TRADE_PROPOSAL` record (which contains the actual player/pick items) had already aged out of that window by the time the cache was populated. The `TRADE_UPHOLD` record remained (it was newer), but without its linked proposal the normalizer had no item data to reconstruct the trade.

### Solution

Two new exported functions were added to `server/espnService.ts`:

**`fetchTradeProposals(season, creds?)`** — Calls the same `mTransactions2` ESPN endpoint but passes the `x-fantasy-filter` header:

```json
{"transactions": {"filterType": {"value": ["TRADE_PROPOSAL"]}}}
```

This instructs ESPN to return all `TRADE_PROPOSAL` records for the season regardless of recency, bypassing the 50-record window limit.

**`mergeTradeProposalsIntoTransactions(data, proposals)`** — Accepts the existing combined-cache data object and the proposals array. It de-duplicates by transaction `id` (so proposals already in the recent-activity window are not double-counted) and appends any new proposals to `data.transactions`. Returns the original `data` object reference unchanged if `proposals` is empty (no allocation).

### Wiring

Both functions are called in two places:

- `server/scheduledRefresh.ts` — after the hardened pipeline fetch, before the cache write. The enriched data object is passed to all downstream normalizers.
- `server/routers.ts` (the `espn.refresh` tRPC mutation) — same enrichment pattern for the manual-trigger path.

---

## 4. Trade Aging Tab (`client/src/pages/TradeAging.tsx`)

### Server procedure: `trpc.espn.tradeAging`

Located in `server/routers.ts` at the `tradeAging` key inside the `espn` router (line ~369).

**Input:** `{ season?: number }` — optional season filter. If omitted, all cached seasons are included.

**Processing pipeline:**

1. Loads all cached seasons (or the requested season) from the DB.
2. For each season, calls `normalizeTransactions` and `normalizeRosters` on the cached ESPN data.
3. Filters transaction rows to trade item rows only: `type === "TRADE"` (legacy) or `type === "TRADE_PROPOSAL"` (2026+) with a non-null `playerId`, plus `itemType === "DRAFT_TRADE"` rows for pick trades.
4. Groups rows by `transactionId` to reconstruct individual trades.
5. For each trade group, identifies the two teams involved and partitions players/picks into Side A and Side B.
6. Scores each side using `calcVORP` and `calcROSValue` from `server/analytics.ts`, using the season-specific `avgPoints` from `normalizeRosters`.
7. Computes a `verdict` (`"sideA"` | `"sideB"` | `"even"`) based on the composite value margin. Trades within a 50-point margin are rated `"even"`.
8. Returns a sorted array (most recent first) of trade objects.

**Return shape (per trade):**

```ts
{
  season: number;
  tradeId: string;
  proposedDate: number;          // UTC ms timestamp
  sideA: {
    teamId: number;
    ownerName: string;
    players: { playerId: number; playerName: string; position: string; avgPoints: number; compositeValue: number }[];
    picks: { overallPickNumber: number; estimatedValue: number }[];
    totalValue: number;
  };
  sideB: { /* same shape */ };
  verdict: "sideA" | "sideB" | "even";
  verdictMargin: number;         // absolute value of sideA.totalValue - sideB.totalValue
}
```

### UI component: `TradeAging.tsx`

The component is a standard React functional component using `trpc.espn.tradeAging.useQuery`. Key UI elements:

- **Season filter** — a `<Select>` populated from `trpc.espn.cachedSeasons.useQuery()`. Defaults to "All Seasons".
- **Summary bar** — counts of Side A wins, Side B wins, and even trades across the filtered set.
- **Trade cards** — one card per trade, showing both sides with player/pick lists, composite value totals, and a winner badge (`SIDE A WON` / `SIDE B WON` / `EVEN`). Cards are sorted most-recent-first.
- **Empty state** — shown when no trades are found for the selected season (e.g., 2025 has 0 trades in the current cache because no trades occurred or the cache predates the season).

### Routing

The tab is wired into `client/src/pages/hubs/TradeLab.tsx` as a fifth `TabsTrigger` / `TabsContent` pair with `value="trade-aging"`.

---

## 5. Test Coverage

All tests are in `server/espnTrade2026.test.ts`. The file contains **four `describe` blocks**:

| Block | Tests | What it covers |
|---|---|---|
| `normalizeTransactions — 2026 format` | 6 | TRADE_UPHOLD/TRADE_ACCEPT rows, relatedTransactionId passthrough, header rows with null playerId |
| `normalizeTransactions — legacy 2025` | 4 | Backward compatibility: legacy TRADE rows, WAIVER rows, season field |
| `normalizeTransactions — edge cases` | 3 | Empty transactions array, transaction with no items field, non-header empty transaction suppression |
| `mergeTradeProposalsIntoTransactions` | 6 | Proposal outside window appended, normalizer reconstructs items, no double-count, empty proposals no-op, non-trade transactions preserved, legacy format unaffected |
| `tradeAging — grouping and reconstruction` | 6 | Legacy TRADE both sides, 2026 TRADE_PROPOSAL both sides, TRADE_UPHOLD header rows produce no groups, merged proposal creates group, verdict math |

**Total: 499 tests passing, 0 TypeScript errors** (verified with `pnpm tsc --noEmit` and `pnpm test`).

> **Note on the TypeScript watcher panel:** The LSP/typescript health-check panel in the management UI shows a stale snapshot from before the `tradeAging` procedure was added (6:00 AM). The `pnpm tsc --noEmit` command returns 0 errors. The stale snapshot is a known incremental-build cache artifact and does not affect the build or runtime.

---

## 6. Known Limitations and Remaining Risks

### `transactionCounter.trades` is 0 for 2026

ESPN's own `transactionCounter.trades` field (embedded in each team object in the league data) is not updated for the new `TRADE_UPHOLD`/`TRADE_ACCEPT` format. The `txnSeasons.trades` count used by OwnerStats historical summaries and leagueDNA will show 0 for 2026 until ESPN fixes their counter. The raw-transaction path (analytics, liveOpponentProfile, Trade Aging) is correctly fixed.

### 2025 season shows 0 trades in Trade Aging

The 2025 cache in the current DB contains no `TRADE` records. This is a data gap — either no trades occurred in 2025 or the cache was populated before any trades were made. Refreshing the 2025 cache via Data Center → Refresh will resolve this if trades exist on ESPN's servers.

### ESPN rate-limiting on `fetchTradeProposals`

`fetchTradeProposals` is a second API call per season per refresh cycle. The `x-fantasy-filter` header is an undocumented ESPN API feature. If ESPN starts throttling or rejecting this header, the call fails silently and the pipeline falls back to the unmerged data — no crash, but proposals will be missing again. Monitor the scheduled-refresh logs for repeated empty-proposal responses.

### Proposal records not retained indefinitely by ESPN

The `filterType: TRADE_PROPOSAL` filter returns all proposals ESPN has indexed for the season, but ESPN may not retain proposals indefinitely. Very old proposals (pre-2024) may return empty even with the filter. This is acceptable — legacy seasons use the old `TRADE` format and do not need proposals.

---

## 7. File Change Summary

| File | Type | Summary |
|---|---|---|
| `server/espnService.ts` | Modified | `normalizeTransactions` header rows + `relatedTransactionId` passthrough; `fetchTradeProposals`; `mergeTradeProposalsIntoTransactions` |
| `server/providers/espnAdapter.ts` | Modified | `mapTxType` extended for `TRADE_PROPOSAL`, `TRADE_UPHOLD`, `TRADE_ACCEPT` |
| `server/liveOpponentProfile.ts` | Modified | Trade-count filter includes new 2026 types |
| `server/analytics.ts` | Modified | Trade-count filter includes new 2026 types |
| `server/weeklyAssessmentService.ts` | Modified | Trade-type branch includes new 2026 types |
| `server/scheduledRefresh.ts` | Modified | `fetchTradeProposals` + `mergeTradeProposalsIntoTransactions` wired in before cache write |
| `server/routers.ts` | Modified | Same enrichment wired into `espn.refresh` mutation; `tradeAging` procedure added inside `espn` router |
| `client/src/pages/TradeAging.tsx` | **New** | Trade Aging UI component |
| `client/src/pages/hubs/TradeLab.tsx` | Modified | Trade Aging tab added as 5th tab |
| `server/espnTrade2026.test.ts` | **New** | 25 regression tests across all four describe blocks |

---

## 8. How to Hand Off to Another Developer

1. Clone the repo and check out commit `5f54e803` (or the latest checkpoint from the management UI).
2. Run `pnpm install` and `pnpm db:push` to sync the schema.
3. Run `pnpm test` — all 499 tests should pass.
4. Run `pnpm tsc --noEmit` — should return 0 errors.
5. Start the dev server with `pnpm dev` and navigate to **Trade Lab → Trade Aging** to verify the UI.
6. To test 2026 trade reconstruction end-to-end, trigger a data refresh via **Data Center → Refresh** for season 2026. The `fetchTradeProposals` call will run automatically and merge any proposals into the cache.

The next logical work items are:

- **Trade History tab** — a simpler companion tab showing raw trade records without scoring (useful when season stats are not yet available, e.g., pre-season 2026).
- **`transactionCounter` fix** — once ESPN updates their counter field for the new format, the OwnerStats historical trade count for 2026 will self-correct. No code change needed.
- **2025 cache refresh** — refresh the 2025 season data to populate trade records if any trades occurred.
