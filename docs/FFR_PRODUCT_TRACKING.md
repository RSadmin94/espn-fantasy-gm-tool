# Fantasy Football Rivals — Product Tracking

**Status:** Official operational source of truth for project status  
**Edition:** 2026-08-09  
**Authority:** Product + engineering. Conflicts with code or live environments are listed under **Inconsistencies**, not guessed away.  
**Does not replace:** `PRODUCT_CONSTITUTION.md` (product law) · `docs/architecture/FFR_2.0_Product_Architecture.md` (IA lock) · per-ticket audit artifacts.

**Environments**

| Env | Host | Railway | Git trigger (intended) | Last verified live SHA / buildTime |
| --- | --- | --- | --- | --- |
| **Production** | `https://www.fantasyfootballrivals.com` | env `87b948fd-810d-4be2-a0b7-651ec0468200` | `release/promote-provider-expansion-dff6154` | **`06b35ba`** · buildTime `2026-08-08T22:14:10.014Z` (RFSN-052 close) |
| **Preview** | `https://sprint-8-preview.fantasyfootballrivals.com` | env `sprint-8-preview` · service `espn-fantasy-gm-tool` `55c68659-ee4c-4352-98f7-4fff0e4aad87` | `feature/provider-expansion` | Git tip **`2b6ec62`** (051C contrast). Advisor **052J** also live via CLI upload · buildTime **`2026-08-09T01:18:53.684Z`** (health `gitSha` often stale `dff6154`) |
| **Local working tree** | localhost | — | uncommitted | 051C typography scale · 053C gallery UI · 052J · **052K** margin intent |

Founder leagues: ESPN **`457622` ATLANTAS FINEST FF**, ESPN **`480452315` Dynasty**, ESPN **`158918` Teco’s**. Do not fabricate Sleeper/Workbook validation.

---

## Executive Project Status

Fantasy Football Rivals is a **live production product** (Clerk auth, multi-league ESPN + Sleeper/Yahoo/workbook paths, Rivalry Center, Draft War Room, RFSN, GM Advisor, billing). The current engineering focus is **historical intelligence quality** (Advisor facts, championship coverage, typography, matchup gallery) without reopening Advisor / Rivalry / live Matchups architecture.

| Layer | State |
| --- | --- |
| Production | Stable at **052 A–I close** (`06b35ba`). Advisor first answers match Preview on the five 052 smoke probes. LOZELL titles still **2 (2011, 2021)** — 2009 podium not in Advisor yet. |
| Preview | Ahead of Production: **051A/B/C contrast** on `feature/provider-expansion` + **052J** Advisor partial-legacy (Preview-validated 8/8). |
| Local / unpushed | **051C typography & readability implementation** (scale/spacing) · **053A/B/C** Historical Matchup Gallery · **052K** margin intent expansion. Not Preview, not Production. |
| Do not | Promote to Production unless explicitly asked. Do not push unless asked. |

**Headline gap:** Championship/History already treat **2009 as verified podium**. Production Advisor does not. Preview 052J does (LOZELL **3: 2009, 2011, 2021**). Ship 052J to Production when approved.

---

## Current Production Features

Shipped and live on `www.fantasyfootballrivals.com` (`06b35ba`, 052 close).

| Area | What’s in Production |
| --- | --- |
| Auth / leagues | Clerk · connected leagues · ESPN / Sleeper / Yahoo / workbook onboarding · sync |
| Home / My Team | Home, Dashboard, Roster, Matchup, Trades, GM Advisor, My GM, Championship Path |
| Rivals | Cast, Owner Dossier, H2H, Rivalries, League Map, Relationships · RFSN-047/048 evidence scope |
| RFSN | Live, Stories, Recaps (+ deep-link Breaking/Analysts) |
| Draft | War Room, Live Draft, Mock, Keepers, Draft History · FantasyPros solo mock connector (030C) |
| League | Standings, Power Rankings, Playoffs, History/HoF/Records/Timeline/Transactions, Commissioner |
| Advisor (052 A–I) | Evidence-first planner · H2H + Championship Authority · margin analytics (049) · career/playoff semantics (052I) · coverage phrases · no generic LLM fallback for wired facts |
| Commercial | Free + Rivals Pro Stripe · The League deferred |
| Extension | GM War Room / Board Mirror (version in tree; not Railway) |

Production Advisor championship coverage still starts at **full-data seasons (≈2010)**, not 2009 podium-only.

---

## Preview Features

On Preview **in addition to** Production, unless noted.

| Item | Preview status | Notes |
| --- | --- | --- |
| **RFSN-051A** typography system repair | Live (committed `22d5bfa` / `2befaac`) | Plugin, body leading, MUTED token, dark: variant |
| **RFSN-051B** zinc → ink tokens | Live (`b551cac`) | AA failures −75% on settled census |
| **RFSN-051C contrast** | Live (`2b6ec62`) | Nav kicker + white-alpha on Commissioner / Championship Path / Stories |
| **RFSN-052 A–I** Advisor historical intelligence | Live + **promoted to Production** | Closed 2026-08-08 |
| **RFSN-052J** partial-legacy championships | **Preview-validated 8/8** (CLI upload `2026-08-09T01:18:53.684Z`) | **Not Production.** Ready to ship as small 052 follow-up |
| **RFSN-051C typography scale** (readability impl) | **Not on Preview** | Local working tree only |
| **RFSN-053A/B/C** Matchup Gallery | **Not on Preview** | Local working tree only |

Trust Preview `buildTime`, not CLI-upload `gitSha`.

---

## Active Development

Work in flight in the **local working tree** (not pushed, not Preview unless noted).

| ID | Work | Status |
| --- | --- | --- |
| **052J** | Partial-legacy podium in Advisor (`league_medals` + aliases; distinct champ vs matchup coverage; limitation sentence) | Code + Preview gate **8/8 PASS**. Awaiting Production ask. |
| **052K** | Matchup margin intent expansion (largest win / blowout / combined scores; stop one-point misroute) | **Local complete.** Not Preview. Not Production. |
| **051C (scale)** | Final typography & readability (floors, draft/RFSN/stories/commissioner spacing) | Implemented locally. Stop for review. |
| **053A** | Gallery + screenshot architecture | Complete (docs only). |
| **053B** | `matchupGallery.query` contract | Complete (tests 16/16). Not deployed. |
| **053C** | Gallery UI `/league/history/matchups` + No Mercy route | Complete locally. Not deployed. |
| **053D–L** | Advisor embed, viewer, stories, screenshots, batch, Preview smoke | **Not started.** |

No Advisor / Rivalry Center / live Matchups redesign is in progress.

---

## Roadmap

Ordered next, after current stop-for-review items. Stop after each increment. Production only when explicitly asked.

1. **Promote RFSN-052J to Production** (small corrective follow-up to 052) — when asked.  
2. **Preview-validate RFSN-052K** (largest-margin routing bugfix) — when asked. Can ship independently of 052J.  
3. **Preview-deploy RFSN-051C typography scale** (the readability implementation) after review.  
4. **RFSN-053D** — Advisor `matchup_gallery` visual return (no Advisor redesign).  
5. **RFSN-053E** — Advisor “N No Mercy victories” + gallery (dedicated **route already exists** in 053C; see inconsistencies).  
6. **RFSN-053F** — Rivalry / Owner Dossier gallery presets (link out only).  
7. **RFSN-053G** — Historical Matchup Viewer (game-day layout, honest nulls).  
8. **RFSN-053H** — Deterministic story archetypes (no LLM, no Miracle Comeback).  
9. **RFSN-053I** — Share/hype cards (resvg) + `/m/:shareCode`.  
10. **RFSN-053J** — Viewer screenshot engine.  
11. **RFSN-053K** — Batch + ZIP + scheduled job.  
12. **RFSN-053L** — Preview regression smoke (052 text probes + gallery probes). Close 053.  
13. **RFSN-MKT-001** — We Got The Tape soundtrack / marketing capture (Preview/local only).  
14. Backlog polish: RFSN-025 mobile dock, RFSN-026 synthetic ADP, 030B-3 authenticated MUD, The League commercial tier.

**Do not** reopen 052 Advisor architecture for 052J. **Do not** start another typography census (051D as “measure again” is cancelled; scale work was executed as 051C readability impl).

---

## Backlog

Newly requested or still open. Not active unless pulled onto the roadmap.

| Item | Notes |
| --- | --- |
| Historical Matchup Gallery remaining | 053D–L (Advisor embed, viewer, stories, screenshots, batch, smoke) |
| Soundtrack / marketing assets | `scripts/marketing/we-got-the-tape/` · RFSN-MKT-001 · Preview/local only · dry-run exists; full capture not a Production release |
| RFSN-025 | Mobile dock active-draft validation (from 024 close) |
| RFSN-026 | Synthetic ADP classification |
| RFSN-030B-1 / 030B-2 / 030B-3 remainder | FP types freeze after authenticated MUD evidence; solo mock already 030C |
| The League (commissioner suite as paid SKU) | Deferred commercially; Commissioner UI exists |
| Light-theme typography debt | 051 audit dark-only; light `!important` block unmeasured |
| Self-host Inter / drop unused weight 300 | 051 note, not scheduled |
| Strength of Schedule authority | Route exists; empty — no SOS engine |
| `todo.md` historical items | Many May-2026 checkboxes (Trade Aging extras, enriched H2H injection, mobile hamburger) — **stale vs FFR 2.0**; do not treat as current backlog without re-triage |
| Pinch-zoom / 051C scale on Preview+Production | Local only until deploy asked |

---

## Release History

| When | What | Where |
| --- | --- | --- |
| 2026-08-08 | **RFSN-052 CLOSED** — Advisor A–I Production close. 5/5 ESPN 457622 first-answer smoke match Preview. | Production `06b35ba` · Preview then same generation |
| 2026-08-08 | **RFSN-051A/B/C contrast** on `feature/provider-expansion` | Preview only (`2b6ec62` tip). Production unchanged |
| 2026-08-07 | **RFSN-049 / 049A / 049B / 049C** — margin analytics, active-league honor, intent-trimmed context, owner-compare rivalry routing | Production via 052 close stack |
| 2026-08-06–07 | **RFSN-047 / 048 / 048B / 048C** — active vs historical rivals; dossier evidence scope | Production |
| 2026-08-05 | Sleeper workbook Preview smoke (Arrowhead) — later **RFSN-050** cleanup of founder test connections | Preview DB only |
| 2026-07-29 | Product Encyclopedia Editions 1.1–1.3 authored in chat | **File missing from this checkout** (see inconsistencies) |
| 2026-07-19 | RFSN-030A closed · 030B planning · 031 durable ADP | Docs + branches |
| 2026-07-18 | RFSN-027C nav · RFSN-024 Live Draft UX closed | Production lineage |

CLI `railway up` to Preview does **not** always update health `gitSha`; use `buildTime`.

---

## Known Issues

| Issue | Env | Severity |
| --- | --- | --- |
| Health `gitSha` stale on Railway CLI upload (`dff6154` while buildTime is newer) | Preview | Ops confusion only |
| Production Advisor excludes 2009 podium (LOZELL 2 vs HoF 3) | Production | P1 historical fact |
| “Largest margin of victory” routed to one-point losses | Production + Preview (pre-052K) | **Fixed locally in 052K**; not deployed |
| 052J Preview run 1 failed 3/8 (LLM invented 2009 record/score) | Preview (superseded) | Fixed in run 2; do not cite run 1 |
| Aside “Players” label missing in an older 049B prod smoke | Production (historical smoke) | DEGRADED nav label; `/players` still loaded — **not re-verified in this update** |
| 053C gallery screenshot Clerk mint can time out on localhost | Local | Fixture shots used |
| Decorative draft `→` / history watermarks still fail raw AA | Preview post-051C contrast | Meaningful AA largely cleared |
| `todo.md` still lists open Trade Aging / playoff-W-L-in-prompts items | Docs | Likely stale vs later authorities — unverified |

---

## Known Limitations

| Limitation | Honest behavior |
| --- | --- |
| 2009 (and any podium-only season) | Championship/RU/3rd from `league_medals` + approved aliases. **No** RS record, championship score, or Week N matchups. 052J sentence: “{year} is preserved as a partial legacy season…” (Preview only until promoted) |
| Matchup coverage vs championship coverage | H2H / records / week asks use full `gmMatchups` span (often 2010+). Titles may start earlier after 052J |
| No in-game timeline | “Largest comeback” / “Miracle Comeback” / “biggest halftime deficit” unsupported — do not invent |
| No pre-game projections in margin tool | “Largest upset” unsupported (052K honest missing-dataset sentence) |
| Playoff tier thin on some leagues | Championship **games** vs medals: 052I honesty; gallery championship filter may empty rather than fake titles |
| Box scores / week standings sparse | Future Historical Viewer: scores always; lineups/standings null with CTA |
| Sleeper / Workbook | Not used to validate 052/053 historical facts |
| Pinch-zoom | Restored in local 051C scale; Production/Preview still `maximum-scale=1` until that impl is deployed |
| Light theme | Not in 051 measurement |
| The League SKU | Not sold in V1 |
| FantasyPros multiplayer live pick wire | Blocked on authenticated MUD evidence (030B-3) |

---

## Architecture Milestones

| Milestone | Status |
| --- | --- |
| FFR 2.0 six-section IA (Home / Rivals / My Team / RFSN / Draft / League) | **Locked** — `FFR_2.0_Product_Architecture.md` |
| One-fact-one-authority (owner, H2H, weekly stats, championships, playoff split) | **Locked** — constitution |
| Deterministic-first Advisor (planner → evidence package → format; no generic LLM facts) | **Production** (052 A–I) |
| Distinct championship vs matchup coverage + partial-legacy seasons | **Preview 052J**; not Production |
| Matchup margin intent: largest win / blowout / combined / unsupported upset | **Local 052K**; not Preview/Production |
| Matchup Gallery query authority (`matchupGallery.query`) | **Local 053B** |
| Matchup Gallery UI (History child, No Mercy preset) | **Local 053C** |
| Preview ≠ Production deploy sources | **In force** (`feature/provider-expansion` vs release branch) |
| Product Encyclopedia as feature-ID SOT | **Missing from this repo** |

---

## Recently Completed RFSNs

| ID | Title | Impl | Preview | Production |
| --- | --- | --- | --- | --- |
| 047 | Active vs historical rivals | done | yes | yes |
| 048 / B / C | Dossier rivalry evidence scope | done | yes | yes |
| 049 / A / B / C | Margin analytics + Advisor intent/context | done | yes | yes |
| 050 | Trace/remove founder test league connections | done (Preview DB) | n/a | n/a |
| 051 | Typography & readability **audit** | audit only | measured on Preview | — |
| 051A | Typography system repair | done | yes (`22d5bfa`) | no |
| 051B | Zinc → ink contrast tokens | done | yes (`b551cac`) | no |
| 051C **contrast** | Contrast completion | done | yes (`2b6ec62`) | no |
| 051C **scale** | Final typography & readability implementation | **local complete** | no | no |
| 052 A–I | GM Advisor historical intelligence | done | yes | **yes (closed)** |
| 052J | Partial-legacy championships in Advisor | done + Preview 8/8 | **yes** | **no** |
| 052K | Matchup margin intent expansion | **local complete** | no | no |
| 053A | Gallery architecture | docs complete | no | no |
| 053B | Gallery query contract | done (16/16 tests) | no | no |
| 053C | Gallery UI | **local complete** | no | no |

---

## Pending RFSNs

| ID | Title | Blocked on |
| --- | --- | --- |
| **052J Production promote** | Same code as Preview gate | Explicit Production ask |
| **052K Preview / Production** | Largest-margin routing bugfix | Review + explicit deploy ask |
| **051C scale Preview/Production** | Readability impl deploy | Review + explicit deploy ask |
| **053D** | Advisor gallery visual | 053C review / Preview optional |
| **053E–L** | No Mercy Advisor copy, dossier presets, viewer, stories, screenshots, batch, smoke | Prior increment |
| **051D** | Originally “typography scale” | **Superseded / do not start as a new audit.** Scale work landed as 051C readability impl |
| 025 / 026 | Mobile dock / synthetic ADP | Backlog |
| 030B remainder | FP multiplayer evidence + type freeze | Authenticated MUD session |

---

## Production Readiness Summary

| Candidate | Preview | Production-ready? | Action |
| --- | --- | --- | --- |
| **052 A–I** | yes | **Shipped** | Closed |
| **052J** | **8/8 PASS** (run 2 authoritative; run 1 superseded) | **Yes, when asked** | Small follow-up; do not reopen 052 |
| **052K** | no | No until Preview gate | Largest-win routing; same margin authority |
| **051A/B/C contrast** | yes (`2b6ec62`) | Not asked | Keep Preview-only until asked |
| **051C typography scale** | no | No | Review locally; then Preview |
| **053A/B/C** | no | No | Review; Preview 053C before later increments |
| **053D–L / MKT-001** | no | No | Not ready |

**Production must not receive** unpushed working-tree 051 scale or 053 gallery until explicitly requested.

---

## Inconsistencies found (doc vs impl vs live)

Do not guess these away:

1. **`docs/FFR_PRODUCT_ENCYCLOPEDIA.md` is missing** from this checkout. Editions 1.1–1.3 were written 2026-07-29 as the feature-ID SOT and linked from constitution in that chat; **the file is not in git history on this branch.** This tracking doc is the operational SOT until the encyclopedia is restored or formally retired.
2. **Two different tickets named RFSN-051C:** (a) Contrast Completion, committed `2b6ec62`, Preview; (b) Final Typography & Readability Implementation, local 2026-08-09. Audit `RFSN-051-typography-audit.md` still calls (a) “051C” and next step “051D scale.” User named the scale sprint **051C**. Both names are recorded here; **051D as a new measurement audit must not start.**
3. **052 Production close still documents LOZELL = 2 titles (2010–2026).** That remains **true on Production**. Preview 052J and HoF show **3 (2009, 2011, 2021)**. Do not update the close-out artifact; it is a historical Production snapshot.
4. **`docs/ARCHITECTURE.md`** still says active deploy branch `cursor/frontend-rebuild-stage1-9b20` and live `gmwarroom.online`. Current split is Preview `feature/provider-expansion` vs Production release branch / `fantasyfootballrivals.com`. **Stale.**
5. **Canonical route inventory (Commit 8)** does not list `/league/history/matchups` or `/no-mercy`. Those exist in **local 053C** `v2Navigation.ts` only.
6. **053E** planned a dedicated No Mercy route; **053C already added** `/league/history/matchups/no-mercy`. 053E remaining work is Advisor copy + count parity, not the route itself.
7. **`todo.md`** still has unchecked May-2026 items (Trade Aging, playoff W/L in prompts, mobile hamburger) that conflict with later RFSN/FFR 2.0 work. Not authoritative.
8. **Preview 052J vs git tip:** Preview Advisor 052J was CLI-uploaded (`buildTime=2026-08-09T01:18:53.684Z`). `origin/feature/provider-expansion` tip remains **`2b6ec62` (051C contrast)**. 052J may not be on the remote feature branch. Do not assume GitHub Preview auto-deploy = 052J.
9. **051C contrast Preview vs 051C scale local:** Preview has contrast tokens, **not** the later font-size/spacing pass.

---

## Recommendations for missing tracking information

1. Restore or officially retire **`docs/FFR_PRODUCT_ENCYCLOPEDIA.md`** (feature IDs, Impl vs Ops). Until then, cite this file for status and the encyclopedia only if recovered.
2. Record **exact Production health `buildTime` + `gitSha` after every promote** in Release History (052 close already has this pattern).
3. After any Preview `railway up`, log **buildTime** here; do not trust `gitSha`.
4. Give the typography-scale increment a **stable ID** (recommend: keep user name **051C scale**, alias **051D impl** in parentheses once, then stop using 051D).
5. Add `/league/history/matchups` to `FFR_2.0_Canonical_Route_Inventory.md` when 053C is accepted/deployed.
6. Re-triage `todo.md` or mark it **legacy / non-SOT**.
7. One-line smoke after 052J Production: LOZELL titles **3 (2009, 2011, 2021)** + leaderboard parity with HoF + one 2010+ H2H unchanged.
8. Track **extension version** separately from Railway (not updated in this pass).
9. Point `PRODUCT_CONSTITUTION.md` related-docs at this file (done in the same docs change).
