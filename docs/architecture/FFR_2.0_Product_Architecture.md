# Fantasy Football Rivals — Product Architecture 2.0

**Status:** LOCKED — product authority for the V1 → V2 information-architecture migration.  
**Supersedes:** ADR-001 Platform Information Architecture v2 wherever they conflict.  
**Rule:** Do not redesign, simplify, reorganize, or substitute judgment for this document. Implement it.

---

## Top-level navigation (exactly six sections)

```
1. Home
2. Rivals
3. My Team
4. RFSN
5. Draft
6. League
```

There is:

- **NO** top-level Season section
- **NO** top-level History section
- **NO** seventh primary section

History belongs **inside League**.  
Rivals is a **primary section** and must not be replaced by Season or absorbed into League.

Utility (header, not sidebar): Settings, Connected Leagues, Sync Data, League Settings.

---

## Section destinations

### HOME

- Home

### RIVALS

- The Cast
- Owner Dossier
- Head-to-Head Ledger
- Rivalries
- League Map
- Relationship Map

### MY TEAM

- Roster
- Matchup
- Trades
- GM Advisor
- My GM
- Championship Path

### RFSN

- Wire
- Breaking News
- Stories
- Recaps
- Analysts

### DRAFT

- War Room
- Mock Draft
- Keeper Center
- Draft History

### LEAGUE

- Standings
  - Record
  - Power Rankings
  - Playoff Picture
  - Strength of Schedule
- History
  - Champions
  - Hall of Fame
  - Records
  - Dynasties
  - Timeline
  - Transactions
- Acquisition Impact
- Commissioner

---

## Canonical route model

```
/home

/rivals
/rivals/cast
/rivals/owners/:ownerId
/rivals/head-to-head
/rivals/rivalries
/rivals/league-map
/rivals/relationships

/my-team
/my-team/roster
/my-team/matchup
/my-team/trades
/my-team/advisor
/my-team/profile
/my-team/championship-path

/rfsn
/rfsn/wire
/rfsn/breaking
/rfsn/stories
/rfsn/recaps
/rfsn/analysts

/draft
/draft/war-room
/draft/mock
/draft/keepers
/draft/history

/league
/league/standings
/league/standings/power-rankings
/league/standings/playoffs
/league/standings/strength-of-schedule
/league/history
/league/history/champions
/league/history/hall-of-fame
/league/history/records
/league/history/dynasties
/league/history/timeline
/league/history/transactions
/league/acquisition-impact
/league/commissioner
```

Minor route naming may align with the existing router; the six-section hierarchy and ownership are non-negotiable.

---

## Migration phases (engineering)

1. Navigation & routing — six sections, canonical routes, placeholders; preserve legacy routes.
2. Move existing functionality into V2 locations.
3. Merge duplicate functionality exactly as defined by product.
4. Update links; remove orphan routes; one canonical home per destination.
5. Cleanup — obsolete wrappers, dead imports, duplicate nav entries.

---

## Non-negotiable implementation rules

1. This document is the authority.
2. Existing functionality must be preserved unless this architecture explicitly merges or removes it.
3. Never delete functionality because it seems redundant.
4. Never invent new product behavior.
5. Never move features to different sections unless this architecture explicitly requires it.
6. When uncertain, implement exactly what this document says.

Do not redesign pages, rewrite business logic, change APIs, calculations, AI prompts, or data models unless required to satisfy this architecture.
