# RFSN-052E — Evidence-First GM Advisor

**Status:** Wired into `advisor.chat` + `POST /api/advisor/stream`. No push/deploy.

Source: `server/advisorEvidenceExecutor.ts`  
Tests: `server/advisorEvidenceExecutor.test.ts` (11) + `server/advisor.chat.test.ts`  
Depends on: 052B scope, 052C planner, 052D package

---

## Flow (both surfaces)

```
User question
→ active league resolution
→ historical scope resolver
→ owner identity resolution
→ League Intelligence Planner
→ authoritative evidence package
→ deterministic answer  OR  grounded LLM narrative  OR  current-season Advisor fallback
```

Chat and stream call the same `runAdvisorEvidencePath`.

---

## Answer modes

| Mode | When | LLM? |
| --- | --- | --- |
| Deterministic | `deterministicFirst && !narrativeAllowed` (margins, reigning champ, title leaderboard) | No |
| Grounded narrative | Historical intent needing multiple authorities (H2H, rivalry, GOAT, why-haven’t-I-won, …) | Yes — only to explain verified evidence |
| Advisor fallback | Current-season / unknown coaching (`fallbackToAdvisorContext`) | Yes — existing War Room context; **no** full-history package |

Deterministic answers state coverage (`Across recorded league history from 2010–2025…`).  
Missing data uses: `This league does not have recorded [dataset] for [coverage].`  
Conflicting title counts / H2H vs rivalry are labeled, not merged.  
User-facing text does not name internal modules.

---

## Telemetry (`meta` on chat; `done.meta` on stream)

| Field | Meaning |
| --- | --- |
| `resolvedLeagueId` | Active league after resolve + sanitize |
| `resolvedScope` | `{ type, startSeason, endSeason, phase }` |
| `intent` | Planner intent |
| `authoritiesUsed` | Planner authority ids (empty on fallback) |
| `deterministicShortCircuit` | True when no LLM |
| `evidenceCoverage` | `{ startSeason, endSeason, notes }` |

Existing 049/049B fields (`classification`, `llmInvoked`, tokens, …) are unchanged.

---

## Tests

Executor: coverage phrasing · reigning champ · unmerged title counts · missing championships · matchup margins · grounded H2H prompt · deterministic short-circuit telemetry · H2H package-before-LLM · current-season skip · owner alias before H2H assemble.

`advisor.chat`: 049 still skips LLM via evidence path; 049B start/sit still LLM + `advisor_fallback` telemetry.

Vitest (052B–E + chat): **61 passed** (20 + 12 + 11 + 11 + 7).

---

## Known follow-ups (not in 052E)

- Live package loaders still thin for draft / trades / timeline / dossier; grounded path will say the dataset is unrecorded rather than invent.
- Start/sit without “this week” still defaults scope to `league_history` (052B), but planner fallback prevents historical fan-out.
- UI does not display telemetry (chat `meta` only).

**Stop for review.** No push/deploy.
