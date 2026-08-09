# RFSN-052F — Advisor H2H + Championship Authority Wiring

**Status:** Wired into the 052E evidence path. No push/deploy.

Closes:
1. H2H questions falling through to the LLM
2. Championship / ring totals being narrated (and hallucinated) before correction

---

## Routing (deterministic, no LLM)

| Question | Intent | Authority |
| --- | --- | --- |
| Rod vs Bruce / Demetri vs LOZELL | `h2h_pair` | H2H Authority + Owner Identity |
| check their head-to-head / who owns who? / how many times have they met? / what’s their playoff record? | `h2h_pair` | same (pronouns resolve from chat history when possible) |
| how many rings does LOZELL have? / how many titles does Rod have? | `owner_championships` | Championship Authority only |
| who has more championships, Rod or Bruce? | `championship_compare` | Championship Authority only |
| retired owner ring count (Vince) | `owner_championships` | Championship Authority only |
| pair with no recorded meetings | `h2h_pair` | specific missing-data sentence |

`h2h_pair` authorities: `owner_identity`, `h2h`, `playoffs` (rivalry engine no longer in the H2H answer path).  
Ring counts never use HoF, career dossier, or LLM estimates. Medal totals are primary; standings-fallback is labeled and not merged.

---

## H2H answer (when recorded)

Opens with: **“Across recorded meetings from X–Y…”**  
Includes when available: regular-season record, playoff record, meetings, coverage range, eliminations, recent record, streaks, closest game, biggest blowout.  
Ends with: **“Not all-time. Recorded meeting coverage is X–Y.”**

No meetings:
`This league does not have recorded head-to-head meetings for A vs B for [coverage].`

---

## Championship answer

`Across recorded league history from 2010–2025, LOZELL has 2 championships (2016, 2019).`

Never “all-time” unless coverage is complete and verified (this increment never claims all-time).

---

## Tests

`server/advisorH2hChampionship.test.ts` (11) + planner/executor updates.

Coverage: Rod vs Bruce · Demetri vs LOZELL · alias variants · retired owners · championship counts · compare · no recorded meetings · pronoun H2H via history.

Vitest: planner 15 + executor 11 + package 11 + 052F 11 + advisor.chat 7 = **55 passed** (plus 052B 20 if included).

---

**Stop for review.** No push/deploy.
