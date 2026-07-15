# Activity DNA™ — Platform Intelligence Engine Specification
**Owner:** Lead Product Architect  ·  **Status:** v1 design, formulas validated against real league data (League 457622, 2018–2026)
**Principle:** Deterministic. Auditable. No LLMs. Every score explains itself.

---

## 0. Executive summary

Activity DNA classifies each owner's **management style** from historical behavior, producing a multi-dimensional fingerprint (not a single label). It is a shared service consumed by LeagueDNA Advisor, Why Haven't I Won?, Championship Path, Acquisition Impact, Rival Profile, Owner Evolution, and the future Championship DNA engine.

**What ships in Phase 1 (data is ready today): 6 archetypes**
Roster Builder · Waiver Aggressive · Trade Opportunist · Draft-and-Hold · Low Activity · High Activity.
These are computed from `transactionCounter` (acquisitions / drops / trades / IR per team-season, 2018–2026) and `draft_picks` (keepers). Validated below.

**What is Phase 2 (NOW LIVE as of 2026-06-11): 2 archetypes**
Draft Reliant · Streamer.
Both link **weekly scoring to player identity/position**. The original blocker — that `gm_weekly_player_stats.playerId` is a non-global id — was a false alarm: the crosswalk already exists as a JOIN. `weekly.playerId = gm_player_registry.id`, and the registry row carries the global `espnPlayerId` and `position`. 100% coverage, validated against live data. See **docs/playerid-crosswalk-decision.md**. The resolver (`server/weeklyStatsResolver.ts`) exposes the resolved rows; both archetypes now return real scores with `status: "ok"`.

This honesty remains the point: scores stay auditable. An owner with no weekly data still returns `null` with `status: "pending-data"` for these two dimensions, never a guess.

---

## 1. Archetype definitions

Each archetype is a 0–100 score. An owner carries all dimensions simultaneously; `primaryDNA`/`secondaryDNA` are simply the top two.

| Archetype | Meaning | Phase | Primary signal |
|---|---|---|---|
| **High Activity** | Total roster churn per season | 1 | `acquisitions+drops+trades+moves` per season |
| **Low Activity** | Inverse of High Activity | 1 | `100 − highActivity` |
| **Waiver Aggressive** | Works the waiver wire / FA | 1 | `acquisitions` per season |
| **Trade Opportunist** | Builds through trades | 1 | `trades` per season |
| **Roster Builder** | Actively reshapes via both adds and trades | 1 | blend of waiver + trade |
| **Draft-and-Hold** | Drafts, then largely stands pat | 1 | low activity + keeper rate |
| **Draft Reliant** | Points come disproportionately from self-drafted players | 2 | % starter points from drafted players |
| **Streamer** | Cycles startable positions (QB/TE/K/DEF) week to week | 2 | distinct starters per streamed position / weeks |

---

## 2. Scoring formulas (deterministic)

All league-relative scores use **percentile rank** within the set of owners (auditable as "ranks #N of M"), defined as:

```
pct(value, distribution) = ( count(x in distribution where x <= value) / count(distribution) ) * 100
```

Per-owner raw metrics are computed as **per-season rates** (totals ÷ seasons played) so owners with fewer seasons are not penalized.

### Phase 1 (live)
```
acqPS      = total_acquisitions / seasons
tradesPS   = total_trades       / seasons
movesPS    = (acquisitions + drops + trades + moveToActive + moveToIR) / seasons
keeperRate = keeper_picks / total_draft_picks          # from draft_picks.isKeeper

highActivity     = round( pct(movesPS) )
lowActivity      = 100 - highActivity
waiverAggressive = round( pct(acqPS) )
tradeOpportunist = round( pct(tradesPS) )
rosterBuilder    = round( 0.5*waiverAggressive + 0.5*tradeOpportunist )
draftAndHold     = round( 0.55*lowActivity + 0.45*pct(keeperRate) )
```

### Phase 2 (live — via the `gm_player_registry.id` crosswalk; see docs/playerid-crosswalk-decision.md)
```
# Draft Reliant — needs weekly starter points linked to draft origin
draftedStarterPts = Σ pointsScored where isStarter=1 AND playerId ∈ player's draft set that season
totalStarterPts   = Σ pointsScored where isStarter=1
draftReliant      = round( 100 * draftedStarterPts / totalStarterPts )

# Streamer — needs weekly starters linked to position
For each streamed position p in {QB, TE, K, DEF}:
  ratio_p = distinct_starters_at_p_in_season / weeks_played_in_season   # 1.0 = same starter all year
streamIndex = mean(ratio_p over streamed positions, over seasons)
streamer    = round( pct(streamIndex) )
```

### primary / secondary / confidence
```
ranked      = archetypes sorted by score desc      # Phase-2 dims excluded while pending
primaryDNA  = ranked[0]; secondaryDNA = ranked[1]
separation  = ranked[0].score - ranked[1].score
confidence  = seasons>=5 ? (separation>=12 ? "High" : "Medium")
            : seasons>=3 ? "Medium" : "Limited"
```

---

## 3. Output contract

```jsonc
{
  "ownerId": "{6042EE3C-...}",
  "ownerName": "Rod Sellers",
  "seasons": 9,
  "archetypes": {
    "draftReliant":    { "score": null, "status": "pending-data" },
    "streamer":        { "score": null, "status": "pending-data" },
    "draftAndHold":    { "score": 66, "status": "ok" },
    "rosterBuilder":   { "score": 70, "status": "ok" },
    "waiverAggressive":{ "score": 61, "status": "ok" },
    "tradeOpportunist":{ "score": 78, "status": "ok" },
    "lowActivity":     { "score": 39, "status": "ok" },
    "highActivity":    { "score": 61, "status": "ok" }
  },
  "primaryDNA": "Trade Opportunist",
  "secondaryDNA": "Roster Builder",
  "confidence": "Medium",
  "evidence": [
    "Completed 1098 roster moves across 9 seasons (122/season).",
    "58 trades all-time — ranks in the 78th percentile league-wide.",
    "228 waiver/FA acquisitions (25/season).",
    "Draft Reliant & Streamer pending player-ID crosswalk."
  ]
}
```
Every numeric score is paired with at least one `evidence` string. No score is emitted without a backing fact.

---

## 4. Data model

### 4.1 Inputs (all existing — no new scraping, no new APIs)
| Source | Used for | Status |
|---|---|---|
| `espn_raw_cache.payload.teams[].transactionCounter` | acquisitions, drops, trades, moveToActive, moveToIR per team-season | ✅ ready (2018–2026) |
| `teams (season, teamId, ownerId)` | team→owner mapping per season, seasons played | ✅ |
| `draft_picks (season, teamId, playerId, isKeeper)` | keeper rate; Phase-2 draft origin | ✅ (keepers); playerId null for undrafted 2026 |
| `gm_weekly_player_stats (season, week, ownerKey, isStarter, pointsScored, playerId, rosterSlotId)` | Phase-2 draft-reliance & streaming | ⚠ playerId non-global — needs crosswalk |
| `players (playerId, season, position)` | Phase-2 position mapping | ✅ (real ESPN IDs) |
| `league_medals`, `teams.finalStanding` | champion correlation for Championship Path integration | ✅ |

### 4.2 Output store (cache table)
```sql
CREATE TABLE activity_dna (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  leagueId      VARCHAR(32) NOT NULL,
  ownerId       VARCHAR(64) NOT NULL,
  ownerName     VARCHAR(128),
  seasons       INT,
  scores        JSON,          -- { archetype: {score,status}, ... }
  primaryDNA    VARCHAR(32),
  secondaryDNA  VARCHAR(32),
  confidence    VARCHAR(8),
  evidence      JSON,          -- string[]
  schemaVersion INT,           -- bump to invalidate on formula change
  computedAt    DATETIME,
  UNIQUE KEY uniq_league_owner (leagueId, ownerId)
);
```

### 4.3 The Phase-2 unblocker (its own work item)
Build `gm_player_registry` crosswalk so `gm_weekly_player_stats.playerId` → canonical ESPN `players.playerId`. Likely a name+season normalization pass (the registry already has `normalizedName`, `firstSeasonSeen`). Once a `weeklyPlayerId → espnPlayerId` map exists, Draft Reliant and Streamer activate with zero formula changes.

---

## 5. API design

Server service `server/activityDnaService.ts`:
```ts
computeActivityDna(leagueId: string): Promise<ActivityDnaResult[]>      // whole league (one pass; needed for percentiles)
getActivityDnaForOwner(leagueId, ownerKey): Promise<ActivityDnaResult>  // single owner (reads cache)
```
Percentiles require the **full league** in one pass, so the league computation is the unit of work; per-owner reads come from the `activity_dna` cache.

tRPC:
```
activityDna.league      -> ActivityDnaResult[]           (cached; recompute if stale)
activityDna.owner       -> ActivityDnaResult             (active profile or ?ownerKey override)
activityDna.recompute   -> mutation (admin/manual refresh)
```
Profile-aware exactly like whyHaventIWon: resolve `ownerKeyOverride || resolveActiveProfile().selectedOwnerKey`.

---

## 6. UI design — Activity DNA card

**Desktop (in Owner Profiles + as an embeddable panel):**
```
┌──────────────────────────────────────────────┐
│ ⬡ ACTIVITY DNA            confidence: Medium   │
│ Rod Sellers · 9 seasons                        │
│                                                │
│   PRIMARY            SECONDARY                  │
│   Trade Opportunist  Roster Builder             │
│                                                │
│   [radar chart: 6 axes, filled polygon]         │
│                                                │
│   Trade Opportunist ███████▊ 78                 │
│   Roster Builder    ███████  70                 │
│   Draft-and-Hold    ██████▌  66                 │
│   Waiver Aggressive ██████   61                 │
│   High Activity     ██████   61                 │
│   Low Activity      ███▉     39                 │
│                                                │
│   EVIDENCE                                      │
│   • 58 trades all-time (78th pct)               │
│   • 1098 roster moves / 9 seasons               │
│   • 228 waiver adds (25/season)                 │
│   ⓘ Draft Reliant & Streamer — coming soon       │
└──────────────────────────────────────────────┘
```
- **Radar chart**: 6 axes (8 once Phase 2 lands), filled polygon, lime/violet palette per design system.
- **Bars**: each archetype with score; primary/secondary highlighted (lime).
- **Evidence chips**: tappable pills, each is one auditable fact.
- Pending dimensions render as a muted "coming soon" chip — never a fake number.

**Mobile (~380px):** stack vertically — header → primary/secondary as two big pills → radar (full-width square) → ranked bars → evidence chips. Radar viewBox sized to width; bars are single-column.

Built with the existing `visualize` SVG/HTML system + design tokens (PAGEBG, PANEL, lime #a3e635, violet #8b5cf6). No new chart dependency required.

---

## 7. Integration plan

| Feature | How Activity DNA improves it | Example surfaced string |
|---|---|---|
| **LeagueDNA Advisor** | Adds an identity line to the dossier | "You profile as a **Trade Opportunist** — 58 career trades, top-quartile." |
| **Why Haven't I Won?** | A finding keyed to style vs. champion style | "Your **Draft-and-Hold** tendency (6 trades in 8 yrs) limits in-season adaptation." |
| **Championship Path** | Correlate archetypes of past champions | "Champions here skew **Waiver Aggressive** (avg 80th pct); you're 44th." |
| **Acquisition Impact** | Frame the owner's acquisition tendency | "Your roster-building score ranks **#3 all-time** in this league." |
| **Rival Profile** | One-line opponent identity | "Marlon trades rarely — beat him on the wire." |
| **Owner Evolution** | Recompute per-season to show drift | "Shifted from Draft-and-Hold (2019) → Trade Opportunist (2024)." |
| **Championship DNA (future)** | Feature vector input | archetype scores become model features. |

Integration is **additive and read-only**: each feature calls `getActivityDnaForOwner` and renders one line/finding. No feature depends on Phase-2 dimensions to function.

---

## 8. Validation plan

### 8.1 Sample outputs — REAL, computed from league 457622 (Phase-1 archetypes)
These come from the validated prototype run against live data, not hand-authored.

| Owner | RB | WA | TO | D&H | LA | HA | Primary / Secondary | Conf | Key evidence |
|---|---|---|---|---|---|---|---|---|---|
| **Rod Sellers** | 70 | 61 | 78 | 66 | 39 | 61 | **Trade Opportunist** / Roster Builder | Medium | 58 trades, 228 acq, 9 seasons |
| **Demetri Clark** | 73 | 89 | 56 | 51 | 11 | 89 | **Waiver Aggressive** / High Activity | Medium | 376 acq, 44 trades, 9 seasons |
| **Mark Deroux** | 84 | 78 | 89 | 50 | 28 | 72 | **Trade Opportunist** / Roster Builder | Medium | 60 trades (league-most), 311 acq |
| **Jan Graham** | 31 | 44 | 17 | 69 | 61 | 39 | **Draft-and-Hold** / Low Activity | Medium | 6 trades in 8 yrs, lowest activity of regulars |

Sanity checks pass: the most-active owners (Demetri 376 acquisitions) score top on Waiver/High Activity; the most prolific traders (Mark 60, Rod 58) top Trade Opportunist; the stand-pat owner (Jan, 6 trades) tops Draft-and-Hold. Scores differentiate cleanly across 18 owners.

### 8.2 Regression tests
- Percentile monotonicity: higher raw rate ⇒ ≥ score.
- `lowActivity == 100 - highActivity` (invariant).
- Each emitted score has ≥1 evidence string; pending dims emit `null`+`pending-data`, never 0.
- Re-run determinism: identical inputs ⇒ identical output (no randomness, no time-of-day).

### 8.3 Data dependencies
- **Hard:** `espn_raw_cache` (transactionCounter), `teams` (owner mapping). Without these, no Phase 1.
- **Soft:** `draft_picks.isKeeper` (Draft-and-Hold loses its keeper term but still works on low-activity).
- **Phase 2:** weekly-stats playerId crosswalk — RESOLVED. JOIN via `gm_player_registry.id` → `espnPlayerId` + `position`; tuple-scoped per league. See docs/playerid-crosswalk-decision.md.

### 8.4 Performance & caching
- One league pass = ~18 owners × 9 seasons; all source rows already pulled by existing queries. Sub-second.
- Compute **once per sync**, store in `activity_dna`, bump `schemaVersion` on formula change to invalidate.
- Per-owner feature reads hit the cache (no recompute). League recompute triggered by `sync_runs` completion or manual `activityDna.recompute`.
- Percentiles are league-scoped, so recompute the **whole league** together (cheap), never a single owner in isolation.

---

## 9. Implementation order (gated; each step validated + committed separately)

**Phase 1 — ship the 6 working archetypes**
1. `server/activityDnaService.ts` — port the validated prototype (transactionCounter + keepers + percentile scoring). Unit-test the formulas.
2. `activity_dna` cache table + migration; compute-on-sync hook.
3. tRPC `activityDna.league` / `.owner` / `.recompute`.
4. Activity DNA **card** component (radar + bars + evidence) — desktop + mobile.
5. Mount on **Owner Profiles** (replaces the currently-empty Activity DNA tab — this is item #8 from the QA audit).
6. Validate live for Rod/Demetri/Mark/Jan; commit; push on approval.

**Phase 2 — DONE (2026-06-11): data-dependent archetypes live**
7. ✅ Crosswalk is a JOIN via `gm_player_registry.id` (not name-based). Resolver: `server/weeklyStatsResolver.ts`. See docs/playerid-crosswalk-decision.md.
8. ✅ Draft Reliant + Streamer compute in `computeActivityDna`; `status` is `ok` for owners with weekly data.

**Phase 3 — wire into features (one PR each, additive)**
9. LeagueDNA Advisor → identity line. 10. Why Haven't I Won? → style finding. 11. Championship Path → champion-archetype correlation. 12. Acquisition Impact → ranking line. 13. Rival Profile, 14. Owner Evolution (per-season recompute).

**Recommended first build:** Phase 1, steps 1–6 — it lights up the empty Activity DNA tab with real, auditable profiles and gives every downstream feature something to call.

---

## 10. Open product decisions (need your call)
1. **Should `primaryDNA` ever prefer a "style" archetype over the High/Low Activity meta-pair?** (e.g., Demetri's primary is currently "Waiver Aggressive" with High Activity close behind — good. But a pure-volume owner could read "High Activity" as primary, which is less descriptive. Option: rank style archetypes first, treat High/Low Activity as a separate "tempo" badge.)
2. **Keeper weight in Draft-and-Hold** — this league barely uses keepers (mostly 0–7%), so the keeper term is near-inert. Keep it (future-proof) or drop to pure low-activity?
3. **Phase-2 priority** — build the playerId crosswalk now (unlocks Draft Reliant + Streamer), or ship Phase 1 first and schedule the crosswalk after?

---

## 10b. DECISIONS LOCKED (owner-approved, supersedes section 10)
1. **Primary selection** - primaryDNA is chosen ONLY from descriptive archetypes (Trade Opportunist, Roster Builder, Waiver Aggressive, Draft-and-Hold). High/Low Activity are "tempo" labels, allowed only as secondaryDNA.
2. **Keepers - kept but capped.** Keeper weight in Draft-and-Hold = 0.30 only when the league materially uses keepers (max keeperRate >= 15%); otherwise 0.10. A low-volume keeper signal can never dominate.
3. **Phase 2 deferred - ship Phase 1 (6 archetypes) first.** Draft Reliant & Streamer return status:"pending-data" and render as "Pending deeper player-linking data" until the playerId crosswalk lands.
