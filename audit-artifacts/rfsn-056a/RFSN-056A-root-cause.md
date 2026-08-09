# RFSN-056A — Transactions Missing Executed Trades

League: ESPN **457622** ATLANTAS FINEST FF · season **2026** · Preview audit before fix.

## Observation

Transactions page: **Showing 1 meaningful transaction** while multiple executed trades occurred.

## Pipeline facts (Preview, pre-fix)

| Layer | Count |
| --- | --- |
| Raw ESPN rows (`espn.transactions`) | **417** |
| Trade rows | **373** |
| Types | TRADE_PROPOSAL 355 · TRADE_UPHOLD **3** · TRADE_ACCEPT **8 rows / 3 ids** · TRADE_DECLINE 7 · ROSTER 43 · FREEAGENT 1 |
| Statuses | EXECUTED 60 · CANCELED 201 · PENDING 154 |
| Trade clusters | **66** |
| Meaningful (old `isMeaningfulEntry`) | **58** |
| Dropped | **8** |

ESPN **did import** transactions. This is not an empty sync.

## Actual executed trades (2026)

Exactly **2** completed trades (UPHOLD/ACCEPT), not 58.

### 1. `f273e8dd-…` — 11 ↔ 23 (shown)

- TRADE_PROPOSAL still **PENDING** + `executionType=EXECUTE` (draft-pick items)
- TRADE_ACCEPT `f034d15b` **EXECUTED** + `executionType=PROCESS` (same picks)
- TRADE_UPHOLD teams **1** and **4** (league voters, not parties)
- Clustered as teams **1/4/11/23** → one 4-team blob
- Status filter **Executed** matches because UPHOLD status is EXECUTED

### 2. `d3731d04-…` — 1 ↔ 18 (**missing**)

- TRADE_UPHOLD team 1 + TRADE_ACCEPT team 18, status EXECUTED / null
- **No TRADE_PROPOSAL items** (ESPN purged the proposal; same ids as `espnTrade2026.test.ts`)
- `isMeaningfulEntry` dropped: **`no_assets`**
- `fetchTradeProposals` did not restore it; activity-feed synthetics used `activity_trade_${topicId}` and **did not cluster** with `relatedTransactionId=d3731d04`
- gmTransactions reconstruction also empty for this cluster

TRADE_DECLINE rows with status **EXECUTED** are processed declines, not completed trades (correctly droppable).

## Root cause (locked)

1. **Meaningful filter** required assets. 2026 executed headers often have none → **1 trade hidden**.
2. **Status filter** keyed off ESPN `status` only. PENDING proposals + `executionType=EXECUTE` are still pending; EXECUTED UPHOLD/ACCEPT is the real executed signal. COMPLETED/PROCESSED aliases were missing (not seen in this dump).
3. **Grouping** by `relatedTransactionId` is correct for linking UPHOLD→proposal, but **UPHOLD voter `teamId`s were treated as trade parties** → 4-team recap.
4. **Activity reconstruction ID mismatch** prevented filling orphan `d3731d04` assets.
5. **`espn.transactions` read path** did not live-merge proposals/activity when orphans exist (refresh-only).

**Missing trades: 1** (d3731d04). The other executed trade was shown incorrectly (voters merged in).

Grading (`completedTradeAuthority` / pick value) was **not** changed.

## Fix (Preview)

- `shared/transactionDisplay.ts` — status normalize, party teams, executed cluster, meaningful eval, pipeline summary
- `server/espnService.ts` — `relinkSyntheticTradesToOrphanHeaders`
- `server/routers.ts` `espn.transactions` — live orphan repair (10m memCache)
- `client/src/pages/Transactions.tsx` — use shared filter/grouping + pipeline diagnostics UI

## Validation

Unit tests: `shared/transactionDisplay.test.ts`, `server/espnTrade2026.test.ts` relink cases.

Preview founder: `/league/history/transactions` · 2026 · Trade Status **Executed** → **2** meaningful trades (11↔23 and 1↔18), not 1. Pipeline panel shows raw / displayed / filtered + reason.
