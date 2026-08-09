# RFSN-052C — League Intelligence Planner matrix

**Status:** Planner + tests only. Not wired into `advisor.chat`. No LLM. No push/deploy.

Source: `server/advisorEvidencePlanner.ts`  
Tests: `server/advisorEvidencePlanner.test.ts`  
Scope input: `resolveAdvisorQuestionScope` (RFSN-052B)

Authorities are **existing modules only** (`ADVISOR_AUTHORITY_MODULES`). The planner does not recompute H2H, titles, or margins.

---

## Output

```
{
  intent,
  authorities[],
  deterministicFirst,
  narrativeAllowed,
  requiredEvidence[],
  fallbackToAdvisorContext
}
```

`fallbackToAdvisorContext: true` → use today’s Advisor prompt packing. The LLM must not invent which facts exist; it only narrates when `narrativeAllowed` after evidence is gathered (executor not built yet).

---

## Planner matrix

| Example / intent | Intent id | Authorities (order) | Det. first | Narrative | Required evidence |
| --- | --- | --- | :---: | :---: | --- |
| Who has the most one-point losses? | `matchup_margins` | owner_identity, matchup_margins | Y | N | margin_query, owner_resolved_matchups |
| Demetri vs LOZELL / Rod vs Bruce / head-to-head cues | `h2h_pair` | owner_identity, h2h, playoffs | Y | N | h2h_career_record, h2h_playoff_record, h2h_meetings, playoff_eliminations |
| Who’s the GOAT? | `goat` | championships, playoffs, league_records, timeline, hall_of_fame | Y | Y | title_counts, hof_leaderboard, league_records, playoff_resume, career_longevity |
| Why haven’t I won? | `why_havent_i_won` | championships, matchup_history, playoffs, owner_dossier, draft_history, trades | Y | Y | why_havent_i_won_findings, title_counts, playoff_resume, draft_tendencies, trade_history, matchup_resume |
| Best rivalry ever? | `best_rivalry` | championships, h2h, rivalry, playoffs, timeline | Y | Y | rivalry_ranking, h2h_career_record, playoff_eliminations, shared_championship_context, rivalry_timeline |
| Who is the champ? | `reigning_champion` | championships | Y | N | reigning_champion, latest_title_season |
| Who has the most championships? | `championship_leaderboard` | championships | Y | N | title_counts, champion_seasons |
| Who has more championships, Rod or Bruce? | `championship_compare` | owner_identity, championships | Y | N | title_counts, champion_seasons |
| How many rings does LOZELL have? | `owner_championships` | owner_identity, championships | Y | N | title_counts, champion_seasons |
| Who always reaches in the draft? | `draft_history` | owner_identity, draft_history | Y | Y | draft_picks, draft_tendencies |
| Who got robbed in trades? | `trade_history` | owner_identity, trades, transactions | Y | Y | completed_trades, transaction_ledger |
| Tell me about Rod's career | `owner_career` | owner_identity, championships, matchup_history, playoffs, owner_dossier, timeline | Y | Y | owner_profile, title_counts, career_timeline, playoff_resume |
| Tell me about league history / HoF | `league_history_general` | championships, hall_of_fame, league_records, playoffs, timeline | Y | Y | title_counts, hof_leaderboard, league_records, career_longevity |
| Who is strongest this year? / start-sit / “what do you think?” | `advisor_fallback` | *(none)* | N | Y | — → existing Advisor context |

Longevity on GOAT is **not** a new authority. It is `timeline` evidence (`career_longevity`) from `careerReportService`.

---

## Existing module map (no duplicates)

| Planner id | Existing implementation |
| --- | --- |
| owner_identity | `ownerIdentityAuthority.buildOwnerIdentityAuthority` |
| championships | `championshipAuthority.buildChampionshipAuthority` |
| h2h | `h2hAuthority.buildH2HAuthority` |
| rivalry | `rivalryService.computeRivalryScores` |
| matchup_history | `gmMatchups` + H2H meetings |
| matchup_margins | `matchupMarginTool.tryMatchupMarginToolAnswer` (cue detection reused via `selectMatchupMarginTool`) |
| playoffs | H2H playoff layer / `playoffPositionSplit` |
| league_records | `hallOfFameService` / `espn.ownerAllTimeRecords` |
| owner_dossier | `ownerProfileService` / `ownerCareerProfileService` / `whyHaventIWon` |
| draft_history | `espn.draftHistory` / owner draft DNA |
| trades | `completedTradeAuthority` |
| transactions | `historicalDataService.getSeasonTransactions` |
| timeline | `careerReportService.computeCareerReport` |
| hall_of_fame | `hallOfFameService.buildHallOfFamePayload` |
| awards | Draft Night Show awards (not in default plans yet) |
| league_dna | `leagueDNA.calcLeagueDNA` (fallback / later coaching) |

---

## Detection order

1. why_havent_i_won  
2. reigning_champion  
3. goat  
4. best_rivalry  
5. matchup_margins (`selectMatchupMarginTool` ≠ null)  
6. championship_compare (2+ owners + rings/titles)  
7. championship_leaderboard  
8. owner_championships (1 owner + rings/titles)  
9. h2h_pair (H2H cues, 2+ owners, or rivalry scope + 1 owner)  
10. draft_history  
11. trade_history  
12. owner_career  
13. league_history_general  
14. advisor_fallback (current_season coaching, low-confidence, unknown)

---

## Not in this increment

- Invoking authorities / assembling evidence packages  
- Wiring into `advisor.chat` or the stream handler  
- UI changes  
- Push / deploy  
