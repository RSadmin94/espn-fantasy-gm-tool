# RFSN-052D — Advisor Evidence Package

**Status:** Package + tests only. Not wired into `advisor.chat`. No LLM. No push/deploy.

Source: `server/advisorEvidencePackage.ts`  
Tests: `server/advisorEvidencePackage.test.ts` (11)  
Planner input: `AdvisorEvidencePlan` (RFSN-052C)  
Scope input: `AdvisorQuestionScope` (RFSN-052B)

Authorities are **existing modules only**. The package does not invent facts, recompute titles, or relabel partial coverage as all-time.

---

## Output

```
{
  league: { leagueId, leagueName, provider, coverageStartSeason, coverageEndSeason },
  scope: { type, startSeason, endSeason, phase },
  owners: [],
  facts: [],
  rankings: [],
  h2h: {},
  championships: {},
  playoffs: {},
  matchupStats: {},
  draftStats: {},
  tradeStats: {},
  timelineFacts: [],
  provenance: [],
  conflicts: [],
  coverageNotes: [],
  plan
}
```

Every fact carries provenance:

```
{ fact, sourceAuthority, sourceScope, startSeason, endSeason, confidence }
```

---

## Rules implemented

| Rule | How |
| --- | --- |
| No silent merge of conflicting numbers | `conflicts[]` when medal vs fallback titles differ, or H2H vs rivalry record differs |
| Different scopes labeled | `sourceScope` + separate ranking ids (`titles_medal`, `titles_fallback_inclusive`) |
| Never convert partial coverage to all-time | `qualifyCoverage` always says “Not all-time. Recorded coverage is …” |
| Never invent missing facts | Missing authority → empty facts + coverage note; no fabricated values |
| Owner Identity before owner stats | `resolveOwnersAgainstIdentity` runs first; aliases → canonical id/name |
| Regular season vs playoffs | H2H tallies split; playoff block is separate from RS |

---

## Assembly

| Export | Role |
| --- | --- |
| `buildAdvisorEvidencePackage` | Pure: snapshots + plan + scope → package |
| `loadAdvisorEvidenceSources` | Live loaders from existing authorities (Identity, Championship, H2H, rivalry, margins, draft, trades, timeline) |
| `assembleAdvisorEvidencePackage` | Load then build |

Not wired into Advisor chat. Executor / narrative still downstream.

---

## Tests (11)

| Case | Assertion |
| --- | --- |
| Full-history evidence | League-history coverage 2010–2025 still labeled “Not all-time”; facts use `recorded 2010–2025` |
| Partial-history qualification | Request 2005–2026 vs coverage 2018–2024 → “Partial history” notes |
| Conflicting scope | Rod medals 3 vs fallback-inclusive 4 → `championship_title_counts` conflict; both rankings kept |
| H2H pair | RS 2–1 vs playoffs 0–1 kept distinct; single-season 2023 does not promote to career |
| Championship fact | Reigning champ + medal provenance (`championships` / medals) |
| Owner alias resolution | “Rod” / “Bruce” → Rod Sellers / Bruce Edwards; unknown alias stays unresolved |

Plus: H2H vs rivalry record conflict labeled; missing championship authority invents nothing; matchup-margin leaderboard keeps phase provenance.

Vitest: `advisorScopeResolver` 20 + `advisorEvidencePlanner` 12 + `advisorEvidencePackage` 11 = **43 passed**.

---

## Stop for review

052D is ready to review. Still not in `advisor.chat`. Next would be executor wiring (052E?) only after approval.
