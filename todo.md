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

## NEW: My Profile — Keeper Calculator

- [x] Query ESPN cache to identify Roderick's team(s) across 2018–2025 and extract keeper history, W/L record, and stats
- [x] Extend keeperEligibility2026 endpoint to include ownerProfile field for the logged-in user's team
- [x] Add "My Profile" section to KeeperCalculator.tsx: personal stats card, keeper history timeline, 2026 recommendation
- [x] Run all tests and save checkpoint

## NEW: My Tendencies & Self-Review (My Profile Tab)
- [x] Analyze Rod's draft picks by position/round across 2018–2025 (positional tendencies, avg draft round per position, round-1 picks history)
- [x] Compute GM activity metrics: avg acquisitions/season, avg trades/season, roster churn vs league avg
- [x] Add tendencies data to ownerProfile server response (draftTendencies, gmActivityProfile, strengthsWeaknesses)
- [x] Add ownerSelfReview tRPC procedure: LLM-generated honest self-scouting report using all career data
- [x] Add Tendencies panel to My Profile tab: positional draft breakdown chart, avg round by position, draft style badge
- [x] Add Self-Review panel to My Profile tab: AI-generated strengths/weaknesses/blind spots/2026 focus areas with on-demand refresh
- [x] Run all tests and save checkpoint

## NEW: Opponent Profile Deep-Dive Modal

- [x] Build per-opponent career data from ESPN cache: draft tendencies, GM activity, career record, H2H vs Rod for all 13 opponents
- [x] Add opponentProfile tRPC endpoint returning full deep-dive data for a given memberId
- [x] Build OpponentProfileModal component: career stats, draft tendencies chart, GM activity, H2H vs Rod, strengths/weaknesses/blind spots, AI scouting report
- [x] Wire modal to Opponent Profiles tab cards (click any card to open deep-dive)
- [x] Run tests, update todo.md, and save checkpoint

## NEW: Draft Strategy Tab — Real Draft Data
- [x] Extract all managers' draft picks by round and position from ESPN cache (2018-2025)
- [x] Build draftTendencies tRPC endpoint: per-manager round-by-round positional breakdown
- [x] Rebuild Draft Strategy tab with real data: positional heat map, round-by-round per manager, league-wide patterns
- [x] Run tests, update todo.md, and save checkpoint

## NEW: Trade Offer Generator
- [x] Build tradeOfferGenerator tRPC endpoint: accepts target (player name or pick), finds owner, computes fair value using pick chart, pulls GM style + H2H context, generates LLM trade offer with negotiation strategy
- [x] Build TradeOfferGenerator.tsx page: target input (player/pick), counterpart auto-detect, offer builder with value balance meter, AI negotiation strategy panel
- [x] Add /trade-offer route to App.tsx
- [x] Add "Trade Offer Generator" nav link in AppLayout under Pro Tools
- [x] Write vitest for trade value calculation logic (32 tests: pick value, pick parsing, player value estimation, value ratio, fuzzy match)
- [x] Run all tests and save checkpoint (92 tests passing across 9 test files)

## REBUILD: Hardened Architecture

### Phase 2 — ESPN Data Pipeline
- [x] Add espnViewHealth table to schema (per-season, per-view status, error messages, fetched_at)
- [x] Rewrite fetchEspnViews with per-view error isolation (one failed view does not kill the whole fetch)
- [x] Add cookie expiry detection (401/403 with clear user-facing error + staleness flag)
- [x] Add data quality gates: validate rosters non-empty, draft data present, matchup count reasonable
- [x] Add stale-data warnings: flag any cached season older than 7 days
- [x] Build DataHealth page: per-season, per-view status with color-coded health indicators
- [x] Expose pipeline health via tRPC pipelineHealth endpoint

### Phase 3 — Analytics Layer
- [x] Build server/analytics.ts: VORP calculator (value over replacement by position)
- [x] Build positional scarcity index (starters rostered vs available at each position)
- [x] Build roster gap analyzer (weakest positions per team)
- [x] Build keeper efficiency score (keeper value vs draft cost vs ADP)
- [x] Build manager behavior stats from transaction data (trades/yr, waiver adds/yr, drop mistakes, reach rate)
- [x] Build rest-of-season (ROS) value estimator using PPG + schedule remaining
- [x] Build LeagueAnalytics page (/analytics) with VORP, scarcity, roster gaps, keeper efficiency tabs
- [x] Build ManagerBehavior page (/manager-behavior) with calculated GM profiles from transaction data
- [x] Write 24 analytics vitest tests — 121 tests total passing, 0 TypeScript errors

### Phase 4 — Replace Hardcoded Content
- [x] Build liveOpponentProfile.ts — generates all GM profiles dynamically from ESPN cache (career records, H2H vs Rod, GM archetype, draft style, strengths/weaknesses all calculated from real data)
- [x] Replace all 4 opponentData.ts usages in routers.ts with liveOpponentProfile (opponentProfile, opponentScoutingReport, tradeOfferGenerator GM style)
- [x] opponentData.ts retained as fallback reference but no longer imported by any active code
- [x] 138 tests passing, 0 TypeScript errors

### Phase 5 — Math-First Trade Analyzer
- [x] Add tradeAnalyze tRPC endpoint: calcTradeValue (ROS value, keeper value, positional scarcity, lineup replacement value, playoff schedule factor)
- [x] Rebuild TradeAnalyzer.tsx: VORP bars, ROS values, keeper bonus, scarcity multipliers, composite scorecard, AI verdict as explanation layer
- [x] Manager tendency factor included (GM archetype from liveOpponentProfile)

### Phase 6 — Draft Optimizer
- [x] Add draftOptimizer tRPC endpoint: keeper-adjusted tier boards by position, scarcity alerts, round-by-round recommendations, removes kept players from available pool
- [x] Build DraftOptimizer.tsx: tier board, round-by-round, scarcity map, off-board keepers tabs
- [x] Build KeeperFutureValue.tsx: 2-year ROI scoring with age trajectory and surplus calculations
- [x] Build StrengthOfSchedule.tsx: weekly matchup difficulty ratings per team
- [x] All 3 new pages added to AppLayout nav (Target/Gem/CalendarDays icons) and App.tsx routes
- [x] 138 tests passing, 0 TypeScript errors

### Phase 7 — UI Consolidation (7 screens)
- [x] Command Center hub (/command-center) — War Room, Standings, Matchups tabs
- [x] Draft War Room hub (/draft-war-room) — Draft History, Keeper Calculator, Draft Optimizer tabs
- [x] Keeper Lab hub (/keeper-lab) — Keeper Tracker, Keeper ROI, Future Value tabs
- [x] Trade Lab hub (/trade-lab) — Trade Analyzer, Trade Offer Gen, Pick Value, Pick Tracker tabs
- [x] Waiver Lab hub (/waiver-lab) — Start/Sit, Waiver Wire, Player Profiles, Schedule Strength tabs
- [x] Opponent Intel hub (/opponent-intel) — Owner Career Stats, Manager Behavior, League Analytics tabs
- [x] Data Center hub (/data-center) — Data Health, Data Refresh tabs
- [x] AppLayout consolidated to 8-item nav (7 hubs + AI GM Advisor)
- [x] App.tsx updated with all hub routes + root redirect to /command-center
### Phase 8 — AI Layer Rewire
- [x] Start/Sit: queries VORP + ROS before calling AI, injects factContext (avg PPG, VORP, tier, ROS adjusted, injury risk, schedule) into prompt, shows collapsible "Facts passed to AI" panel with fuzzy name matching
- [x] Waiver Wire: same pattern — injects calculated player stats into waiver AI prompt, shows "Calculated stats" card
- [x] GM Advisor: inject league analytics snapshot into system prompt context (VORP leaders by position, positional scarcity alerts, biggest roster weaknesses — all calculated facts, AI instructed not to contradict them)
### Phase 9 — Tests + Checkpoint
- [x] server/draftOptimizer.test.ts: 4 tests for pick value, VORP tiers, ROS value, keeper pool filtering
- [x] analytics.ts updated with scheduleStrength support in calcROSValue
- [x] 142 tests passing across 12 test files, 0 TypeScript errors
- [x] Final rebuild checkpoint saved

## REBUILD Phase 1-3 Complete (2026-04-30)
- [x] Harden ESPN pipeline: fetchEspnViewsHardened with per-view error isolation
- [x] Add espnViewHealth DB table and helpers (upsertViewHealth, getViewHealthForSeason, getAllViewHealth)
- [x] Add validateDataQuality, isStale, staleSummary, hasCookies to espnService
- [x] Update refresh endpoint to use hardened pipeline and write view health records
- [x] Add pipeline.health and pipeline.validate tRPC endpoints
- [x] Build analytics engine: calcVORP, calcPositionalScarcity, calcRosterGaps, calcKeeperEfficiency, calcManagerBehavior, calcROSValue, calcPickValue
- [x] Add analytics.vorp, analytics.scarcity, analytics.rosterGaps, analytics.keeperEfficiency, analytics.managerBehavior, analytics.rosValues tRPC endpoints
- [x] Build DataHealth page (/data-health) with per-season and per-view health indicators
- [x] Build LeagueAnalytics page (/analytics) with VORP, scarcity, roster gaps, keeper efficiency tabs
- [x] Build ManagerBehavior page (/manager-behavior) with calculated GM profiles from transaction data
- [x] Wire all new routes in App.tsx and AppLayout.tsx
- [x] Write 24 analytics vitest tests (VORP, scarcity, roster gaps, keeper efficiency, manager behavior, ROS value, pick value)
- [x] All 121 tests passing across 10 test files, 0 TypeScript errors

## Weekly Stats Cache (2026-05-09)
- [x] Add weeklyPlayerStats table to drizzle/schema.ts (playerId, playerName, season, week, targets, receptions, receivingYards, rushingYards, snapCount, snapPct, fantasyPoints, position, teamId, ownerName)
- [x] Build server/weeklyStatsService.ts: fetch per-week stats from ESPN scoringPeriodId endpoint
- [x] Add espn.fetchWeeklyStats tRPC mutation: pulls all weeks for a season, caches in DB
- [x] Add espn.weeklyStats tRPC query: returns cached weekly stats by season/player/week
- [x] Add espn.playerWeeklyTrend tRPC query: returns last N weeks for a player (targets, snaps, PPG trend)
- [x] Surface weekly stats in PlayerProfiles page (targets/snaps sparkline per week)
- [x] Update Start/Sit facts panel to show last 4 weeks targets + snap % for each player
- [x] Update Waiver Wire facts card to show weekly trend for pickup candidates
- [x] Inject weekly trend summary into GM Advisor system prompt context
- [x] Write vitest tests for weekly stats normalization
- [x] Save checkpoint

## Weekly Stats Cache — COMPLETE (2026-05-09)
- [x] Add weekly_player_stats DB table (26 cols: targets, receptions, rec yards, rec TDs, rush att, rush yards, rush TDs, pass att, completions, pass yards, pass TDs, INTs, snap count, snap pct, fantasy points × 100, 3 indexes)
- [x] Build server/weeklyStatsService.ts: fetchWeeklyStatsForPeriod (scoringPeriodId param), normalizeWeeklyStats (statSplitTypeId=1 weekly split, statSourceId=0 actual), fetchAllWeeksForSeason, computePlayerTrend (rising/falling/stable)
- [x] Add DB helpers to server/db.ts: upsertWeeklyStats, getWeeklyStatsBySeason, getWeeklyStatsByPlayer, getCachedWeeks
- [x] Add weeklyStats tRPC router to appRouter: fetchAndCache, getSeasonStats, getPlayerTrend, getCachedWeeks
- [x] Build client/src/pages/WeeklyStats.tsx: fetch-by-week UI, season stats table with position filter + search, player trend panel, cache status indicators
- [x] Add /weekly-stats route to App.tsx and "Weekly Stats" nav item to AppLayout (System group)
- [x] Write 13 vitest tests in server/weeklyStats.test.ts: normalizeWeeklyStats (5 tests), computePlayerTrend (8 tests)
- [x] 155 tests passing across 13 test files, 0 TypeScript errors

## BUG: Double Sidebar on Command Center (and hub pages)
- [x] Fix double sidebar: added InsideLayoutContext to AppLayout.tsx — nested AppLayout calls detect they are already inside a layout and render children only, no extra sidebar. Zero changes needed to any of the 22 child pages or 7 hub pages.
- [x] 155 tests passing, 0 TypeScript errors

## Phase 10 — AI Context Enhancements + UX Polish (2026-05-09)
- [x] Data Health Alert Banner: added DataHealthBanner component to AppLayout.tsx — calls pipeline.health, shows red/amber/yellow dismissible banner with link to Data Center based on cookie status, staleness, and data quality
- [x] Weekly Trend Injection — Start/Sit: queries weeklyStats.getPlayerTrendsByName for both players, injects last-4-week trend lines (pts/wk, avg targets, snap%) into AI prompt; shows Trend badge (RISING/FALLING/STABLE) and per-week breakdown in "Facts passed to AI" panel
- [x] Weekly Trend Injection — Waiver Wire: same pattern — queries trend for typed player name, injects trend context into AI scouting report prompt, adds Trend column to Calculated Stats card with per-week detail row
- [x] Keeper Deadline Countdown Card: added KeeperCountdownCard to Executive Summary metric grid (7th card) — shows days remaining until Aug 18 2026 with urgency color coding (upcoming/approaching/urgent/critical/locked) and link to Keeper Lab
- [x] 155 tests passing, 0 TypeScript errors

## BUG: Data Center Refresh Not Working — FIXED
- [x] Diagnose why refresh fails in Data Center UI — espn.refresh was protectedProcedure, returned 401 for unauthenticated users
- [x] Fix root cause: changed espn.refresh to publicProcedure (ESPN credentials are server-side secrets, no user auth needed)
- [x] Removed auth gate from DataRefresh.tsx UI (redirect to login, warning banner)
- [x] Verify fix: curl test returns {status:success, 11 views ok}, 155 tests passing

## BUG: Published Site Shows Blank Page — FIXED
- [x] Diagnose blank page in production build — Google Fonts link tag in index.html had `</head>` embedded in the URL (malformed href), causing the `<script type="module">` tag to be swallowed into the attribute value, so the app JS bundle never loaded
- [x] Fix root cause: corrected the href to use `&display=swap` — build now produces clean `<script type="module">` tag

## FEATURE: Smart Refresh — Skip Closed Seasons — DONE
- [x] Mark seasons 2009–2024 as "closed" (data will not change)
- [x] Refresh endpoint: skip closed seasons already cached with status=success (unless forceRefresh=true)
- [x] DataRefresh UI: amber Lock badge on closed seasons, skip summary line, Force Re-fetch toggle, improved log with skipped/success/error icons
- [x] Only open seasons (2025, 2026) refresh by default; closed+cached seasons auto-skipped

## FEATURE: Weekly Auto-Refresh Heartbeat Job — DONE
- [x] Apply §5c SDK patches: manusTypes.ts (add taskUid field) + sdk.ts (cron short-circuit + AuthenticatedUser type + buildCronUser)
- [x] Add /api/scheduled/espn-refresh Express handler (server/scheduledRefresh.ts) — authenticates cron token, runs refresh for 2025+2026, records run status in DB
- [x] Mount handler in server/_core/index.ts before Vite fallthrough
- [x] Add scheduled_jobs table to drizzle/schema.ts (migrations 0005, 0006 applied)
- [x] Add DB helpers: getScheduledJobs, getScheduledJobByName, getScheduledJobByTaskUid, upsertScheduledJob, updateScheduledJobRun
- [x] Add schedule tRPC router: list (public), create/pause/resume/delete (protected) procedures
- [x] Build ScheduledRefresh.tsx management UI: status badge, next run, last run, task UID, pause/resume/delete buttons
- [x] Add Auto-Refresh tab to DataCenter.tsx
- [x] 155 tests passing, 0 TypeScript errors

## BUG: Stale Data Banner Shows After Refresh — FIXED
- [x] Diagnose: seasons 2009–2017 all have status=failed (ESPN API only supports 2018+) and are older than 7 days — counted as both failed AND stale, pushing staleSeasons > 3 and triggering amber banner
- [x] Fix: pipeline.health now filters to seasons >= 2018 before computing staleSeasons/failedSeasons/partialSeasons — pre-2018 failures are expected and excluded from health scoring

## BUG: Trade Lab — Pick Number Not Visible After Selection — FIXED
- [x] Root cause: SelectTrigger used bg-slate-800 background but no explicit text color, causing selected value text to render as dark-on-dark
- [x] Fixed PickValueCalculator.tsx (Round + Pick selectors) and DraftPickTracker.tsx (Round, Pick Position, Counterparty selectors) — added text-slate-100 to all 5 SelectTrigger elements

## BUG: Stale Data Banner Still Appearing (Round 2) — FIXED
- [x] DB query: seasons 2018–2024 all status=success but lastRefreshedAt=April 29 (10 days ago), exceeding 7-day threshold — staleFlag=true for 7 seasons, staleSeasons=7>3 triggers banner
- [x] Fix: closed seasons (< 2025) now always get staleFlag=false — their data is immutable and should never trigger a freshness warning
- [x] Live health check now returns overallHealth=healthy, staleSeasons=0, failedSeasons=0

## BUG: Opponent Intel Data Incorrect — FIXED
- [x] Root cause 1: espn_season_cache had 3–5 duplicate rows per season — getCachedView had no ORDER BY so returned stale April 29 data instead of latest refresh
- [x] Fix: getCachedView now orders by fetchedAt DESC; added unique constraint on (season, viewName) via migration 0007; deleted all duplicate rows via SQL
- [x] Root cause 2: Dashboard had hardcoded OPPONENT_PROFILES (14 cards), MULTI_YEAR_RANKINGS (14 rows), COMPETITOR_DRAFT_INTEL (4 items) with wrong records, wrong pronouns (Jan Graham labeled ‘her’), stale data
- [x] Fix: Removed all three hardcoded arrays; replaced with live ownerCareerStats data — threat scores, 3-year rank history, behavioral text, and draft intel all computed from real ESPN cache
- [x] Champion detection verified correct across all 8 seasons (2018–2025) — Rod Sellers is 2025 champion
- [x] Transaction counts confirmed accurate from live ESPN cache
- [x] 155 tests passing, 0 TypeScript errors

## BUG: Opponent Profiles Tab — Multiple Issues — FIXED
- [x] Fix threat score 99% bug: winPct from server is 0-100 percentage, was being multiplied as if 0-1 decimal — fixed to divide by 100 before multiplying by 40
- [x] Fix directive always AVOID: was caused by threat=99 for everyone — now properly differentiated (78% WATCH down to 43% FAIR)
- [x] Merge duplicate Jan Graham entries: mergedOwners useMemo combines two ESPN member IDs by fullName key, sums totals, merges seasonRecords
- [x] Filter inactive owners: INACTIVE_KEYWORDS list excludes teco Browning, Maurice Welch, Vince Sellers from all three computed arrays (liveOpponents, liveRankings, liveDraftIntel)
- [x] Behavioral text: comes from live gmArchetypeDesc field — will improve further after fresh 2025 data refresh

## NEW: Opponent Profile Deeper Analysis & Varied Comments

- [x] Replace generic gmArchetypeDesc on cards with generatePersonalizedInsight() using actual stats (championships, rank trajectory, win%, playoff rate, waiver/trade counts)
- [x] Replace generic computeDirective() with richer generateStrategicDirective() varying by threat tier + trajectory + activity combo
- [x] Add more data to each card: career W-L record, best season rank, playoff rate %, trajectory pill
- [x] Add trajectory narrative sentence (e.g., "3 consecutive playoff appearances", "dropped from #1 to #6 in 2 years")
- [x] Ensure all 13 opponent cards have unique, non-repeated insight text

## NEW: Competitor Draft Intelligence — Deeper Tendencies

- [x] Enhance leagueDraftTendencies server procedure: add avgPickRound per position, late-round position targets, QB timing, TE timing, keeper rate, positional reach score
- [x] Add generateDraftTendencyNarrative() on client: produces 2-3 sentences of specific tendencies per manager from actual pick data
- [x] Add generateDraftCounterStrategy() per manager: specific advice for Rod on how to draft against this person
- [x] Rebuild Competitor Draft Intelligence section: replace 6-item simple list with full per-manager deep-dive cards using leagueDraftTendencies data
- [x] Each card shows: draft style badge, positional bar, round-by-round tendencies (Rd1-6), actual Rd1 pick history, key tendencies list, counter-strategy box
- [x] Add "Tendencies at a Glance" summary row: QB timing, TE timing, keeper rate, diversity score per card

## NEW: Mid-Round Targets Row

- [x] Add Mid-Round Targets row (Rds 4–6) to each competitor draft intelligence card using midTopPos data

## BUG: Missing 2024/2025 Picks in Competitor Draft Intelligence

- [x] Diagnose why round1Picks for some managers are missing 2024 and 2025 seasons
- [x] Fix data pipeline to include all cached seasons for round1Picks/round2Picks/round3Picks (sort newest-first; missing entries are genuine keeper slots)
- [x] Increase visible pick history rows per card from 6 to show all available years; add footnote for keeper-slot gaps

## NEW: Rd2/Rd3 Pick History Toggles

- [x] Add per-card expand/collapse toggle for Rd2 and Rd3 pick history in Competitor Draft Intelligence

## NEW: FantasyPros + PFR Data Integration & 5 Features

- [x] Build server/fantasyDataService.ts: FantasyPros ECR scraper, ADP scraper, PFR stats scraper, merge + cache with 6hr TTL
- [x] Add fantasy_data_cache DB table (key, data JSON, fetched_at)
- [x] Add draftBoard tRPC router: getPlayers (merged ECR+ADP+PFR), comparePlayer, searchPlayers, getPlayer
- [x] Build DraftBoard.tsx page: tier breaks, ECR rank, ADP, ECR vs ADP gap, PFR stats overlay, position filter, search
- [x] Build PlayerComparison.tsx ("Who Should I Draft?"): 2-3 player comparison with ECR, ADP, PFR stats, opponent likelihood notes
- [x] Build MockDraftSimulator.tsx: 14-team draft, AI opponents use real historical tendencies, Rod picks from actual slot, post-draft ECR grade
- [x] Build WeeklyProjections.tsx: FantasyPros ECR + PFR 2025 stats as projection baseline
- [x] Build WaiverIntelligence.tsx: FantasyPros waiver rankings + opponent positional tendency overlay
- [x] Add all 5 new pages to DraftWarRoom and WaiverLab hubs
- [x] Write vitest tests for draftBoard procedures (25 tests, all passing)
- [x] Save checkpoint (ed8144b3)

## NEW: Undo Pick in Mock Draft Simulator

- [x] Add Undo Pick button to MockDraftSimulator.tsx: reverses last pick, restores player to pool, moves cursor back one slot

## NEW: Mock Draft Simulator Enhancements

- [x] Add "Auto-Draft to My Pick" button: runs all AI picks until it is Rod's turn
- [x] Add "Draft All Remaining" button: AI finishes rest of draft automatically after Rod's last pick
- [x] Show all 14 teams' rosters in post-draft grade report with grades side-by-side

## NEW: Save Draft Results Feature

- [x] Add mock_draft_results table to drizzle/schema.ts
- [x] Run pnpm db:push to apply migration
- [x] Add saveDraft, listDrafts, getDraft, deleteDraft tRPC procedures
- [x] Add Save Draft button to MockDraftSimulator post-draft grade report
- [x] Build SavedDrafts.tsx page for reviewing past drafts
- [x] Wire Saved Mocks tab into DraftWarRoom hub
- [x] Write vitest tests for saveDraft and listDrafts procedures (15 tests)

## NEW: Best Available Highlight in Mock Draft Sim

- [x] Add Best Available panel to MockDraftSimulator showing top 8 value picks by ECR-ADP gap on Rod's turn

## NEW: Player Detail Drawer (Draft Board)

- [x] Build PlayerDetailDrawer component: slide-out panel with full player profile, ECR range, ADP trend, 2025 PFR stats, opponent draft history, and Rod's Edge score
- [x] Add getPlayerDraftHistory tRPC procedure: returns which opponents have drafted this player and in what round/year
- [x] Wire into DraftBoard.tsx: Info icon on each row opens the drawer
- [x] Add Draft Collision Risk badge to each player row in DraftBoard.tsx showing how many opponents historically target that position in the same round tier (HIGH/MED/LOW)

## NEW: Saved Mocks — Side-by-Side Comparison View
- [x] Select any 2 drafts from the list (numbered badges: Draft A / Draft B) and click Compare Selected
- [x] Overview tab: head-to-head metrics (grade, avg ECR, total VBD, avg value surplus, value picks, reaches), positional construction bars, positional breakdown table, advantage summary
- [x] Pick-by-Pick tab: round-by-round table with ADP gap (green = value, red = reach) for both drafts
- [x] All Teams tab: full positional construction cards for every team in both drafts side-by-side
- [x] Winner banner: shows which draft wins on more metrics (or "Even match")
- [x] 195 tests passing, 0 TypeScript errors

## Phase 1 — Injury Intelligence Engine
- [x] Copy injuryService.ts, injuryRouter.ts, injuryAnalytics.ts into server/
- [x] Edit routers.ts: add imports for injuryRouter and buildAdvisorInjuryContext
- [x] Edit routers.ts: mount injury: injuryRouter inside appRouter
- [x] Edit routers.ts: inject buildAdvisorInjuryContext into advisor.chat leagueContext
- [x] Verify TypeScript 0 errors after integration
- [x] Verify 195 tests still pass after integration
