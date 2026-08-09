# RFSN-052H — Close Live Historical Evidence Gaps

**Status:** Preview live gate **9/9 PASS** (Sleeper/Workbook switch SKIP — not connected). **Do not promote to Production.**

Preview host: `https://sprint-8-preview.fantasyfootballrivals.com`  
Preview deploy: `buildTime=2026-08-08T15:47:57.377Z` (health `gitSha` still GitHub `dff6154`, known CLI-upload caveat)  
Production unchanged: `06b35ba` / `buildTime=2026-08-08T04:27:20.181Z`

---

## Root causes (052G live)

| # | Failure | Root cause |
| --- | --- | --- |
| 1 | Pronoun H2H: “Check their head-to-head stats.” after Demetri vs LOZELL resolved **Bruce vs Demetri** | Follow-up owner resolution scanned chat history against the **current-season alias list**. Historical LOZELL is absent from 2025 membership, so the scan picked Bruce + Demetri. No persisted `lastResolvedOwners` pair. |
| 2 | “Who has the most championships?” became a two-owner compare | Planner treated `ownerCount ≥ 2` (false aliases like “the”/“most”, or leftover named owners) as `championship_compare`. Unnamed most-titles must be a **leaderboard**. |
| 3 | Playoff eliminations → “none recorded” | `loadAdvisorEvidenceSources` never filled `playoffEliminations`. Rivalry Center already had playoff meeting wins from **H2H Authority**. Advisor formatters hit empty snapshot → missing-dataset copy. |
| 4 | Career records → “no data” | Same gap: `careerRecords` never loaded. Owner Dossier / Hall of Fame already expose career W-L-T via `buildHallOfFamePayload.ownerRecords`. |

---

## Authorities reused (no second engines)

| Intent | Authority | Module |
| --- | --- | --- |
| Pronoun / pair continuity | Conversation context (user+league) + Owner Identity aliases across seasons | `advisorConversationContext` · `listAdvisorOwnerAliases` + `buildOwnerIdentityAuthority` |
| Championship leaderboard | Championship Authority (medal totals; fallback labeled, not merged) | `championshipAuthority.buildChampionshipAuthority` |
| Championship compare (named X or Y) | Championship Authority + Owner Identity | same + `ownerIdentityAuthority` |
| Playoff eliminations | **H2H Authority** playoff meetings (same corpus Rivalry uses) | `h2hAuthority.eliminationsInflicted()` — winner of a completed playoff gmMatchup = one elimination |
| Career W-L-T / win% / most wins / most losses | Hall of Fame owner records (regular season), Owner Identity first | `hallOfFameService.buildHallOfFamePayload.ownerRecords` |
| One-point / 50+ blowouts | existing matchup margin tool | `matchupMarginTool.tryMatchupMarginToolAnswer` |

No LLM fallback for any of the above deterministic intents.  
No current-season standings substitute for career history.  
Historical owners remain valid when absent from 2025 membership.  
League switch uses a different `userId::leagueId` key (prior pair cannot leak).

---

## Conversation context shape

```
{
  lastResolvedOwners: [],
  lastIntent,
  lastScope,
  lastLeagueId
}
```

Scoped by `userId + active league`. Follow-up cues (`their`, `those two`, `them`, `head-to-head`, `compare them`, `who leads`, `playoff record`) prefer the prior resolved pair before fresh name inference.

---

## Tests (offline)

`server/advisorEvidence052h.test.ts` + planner/H2H/executor/historical regression:

1. Demetri + LOZELL → “their H2H” keeps Demetri + LOZELL (even when current-season aliases omit LOZELL)
2. Historical owner absent from current season remains resolvable in follow-up
3. League switch clears / isolates prior pronoun owner pair
4. “Who has the most championships?” → leaderboard
5. “Who has more championships, X or Y?” → comparison
6. Playoff elims from H2H/Rivalry-shaped snapshot (victim when available, playoffs only, coverage, provenance)
7. Career win% / worst / most wins / most losses from HoF-shaped records
8. Empty snapshot → precise missing-dataset sentence
9. No LLM fallback for deterministic intents

Vitest: 71/71 on 052H + planner + executor + package + H2H + historical regression.  
`tsc --noEmit`: clean.

---

## Live Preview gate (457622) — before / after

| Question | 052G before | 052H after | Verdict |
| --- | --- | --- | --- |
| LOZELL championships | 2 (2011, 2021) | 2 (2011, 2021) | PASS (kept) |
| Compare Demetri vs LOZELL | RS 10–10–0 · playoffs Demetri 5–1–0 | same | PASS (kept) |
| Check their H2H | **Bruce vs Demetri** | **Demetri vs LOZELL** RS 10–10–0 · PO 5–1–0 | **PASS** (was FAIL) |
| Who has the most championships? | Compare Graham 3 vs Bruce 2 | Leaderboard: Graham 3, Demetri 3, Bruce 2, LOZELL 2, … | **PASS** (was FAIL) |
| Most playoff eliminations | “does not have recorded…” | LOZELL 26 inflicted (playoffs only) · most often vs Steffon Bizzell (6) · Next Randy 23, Christian 22, Rod 22 | **PASS** (was FAIL) |
| Best career win% | “does not have recorded…” | Reginald Sellers 76.9% (10–3–0 RS) | **PASS** (was FAIL) |
| Worst career record | “does not have recorded…” | orlando howard 23.1% (3–10–0 RS) | **PASS** (was FAIL) |
| One-point losses | Mark Deroux 4 / 1,399 RS | Mark Deroux 4 / 1,399 RS | PASS (kept) |
| 50-point blowout wins | Christian Graham 32 | Christian Graham 32 | PASS (kept) |
| League switch | no Sleeper/Workbook | SKIP — still none on founder Preview | not fabricated |

Full transcript: `audit-artifacts/rfsn-052/RFSN-052H-live-gaps.md`

---

## Remaining blockers (not Production-ready)

1. **Sleeper API + Workbook switch** still not connected on founder Preview. Do not fabricate.
2. **Career win% / worst record** use HoF `ownerRecords` with `gamesPlayed > 0` only — short-tenure owners (13 RS games) can lead. HoF itself has no min-games filter; if product wants multi-season careers, reuse that same filter (do not invent a second career engine).
3. **Playoff eliminations** tally every completed H2H `isPlayoff` meeting win (same flag Rivalry uses). That may include consolation/toilet-bowl weeks, not only knockout bracket. Qualifier: “playoffs only · recorded playoff meetings · not all-time.”
4. Conversation context is **in-memory per process**; durable follow-up also uses chat history + Owner Identity aliases (this is what kept LOZELL on Preview). Multi-replica may miss in-memory pair for one hop; history+identity still applies.
5. Preview health `gitSha` still reports GitHub `dff6154` on CLI upload — trust `buildTime`.

**Stop after Preview validation. No Production.**
