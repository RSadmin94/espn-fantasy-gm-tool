# Why Haven't I Won? (TM) - Flagship Redesign Spec (v1)

Status: APPROVED for build (Phase 0). Owner-facing career documentary + championship
diagnostic for Fantasy Football Rivals (TM). Deterministic, auditable, real-data-only.

## Approvals locked (this revision)
1. Pre-2021 seasons REMAIN VISIBLE. Player-level metrics degrade gracefully with the label
   "Player-level metrics unavailable before 2021. Team-level analysis available." Never hide a season.
2. Draft misses = seasons in the owner's BOTTOM 25% of draft grades (was bottom third).
3. Activity DNA stays in the readiness score at weight 5% (descriptive, influences but never dominates).
4. Proposed readiness weights kept as-is for v1 (recalibrate after real user feedback; do not over-optimize).
5. NEW Section 0: Career Story Header (TM) + Career Arc label (both deterministic, template-driven, no LLM).

## Non-negotiable principles
- Deterministic + explainable + auditable. Every number traces to an existing service. NO LLM-generated facts.
- Active-profile driven: resolve activeProfile.selectedOwnerKey / selectedTeamId. No hardcoded Rod logic,
  no owner-name matching, no fallback-to-Rod except an explicit legacy flag. Every owner gets their own report.
- Preserve and EXPAND existing coaching: the current whyHaventIWon findings are never removed.

## The two-tier data reality (governs every section)
- Team-level (ALL seasons 2010-2026) via `teams` + `matchups`: finish, record, points-for, champion
  identity, playoff result, close losses, head-to-head / rivalry.
- Player-level (2021-2025 ONLY) via `gm_weekly_player_stats` JOIN `gm_player_registry` (position +
  espnPlayerId) and `espn_raw_cache 'combined'` (draft picks): positional starter PPG, champion positional
  benchmarks, acquisition impact, draft grades.
- Timeline shows all seasons; player-level fields render only when available, else the degradation label.

## Reuse map (most analytics already exist)
| Need | Existing service | Provides |
|---|---|---|
| Modes, findings, titles, finishes | whyHaventIWon.ts | pageMode, findings[], championSeasons, isReigningChampion, titles, bestFinish, playoffAppearances, narrative, confidence |
| Positional gaps / champion compare | championshipPath.ts | ownerProfile/championProfile (QB/RB/WR/TE PPG), positionGaps, closestChampion, similarity |
| Acquisition impact | acquisitionImpact.ts | acquisitionImpactScore, per-season AcquisitionSeason[], focalRankImpact |
| Draft / roster-mgmt grades (per season) | draftRealitySimulator.ts | computeDraftReality(season): draftGrade, rosterMgmtGrade, overallGrade, ranks |
| Biggest rival / per-season rival result | rivalryService.ts | RivalryPair (rivalryScore, painful loss, H2H) |
| Activity DNA | activityDnaService.ts | primary/secondary archetype, percentiles, confidence |
| Champion-by-season / finishes | teams, hallOfFameService.ts | finalStanding history |

## Dynamic page modes (from whyHaventIWon.pageMode)
- never won -> Title "Why Haven't I Won? (TM)" / Sub "A complete breakdown of what's preventing you from becoming a champion."
- reigning champion -> "Why You Won (TM)" / "The exact reasons your championship season succeeded."
- past champion (not reigning) -> "Why You Broke Through (TM)" / "The story of how you became a champion and what has changed since."

## SECTION 0 - Career Story Header (TM) + Career Arc  [NEW, headline element]

Mad Libs powered by league history: deterministic templates, no LLM. Renders ABOVE Section 1.

### 0a. Career Arc label (one memorable word-phrase)
Ordered decision tree; first match wins. Inputs are existing metrics only.
Inputs: titles, isReigningChampion, seasonsPlayed, bestFinish, runnerUps (finalStanding==2 count),
careerWinRate, playoffRate (playoffAppearances/seasonsPlayed), activityDnaPrimary.

```
if titles >= 3                         -> "The Dynasty"
elif isReigningChampion                -> "The Breakthrough"
elif titles >= 1                       -> "The Contender"          # past champion chasing the next
# ---- never won (titles == 0) ----
elif runnerUps >= 2 and winRate >= 0.50 -> "The Gatekeeper"        # perennial finalist, no trophy
elif winRate >= 0.50               -> "The Challenger"          # consistently competitive
elif activityDnaPrimary in {Roster Builder, Waiver Aggressive, Trade Opportunist} -> "The Builder"
else                                   -> "The Underdog"
```
Thresholds are v1 and tunable. Expected: Demetri=The Dynasty (3 titles), Rod=The Breakthrough (reigning),
Mark=The Gatekeeper (4x runner-up, ~.500), Jan=likely The Underdog (2 RU, sub-.500, low activity) - to be
confirmed in validation and recalibrated to taste.

v1 implementation notes (raw signals not yet reliable; revisit in the timeline phase):
1. Playoff trips use a TOP-6 finalStanding proxy. The playoffSeed column is populated for nearly every team
   every season, so it cannot identify playoff qualifiers. True bracket participation arrives in the timeline phase.
2. The Challenger arc uses careerWinRate >= 0.500 (winning record) INSTEAD of playoff-rate, for the same reason,
   until true bracket participation is available.

### 0b. Career Story Header (3-4 templated sentences)
Branch by champion-vs-never-won; fill slots from facts. Activity-DNA descriptor map:
Trade Opportunist->"aggressive trading", Waiver Aggressive->"aggressive waiver-wire moves",
Roster Builder->"steady roster improvement", Draft-and-Hold->"patience and a hold-your-core approach",
High Activity->"a high-volume, hands-on style", Low Activity->"a patient, low-churn style".

CHAMPION (titles >= 1):
- S1 (the win): reigning -> "After {seasonsBeforeFirstTitle} years of chasing a title, you broke through in {firstTitleYear}."
  / dynasty (titles>=3) -> "You have built a dynasty with {titles} championships ({titleYears})."
- S2 (how): "Your path was built on {dnaDescriptor}{, secondaryDescriptor}, and {persistence|dominance}."
- S3 (status): "You have reached the mountaintop {titles==1?'once': titles+' times'}."
- S4 (next): reigning -> "The next challenge is proving it wasn't a one-year peak."
  / past champ -> "The challenge now is finding your way back to the top."

NEVER WON (titles == 0):
- S1 (identity): competitive (runnerUps>=1 or playoffRate>=0.45) ->
  "You have consistently fielded competitive teams but have never completed the final step."
  / passive (Low Activity / Draft-and-Hold) -> "Your profile reflects patience and stability."
- S2 (evidence): competitive -> "Your league history shows {runnerUps} runner-up finish(es) and {playoffTrips} playoff trips that ended short of the trophy."
  / passive -> "You rarely overreact, but that same caution has limited chances to improve your championship odds during the season."
- S3 (obstacle/next): "Your greatest obstacle has been {topFindingHeadline}." OR
  "The data suggests your next breakthrough requires {topRecommendation}."

NOTE on illustrative examples: user examples (e.g. Rod "once") are tone/structure references. The template
emits ACTUAL facts; if data shows Rod has 2 titles (2010, 2025) it will say "twice". Any mismatch between the
deterministic output and the example is reported during validation, not papered over. CONFIRMED: Rod 2010+2025 are accurate canonical data (report says "twice"); if 2010 is ever disproven, fix gm_teams data, not the report logic.

## SECTION 1 - Career Snapshot (hero)
Seasons Played, Titles, Best Finish, Playoff Trips, Championship Drought (seasons since last title, else
seasonsPlayed), League DNA Rank (championshipPath/power rank), Activity DNA, Biggest Rival (rivalryService
top pair), Biggest Threat (highest-similarity active non-self owner).

## SECTION 2 - Season-by-Season Timeline (centerpiece)
One SeasonCard per season 2010-2026. Always: year, finish, record, PF, playoff result, champion-that-year,
rival result, biggest obstacle, short diagnosis. Player-level (2021-2025 only): draft grade, acquisition
impact + league rank, activity snapshot. Pre-2021 cards show the degradation label, never hidden. Champion
seasons get lime halo + trophy badge.

## SECTION 3 - Pattern Detection
Counts + percentages: losses to eventual champions, below-champion WR/QB seasons (2021-2025), close losses,
playoff scoring deficit seasons, repeated draft misses (= seasons in owner's BOTTOM 25% of draft grades).

## SECTION 4 - Championship Season Breakdown (only if hasWon)
Per title year: draft contribution, acquisition contribution, positional strengths, biggest rival defeated,
biggest playoff win, champion-DNA comparison. Answers "why did THIS season work?".

## SECTION 5 - Top Reasons / Breakthrough Drivers
Existing whyHaventIWon findings, re-headlined by mode: "Top 5 Reasons You Haven't Won" / "...You Won" /
"...You Broke Through".

## SECTION 6 - Championship Readiness Score (TM) (0-100)
Sub-scores (all existing 0-100 or derivable ratios):
- QB/RB/WR/TE: 100 * clamp(ownerAvg/championAvg, 0, 1) from championshipPath.positionGaps (2021-2025).
- Draft: mean draftReality.draftGrade (recent seasons).
- Roster Management: mean draftReality.rosterMgmtGrade.
- Acquisition Impact: acquisitionImpact.acquisitionImpactScore.
- Playoff Readiness: 100 * percentile(focal playoff PPG vs league).
- Activity alignment: similarity(focal archetype vector, mean-champion archetype vector).
Weights (v1, locked): positional 40% (QB/RB/WR/TE evenly), Playoff 15%, Acquisition 15%, Draft 15%,
Roster Mgmt 10%, Activity 5%. Clamp 0-100. Confidence scales with seasons of player-level data.

## SECTION 7 - What Must Change Next
Preserve existing findings; ADD measurable gap cards (current / champion-avg / gap) from positionGaps,
acquisition gap, playoff gap. Mode-aware wording. Nothing removed.

## SECTION 8 - LeagueDNA Evidence Panel
Seasons analyzed, championship years, playoff appearances, rival records, champion losses, close losses,
positional averages, Activity DNA, acquisition metrics. Full transparency.

## Visual design
Dark near-black panels, lime #a3e635 primary, violet #8b5cf6 secondary, amber accents, large type, timeline
visuals, championship years highlighted, rival icons, achievement badges. Mobile + desktop.

## API + data model
New tRPC query `leagueIntel.careerReport` (input {ownerKey?}); profile-aware; composes existing computes in
parallel + per-season draftReality loop (memoized). Returns CareerReport { mode, title, subtitle, careerArc,
careerStory, snapshot, timeline[], patterns[], championshipBreakdown?, topReasons[], readiness,
recommendations[], evidence, confidence, dataCoverage }. No new scraping / APIs / extension work.

## File list impacted
NEW: server/careerReportService.ts (orchestrator + Career Arc + Career Story), client components
(CareerStoryHeader, CareerSnapshotHero, SeasonTimeline, PatternDetection, ChampionshipBreakdown, TopReasons,
ChampionshipReadinessGauge, WhatMustChange, EvidencePanel).
REUSED: championshipPath, acquisitionImpact, draftRealitySimulator, activityDnaService, rivalryService,
hallOfFameService.
TOUCHED: whyHaventIWon.ts (expose internals as needed; keep output stable), leagueIntelRouter.ts + routers.ts
(mount), client/src/pages/WhyHaventIWon.tsx (rebuild into Section 0-8 layout).
AUDIT: rivalryService.ts has avgRodPF-style field names - verify focal-generic (no hardcoded Rod).

## Validation plan (4 owners)
Rod -> Why You Won (reigning 2025); Demetri -> Why You Broke Through (3 titles, not reigning);
Mark -> Why Haven't I Won (0 titles); Jan -> Why Haven't I Won (0 titles).
Verify: mode/title, Career Arc, Career Story sentences, snapshot numbers, timeline finishes vs
teams.finalStanding, readiness sub-scores trace to services, preserved findings present, evidence reconciles.

## Implementation phases
- Phase 0: careerReportService orchestrator + endpoint -> Section 0 (Career Story + Arc), snapshot, modes,
  preserved findings. Validate 4 owners. (THIS PHASE)
- Phase 1: per-season timeline assembler (team-level all seasons + 2021-2025 player-level, degrade label).
- Phase 2: Championship Readiness Score + gauge.
- Phase 3: Pattern Detection (incl. draft misses = bottom 25%).
- Phase 4: UI rebuild (Sections 0-8, timeline visual, mode titling, mobile).
- Phase 5: Championship Breakdown (winners) + Evidence panel + biggest rival/threat in snapshot.
- Phase 6: full validation + polish.
