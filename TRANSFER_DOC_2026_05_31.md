# GM War Room — Session Transfer Document
**Generated:** 2026-05-31
**For:** New conversation window to continue development

---

## Project Overview
**App:** GM War Room (`gmwarroom.online`) — ESPN fantasy football SaaS for ATLANTAS FINEST FF
**Stack:** React/TypeScript/tRPC/Express/Drizzle ORM/MySQL, Railway hosting, Chrome extension
**Repo:** `C:\Users\RODERICK\Projects\espn-fantasy-gm-tool`
**Branch:** `cursor/frontend-rebuild-stage1-9b20`
**Railway project:** affectionate-rebirth
**DB (public proxy):** `mysql://root:fbNLxYbUnFfXGqyuRZHnSkawQDIrgRcl@viaduct.proxy.rlwy.net:55605/railway`
**League:** ATLANTAS FINEST FF, leagueId=457622
**User:** No coding experience — AI does all the work

---

## Latest Git State
**Latest commit:** `545b3c6` — "part4-league-wire-newsroom-championship-archive"

### Recent commits (most recent first):
| Hash | Description |
|---|---|
| `545b3c6` | Part 4 League Wire Newsroom + Championship Archive |
| `8b8c437` | Batch player POST 450 per request |
| `5b8344e` | Roster+KA merge, League Wire to Dashboard/Matchups |
| `19cf042` | League Wire postgame reports |
| `341cdbc` | Player DB template redesign + AI sidebar + dynasty bars |
| `fb464ab` | Player DB FLEX + DL/LB/DB filters + UI overhaul |
| `4b891a2` | Player headshots from ESPN CDN |
| `30d85a6` | Player Database page (ESPN-style) |
| `78c26c3` | Fix saveRosterPlayers raw SQL column names |

---

## Chrome Extension
**Current version:** v1.4.7
**Location:** `chrome-extension/` folder
**Key buttons in popup:**
- `POPULATE PLAYER REGISTRY (ESPN Universe)` — fetches top 700 players (QB/RB/WR/TE/K/DEF + DL/LB/DB) from ESPN kona_player_info, POSTs in 450-player batches to server
- `FULL IMPORT` — imports all historical seasons draft + matchup data
- `TEST IMPORT (2010)` — was repurposed, now defunct

**Extension files modified:**
- `chrome-extension/background.js` — main service worker
- `chrome-extension/popup.html` / `popup.js` — popup UI
- `chrome-extension/manifest.json` v1.4.7

**DNR rules:** Rules 1–6 applied for ESPN API auth header injection

---

## Database State
| Table | Rows | Notes |
|---|---|---|
| `gm_player_registry` | 500 | Needs re-populate with v1.4.7 for DL/LB/DB |
| `gm_weekly_player_stats` | 0 | Empty — pipeline not yet run |
| `matchups` | 172 | 2010 (weeks 1–16) + 2026 (week 0, all 0 scores) |
| `teams` | 226 | All seasons |
| `standings_snapshots` | 226 | Week 0 only for most seasons |
| `roster_entries` | 1642 | 2018–2026, week 0 (preseason projections) |
| `draft_picks` | 1776 | Multiple seasons, 4 keepers flagged for 2026 |
| `league_medals` | 16 | Champions 2010–2025 |
| `transactions` | 297 | 2026 season |
| `espn_raw_cache` | 24 | Combined views per season |
| `league_wire_articles` | 0 | NEW TABLE — caches AI-generated articles |

**New table created this session:**
```sql
league_wire_articles (id, leagueId, season, articleType, slug, category,
  headline, subheadline, body, byline, evidenceJson, isPredicted, status,
  createdAt, updatedAt)
```

---

## Pages & Routes

| Route | Component | Status |
|---|---|---|
| `/dashboard` | Dashboard.tsx | ✅ Live — has League Wire news feed widget |
| `/player-intelligence` | PlayerIntelligence.tsx | ✅ Live |
| `/player-database` | PlayerDatabase.tsx | ✅ Live — ESPN-style, headshots, dynasty bars |
| `/league-wire` | LeagueWire.tsx | ✅ Live — REDESIGNED as full newsroom |
| `/matchups` | Matchups.tsx | ✅ Live — has Week Wrap-Up section |
| `/rosters` | Roster.tsx | ✅ Live — KeeperAdvisor merged in |
| `/keeper-advisor` | KeeperAdvisor.tsx | ✅ Kept but removed from nav (merged into Roster) |

---

## New Server Files (This Session)

### `server/leagueNewsroomRouter.ts`
Main newsroom router. Wired as `leagueNewsroom:` in `server/routers.ts`.

Procedures:
- `getArchiveSeasons` — returns seasons with medal data
- `getSeasonArticles(season, category?)` — reads cached articles from DB
- `getNewsroomFeed(limit)` — latest articles across all seasons
- `generateChampionshipMarch(season)` — builds evidence + LLM → saves to DB
- `generateAllChampionshipMarches` — batch generates all 16 seasons
- `generateKeeperPreviews(draftYear)` — uses keeper draft history
- `generateRosterConstruction(season)` — uses 2026 roster projections
- `deleteArticle(slug)` — force regeneration

### `server/leagueNewsroomEvidence.ts`
Builds DB-sourced evidence objects for each article type.
Key function: `buildChampionshipEvidence(db, season)` — returns champion info,
regular season records, biggest win, closest escape, playoff path, rivalries.
All from real matchup + medal + team data. NO fabrication.

### `server/leagueWireRouter.ts` (previous session)
Original postgame report engine (deterministic, no LLM).
- `getAvailableWeeks` — completed week/season combos
- `getPostgameReports(season, week)` — all reports for a week
- `getMatchupReport(matchupId)` — single report

### `server/playerStatsCacheRouter.ts`
Player registry population.
- `saveRosterPlayers` — raw SQL upsert into gm_player_registry (fixed column names)
- `syncPlayersFromCache` — reads espn_raw_cache rows
- `saveWeeklyPlayerStats` — stores mMatchupScore payloads

---

## Frontend Architecture

### Nav Structure (AppShell.tsx)
```
COMMAND CENTER
  Dashboard
  AI Advisor
  League Wire  ← NEW (moved from Intelligence)

DYNASTY
  Franchise Dashboard (Coming Soon)
  Owner Profiles
  Hall of Fame
  League Timeline

INTELLIGENCE
  Rivalry Center
  Draft DNA (Coming Soon)
  Player Intelligence
  Player Database  ← NEW
  Trade Analyzer

LEAGUE
  Standings
  Matchups
  Rosters      ← Now includes Keeper Advisor section
  Transactions

COMMISSIONER
  League Settings
  Sync Data
  Data Health
  Identity Review
```

### League Wire Page (`LeagueWire.tsx`)
Complete newsroom. Two tabs:
1. **Latest News** — live wire scores + AI-generated article feed + archive index
2. **Historical Archive** — season selector (2010–2025) → articles per season

Article types:
- `championship_march` → featured hero card (amber border)
- `keeper_preview` → labeled PREDICTED — NOT OFFICIAL
- `roster_construction` → roster needs analysis
- `season_archive` → season index

Generate controls visible on the page. Clicking "All Championship Marches" calls
`leagueNewsroom.generateAllChampionshipMarches` which loops all 16 seasons,
builds evidence from DB, calls LLM (`invokeLLM` via `server/_core/llm.ts`),
stores in `league_wire_articles` table.

### Player Database (`PlayerDatabase.tsx`)
ESPN projections-style layout with:
- Stats header (total, active, avg dynasty)
- Tab bar: ALL PLAYERS / WATCHLIST / DYNASTY RANKS / SCORES / BILLING
- Search + position filters (ALL QB RB WR TE K DL LB DB DEF)
- Sort dropdown (Dynasty Value, Player Name, NFL Team, etc.)
- Table with ESPN headshots, position pills, dynasty value bars (gradient)
- Right sidebar: AI insights + position distribution chart
- Pagination

### Roster Page (`Roster.tsx`)
Original roster view + new sections:
- Collapsible "Keeper Advisor 2026" section at bottom
- KVS (Keeper Value Score) table with KEEP/CONSIDER/SKIP/DROP recommendations
- "Keeper Eligibility Expiring" section for final-year keepers (amber warning)

---

## Pending / Known Issues

### 🔴 High Priority
1. **Railway deployment lag** — latest commits may not be live yet. Bundle hash
   `CJ_Ctni_` is our latest; if browser shows older hash, Railway is still building.
2. **gm_player_registry needs re-populate** — reload extension v1.4.7,
   click POPULATE PLAYER REGISTRY. Will now fetch ~700 players including DL/LB/DB.
3. **league_wire_articles is empty** — go to League Wire page, click
   "All Championship Marches" to generate all 16 season articles. Takes ~2–3 min.

### 🟡 Medium Priority
4. **gm_weekly_player_stats (0 rows)** — until populated, League Wire hides
   Player of the Game and Bench Regret sections (guardrails working correctly).
   To populate: fetch mMatchupScore from ESPN via extension for past seasons.
5. **standings_snapshots week=0 only** — standings show cumulative totals not
   weekly snapshots. For more granular standings, need to import per-week data.
6. **draft_picks 2011–2025** — only 2010 and 2026 have complete data.
   Other seasons show 0 keepers. Run Full Import for those seasons.

### 🟢 Enhancement Ideas
- Championship March articles for seasons with no matchup data (2011–2025)
  currently return "no_data" — need Full Import for those seasons first
- Add "Mock Draft News" article type once mock draft feature is built
- Add "Draft Pick Trade News" once transaction parsing is improved
- Weekly auto-generation of postgame reports after each week completes
- Push notifications when new League Wire articles are generated

---

## Key Technical Notes

### tRPC Router Wiring
Main router file: `server/routers.ts`
All sub-routers imported and listed in the `router({...})` call:
```typescript
leagueWire:      leagueWireRouter,
leagueNewsroom:  leagueNewsroomRouter,
playerStats:     playerStatsRouter,
playerStatsCache: playerStatsCacheRouter,
```

### LLM Calls
Use `invokeLLM` from `server/_core/llm.ts`. Already configured for Anthropic Claude.
Call type `retrospective` for articles (2048 token default, bumped to 2000 in newsroom).
Articles stored in `league_wire_articles` — never re-generated if slug exists.

### ESPN API
- `kona_player_info` with `x-fantasy-filter` header → player universe (700 players)
- `mRoster` view → team rosters
- `mMatchupScore` → weekly player scoring data
- All require SWID + espn_s2 cookies (injected via DNR rules in extension)

### Column Name Warning
`gm_player_registry` uses camelCase column names (not snake_case):
- `espnPlayerId`, `fullName`, `normalizedName`, `currentNflTeam`, `lastSeasonSeen`
Raw SQL must use camelCase. Drizzle ORM `.onDuplicateKeyUpdate` had a bug with
snake_case references — fixed by using `db.execute(drizzleSql\`...\`)` directly.

### standings_snapshots RANK column
`rank` is a reserved word in MySQL. Always backtick: `` `rank` ``

---

## How to Continue

### Start a new chat window with this context:
Paste this document and say:
"Continue development of GM War Room from this transfer doc.
Latest commit is 545b3c6. Railway may still be deploying."

### First things to verify after Railway deploys:
1. Navigate to gmwarroom.online/league-wire — should show newsroom layout
2. Click "All Championship Marches" — should generate 16 articles
3. Navigate to /player-database — should show 500+ players with ESPN photos
4. Navigate to /rosters — scroll to bottom, should see Keeper Advisor section
5. Navigate to /matchups, select season 2010, week 1 — should see Week Wrap-Up

### Next development priorities:
1. **Article improvements** — add season summary (wins/losses narrative), biggest upset
2. **Full Import for 2011–2025** — to get matchup data for more Championship March articles
3. **Weekly stats pipeline** — populate gm_weekly_player_stats to unlock POTG/bench regret
4. **AI-powered article refinements** — improve evidence builder for richer narratives
5. **Draft Pick Trade tracker** — parse rawTransaction JSON from transactions table
6. **Mock Draft feature** — generate mock draft then create news articles from it
