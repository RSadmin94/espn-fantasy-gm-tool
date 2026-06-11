# Decision Record: weekly-stats playerId → global ESPN id crosswalk

**Status:** Resolved (recoverable, 100% coverage) — 2026-06-11
**Supersedes:** ACTIVITY_DNA_SPEC.md §4.3 "Phase-2 blocker" (the playerId crosswalk is **not** missing)

## Summary

`gm_weekly_player_stats.playerId` was believed to be an unmappable local id,
blocking the two data-dependent Activity DNA archetypes (Draft Reliant, Streamer)
and any downstream signal needing per-player weekly scoring (Waiver Impact,
Homegrown Strength, Why Haven't I Won, Championship Path, Historical Receipts).

It is fully recoverable. The crosswalk already exists in the live schema — no
backfill, re-fetch, or ingestion change is required. It is a JOIN.

## Join path

```
gm_weekly_player_stats.playerId   →   gm_player_registry.id          (registry autoincrement PK)
gm_player_registry.espnPlayerId   →   global ESPN id  (e.g. 3918298)
gm_player_registry.position       →   position (QB/RB/WR/TE/K/DEF/DL/LB)
```

The local `playerId` (values 1..~2025, climbing each season) is a sequential
surrogate key that points at `gm_player_registry.id`. The registry row carries
both the global `espnPlayerId` and `position`.

## Validation performed (live DB, read-only)

1. **Structural join** — `weekly.playerId = registry.id` resolves for every row.
2. **Semantic spot-check** — recovered ids are objectively correct:
   Josh Allen→3918298, Ja'Marr Chase→4362628, Tom Brady→2330,
   Aaron Rodgers→8439, Dak Prescott→2577417. Top-scoring starters are elite
   QBs sitting in QB slots (rosterSlotId 1).
3. **Same id-space as draft_picks** — recovered global ids join to
   `draft_picks.playerId`; 577 of 849 players (68%) appear there. The ~32% that
   don't are waiver/FA pickups — the desired Waiver-Impact signal, not a gap.
4. **No wrong-player collisions** — every apparent name mismatch on the
   draft_picks join was a blank `draft_picks.playerName` (id still correct) or a
   suffix ("Kyle Pitts Sr." vs "Kyle Pitts"). Zero cross-player errors.

## Coverage numbers

| Measure | Result |
|---|---|
| Weekly rows joining to registry + numeric global id | 64,812 / 64,812 (100%) |
| Distinct players resolving to a global id | 849 / 849 (100%) |
| Distinct players resolving to a position | 849 / 849 (100%) |
| Recovered players also present in draft_picks | 577 / 849 (68%, expected) |

## Scoping note (important)

`gm_weekly_player_stats` has **no leagueId column** and is **multi-league**
(28 teamIds, 53 owner GUIDs). `ownerKey` is the league-agnostic ESPN member GUID.
Scope weekly stats to a league by the `(ownerGUID, season, teamId)` tuple matched
against that league's `teams` roster — never by teamId alone. For league 457622
this yields 18 owners / 16,466 starter-eligible rows.

## Implementation path

- **Resolver:** `server/weeklyStatsResolver.ts`
  - `resolveWeeklyPlayerStats(leagueId, { season?, startersOnly? })` → league-scoped
    weekly rows enriched with `espnPlayerId` + `position` (the registry join).
  - `resolveLeagueDraftSet(leagueId)` → `{ ownerId, season, espnPlayerId }[]` (draft origin).
- **Archetypes:** `server/activityDnaService.ts` `computeActivityDna` consumes the
  resolver to compute Draft Reliant + Streamer with verdict-grade evidence.

## Retirement of the ACTIVITY_DNA_SPEC blocker

ACTIVITY_DNA_SPEC.md §4.3 / §8.3 / §9 (Phase 2) described the weekly-stats
playerId crosswalk as a blocker requiring name-normalization work
(`gm_player_registry.normalizedName`). That is **retired**:

- The crosswalk is a direct id join, not a name match. The name path is unnecessary.
- Draft Reliant and Streamer are **live** (status `ok`), not `pending-data`.
- The spec's "pending deeper player-linking data (Phase 2)" gate no longer applies.

## Residual caveats (hardening, not blockers)

1. The `weekly.playerId = registry.id` link is not an enforced FK — it relies on
   registry PK stability. If the registry is ever rebuilt/re-keyed, validate.
2. Registry contains duplicate rows for some players (e.g. two "Justin Jefferson").
   Joins by `espnPlayerId` are unaffected (duplicates share the global id); a dedup
   pass is hygiene, not correctness.
