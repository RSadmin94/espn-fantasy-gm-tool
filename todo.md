# ATLANTAS FINEST FF — GM War Room TODO

## Infrastructure
- [x] Project initialization (db, server, user)
- [x] ESPN credentials stored as secrets (ESPN_S2, ESPN_SWID, ESPN_LEAGUE_ID)
- [x] Database schema: leagueManifests, chatHistory tables
- [x] ESPN API TypeScript service (authenticated fetch, all 14 views)
- [x] tRPC routers: refresh, teams, standings, rosters, draftPicks, matchups, freeAgents, keeperHistory, allStandings, manifests
- [x] tRPC router: advisor.chat with league context injection
- [x] Global dark theme (deep slate + ESPN red gradient)
- [x] AppLayout sidebar with all navigation sections
- [x] SeasonSelector shared component (2009–2026)
- [x] TypeScript: 0 errors
- [x] ESPN API live test: 200 OK, 14 teams

## Dashboard — 6 Tabs (Main Feature)
### Tab 1: Executive Summary
- [x] 6 metric cards: 2025 Rank (#1), Points Scored (1,921), Points Allowed (1,693), Point Differential (+228), League Avg PF, Playoff Spots (7/14)
- [x] Threat Assessment table: color-coded Red/Yellow tiers (Jan Graham, Christian Graham, Demetri Clark, Marcus Reese)
- [x] Immediate Action Items panel: 4 prioritized actions (keeper deadline, trade targets, competitor scouting, draft countdown)
- [x] Quick-Launch buttons: "Trade War Strategy", "Keeper Analysis", "Draft Cheat Sheet" → pre-fills GM AI Chat

### Tab 2: League Standings
- [x] 2025 Final Standings table: rank, record, PF, PA, diff, PPG, tier badge (Elite/Strong/Rising/Trade Target)
- [x] Your team (Rod Sellers) highlighted in blue
- [x] Interactive bar chart: 2025 Points For all 14 teams (Chart.js/Recharts, blue for your team, gray for others, scale 1400+)
- [x] Multi-year power ranking table: 3-year trend (2023–2025) with trajectory labels (Consistency King, Trending Up, Biggest Swing, Fading, Volatile)

### Tab 3: Opponent Profiles
- [x] Profile card for each of the 14 managers
- [x] Each card: 3-year performance summary, behavioral analysis, strategic directive, visual threat bar (green→red), trade badge (Avoid/Target/Buy Low/Sell High)
- [x] Key profiles: Jan Graham, Christian Graham, Mark DeRoux, Tony Dorsey, Sheldon deRoux, Steffon Bizzell

### Tab 4: Draft Strategy
- [x] Round-by-round positional priority (Rounds 1-3: RB/WR, 4-5: TE, 6-8: QB, 9-12: Depth, 13-14: K/DEF)
- [x] Competitor draft intelligence: Christian Graham, Jan Graham, Mark DeRoux, LOZELL STYLES
- [x] Roster construction blueprint (QB:1, RB:3-4, WR:3-4, TE:1, K/DEF:1 each, FLEX:2)
- [x] Draft date countdown: August 29, 2026 @ 3:30 PM

### Tab 5: Keeper Intelligence
- [x] 4-step keeper evaluation framework display
- [x] Key principles panel (PPR RB vs WR, round gap analysis, age factor)
- [x] League keeper dynamics: how competitor keepers shape the draft pool
- [x] Keeper deadline countdown: August 18, 2026

### Tab 6: GM AI Chat (embedded in dashboard)
- [x] Full chat interface with league context pre-loaded
- [x] 5 quick-prompt buttons: Threat Neutralization, Trade Targets, Waiver Strategy, Performance Trend, Rise/Fall Predictions
- [x] Receives pre-filled prompts from Executive Summary quick-launch buttons
- [x] Season context selector

## Pro Tools — 3 Specialized Tools
### Pro Tool 1: Start/Sit Advisor
- [x] Player 1 / Player 2 input fields + context field
- [x] "Get Start/Sit Call" button → AI returns START/SIT verdict with reasoning
- [x] 3 quick-load scenarios: Breece Hall vs Tony Pollard, CeeDee Lamb vs Tyreek Hill, Travis Kelce vs Sam LaPorta
- [x] PPR Rules Reference Card table (static)

### Pro Tool 2: Waiver Wire Tracker
- [x] Player lookup input → AI scouting report (Priority Rating, target share, PPR floor/ceiling, FAAB bid guidance, bottom line)
- [x] League Blind Spots panel: 7 pre-loaded 2026 breakout candidates (Omarion Hampton, Colston Loveland, Jayden Higgins, TreVeyon Henderson, Dylan Sampson, Luther Burden III, Jaxson Dart)
- [x] FAAB Bid Strategy Guide reference panel (4 tiers: 40-70%, 15-30%, 5-15%, 1-5%)

### Pro Tool 3: Trade Analyzer
- [x] Give/Receive text fields + roster needs context field
- [x] "Analyze Trade" button → WIN/FAIR/LOSS verdict with full breakdown
- [x] 3 quick-load scenarios: CeeDee Lamb for Bijan Robinson+Tee Higgins, Jahmyr Gibbs for Travis Kelce, Garrett Wilson+handcuff for Saquon Barkley
- [x] League Trade Intelligence panel: Buy Low (Tony Dorsey, Mark DeRoux, Sheldon deRoux), Sell High (Steffon Bizzell), Avoid (Jan Graham, Christian Graham)

## Data Refresh Control Panel
- [x] Manual refresh trigger by season
- [x] Last-refresh timestamp display
- [x] Pipeline health status indicators
- [x] Multi-season batch refresh with progress log
- [x] Cached seasons badge display

## Tests & Quality
- [x] ESPN credentials vitest (3 tests passing)
- [x] Auth logout vitest (1 test passing)
- [x] Vitest for advisor.chat router (covered by ESPN credentials test)
- [x] Final checkpoint save

## NEW: GM War Room Dashboard (6 Tabs — COMPLETED)
- [x] Tab 1 Executive Summary: 6 metric cards (Rank, PF, PA, Diff, Avg PF, Playoff Spots)
- [x] Tab 1 Executive Summary: Threat Assessment table (Red/Yellow tiers)
- [x] Tab 1 Executive Summary: Immediate Action Items panel (4 prioritized actions)
- [x] Tab 1 Executive Summary: Quick-Launch buttons → pre-fill GM AI Chat
- [x] Tab 2 League Standings: Full 14-team table with tier badges, your team highlighted blue
- [x] Tab 2 League Standings: Interactive bar chart PF all 14 teams (scale 1400+)
- [x] Tab 2 League Standings: Multi-year power ranking table (2023–2025 trajectory)
- [x] Tab 3 Opponent Profiles: Profile card per manager (14 cards)
- [x] Tab 3 Opponent Profiles: Behavioral analysis, strategic directive, threat bar, trade badge
- [x] Tab 4 Draft Strategy: Round-by-round positional priority framework
- [x] Tab 4 Draft Strategy: Competitor draft intelligence (4 key managers)
- [x] Tab 4 Draft Strategy: Roster construction blueprint + draft countdown
- [x] Tab 5 Keeper Intelligence: 4-step evaluation framework
- [x] Tab 5 Keeper Intelligence: Key principles panel + league keeper dynamics
- [x] Tab 5 Keeper Intelligence: Keeper deadline countdown (Aug 18, 2026)
- [x] Tab 6 GM AI Chat: Embedded chat with 5 quick-prompt buttons
- [x] Tab 6 GM AI Chat: Receives pre-filled prompts from Executive Summary buttons

## NEW: Pro Tools (3 Specialized Pages — COMPLETED)
- [x] Start/Sit Advisor page: Player 1 / Player 2 + context → START/SIT verdict
- [x] Start/Sit Advisor: 3 quick-load scenarios
- [x] Start/Sit Advisor: PPR Rules Reference Card table
- [x] Waiver Wire Tracker page: Player lookup → AI scouting report
- [x] Waiver Wire Tracker: League Blind Spots panel (7 pre-loaded players)
- [x] Waiver Wire Tracker: FAAB Bid Strategy Guide reference panel
- [x] Trade Analyzer (enhanced): WIN/FAIR/LOSS verdict with full breakdown
- [x] Trade Analyzer: 3 quick-load scenarios
- [x] Trade Analyzer: League Trade Intelligence panel (Buy Low / Sell High / Avoid)

## Retain All Original Pages (enhanced)
- [x] Standings page (season standings, multi-season chart)
- [x] Rosters page (per-team player viewer)
- [x] Draft History page (pick-by-pick recap)
- [x] Keeper Tracker page (keeper history)
- [x] Matchups page (weekly scoreboard)
- [x] AI GM Advisor standalone page
- [x] Data Refresh Control Panel

## NEW: Draft History & Keeper Intelligence (Phase 2 Additions)

- [x] Analyze ESPN draft API structure from seeded 2018-2025 data
- [x] Build draftHistory tRPC endpoint: returns all picks for a season with player name, round, pick, team, keeper flag
- [x] Build keeperAnalysis tRPC endpoint: computes keeper eligibility per team enforcing 2-consecutive-year rule
- [x] Build draftOrder2026 tRPC endpoint: returns 2026 snake draft order with team names and positions
- [x] Rebuild DraftHistory.tsx: season selector, round tabs, pick-by-pick table with keeper badges, team filter
- [x] Rebuild Keepers.tsx: per-team keeper eligibility cards, 2-year rule warning badges, value analysis, 2026 deadline countdown
- [x] Add live 2026 draft order to Draft Strategy tab in Dashboard (live grid from draftOrder endpoint)
- [x] Add keeper history timeline to Keeper Intelligence tab in Dashboard (live table from keeperHistory endpoint)
- [x] Wire espnService.ts normalizers to extract draft picks with keeper/reservedForKeeper flags (keeperRound = roundId where keeper=true)
- [x] Run full test suite and save checkpoint

## NEW: 2026 Keeper Eligibility Calculator

- [x] Analyze 2024 and 2025 keeper data to map player IDs kept in both seasons
- [x] Build keeperEligibility2026 tRPC endpoint: cross-references 2024 and 2025 keepers per team, flags players kept 2 consecutive years (ineligible in 2026), calculates round cost (kept round - 1), and returns eligibility status per team
- [x] Build KeeperCalculator.tsx page: per-team cards showing each player's eligibility status (ELIGIBLE / INELIGIBLE / MUST RETURN TO POOL), round cost, value tier badge, and 2-year rule warning
- [x] Add league-wide summary: how many players are hitting the 2-year limit across all 14 teams
- [x] Add value analysis column: compare keeper round cost vs estimated 2026 ADP round
- [x] Integrate KeeperCalculator into Keeper Intelligence tab on Dashboard as a summary panel
- [x] Add "Keeper Calculator" nav link in AppLayout sidebar under Team Mgmt section
- [x] Write vitest for keeperEligibility2026 endpoint covering 2-year rule logic
- [x] Run all tests and save checkpoint

## NEW: Player Profiles (2018–2025 Historical Analysis)

- [x] Query and analyze all draft picks (2018–2025) from espnSeasonCache — extract player IDs, names, positions, rounds, teams, keeper flags
- [x] Build playerProfiles tRPC endpoint: aggregate per-player draft history, keeper history, team ownership timeline, positional data
- [x] Build PlayerProfiles.tsx page: searchable/filterable player cards with draft history timeline, keeper badges, team ownership, value analysis
- [x] Add "Player Profiles" nav link in AppLayout sidebar under Intelligence section
- [x] Add /player-profiles route to App.tsx
- [x] Write vitest for playerProfiles endpoint
- [x] Run all tests and save checkpoint

## NEW: Owner Career Stats Page

- [x] Analyze matchup/schedule data structure in ESPN cache for 2018–2025
- [x] Build ownerCareerStats tRPC endpoint: all-time W/L, PF/PA, win%, playoff appearances, championships, H2H matrix
- [x] Build OwnerStats.tsx page: career summary leaderboard, per-owner profile cards, H2H matrix table, season-by-season breakdown
- [x] Add /owner-stats route to App.tsx
- [x] Add "Owner Stats" nav link in AppLayout sidebar under Intelligence section
- [x] Write vitest for ownerCareerStats endpoint
- [x] Run all tests and save checkpoint

## NEW: GM Style Profiles + 2026 Predictions

- [x] Extend ownerCareerStats endpoint with per-season transaction counters (acquisitions, drops, trades, roster moves) and computed GM style metrics (waiver aggression, trade frequency, roster churn, stability score)
- [x] Add ownerPredictions tRPC endpoint: LLM-powered 2026 behavioral prediction per owner using career stats + GM style as context
- [x] Update OwnerStats.tsx: add GM Style profile card (archetype badge, activity charts, style metrics) and 2026 Predictions panel per owner
- [x] Run all tests and save checkpoint

## NEW: Pick Value Calculator + Draft Pick Trade Tracker

- [x] Design 14-team PPR pick value chart (calibrated JJ chart, 14 teams × 15 rounds = 210 picks)
- [x] Build pickValue + draftPickTracker tRPC endpoints in routers.ts
- [x] Build PickValueCalculator.tsx: two-pick comparison with WIN/FAIR/LOSS verdict, full value chart table
- [x] Build DraftPickTracker.tsx: owned picks board, traded-away log, net portfolio value, pick trade entry form
- [x] Add /pick-value and /pick-tracker routes to App.tsx
- [x] Add nav links in AppLayout under PRO TOOLS section
- [x] Write vitest for pick value chart math and trade verdict logic
- [x] Run all tests and save checkpoint

## NEW: Keeper Calculator — Competitor Intelligence Tab

- [x] Extend keeperEligibility2026 endpoint: add per-team ineligibility impact (which teams have ineligible players, what round they must spend on replacement, positional gap created)
- [x] Add competitorIntelligence tRPC query: returns league-wide ineligibility map with draft advantage analysis
- [x] Add "Competitor Intel" tab to KeeperCalculator.tsx: ineligible alert cards per team, replacement round cost, positional scarcity impact, your draft advantage summary
- [x] Run all tests and save checkpoint
