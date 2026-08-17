# RFSN-055A — Preview validation (Historical Draft Grades + Draft Reality)

**Status:** Live Preview only. Not Production. Does not promote 055. No Chrome extension / onboarding changes.

**Host:** `https://sprint-8-preview.fantasyfootballrivals.com`
**Git:** `5b34a29` on `feature/provider-expansion`
**Railway:** Git deploy `3de133fb` SUCCESS (not CLI)
**commitHash:** `5b34a298a7e88616764b489322e5f6039ecad521`
**buildTime:** `2026-08-17T18:05:23.401Z`
**gitSha (stale):** `dff6154` — ignore
**Founder league:** ESPN `457622`
**Live JS:** `assets/index-Dg3B4XnJ.js` contains `historicalDraftEvaluation`, `Draft Night`, `Draft Results`; does not contain `Best Pick`

Stop here for founder review of Team view. Do not Production.

---

## Authorities reused (no new formula)

| Question | Authority |
| --- | --- |
| Draft Night letter | `computeOwnerDraftMetrics` (`shared/draftNightGrading.ts`) |
| Same-season ADP | `loadDraftPickEvidence` → `ensureSameSeasonEspnOffenseAdp` + `isUsableAdp` |
| Biggest Reach | `classifyReach` / `selectBiggestClassifiedReach` |
| Biggest Steal | RFSN-055 `stealDelta` (pick − ADP, keepers excluded) |
| Draft Results | `computeDraftReality.draftGrade` (0–100) |
| Untouched record / rank | `OwnerImpact.draftRecord`, `draftRank`, standings `wins` |
| Roster Management | `computeDraftReality.rosterMgmtGrade` (not `careerSimGrades` headroom overlay) |

API: `espn.historicalDraftEvaluation` `{ season, activeLeagueKey? }` → per-owner `draftNight` + `draftReality`. 30-minute season cache around `computeDraftReality`. Query runs only on Team view (`staleTime` 5 min).

---

## Coverage matrix — ESPN 457622

| Season | Board | Draft Night | Draft Results | Notes |
| --- | --- | --- | --- | --- |
| 2010 | yes (legacy recap) | — ADP unavailable | — floor 2018 | Do not hide the board |
| 2017 | yes | — ADP unavailable | — floor 2018 | |
| 2018 | yes | **A–F** (same-season ADP, 153 usable) | — unjoined | Engine returned 1 GUID-only impact; not published |
| 2019 | yes | — 0 usable ADP | **yes** | Player IDs exist; same-season ESPN ADP currently empty |
| 2020 | yes | **yes** | **yes** | |
| 2021 | yes | **yes** | **yes** | |
| 2022 | yes | **yes** | **yes** | Independence proof (F vs 8) |
| 2023 | yes | **yes** | **yes** | Independence proof (A vs 8) |
| 2024 | yes | **yes** | **yes** | |
| 2025 | yes | — sentinel ADP stripped | **yes** | Night stays honest until 2025 ADP is healthy |

2019 Night is coverage-honest, not a new formula. Do not backfill another season's ADP.

---

## Draft Night examples — Rod Sellers

### 2018 (usable ADP)

Letter **A**. `valueScore` 0.709. 11 ADP-joined non-keeper picks. League-wide `computeOwnerDraftMetrics` (not graded in isolation).

| Player | Pick | 2018 ADP | stealDelta | reachDelta |
| --- | --- | --- | --- | --- |
| Le'Veon Bell | 14 | 20.7 | −6.7 | 6.7 |
| Larry Fitzgerald | 19 | 32.4 | −13.4 | 13.4 |
| Devonta Freeman | 20 | 25.7 | −5.7 | 5.7 |
| Golden Tate | 38 | 49.2 | −11.2 | 11.2 |
| Tom Brady | 45 | 23.7 | +21.3 | −21.3 |
| Unknown | 103 | 113.7 | −10.7 | 10.7 |
| Unknown | 104 | 44.5 | +59.5 | −59.5 |
| Philip Rivers | 132 | 116.5 | +15.5 | −15.5 |
| John Brown | 143 | 138.4 | +4.6 | −4.6 |
| Unknown | 157 | 126 | +31 | −31 |
| Unknown | 178 | 147.1 | +30.9 | −30.9 |

Biggest Reach: Larry Fitzgerald, pick 19 · ADP 32.4 · 13.4 spots early (`classifyReach` early-phase floor, not ≥8 hardcoded).
Biggest Steal: Unknown, pick 104 · ADP 44.5 · +59.5 spots (canonical `stealDelta`). Name is missing in `gmDraftPicks`, not invented.

Draft Results: **not shown**. `computeDraftReality(2018)` weeks=18 / confidence High but `ownerImpacts.length === 1` with a GUID name and `teamId: null`. Composer refuses to publish unmatched results.

### 2022

Letter **F**. `valueScore` 0. 6 usable ADP picks (keepers + missing names reduce the ADP set). All six earlier than ADP.

Biggest Reach: Unknown, pick 43 · ADP 128.03 · 85 spots early.

Draft Results **8 / 100**. Untouched 13th of 14. Projected **5–11**. Actual **3–11**. Difference **+2 wins**. Roster Management **50 / 100**.

Night F and Results 8 are independent. Neither overwrites the other.

### 2024

Letter **C**. 6 usable ADP picks.

Biggest Reach: Evan Engram, pick 58 · ADP 123.38 · 65.38 spots early.
Biggest Steal: none (no positive `stealDelta`).

Draft Results **33 / 100**. Untouched 9th of 13. Projected **7–9**. Actual **5–8**. Difference **+2 wins**. Roster Management **33 / 100**.

### 2023 (independence)

Night **A** / Results **8**. Projected **4–12** vs actual **7–7**.

### 2025

Night **—** Historical ADP unavailable (0 usable ADP; ESPN sentinel rejected).
Results **77 / 100**. Untouched 4th of 14. Projected **10–7**. Actual **9–5**. Difference **+1 win**. Roster Management **62 / 100**.

---

## Untouched vs actual records

Authoritative when Draft Reality joins. Sourced from existing `draftRecord` / `actualRecord` and standings `wins`. Win difference = simulated wins − actual wins. Not a second replay.

Known engine caveat (already documented in `computeDraftReality`): draft-only replay uses weeks with per-player stats; actual ESPN records can include a different number of games. 2025 Rod 10–7 vs 9–5 is that case. Displayed as returned; not renormalized.

---

## Performance (local founder DB, cold `computeDraftReality`)

| Season | timingMs | Notes |
| --- | --- | --- |
| 2010 | 739 | picks only; no reality |
| 2017 | 108 | |
| 2018 | 858 | reality computed then unpublished |
| 2019 | 2047 | |
| 2020 | 480 | |
| 2021 | 1501 | |
| 2022 | 633 | |
| 2023 | 1724 | |
| 2024 | 2181 | |
| 2025 | 3046 | |

Repeat hits within 30 minutes reuse the in-memory reality cache. Team view does not refetch on every board interaction.

---

## Tests / typecheck / build

- `npx vitest run server/historicalDraftEvaluation.test.ts client/src/pages/DraftHistory.evaluation.test.ts` — **16 passed**
- Related: `server/draftIntelligence.test.ts` + `server/services/rfsn/draftNightGrading.test.ts` still green
- `npx tsc --noEmit` — pass
- `npm run build` — pass (local `build-meta` then overwritten by Railway Git build)

Checklist from the ticket:

1. 2018 Night exists with same-season ADP — **PASS**
2. 2019–2024 Night where evidence exists — **PASS** for 2020–2024; **2019 Night unavailable** (0 usable ADP)
3. 2010 Night unavailable — **PASS**
4. 2017 Night unavailable — **PASS**
5. 2025 Night unavailable with ADP reason — **PASS**
6. No current-season ADP joined to a historical season — **PASS** (`ensureSameSeasonEspnOffenseAdp(season)` only)
7. ESPN ~170 sentinel rejected — **PASS** (`isUsableAdp`, 2025 usableAdp=0)
8. Keepers excluded from value/reach/steal — **PASS** (unit)
9. Reach uses `classifyReach` phase floors — **PASS** (unit)
10. Biggest Steal uses 055 `stealDelta` — **PASS**
11. Draft Results uses `computeDraftReality` — **PASS**
12. Results unpublished when weeks/identity fail — **PASS** (MIN_WEEKS unit; 2018 unmatched live)
13. Night and Results can disagree — **PASS** (2022 F/8, 2023 A/8)
14. Roster Management from Draft Reality — **PASS** (raw `rosterMgmtGrade`)
15. Board view unchanged — **PASS** (source test; live JS has no Best Pick)
16. Team view overflow — **not visually measured** (Preview Clerk sign-in in agent browser). Grades use `text-3xl` + 054D tokens + `flex-wrap`. Founder should confirm at 1366–1920.
17. Existing Draft History intact — board default unchanged; evaluation query Team-view only

---

## Unsupported requested fields

| Request | Disposition |
| --- | --- |
| Best Pick | Not implemented. No canonical authority. |
| Headline `overallGrade` (55/45 mix) | Kept off Draft History. Engine still returns it elsewhere. |
| Letter pluses (B+) | Existing bands are A/B/C/D/F or —. |
| Narrative “good value relative to the market” | Not shown. |
| 2018 Draft Results | Engine output not joinable; honest —. |
| 2019 Draft Night | Same-season ADP currently empty; honest —. |
| Resolving `Unknown` player names | Existing `gmDraftPicks.playerName` gap. Not invented. |
| Advisor “How was my 2022 draft?” | Later increment. Same query should be consumed later. |
| 2010–2017 owner cards from `gmDraftPicks` | Picks collapse to Team 0 (no owner join). Team view still uses the legacy recap ledger. Grades stay —. |

---

## UI note for founder

Open Preview `/draft/history`, ESPN 457622, **Team** view (leave Board as the pick ledger).

Expected:

- 2010 / 2017: Night — / Results — plus coverage copy; board still listed
- 2018: Night letters; Results —
- 2022 Rod: Night **F**, Results **8**, projected 5–11 vs actual 3–11
- 2024 Rod: Night **C**, Results **33**, Engram biggest reach
- 2025: Night — Historical ADP unavailable; Results **77**

Roster Management copy: compares actual season results with the draft-only simulation. It does not score individual trades.
