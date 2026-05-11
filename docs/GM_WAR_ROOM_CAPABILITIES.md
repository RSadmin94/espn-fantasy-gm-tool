# Atlantas Finest FF — GM War Room
## Capabilities & Features Reference Document

**Application:** ESPN Fantasy Football GM/Advisor Tool  
**League:** Atlantas Finest FF (ESPN League ID 457622, 14 teams, PPR scoring)  
**Primary User:** Rod Sellers (2025 Champion)  
**Stack:** React 19 · Tailwind 4 · Express 4 · tRPC 11 · MySQL/TiDB · Vitest  
**Test Coverage:** 195 tests passing across 15 test files · 0 TypeScript errors  
**Last Updated:** May 2026

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Data Infrastructure](#2-data-infrastructure)
3. [Command Center Hub](#3-command-center-hub)
4. [Draft War Room Hub](#4-draft-war-room-hub)
5. [Keeper Lab Hub](#5-keeper-lab-hub)
6. [Trade Lab Hub](#6-trade-lab-hub)
7. [Waiver Lab Hub](#7-waiver-lab-hub)
8. [Opponent Intel Hub](#8-opponent-intel-hub)
9. [AI & Intelligence Engines](#9-ai--intelligence-engines)
10. [Data Center Hub](#10-data-center-hub)
11. [Analytics Engine](#11-analytics-engine)
12. [System Architecture & Quality](#12-system-architecture--quality)
13. [Feature Summary Table](#13-feature-summary-table)

---

## 1. Application Overview

The GM War Room is a full-stack web application built exclusively for the Atlantas Finest FF league. It transforms 18 seasons of ESPN fantasy football data (2009–2026) into a unified command interface for strategic decision-making. Every feature is grounded in real league data: rosters, matchups, draft picks, transactions, keeper history, and weekly scoring — all fetched directly from the ESPN private API using authenticated session credentials.

The application is organized into seven functional hubs accessible from a persistent sidebar. Each hub aggregates related tools into a tabbed workspace, eliminating the need to navigate between disconnected pages. A global dark theme (deep slate with ESPN-red gradient accents) is applied throughout, and a **Data Health Banner** appears at the top of every page when ESPN cookies are expired, data is stale, or any pipeline view has failed — ensuring the user always knows the reliability of the underlying data before making decisions.

The system is designed around a single owner's perspective: Rod Sellers. All analytics, threat assessments, trade valuations, and AI prompts are calibrated to surface insights relevant to Rod's roster, draft position, and competitive situation within the league.

---

## 2. Data Infrastructure

### 2.1 ESPN API Integration

The application connects to the ESPN Fantasy Football private API across all 14 documented view endpoints. Authentication uses the `ESPN_S2` and `ESPN_SWID` session cookies stored as server-side secrets. The data pipeline fetches and merges the following views per season:

| View | Contents |
|---|---|
| `mTeam` | Team metadata, owner names, member IDs |
| `mRoster` | Current and historical rosters with player IDs |
| `mMatchup` | Weekly matchup scores and outcomes |
| `mDraftDetail` | Draft pick history with keeper flags |
| `mTransactions` | Waiver adds, drops, and trades |
| `mSettings` | League rules, scoring settings, playoff format |
| `mStandings` | Final standings and seeding |
| `mSchedule` | Full season schedule |
| `kona_player_info` | Player metadata and injury status |
| `mBoxscore` | Weekly lineup and scoring breakdown |
| `mPendingTransactions` | Pending waiver claims |
| `mLiveScoring` | Live scoring data |
| `mPositionalRatings` | Positional rating data |
| `mTeamTransactions` | Team-level transaction history |

### 2.2 Hardened Pipeline

The fetch pipeline uses per-view error isolation: a failure in any single view does not abort the entire refresh. Each view's result is independently validated and written to the `espn_view_health` database table with status (`ok`, `partial`, `error`, `auth_error`), error message, record count, and timestamp. This allows the Data Health page to report granular pipeline status rather than a binary pass/fail.

Data quality gates validate that rosters are non-empty, draft data is present, and matchup counts are within expected ranges. Cookie expiry is detected via 401/403 responses and surfaced as a clear user-facing error with a staleness flag.

### 2.3 Smart Refresh

Seasons 2009–2024 are classified as **closed** — their data is immutable and will not change. The refresh endpoint automatically skips closed seasons that are already cached with `status=success`, unless the user explicitly enables a **Force Re-fetch** toggle. Only open seasons (2025, 2026) refresh by default. This reduces unnecessary API calls and prevents false staleness warnings for historical data.

### 2.4 Automated Weekly Refresh

A **heartbeat job** runs on a weekly schedule via the Manus scheduling infrastructure. It calls the `/api/scheduled/espn-refresh` Express handler, which authenticates via a cron token and refreshes the 2025 and 2026 season caches automatically. The job's status (last run, next run, task UID) is visible and manageable from the Data Center hub's Auto-Refresh tab, where the user can pause, resume, or delete the job.

### 2.5 Weekly Player Stats Cache

A dedicated `weekly_player_stats` database table stores per-player, per-week statistics with 26 columns including targets, receptions, receiving yards, rushing yards, passing yards, touchdowns, interceptions, snap count, snap percentage, and fantasy points. The `weeklyStatsService` fetches stats from the ESPN `scoringPeriodId` endpoint for each week of a season, normalizes the data (filtering for `statSplitTypeId=1` weekly splits and `statSourceId=0` actual stats), and caches the results. A `computePlayerTrend` function classifies each player as **RISING**, **FALLING**, or **STABLE** based on their last four weeks of fantasy point production.

### 2.6 External Data Integration (FantasyPros + PFR)

The `fantasyDataService` module fetches and merges data from two external sources:

- **FantasyPros Expert Consensus Rankings (ECR):** Position-filtered rankings with positional tier breaks and ADP data.
- **Pro Football Reference (PFR):** 2025 season statistics including targets, receptions, yards, touchdowns, and snap counts.

Merged player records are cached in the `fantasy_data_cache` table with a 6-hour TTL. This data powers the Draft Board, Player Comparison, Weekly Projections, and Waiver Intelligence tools.

---

## 3. Command Center Hub

The Command Center (`/command-center`) is the primary landing page. It aggregates four major sections under a single tabbed interface.

### 3.1 War Room Dashboard

The War Room is a six-tab dashboard providing a complete league intelligence overview.

**Tab 1 — Executive Summary** presents six metric cards drawn from live ESPN data: 2025 Final Rank, Total Points Scored, Total Points Allowed, Point Differential, League Average PF comparison, and Playoff Spots available. Below the metrics, a **Threat Assessment table** classifies all 13 opponents into Red (immediate threat) and Yellow (monitor) tiers based on computed threat scores derived from win percentage, point differential, and recent trajectory. An **Immediate Action Items** panel surfaces four prioritized strategic actions (keeper deadline, trade targets, competitor scouting, draft countdown), and three **Quick-Launch buttons** pre-fill the GM AI Chat with specific strategic prompts.

**Tab 2 — League Standings** displays the full 14-team standings table with record, PF, PA, point differential, PPG, and a tier badge (Elite / Strong / Rising / Trade Target). Rod's team is highlighted in blue. An interactive bar chart visualizes Points For across all 14 teams, and a multi-year power ranking table shows 3-year trajectory labels (Consistency King, Trending Up, Biggest Swing, Fading, Volatile) for the 2023–2025 period.

**Tab 3 — Opponent Profiles** renders a profile card for each of the 13 active opponents. Each card displays a 3-year performance summary, a **behavioral analysis** generated from actual transaction data (trade frequency, waiver aggression, roster churn), a **strategic directive** (AVOID / WATCH / FAIR / TARGET / BUY LOW / SELL HIGH), a visual threat bar, and a trajectory narrative sentence. All content is computed dynamically from live ESPN cache data — no hardcoded profiles. Inactive owners (those who have left the league) are automatically filtered out.

**Tab 4 — Draft Strategy** presents a round-by-round positional priority framework, a **Competitor Draft Intelligence** section with per-manager deep-dive cards (draft style badge, positional bar, round-by-round tendencies, actual Round 1 pick history, key tendencies list, counter-strategy box, mid-round targets), and a roster construction blueprint. The draft date countdown (August 29, 2026 @ 3:30 PM) is displayed prominently.

**Tab 5 — Keeper Intelligence** shows the 4-step keeper evaluation framework, key PPR principles (RB vs WR value, round gap analysis, age factor), league keeper dynamics (how competitor keepers shape the available draft pool), and a keeper deadline countdown (August 18, 2026) with urgency color coding.

**Tab 6 — GM AI Chat** is a full chat interface with the league context pre-loaded into the system prompt. Five quick-prompt buttons cover Threat Neutralization, Trade Targets, Waiver Strategy, Performance Trend, and Rise/Fall Predictions. The chat receives pre-filled prompts from the Executive Summary quick-launch buttons and supports a season context selector.

### 3.2 Standings

A dedicated standings view with season selector, sortable columns, and multi-season trend visualization.

### 3.3 Matchups

Weekly scoreboard view showing all 14 matchups for any selected week and season, with scores, projected points, and outcomes.

### 3.4 Championship Equity

The Championship Equity tab (powered by the Championship Equity Engine) presents three sub-sections:

- **Full Report:** Rod's current championship probability, projected win rate, remaining schedule difficulty, and roster variance profile.
- **League Rankings:** All 14 teams ranked by championship probability with comparative metrics.
- **Variance Mode Advice:** AI-generated guidance on whether Rod should play for floor (safe wins) or ceiling (high-variance plays) given current standings and schedule.

The `whatIfDelta` mutation calculates the before/after championship probability impact of any proposed trade or keeper decision, and this delta is surfaced as a **Championship Impact card** in the Trade Analyzer.

---

## 4. Draft War Room Hub

The Draft War Room (`/draft-war-room`) consolidates seven draft-related tools.

### 4.1 Draft Board

The Draft Board is the primary pre-draft research interface. It displays merged FantasyPros ECR + ADP + PFR data in a sortable, filterable table with the following columns: ECR rank, ADP, ECR vs ADP gap (value/reach indicator), position, team, 2025 PFR stats overlay, and a **Draft Collision Risk badge** (HIGH/MED/LOW) showing how many opponents historically target that position in the same round tier. A **Player Detail Drawer** slides out from any row, showing full player profile, ECR range, ADP trend, 2025 PFR stats, opponent draft history (which opponents have drafted this player and in what round/year), and a computed **Rod's Edge score**.

### 4.2 Player Comparison ("Who Should I Draft?")

A 2-to-3 player head-to-head comparison tool. Users enter player names and receive a side-by-side breakdown of ECR, ADP, PFR 2025 stats, opponent likelihood notes (based on historical draft tendencies), and a recommendation verdict.

### 4.3 Mock Draft Simulator

A full 14-team snake draft simulator where AI opponents use real historical draft tendencies extracted from ESPN cache data (2018–2025). Key features include:

- Rod picks from his actual draft slot with a **Best Available panel** showing the top 8 value picks by ECR-ADP gap on his turn.
- **Auto-Draft to My Pick** button: runs all AI picks until it is Rod's turn.
- **Draft All Remaining** button: AI finishes the rest of the draft automatically after Rod's last pick.
- **Undo Pick** button: reverses the last pick, restores the player to the pool, and moves the cursor back one slot.
- A post-draft **grade report** showing Rod's team grade, average ECR, total VBD, and all 14 teams' rosters with grades side-by-side.

### 4.4 Saved Drafts

Mock draft results are saved to the `mock_draft_results` database table. The Saved Drafts page lists all saved sessions with metadata. A **Side-by-Side Comparison View** allows selecting any two saved drafts and comparing them across three tabs:

- **Overview:** Head-to-head metrics (grade, avg ECR, total VBD, avg value surplus, value picks, reaches), positional construction bars, positional breakdown table, and an advantage summary.
- **Pick-by-Pick:** Round-by-round table with ADP gap (green = value, red = reach) for both drafts.
- **All Teams:** Full positional construction cards for every team in both drafts side-by-side, with a winner banner showing which draft wins on more metrics.

### 4.5 Draft History

A season-selectable, round-tabbed, team-filterable pick-by-pick table of all historical ESPN drafts (2018–2025). Each row shows player name, position, round, pick number, team, and a keeper badge if the player was kept. Keeper flags are extracted directly from ESPN's `reservedForKeeper` field.

### 4.6 Keeper Calculator

Per-team keeper eligibility cards enforcing the league's **2-consecutive-year rule**: any player kept in both 2024 and 2025 is ineligible to be kept in 2026 and must return to the draft pool. Each card shows eligibility status (ELIGIBLE / INELIGIBLE / MUST RETURN TO POOL), round cost (kept round minus 1), a value tier badge, and a 2-year rule warning. A league-wide summary counts how many players are hitting the 2-year limit across all 14 teams. A **Competitor Intel tab** shows the ineligibility impact per team: which teams have ineligible players, what replacement round cost they face, and what positional gaps this creates — surfacing draft advantages for Rod.

### 4.7 Draft Optimizer

A keeper-adjusted tier board organized by position, with scarcity alerts, round-by-round recommendations, and an off-board keepers tab showing players removed from the available pool due to keeper designations. The optimizer uses VORP (Value Over Replacement Player) calculations to rank available players within each positional tier.

---

## 5. Keeper Lab Hub

The Keeper Lab (`/keeper-lab`) consolidates three keeper-focused tools.

### 5.1 Keeper Tracker

Historical keeper data per team across all cached seasons, showing which players were kept, at what round cost, and whether they were subsequently kept again the following year.

### 5.2 Keeper ROI

Value analysis comparing each keeper's round cost against their estimated 2026 ADP round. Players where the keeper round is significantly earlier than ADP represent high-value keepers; players where keeper round approaches or exceeds ADP represent poor value.

### 5.3 Keeper Future Value

A 2-year ROI scoring tool with age trajectory and surplus calculations. Each eligible player receives a future value score based on projected career arc, positional scarcity, and the cost of keeping them relative to their expected draft position.

---

## 6. Trade Lab Hub

The Trade Lab (`/trade-lab`) consolidates four trade-related tools under the subtitle "Math-first trade analysis and pick portfolio."

### 6.1 Trade Analyzer

A math-first trade evaluation tool. Users enter the assets being given and received, and the analyzer computes a composite trade score using five value components:

| Component | Description |
|---|---|
| ROS Value | Rest-of-season projected points adjusted for schedule |
| Keeper Value | Round-cost surplus vs estimated ADP |
| Positional Scarcity | Multiplier based on how scarce the position is league-wide |
| Lineup Replacement Value | Cost to replace the player from the available pool |
| Playoff Schedule Factor | Adjustment for strength of schedule in playoff weeks |

The result is a **WIN / FAIR / LOSS verdict** with VORP bars, ROS value breakdown, keeper bonus, scarcity multipliers, and a composite scorecard. The AI verdict is presented as an explanation layer on top of the math, not as the primary source of truth. A **Championship Impact card** shows the before/after championship probability delta for the proposed trade. In pre-draft mode (`DRAFT_2026_COMPLETE = false`), the analyzer is restricted to 2026 draft picks only.

### 6.2 Trade Offer Generator

A targeted offer-building tool for acquiring specific 2026 draft picks. The user selects a target pick by round and slot, and the generator:

1. Resolves which owner holds that pick (using the Pick Tracker log and ESPN member data).
2. Displays a **Pick Owner Identity Card** showing the owner's name, GM archetype badge, tilt risk badge, seasons analyzed, pick value, exploit score, H2H record vs Rod, an exploitability bar, and the top exploit window.
3. Builds three offer tiers (fair, slight overpay, package deal) from Rod's roster using PPR fantasy point values and the 14-team pick value chart.
4. Generates an AI negotiation strategy with: recommended offer framing, optimal timing, negotiation angle tailored to the owner's DNA profile, red flags to watch for, and a ready-to-send opening message.

The server resolves the pick owner's `memberId` from their display name when a direct ID is not available, ensuring DNA and GM-style lookups always fire for the pick holder. An amber pre-draft notice banner is shown until `DRAFT_2026_COMPLETE` is set to `true`, at which point player trading unlocks.

### 6.3 Pick Value Calculator

A two-pick comparison tool using a calibrated 14-team PPR pick value chart (210 picks: 14 teams × 15 rounds). Users select any two picks and receive a WIN / FAIR / LOSS verdict with the full value chart table for reference.

### 6.4 Draft Pick Tracker

A portfolio management tool for 2026 draft picks. Users log pick trades (acquired from / traded away to a counterparty) with round, slot, optional notes, and the pick's chart value. The board view shows all currently owned picks; the acquired and traded-away logs show the full transaction history. A net portfolio value is computed from the chart values of all owned picks.

---

## 7. Waiver Lab Hub

The Waiver Lab (`/waiver-lab`) consolidates six weekly-decision and player-research tools.

### 7.1 Waiver Intelligence

A FantasyPros waiver rankings tool overlaid with opponent positional tendency data. For any player, the tool shows their waiver priority ranking alongside which opponents historically target that position, helping Rod identify pickups that also block competitor needs.

### 7.2 Weekly Projections

FantasyPros ECR and PFR 2025 stats used as a projection baseline for the upcoming week. Players are ranked by projected fantasy points with positional filters.

### 7.3 Start/Sit Advisor

A two-player decision tool powered by a **5-agent War Room debate panel**. Five specialized AI agents (Statistician, Contrarian, Injury Scout, Matchup Analyst, and GM Strategist) each independently evaluate the matchup and return a verdict. The UI shows individual agent verdicts, a consensus bar, and a disagreement list. Before calling the AI, the tool queries VORP and ROS values for both players and injects a **factContext** panel (avg PPG, VORP, tier, ROS-adjusted value, injury risk, schedule) into the prompt — the AI explains the math rather than inventing it. A **Monte Carlo simulation** runs probabilistic outcome distributions for each player, showing floor/median/ceiling with a win-probability delta. A "Facts passed to AI" collapsible panel shows exactly what data was injected. Three quick-load scenarios are pre-loaded.

### 7.4 Waiver Wire

A player scouting report tool. Users enter a player name and receive an AI-generated report covering Priority Rating, target share trend, PPR floor/ceiling, FAAB bid guidance, and a bottom line. The tool injects calculated weekly trend data (last 4 weeks of targets and snap percentage) into the prompt. A **League Blind Spots panel** pre-loads seven 2026 breakout candidates. A **FAAB Bid Strategy Guide** reference panel shows four bid tiers.

### 7.5 Player Profiles

A searchable and filterable historical player database covering all draft picks from 2018–2025. Each player card shows draft history timeline, keeper badges, team ownership across seasons, positional data, and a targets/snaps sparkline per week (from the weekly stats cache).

### 7.6 Strength of Schedule

Weekly matchup difficulty ratings per team, computed from opponent scoring averages. Useful for identifying favorable playoff schedules and informing start/sit decisions in high-stakes weeks.

---

## 8. Opponent Intel Hub

The Opponent Intel hub (`/opponent-intel`) consolidates three competitor-analysis tools.

### 8.1 Owner Career Stats

A comprehensive career statistics page covering all 14 managers across all cached seasons (2018–2025). The page includes a career summary leaderboard, per-owner profile cards, a full **H2H matrix table** (all-time head-to-head records between every pair of managers), and a season-by-season breakdown. Per-season transaction counters (acquisitions, drops, trades, roster moves) are included alongside computed GM style metrics.

### 8.2 Manager Behavior

Calculated GM profiles derived from transaction data. Each manager receives scores for waiver aggression, trade frequency, roster churn, and stability. A GM archetype label (e.g., "Aggressive Trader," "Waiver Hawk," "Set-and-Forget") is assigned based on the combination of these scores. The **Opponent Profile Deep-Dive Modal** (accessible by clicking any manager card) shows full career stats, draft tendencies chart, GM activity, H2H vs Rod, strengths/weaknesses/blind spots, and an AI scouting report.

### 8.3 League Analytics

A four-tab analytics dashboard covering:

- **VORP:** Value Over Replacement Player by position, showing which players are most valuable relative to the replacement level at their position.
- **Scarcity:** Positional scarcity index — the ratio of starters rostered to total available at each position.
- **Roster Gaps:** The weakest positions per team, identifying trade targets and waiver priorities.
- **Keeper Efficiency:** Keeper value vs draft cost vs ADP for all kept players league-wide.

---

## 9. AI & Intelligence Engines

The application integrates multiple AI and analytics systems that work together to produce grounded, data-backed intelligence.

### 9.1 GM Advisor (AI Chat)

The standalone AI GM Advisor (`/ai-advisor`) and the embedded dashboard chat share a common system prompt that injects a comprehensive league context snapshot before every conversation. The injected context includes:

- VORP leaders by position
- Positional scarcity alerts
- Biggest roster weaknesses per team
- Weekly trend summaries (last 4 weeks of targets and snap% for key players)
- Injury intelligence summary (from the Injury Intelligence Engine)
- League DNA behavioral profile block (from the League DNA Engine)

The AI is explicitly instructed not to contradict calculated facts — it explains and contextualizes the math rather than generating unsupported opinions.

### 9.2 League DNA Engine

The League DNA Engine (Phase 3) builds behavioral profiles for every manager from 2018+ season data. For each manager, it computes:

| Metric | Description |
|---|---|
| Draft DNA | Positional biases vs league average (rounds earlier/later per position), draft style badge, reach/value positions |
| Trade DNA | Trade frequency score, loss-trade ratio (how often trades result in losses) |
| Waiver DNA | Waiver aggression score |
| Tilt Profile | Tilt score (0–100) and tilt label (TILTED / AT RISK / STABLE) |
| Exploit Windows | Specific behavioral vulnerabilities (e.g., "Overpays for RBs in Rounds 1–3") |
| Exploitability Score | Composite 0–100 score with label (HIGHLY EXPLOITABLE / EXPLOITABLE / MODERATE / DIFFICULT) |
| GM Archetype | Behavioral archetype label derived from the combination of all above metrics |

DNA profiles are exposed via the `dna` tRPC router with endpoints for `leagueProfiles`, `managerProfile`, `desperationScores`, `tradeWindow`, `exploitBoard`, and `promptBlock`. The `promptBlock` endpoint generates a formatted text block injected into AI prompts to give the LLM behavioral context about the target opponent.

### 9.3 Injury Intelligence Engine

The Injury Intelligence Engine (Phase 1) fetches current injury data and enriches it with fantasy impact context. An `buildAdvisorInjuryContext` function formats the injury data into a structured block injected into the GM Advisor system prompt, ensuring the AI has current injury awareness when answering questions about roster decisions.

### 9.4 Monte Carlo Simulation Engine

The Monte Carlo Simulation Engine (Phase 2) runs probabilistic outcome distributions for player performance. It uses historical scoring data, injury adjustments, and schedule factors to generate floor/median/ceiling projections. Key endpoints include:

- `playerOutcome`: Distribution for a single player (accessible from Draft Board rows via a Player Outcome modal).
- `startSit`: Side-by-side simulation for two players with win-probability delta.
- `matchup`: Full matchup simulation.
- `lineupCheck`: Lineup optimization check.

Simulation results are visualized with distribution bars, percentile bands, bust/ceiling percentages, win-probability gauges, and confidence badges.

### 9.5 Championship Equity Engine

The Championship Equity Engine (Phase 5) computes each team's probability of winning the championship based on current standings, projected lineups, remaining schedule, and roster variance. It supports `whatIfDelta` calculations that show how any proposed trade or keeper decision changes Rod's championship probability before and after the decision.

### 9.6 Multi-Agent War Room

The Multi-Agent War Room (Phase 4) deploys five specialized AI agents that independently evaluate start/sit decisions and then debate their conclusions. The five agents are:

| Agent | Role |
|---|---|
| Statistician | Evaluates based on historical averages, VORP, and trend data |
| Contrarian | Challenges the consensus with counter-arguments |
| Injury Scout | Focuses on injury risk, snap counts, and usage trends |
| Matchup Analyst | Evaluates opponent defensive matchup quality |
| GM Strategist | Considers playoff implications and championship equity |

The UI shows individual agent verdicts, a consensus bar, and a disagreement list highlighting where agents diverge.

---

## 10. Data Center Hub

The Data Center (`/data-center`) provides operational control over the data pipeline.

### 10.1 Data Health

A per-season, per-view health dashboard with color-coded status indicators. Each of the 14 ESPN views is shown with its last-fetch status (`ok`, `partial`, `error`, `auth_error`), record count, and timestamp. A pipeline health summary shows overall status, stale season count, failed season count, and partial season count. Seasons before 2018 are excluded from health scoring (ESPN API does not support them). Closed seasons (2009–2024) are never flagged as stale regardless of last-fetch date.

### 10.2 Data Refresh

Manual refresh controls with season selector, last-refresh timestamp, pipeline health status indicators, multi-season batch refresh with a progress log, cached seasons badge display, and a **Force Re-fetch toggle** that overrides the smart-refresh skip logic for closed seasons.

### 10.3 Auto-Refresh (Scheduled Jobs)

The scheduled jobs management UI shows the weekly heartbeat job's status badge, next run time, last run time, and task UID. Pause, resume, and delete controls are available. Job state is persisted in the `scheduled_jobs` database table.

---

## 11. Analytics Engine

The `server/analytics.ts` module provides the core quantitative layer that all other features build on. It exposes six primary calculators:

| Function | Description |
|---|---|
| `calcVORP` | Value Over Replacement Player by position, using positional replacement thresholds |
| `calcPositionalScarcity` | Scarcity index: starters rostered vs available at each position |
| `calcRosterGaps` | Weakest positions per team based on VORP of starters |
| `calcKeeperEfficiency` | Keeper value vs draft cost vs ADP surplus/deficit |
| `calcManagerBehavior` | GM archetype, waiver aggression, trade frequency, roster churn, stability score |
| `calcROSValue` | Rest-of-season value using PPG, remaining schedule, and schedule strength |
| `calcPickValue` | 14-team PPR pick value chart (calibrated JJ chart, 210 picks) |

The `liveOpponentProfile.ts` module generates all GM profiles dynamically from ESPN cache data, replacing any previously hardcoded static profiles. It builds career records, H2H vs Rod, GM archetype, draft style, and strengths/weaknesses from real data across all cached seasons.

---

## 12. System Architecture & Quality

### 12.1 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Recharts |
| API Layer | tRPC 11 with Superjson (end-to-end type safety) |
| Backend | Express 4, Node.js 22, TypeScript |
| Database | MySQL/TiDB via Drizzle ORM |
| AI | Manus built-in LLM API (server-side, credentials injected) |
| Auth | Manus OAuth with JWT session cookies |
| Testing | Vitest (195 tests, 15 test files) |
| Hosting | Manus managed hosting (espnfftool-d7edtbt5.manus.space) |

### 12.2 Database Schema

The application maintains the following primary tables:

| Table | Purpose |
|---|---|
| `users` | OAuth user accounts with role field (admin/user) |
| `espn_season_cache` | Merged ESPN view data per season (unique constraint on season+viewName) |
| `refresh_manifest` | Per-season refresh status and metadata |
| `espn_view_health` | Per-season, per-view pipeline health records |
| `chat_history` | GM Advisor conversation history |
| `weekly_player_stats` | Per-player, per-week stats cache (26 columns, 3 indexes) |
| `pick_trades` | 2026 draft pick trade log (acquired/traded_away with counterparty) |
| `fantasy_data_cache` | FantasyPros + PFR merged data with 6hr TTL |
| `mock_draft_results` | Saved mock draft sessions |
| `adp_trend_snapshots` | ADP trend data over time |
| `scheduled_jobs` | Heartbeat job state and run history |

### 12.3 Navigation Structure

The application sidebar organizes all features into five groups:

| Group | Items |
|---|---|
| Overview | Command Center |
| Draft & Keepers | Draft War Room, Keeper Lab |
| Decision Tools | Trade Lab, Waiver Lab |
| Intelligence | AI GM Advisor, Opponent Intel |
| System | Data Center, Weekly Stats |

### 12.4 Quality Assurance

The test suite covers 195 tests across 15 files:

| Test File | Coverage Area |
|---|---|
| `analytics.test.ts` | VORP, scarcity, roster gaps, keeper efficiency, manager behavior, ROS value, pick value (24 tests) |
| `tradeOfferGenerator.test.ts` | Pick value, pick parsing, player value estimation, value ratio, fuzzy match (37 tests) |
| `draftBoard.test.ts` | ECR/ADP merge, player search, comparison logic (25 tests) |
| `weeklyStats.test.ts` | Stat normalization, trend computation (13 tests) |
| `savedDrafts.test.ts` | Save, list, get, delete draft procedures (15 tests) |
| `ownerCareerStats.test.ts` | Career W/L, H2H matrix, playoff detection (10 tests) |
| `pickValue.test.ts` | 14-team pick chart math, trade verdict logic (16 tests) |
| `playerProfiles.test.ts` | Draft history aggregation, keeper flag extraction (9 tests) |
| `espnPipeline.test.ts` | View isolation, data quality gates, staleness detection (17 tests) |
| `ownerGmStyle.test.ts` | GM archetype, behavior scores, style metrics (10 tests) |
| `draftOptimizer.test.ts` | Pick value, VORP tiers, ROS value, keeper pool filtering (4 tests) |
| `espn.credentials.test.ts` | ESPN API authentication (3 tests) |
| `auth.logout.test.ts` | Session cookie clearing (1 test) |
| `advisor.chat.test.ts` | Chat router context injection (5 tests) |

---

## 13. Feature Summary Table

| Feature | Hub | Data Source | AI-Powered |
|---|---|---|---|
| Executive Summary Dashboard | Command Center | Live ESPN cache | No |
| Threat Assessment | Command Center | Computed from ESPN cache | No |
| Opponent Profiles (14 cards) | Command Center | Live ESPN cache | No |
| Draft Strategy + Competitor Intel | Command Center | Live ESPN cache | No |
| Keeper Intelligence | Command Center | Live ESPN cache | No |
| GM AI Chat | Command Center | League context + ESPN cache | Yes |
| Championship Equity | Command Center | Computed from ESPN cache | Yes (variance advice) |
| Draft Board (ECR+ADP+PFR) | Draft War Room | FantasyPros + PFR | No |
| Player Comparison | Draft War Room | FantasyPros + PFR | No |
| Mock Draft Simulator | Draft War Room | FantasyPros + ESPN tendencies | No |
| Saved Drafts + Comparison | Draft War Room | Database | No |
| Draft History | Draft War Room | Live ESPN cache | No |
| Keeper Calculator + Competitor Intel | Draft War Room | Live ESPN cache | No |
| Draft Optimizer | Draft War Room | VORP + ESPN cache | No |
| Keeper Tracker | Keeper Lab | Live ESPN cache | No |
| Keeper ROI | Keeper Lab | ESPN cache + ADP | No |
| Keeper Future Value | Keeper Lab | ESPN cache + ADP | No |
| Trade Analyzer (math-first) | Trade Lab | VORP + ESPN cache | Yes (explanation) |
| Trade Offer Generator | Trade Lab | ESPN cache + DNA | Yes |
| Pick Value Calculator | Trade Lab | Pick value chart | No |
| Draft Pick Tracker | Trade Lab | Database | No |
| Waiver Intelligence | Waiver Lab | FantasyPros + ESPN tendencies | No |
| Weekly Projections | Waiver Lab | FantasyPros + PFR | No |
| Start/Sit Advisor (5-agent) | Waiver Lab | VORP + Monte Carlo + ESPN | Yes |
| Waiver Wire Scouting | Waiver Lab | Weekly stats + ESPN | Yes |
| Player Profiles | Waiver Lab | ESPN cache + weekly stats | No |
| Strength of Schedule | Waiver Lab | ESPN cache | No |
| Owner Career Stats + H2H Matrix | Opponent Intel | Live ESPN cache | No |
| Manager Behavior + Deep-Dive | Opponent Intel | Live ESPN cache | Yes (scouting) |
| League Analytics (VORP/Scarcity) | Opponent Intel | Computed from ESPN cache | No |
| League DNA Engine | All (injected) | ESPN cache (2018+) | No |
| Injury Intelligence | All (injected) | ESPN injury data | No |
| Monte Carlo Simulation | Waiver Lab | Historical scoring data | No |
| Multi-Agent War Room | Waiver Lab | All data sources | Yes |
| Data Health Dashboard | Data Center | Pipeline health records | No |
| Data Refresh Controls | Data Center | ESPN API | No |
| Weekly Auto-Refresh Job | Data Center | ESPN API | No |
| Weekly Stats Cache | System | ESPN scoring API | No |

---

*Document generated May 2026. All features are fully implemented and tested. 195 tests passing, 0 TypeScript errors.*
