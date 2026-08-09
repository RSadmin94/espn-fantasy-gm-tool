# RFSN-052I — Tighten Career Record and Playoff Elimination Semantics

**Status:** Preview live gate **11/11 PASS** (Sleeper/Workbook switch SKIP). **Do not promote to Production.**

Preview host: `https://sprint-8-preview.fantasyfootballrivals.com`  
Preview deploy: `buildTime=2026-08-08T22:01:38.280Z`  
Production unchanged: `06b35ba` / `buildTime=2026-08-08T04:27:20.181Z`

---

## 1. Career record qualification

HoF `ownerRecords` is unchanged. Advisor leaderboard-style career questions apply a **league-relative** bar:

| Input | Rule |
| --- | --- |
| Universe | HoF ownerRecords with `gamesPlayed > 0` |
| `medianGames` | median of RS games |
| `medianSeasons` | median of `seasonsActive` |
| `minGames` | `round(medianGames)` |
| `minSeasons` | `2` if median tenure ≥ 2, else `1` |
| Qualified | `games ≥ minGames` AND `seasons ≥ minSeasons` |

**Why defensible:** scales with league age. A 1-year league median ≈ a full season (everyone who finished RS qualifies). A 16-year league median drops one-season flukes (Reginald 13 games / orlando 13 games) without a hardcoded 50-game constant. Two-season floor only applies when the league itself has multi-season careers.

**Affected intents:** best career win%, worst career record, most efficient owner, most career wins/losses.

**Named owner still answers below the bar:**  
“How good was Reginald Sellers?” → actual 10–3–0 (13 RS games, 1 season) + “Below the career leaderboard bar…”.

---

## 2. Playoff elimination semantics

Source: same **gmMatchups + Owner Identity** H2H Authority (Rivalry corpus). No second engine.

| ESPN field | Meaning |
| --- | --- |
| `isPlayoff` | ANY non-`NONE` `playoffTierType` — **includes consolation / losers bracket** |
| `rawMatchup.playoffTierType` | `WINNERS_BRACKET` vs `LOSERS_BRACKET` / consolation |
| 3rd-place game | Also `WINNERS_BRACKET` in the final period; excluded when semi-final winners identify the title game (same tracing as championship matchup ID) |

**If tier coverage is reliable** (≤10% unknown among playoff meetings, ≥1 WINNERS_BRACKET):  
label **championship-bracket playoff eliminations** (consolation excluded; placement excluded when identifiable).

**If tier cannot prove elimination:**  
label **recorded playoff wins against opponents** — do not call them eliminations.

Pair H2H RS/PO W-L-T still uses `isPlayoff` (Demetri vs LOZELL 10–10–0 / 5–1–0 unchanged).

---

## 3. Live 457622 (before → after)

| Question | 052H before | 052I after | Gate |
| --- | --- | --- | --- |
| Best career win% | Reginald Sellers 76.9% (10–3–0, 13 games) | **LOZELL STYLES 59.7% (126–85–0)** among owners with ≥**40 RS games** (league median) and **2 seasons** | PASS |
| Worst career record | orlando howard 23.1% (3–10–0, 13 games) | **Vince Sellers 38.1% (16–26–0)** under the same bar | PASS |
| How good was Reginald Sellers? | n/a | **76.9% (10–3–0, 13 RS games, 1 season). Below the bar of 40/2.** | PASS |
| Most playoff eliminations | LOZELL 26 “eliminations inflicted” | **LOZELL 26 recorded playoff wins** — consolation/placement may be included; **not proven eliminations** (tier coverage insufficient) | PASS |
| Biggest playoff villain | same false elim label | **LOZELL 26 recorded playoff wins** (same honest scope) | PASS |
| LOZELL titles | 2 (2011, 2021) | same | PASS |
| Demetri vs LOZELL | RS 10–10–0 · PO 5–1–0 | same | PASS |
| Their H2H follow-up | Demetri vs LOZELL | same | PASS |
| One-point losses | Mark Deroux 4 | same | PASS |
| 50+ blowouts | Christian Graham 32 | same | PASS |
| Championship leaderboard | Graham 3, Demetri 3, … | same | PASS |

Live median on 457622 is **40 RS games** (many short/mid-tenure owners pull the median down). Vince 42 games just clears it. If product wants a higher bar later (e.g. 75th percentile or 3 seasons), reuse the same HoF rows — do not invent a second career engine.

Playoff: Preview `gmMatchups.rawMatchup` does **not** have enough `playoffTierType` to prove WINNERS_BRACKET (unknown-tier ratio > 10%). Advisor therefore uses the honest label required by the ticket rather than calling them eliminations.

Full transcript: `audit-artifacts/rfsn-052/RFSN-052I-live-semantics.md`

---

## Tests / check / build

- Focused vitest: career qualification, playoff tier, 052I, 052H, planner, H2H, executor, package, 052G regression — **87/87**
- `tsc --noEmit`: clean
- `npm run build`: (run before Preview deploy)

**Stop after Preview validation. No Production.**
