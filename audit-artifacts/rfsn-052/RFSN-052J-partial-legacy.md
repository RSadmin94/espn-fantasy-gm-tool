# RFSN-052J — Partial Legacy Seasons in GM Advisor Championship History

**Status:** Preview validation **PASS (8/8)**. Not Production. No push.

> **Preview history (do not confuse runs):**
> Run 1 (`buildTime=2026-08-09T01:12:45.396Z`) was **5 PASS / 3 FAIL** (3 of 8 failed).
> That result is **SUPERSEDED**. Authoritative gate is Run 2: **8 PASS / 0 FAIL**
> (`buildTime=2026-08-09T01:18:53.684Z`). See §7.

---

## 1. Source of 2009 podium data

Championship screen + History / Hall of Fame already read **`league_medals`** (`source: espn_history_medal` — ESPN League History scrape / Sync medals UI), including:

- `championOwner`
- `runnerUpOwner`
- `thirdPlaceOwner`

Owner resolution (HoF / History):

1. In-season `gm_teams` name match (`resolveMedalTeamToOwnerKey`)
2. Approved **`owner_aliases`** fallback for seasons with no roster rows

That is the same verified podium source. No second title ledger was added.

---

## 2. Why Advisor excluded it

`championshipAuthority.resolveChampionsFromRows` only iterated **`gm_teams` seasons**.

2009 has verified medals (and alias resolution on HoF) but **no usable `gm_teams` / `gmMatchups`**. The season never entered `championKeyBySeason` / `titlesByKey`, so Advisor Championship Authority totals started at the first full-data year (live 052I: **2010–2026**, LOZELL **2 — 2011, 2021**).

Coverage for Advisor also came from `teams` seasons (`getLeagueHistoricalCoverageSignals`), which clipped championship language to the matchup/roster span.

---

## 3. Season classification (generic, not hardcoded years)

| Kind | Rule |
| --- | --- |
| **FULL** | Completed `gmMatchups` present → records, H2H, scores, champion |
| **PARTIAL_LEGACY** | Verified `league_medals` podium, **no** usable matchup history |
| **NONE** | No podium and no matchups |

On 457622 (from 052I live + this defect): **2009 = partial legacy**; **2010–2025/2026 = full** where matchups exist. Other leagues: same classifier, no year constants.

---

## 4. Behavior change

Championship Authority now:

- Unions **medal seasons ∪ gm_teams ∪ matchup seasons**
- Resolves podium-only medals via the **same approved-alias map as HoF**
- Counts those titles (and RU / 3rd) without inventing team IDs, scores, or matchups
- Exposes `partialLegacySeasons`, championship coverage vs matchup coverage

Advisor:

- Title questions: **“Across recorded championship history from {champStart}–{champEnd}…”**
- Matchup / record questions: still use the **full-data** range
- Unsupported partial-season asks (record, championship score, Week N):  
  **“{year} is preserved as a partial legacy season. The recorded data includes final podium placement, but detailed matchup history is unavailable.”**

---

## 5. LOZELL title total / leaderboard

**Before (052I live Preview, 457622):**

| | |
| --- | --- |
| LOZELL STYLES | **2** (2011, 2021) |
| Phrase | Across recorded **league history** from **2010–2026** |
| Leaderboard | Graham 3 (2012, 2013, 2018) · Demetri 3 (2014, 2017, 2024) · Bruce 2 · LOZELL 2 · Randy 2 · Rod 2 · Nate 1 · steven 1 |

**After (code + offline contract):**

If `league_medals` 2009 champion resolves to the same owner as HoF (example: LOZELL):

| | |
| --- | --- |
| LOZELL STYLES | **3** (2009, 2011, 2021) |
| Phrase | Across recorded **championship history** from **2009–…** |
| Leaderboard | Same medal table as Championship/History, with 2009 included. Three-title owners sort by name among ties. Matchup coverage stays **2010–…**. |

**Live Preview (authoritative Run 2, `buildTime=2026-08-09T01:18:53.684Z`):** 8/8 PASS. LOZELL 3 (2009, 2011, 2021); leaderboard matches HoF (Graham/Demetri/LOZELL all 3); 2009 RU Steffon Bizzell; 2009 third Jan Graham; 2009 RS record / championship score / Week 8 → partial-legacy sentence; Demetri vs LOZELL H2H still 2010–2025. Production not touched. Identity is not hardcoded — it follows `league_medals` + aliases.

A prior Preview run (5/8 pass, 3 limitation fails) is archived and **superseded** — see §7.

---

## 6. Tests / check / build

| Suite | Result |
| --- | --- |
| `championshipAuthority.test.ts` | 11/11 (5 new 052J) |
| `advisorEvidence052j.test.ts` | 9/9 (season_matchup_detail intercept) |
| Related 052F/H/I + trophy/receipts | pass |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 (`2b6ec62 @ 2026-08-09T01:02:12.095Z`) |

Required cases covered:

1. Partial-legacy champion counts toward totals  
2. Runner-up + third remain available  
3. Missing matchup history is not fabricated  
4. Full-data seasons unchanged  
5. Leaderboard uses medal totals including partial  
6. Named-owner totals match History-style medal seasons  
7. Coverage language differs by fact type  
8. No duplicate title from alias merge of the same season  

---

---

## 7. Preview validation history (supersession)

| Run | buildTime | Score | Artifact | Use? |
| --- | --- | --- | --- | --- |
| 1 | `2026-08-09T01:12:45.396Z` | **5 PASS / 3 FAIL** | [`RFSN-052J-live-preview-run1-superseded.md`](./RFSN-052J-live-preview-run1-superseded.md) | **SUPERSEDED** |
| **2** | `2026-08-09T01:18:53.684Z` | **8 PASS / 0 FAIL** | [`RFSN-052J-live-preview.md`](./RFSN-052J-live-preview.md) | **Authoritative** |

Run 1 podium/title/leaderboard/H2H already passed. The 3 fails were unsupported 2009 asks (RS record, championship score, Week 8) that fell through to LLM and invented facts (e.g. a 6-7 record). Planner intent `season_matchup_detail` was added so those questions load championships and hit the deterministic partial-legacy intercept. Run 2 after that Preview redeploy is the only result that counts.

Do not cite Run 1 (5/8, or “3 of 8 failed”) as the 052J Preview outcome.

---

**RFSN-052J Preview gate green (Run 2, 8/8).** Ready to ship as a small corrective follow-up to 052. Stop. Do not promote to Production until explicitly asked.
