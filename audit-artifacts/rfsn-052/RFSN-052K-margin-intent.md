# RFSN-052K — Matchup Margin Intent Expansion

**Status:** Implemented locally. **Not Preview. Not Production.** Stop for review.  
**Type:** Bug fix on existing Matchup Margin Authority (not a new Advisor surface).

## Bug

Screenshot ask:

> who has the largest margin of victory in a single game

Advisor answered **one-point losses** again.

Root cause: `selectMatchupMarginTool` treated a bare `\bmargin\b` cue as one-point losses:

```ts
// Generic margin cue without a clearer metric → one-point losses (the observed failure).
if (/\bmargin\b|\bclose\s+games?\b|\bnail-?biter/.test(t)) {
  return { metric: "losses_by_margin", marginExact: 1 };
}
```

The authority already had final-score margins. The classifier sent the wrong query.

## Fix (same tool: `query_matchup_margins`)

| Ask | Metric | Aggregation | Filter |
| --- | --- | --- | --- |
| Who has the largest margin of victory? | `largest_margin` | `owner_max` | — |
| Who has the largest margin of victory **in a single game** / what was … in league history? | `largest_margin` | `single_game` | — |
| What's my biggest win? | `largest_margin` | `single_game` | resolved owner (`personalAsk`) |
| What's Rod's biggest win over Bruce? | `largest_margin` | `single_game` | owner + opponent |
| biggest blowout / largest win / most dominant win / highest winning margin | `largest_margin` | per rules above | — |
| highest / lowest combined score | `highest_combined_score` / `lowest_combined_score` | `single_game` | — |
| highest losing score / lowest winning score | same | `single_game` | — |
| biggest comeback | `largest_comeback` | — | **unsupported** (no timeline) |
| largest upset | `largest_upset` | — | **unsupported** (no projections) |
| biggest halftime deficit | `largest_halftime_deficit` | — | **unsupported** (no timeline) |

Unchanged:

- One-point losses / narrow wins
- Most blowout wins by 50+ (**count**, not largest single game)
- Closest game / average margin / ties / close losses

Bare `\bmargin\b` no longer defaults to one-point losses. Close games / nail-biters still can.

Phase default remains **regular season** unless playoffs / all-games / league-history (closest-game exception unchanged).

## Example answers

Single game:

> Christian Graham recorded the largest margin of victory in league history, defeating Bruce Edwards by 78.4 points in Week 2 of the 2016 season (regular-season). …

Leaderboard:

> Largest single-game victory margins:  
> 1. Christian Graham – 78.4  
> 2. Rod Sellers – 74.1  
> …

## Files

- `server/matchupMarginAnalytics.ts` — metrics, opponent filter, highlight + owner-max leaderboard, formatters
- `server/matchupMarginTool.ts` — intent expansion; personal owner from Advisor-resolved names
- `server/advisorEvidencePackage.ts` — pass resolved owners; attach highlight / owner-max facts
- `server/advisorScopeResolver.ts` — matchup-stat phase cue includes largest-win / combined score
- Tests: `matchupMarginAnalytics.test.ts`, `advisorEvidence052k.test.ts`, planner + 052I intent checks

## Not done

- Preview deploy / Production promote
- Advisor / Rivalry / live Matchups redesign
- In-game timeline or pre-game projections (comeback / upset / halftime stay honest unsupported)
