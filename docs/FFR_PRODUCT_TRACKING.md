# Fantasy Football Rivals — Product Tracking

**Status:** Canonical operational tracking document. `FFR_PRODUCT_ENCYCLOPEDIA.md` is **permanently retired** (never committed; not recoverable). This file is the single operational source of truth until product-owner amendment.  
**Edition:** 2026-08-09 (RFSN-053G Preview)  
**Authority:** Product + engineering. Conflicts with code or live environments are listed under **Inconsistencies**, not guessed away.  
**Does not replace:** `PRODUCT_CONSTITUTION.md` (product law) · `docs/architecture/FFR_2.0_Product_Architecture.md` (IA lock) · per-ticket audit artifacts.

**RFSN-051 IDs (locked — do not rename again)**

| ID | Name | Status |
| --- | --- | --- |
| **051A** | Foundation (typography system repair) | Preview + **Production** (`4ec5d90` stack) |
| **051B** | Contrast Migration (zinc → ink) | Preview + **Production** |
| **051C** | Contrast Completion | Preview + **Production** |
| **051D** | Typography Readability (floors, spacing, pinch-zoom) | Preview + **Production** (`4ec5d90` / `buildTime=2026-08-09T04:08:39.829Z`) |
| **051E** | Closeout (Preview + Production of 051A–D) | **Done** 2026-08-09 |

Former “051D = measure typography again” is **cancelled**. Do not start a new census.

**RFSN-054** — UI Density & Scanability (spacing rhythm, not typography). 051 stays closed.

---

## Project Health Dashboard

| Area | Status | Notes |
| --- | --- | --- |
| Production | 🟢 Stable | Git `798aa8a` · `buildTime=2026-08-09T14:32:05.217Z` · 051A–D + **054** + **054A** + 052J/K + **052L** + **056A** + **053C** + **053D** |
| Preview | 🟢 Git-aligned | Git `0c5d94a` · `buildTime=2026-08-09T20:34:42.594Z` · 051A–D + **054** + **054A** + 052J/K + **052L** + **055** + **056A** + **053C** + **053D** + **053E** + **053F** + **053G** |
| GM Advisor | 🟢 / 🟡 | 052J+K+**L** live Preview + Production. **053D gallery visuals live Preview + Production**. **055 Draft Intelligence live Preview only**. **“What's my biggest win?” FAIL**. |
| RFSN | 🟢 | Live / Stories / Recaps |
| Typography | 🟢 Production | 051A–D live Preview + Production. **051E closed.** Pinch-zoom on. |
| UI density | 🟢 Production | **RFSN-054** + **054A** live Preview + Production. Compact Live Draft Control strip. Not typography. |
| Matchup Gallery | 🟢 / 🟡 | **053C** + **053D** live Preview + **Production**. **053E** + **053F** + **053G PNG export live Preview only** (`0c5d94a`). Not Production. |
| Mobile | 🟡 Partial | FFR 2.0 responsive IA. RFSN-025 active-draft dock unvalidated |
| Data Sync | 🟢 | ESPN / Sleeper / Yahoo / workbook paths live |
| Release Pipeline | 🟢 Preview=Git proven | Push `e48b34e` → Railway Git deploy `0afa371e` SUCCESS. No CLI `railway up`. `gitSha` still stale — trust `buildTime` + Railway `commitHash` |
| Extension | 🟢 / low tracking | GM War Room **v1.14.2** (`chrome-extension/manifest.json`). Not Railway |

Founder leagues: ESPN **`457622` ATLANTAS FINEST FF**, ESPN **`480452315` Dynasty**, ESPN **`158918` Teco’s**. Do not fabricate Sleeper/Workbook validation.

---

## Environments

| Env | Host | Railway | Git trigger (intended) | Last verified live |
| --- | --- | --- | --- | --- |
| **Production** | `https://www.fantasyfootballrivals.com` | env `production` / `87b948fd-810d-4be2-a0b7-651ec0468200` | `release/promote-provider-expansion-dff6154` | Git **`798aa8a`** (053D cherry-pick of `dc912a8` + Production-safe tests, Git not CLI). Health `buildTime=2026-08-09T14:32:05.217Z` (gitSha still stale `06b35ba`) · deploy `9f2d70ff` |
| **Preview** | `https://sprint-8-preview.fantasyfootballrivals.com` | env `sprint-8-preview` · service `espn-fantasy-gm-tool` `55c68659-ee4c-4352-98f7-4fff0e4aad87` | `feature/provider-expansion` | Git **`0c5d94a`**. Railway Git SUCCESS deploy `d3518077` (not CLI). Health `buildTime=2026-08-09T20:34:42.594Z` (gitSha still stale `dff6154`) |
| **Local working tree** | localhost | — | uncommitted | marketing |

Trust **`buildTime`** + Railway deployment `commitHash`, not health `gitSha` (stale on both CLI and Git deploys).

---

## P0 — Preview must match Git

**Problem:** Preview has been deployable two ways — GitHub auto-deploy from `feature/provider-expansion`, and CLI `railway up`. CLI uploads can run **newer Advisor code than Git HEAD**, while health `gitSha` still reports the GitHub-linked commit. Documentation, code, and Preview then tell three different stories.

**Policy (adopted 2026-08-09):**

1. **Git is the only authoritative Preview source.** Intended trigger: `feature/provider-expansion` → `sprint-8-preview`.
2. **Do not `railway up` Preview** unless the exact same tree is already committed **and pushed** to `origin/feature/provider-expansion`, or you immediately commit+push before calling Preview “current.”
3. After any Preview deploy, record **`buildTime`** here. Ignore stale `gitSha` on CLI uploads.
4. Production trigger remains `release/promote-provider-expansion-dff6154`. Promote by cherry-pick/merge + push; same no-orphan-CLI rule.
5. If Preview `buildTime` is newer than `origin/feature/provider-expansion` HEAD, treat Preview as **unverified** until Git catches up.

**Proven 2026-08-09:** push `e48b34e` on `feature/provider-expansion` → Railway Preview `0afa371e` SUCCESS (`commitHash=e48b34e`, no `cliCaller`). Prior CLI deploy `b3639df7` REMOVED. Preview `buildTime` advanced `02:26:16Z` → `02:51:01Z`. Gate Advisor smokes PASS on that Git build.

Keep the no-CLI rule. Do not `railway up` Preview.

---

## Executive Project Status

Fantasy Football Rivals is a **live production product** (Clerk auth, multi-league ESPN + Sleeper/Yahoo/workbook paths, Rivalry Center, Draft War Room, RFSN, GM Advisor, billing). Engineering focus: historical intelligence quality and typography closeout, without reopening Advisor / Rivalry / live Matchups architecture.

| Layer | State |
| --- | --- |
| Production | Git **`798aa8a`** includes 052 A–**L** + **051A–D** + **054** + **054A** + **056A** + **053C** + **053D**. Live `buildTime=2026-08-09T14:32:05.217Z`. |
| Preview | Git tip **`0c5d94a`** · `buildTime=2026-08-09T20:34:42.594Z` · **055** + **056A** + **053C** + **053D** + **053E** + **053F** + **053G PNG**. |
| Local / unpushed | marketing. Not Preview, not Production. |

**Headline remaining gaps:** (1) 052K personal “What's my biggest win?” still fails. (2) 055 reach/steal math needs same-season ADP join onto `draft_picks` (Preview currently coverage-honest). (3) 056A four executed 2026 headers still lack assets.

---

## Current Production Features

Shipped and live on `www.fantasyfootballrivals.com` (git `798aa8a` / buildTime `2026-08-09T14:32:05.217Z`).

| Area | What’s in Production |
| --- | --- |
| Auth / leagues | Clerk · connected leagues · ESPN / Sleeper / Yahoo / workbook onboarding · sync |
| Home / My Team | Home, Dashboard, Roster, Matchup, Trades, GM Advisor, My GM, Championship Path |
| Rivals | Cast, Owner Dossier, H2H, Rivalries, League Map, Relationships · RFSN-047/048 evidence scope |
| RFSN | Live, Stories, Recaps (+ deep-link Breaking/Analysts) |
| Draft | War Room, Live Draft, Mock, Keepers, Draft History · FantasyPros solo mock connector (030C) |
| League | Standings, Power Rankings, Playoffs, History/HoF/Records/Timeline/Transactions, **Historical Matchups (053C)**, Commissioner |
| Advisor (052 A–L) | Evidence-first planner · H2H + Championship Authority · 052J LOZELL **3 (2009, 2011, 2021)** live · 052K league-wide largest margin live · **052L Clear = true session reset** · personal “my biggest win” still broken · no generic LLM fallback for wired facts |
| Commercial | Free + Rivals Pro Stripe · The League deferred |
| Extension | GM War Room **v1.14.2** (Chrome; not Railway) |

051A–D typography, **RFSN-054** density, **054A** compact Live Draft Control, **056A** Transactions, **053C Historical Matchup Gallery**, and **053D Advisor gallery visuals** are Production.

---

## Preview Features

On Preview **in addition to** Production, unless noted.

| Item | Preview status | Notes |
| --- | --- | --- |
| **051A** Foundation | Live | Plugin, body leading, MUTED token |
| **051B** Contrast Migration | Live (`b551cac`) | AA failures −75% on settled census |
| **051C** Contrast Completion | Live (`2b6ec62`) | Nav kicker + white-alpha P1 |
| **052 A–K** Advisor historical intelligence | Live + **on Production** | 052J/K smoke 5/6. Personal biggest-win still FAIL |
| **051D** Typography Readability | Live Preview + **Production** | `4ec5d90` / `ba2d475b` |
| **054** UI Density & Scanability | Live Preview + **Production** | `a9b7d87` / `4e447c06` · `2db9b77` / `803d531b` |
| **054A** Compact Live Draft Control | Live Preview + **Production** | `fa65ab5` / `3bdcd8f3` · `2a80eca` / `3d25ff96` |
| **052L** Advisor Clear session reset | Live Preview + **Production** | `68fa655` / `ee9ed04` · founder 12/12 both envs |
| **055** Draft Intelligence Authority | **Live Preview** | Deterministic `draft_intelligence`. Founder 9/9. Reach/steal coverage-honest until pick IDs join ADP. Not Production. |
| **056A** Transactions missing executed trades | Live Preview + **Production** | Executed filter 5/5 ESPN 457622 2026 both envs. Grading unchanged. |
| **053C** Historical Matchup Gallery | Live Preview + **Production** | Preview `539dfea` / `ba0bbd5a`. Production `2ad6e04` / `ad8e93d3` / `buildTime=2026-08-09T13:17:56.373Z`. Founder 12/12 both envs. |
| **053D** Advisor visual gallery | Live Preview + **Production** | Preview `dc912a8` / `3ebed032`. Production `798aa8a` / `9f2d70ff` / `buildTime=2026-08-09T14:32:05.217Z`. Founder 16/16 Preview · **17/17 Production**. |
| **053E** Historical Story Collections | **Live Preview** | Git `eca6da1` / deploy `874954b5` / `buildTime=2026-08-09T16:34:43.599Z`. Founder ESPN 457622 **22/22**. Not Production. |
| **053F** Premium Historical Share Cards | **Live Preview** | Git `e6c0cf7` / deploy `5af3da2f` / `buildTime=2026-08-09T19:12:00.470Z`. Founder ESPN 457622 **10/10**. HTML renderer. Not Production. |
| **053G** Share Card PNG Export | **Live Preview** | Git `0c5d94a` / deploy `d3518077` / `buildTime=2026-08-09T20:34:42.594Z`. Founder ESPN 457622 **9/9**. Snapshots ShareCardRenderer. Not Production. |

---

## Active Development

| ID | Work | Status |
| --- | --- | --- |
| **P0 Preview=Git** | Stop orphan CLI Preview uploads; Git tip must explain Preview `buildTime` | **Proven** `e48b34e` → `0afa371e`. Keep no-CLI discipline |
| **052K-follow** | Personal “What's my biggest win?” → generic no-margins | **Open** — league-wide largest margin PASS; `my` owner not resolved into margin tool |
| **051D** | Typography readability (floors, draft/RFSN/stories/commissioner spacing, pinch-zoom) | **Production live** `4ec5d90` |
| **051E** | Typography closeout (Preview then Production of 051A–D) | **Closed** 2026-08-09 |
| **054** | UI Density & Scanability (predictable spacing rhythm) | **Production live** `2db9b77`. Not typography. 051 stays closed. |
| **054A** | Compact Live Draft Control (`/rfsn/live` + `/draft/live`) | **Production live** `2a80eca` / `3d25ff96`. |
| **052L** | GM Advisor Clear = true session reset | **Production live** `ee9ed04` / `buildTime=2026-08-09T09:07:04.929Z`. Preview `68fa655`. 12/12 both. |
| **055** | Draft Intelligence Authority | **Preview live** `c9284f9` / `buildTime=2026-08-09T10:14:06.089Z`. Founder 9/9. Not Production. |
| **056A** | Transactions missing executed trades | **Production live** `1aa6d28` / `buildTime=2026-08-09T11:19:47.170Z`. Preview `31b6e69`. Executed 5/5 both. |
| **053A** | Gallery + screenshot architecture | Complete (docs). |
| **053B** | `matchupGallery.query` contract | **Production live** with 053C (16/16). Semantics unchanged. |
| **053C** | Gallery UI + No Mercy + viewer V1 | **Production live** `2ad6e04` / `buildTime=2026-08-09T13:17:56.373Z`. Founder 12/12 both. |
| **053D** | Advisor `matchup_gallery` visual | **Production live** `798aa8a` / `buildTime=2026-08-09T14:32:05.217Z`. Founder 17/17. Closed. |
| **053E** | Historical Story Collections | **Preview live** `eca6da1` / `buildTime=2026-08-09T16:34:43.599Z`. Founder 22/22. Not Production. |
| **053F** | Premium Historical Share Cards | **Preview live** `e6c0cf7` / `buildTime=2026-08-09T19:12:00.470Z`. Founder 10/10. One ShareCardModel + renderer. Not Production. |
| **053G** | Share Card PNG Export | **Preview live** `0c5d94a` / `buildTime=2026-08-09T20:34:42.594Z`. Founder 9/9. Playwright snapshot of ShareCardRenderer. Not Production. |
| **053H–I** | AI narration / public sharing | **Not started.** Consume exported PNG + ShareCardModel. |

No Advisor / Rivalry Center / live Matchups redesign is in progress.

---

## Roadmap

Stop after each increment. Production only when explicitly asked.

1. **052K-follow — personal biggest win** — “What's my biggest win?” must resolve founder `my` into margin `ownerName`, not `missingDatasetSentence("matchup margins")`.  
2. **055 ADP join follow-up (optional)** — same-season pick/ADP math on Preview after `draft_picks.playerId` join is proven. Production only when asked.  
3. **056A asset reconstruction follow-up (optional)** — 4 executed 2026 headers still lack pick/player items after activity relink.  
4. ~~**Preview-deploy 053C**~~ **Done** Preview + **Production** `2ad6e04` / `buildTime=2026-08-09T13:17:56.373Z`.  
5. ~~**RFSN-053D**~~ **Done Preview + Production** `798aa8a` / `buildTime=2026-08-09T14:32:05.217Z`. Founder 17/17.  
6. ~~**RFSN-053E**~~ **Done Preview** `eca6da1` / `buildTime=2026-08-09T16:34:43.599Z`. Founder 22/22. Not Production.  
7. ~~**RFSN-053F**~~ **Done Preview** `e6c0cf7` / `buildTime=2026-08-09T19:12:00.470Z`. Founder 10/10. Not Production.  
8. ~~**RFSN-053G**~~ **Done Preview** `0c5d94a` / `buildTime=2026-08-09T20:34:42.594Z`. Founder 9/9. Not Production.  
9. **RFSN-053H** — AI narration / video overlays.  
10. **RFSN-053I** — Public sharing.  
11. **RFSN-053J** — Viewer screenshot engine.  
12. **RFSN-053K** — Batch + ZIP + scheduled job.  
13. **RFSN-053L** — Preview regression smoke. Close 053.  
14. **RFSN-MKT-001** — We Got The Tape (Preview/local only).  
15. Backlog polish: RFSN-025 mobile dock, RFSN-026 synthetic ADP, 030B-3 authenticated MUD, The League commercial tier.

**Do not** reopen 052 Advisor architecture. **Do not** start another typography census.

---

## Backlog

| Item | Notes |
| --- | --- |
| Historical Matchup Gallery remaining | 053H–L (video/public next). 053E + 053F + **053G Preview only**. |
| Soundtrack / marketing assets | `scripts/marketing/we-got-the-tape/` · RFSN-MKT-001 · Preview/local only |
| RFSN-025 | Mobile dock active-draft validation |
| RFSN-026 | Synthetic ADP classification |
| RFSN-030B remainder | FP types freeze after authenticated MUD; solo mock already 030C |
| The League (commissioner suite as paid SKU) | Deferred commercially; Commissioner UI exists |
| Light-theme typography debt | 051 audit dark-only; unmeasured |
| Self-host Inter / drop unused weight 300 | 051 note, not scheduled |
| Strength of Schedule authority | Route exists; empty — no SOS engine |
| Pinch-zoom / 051D on Preview+Production | Live both envs |
| Extension version in this dashboard | Low priority; currently **v1.14.2** |

`todo.md` is **legacy planning only** — not backlog.

---

## Release History

| When | What | Where |
| --- | --- | --- |
| 2026-08-09 | **053G Preview.** Git `0c5d94a` → deploy `d3518077`. Share Card PNG export snapshots ShareCardRenderer (1×/2×/4×, hash cache). Founder ESPN 457622 **9/9 PASS**. Not Production. | Preview `buildTime=2026-08-09T20:34:42.594Z` · `RFSN-053G-preview-validation.md` |
| 2026-08-09 | **053F Preview.** Git `e6c0cf7` → deploy `5af3da2f`. Premium HTML share cards (matchup/collection/record) on one ShareCardModel. Founder ESPN 457622 **10/10 PASS**. No PNG. Not Production. | Preview `buildTime=2026-08-09T19:12:00.470Z` · `RFSN-053F-preview-validation.md` |
| 2026-08-09 | **053E Preview.** Git `eca6da1` → deploy `874954b5`. Historical Story Collections compile into `queryMatchupGallery`. Founder ESPN 457622 **22/22 PASS**. Not Production. | Preview `buildTime=2026-08-09T16:34:43.599Z` · `RFSN-053E-preview-validation.md` |
| 2026-08-09 | **053D Production.** Cherry-pick `0393105`/`798aa8a` of `dc912a8` (no 055) → deploy `9f2d70ff`. Founder ESPN 457622 **17/17 PASS**. | Production `buildTime=2026-08-09T14:32:05.217Z` · `RFSN-053D-production-validation.md` |
| 2026-08-09 | **053D Preview.** Git `dc912a8` → deploy `3ebed032`. Advisor `matchup_gallery` visual + 053C embed. Founder ESPN 457622 **16/16 PASS**. | Preview `buildTime=2026-08-09T14:01:47.305Z` · `RFSN-053D-preview-validation.md` |
| 2026-08-09 | **053C Production.** Cherry-pick `2ad6e04` of `539dfea` (dropped 055-only `draftIntelligenceTool.ts`) → deploy `ad8e93d3`. Founder ESPN 457622 **12/12 PASS**. | Production `buildTime=2026-08-09T13:17:56.373Z` · `RFSN-053C-production-validation.md` |
| 2026-08-09 | **053C Preview.** Git `539dfea` → deploy `ba0bbd5a`. Historical Matchup Gallery + viewer V1. Founder ESPN 457622 **12/12 PASS**. | Preview `buildTime=2026-08-09T12:50:42.295Z` · `RFSN-053C-preview-validation.md` |
| 2026-08-09 | **056A Production.** Cherry-pick `1aa6d28` of `31b6e69` → deploy `b246f95f`. Executed filter 5/5 ESPN 457622. | Production `buildTime=2026-08-09T11:19:47.170Z` · `RFSN-056A-production-validation.md` |
| 2026-08-09 | **056A Preview.** Git `31b6e69` → deploy `408fa8c3`. Transactions Executed filter 5/5 ESPN 457622 2026 (was 1). Grading unchanged. | Preview `buildTime=2026-08-09T10:45:03.298Z` · `RFSN-056A-preview-validation.md` |
| 2026-08-09 | **055 Preview.** Git `c9284f9` → deploy `ed72c194`. Draft Intelligence deterministic 9/9 ESPN 457622. Reach/steal coverage-honest (no fake ADP). | Preview `buildTime=2026-08-09T10:14:06.089Z` · `RFSN-055-preview-validation.md` |
| 2026-08-09 | **052L Production.** Cherry-pick `ee9ed04` of `68fa655`. Founder ESPN 457622 **12/12 PASS**. | Production `buildTime=2026-08-09T09:07:04.929Z` · `RFSN-052L-production-validation.md` |
| 2026-08-09 | **052L Preview.** Git `68fa655` Clear = true session reset. Founder ESPN 457622 **12/12 PASS**. | Preview `buildTime=2026-08-09T08:23:34.167Z` · `RFSN-052L-preview-validation.md` |
| 2026-08-09 | **054A Production.** Cherry-pick `2a80eca` → deploy `3d25ff96`. Compact Live Draft Control live. | Production `buildTime=2026-08-09T07:37:29.445Z` · `RFSN-054A-production-validation.md` |
| 2026-08-09 | **054A Preview.** Git `fa65ab5` → deploy `3bdcd8f3`. Founder 1440: 49px strip, ~4 rows, no overflow-x. | Preview `buildTime=2026-08-09T07:27:48.537Z` · `RFSN-054A-preview-validation.md` |
| 2026-08-09 | **054 Production.** Cherry-pick `2db9b77` → deploy `803d531b`. Density rhythm live. 051 stays closed. | Production `buildTime=2026-08-09T06:02:41.032Z` · `RFSN-054-production-validation.md` |
| 2026-08-09 | **054 Preview.** Git `a9b7d87` → deploy `4e447c06` (first `3bc07f7` build FAILED on JSX closer; fix relanded). Founder scan 5/5 no overflow-x. | Preview `buildTime=2026-08-09T05:56:49.880Z` · `RFSN-054-preview-validation.md` |
| 2026-08-09 | **051D Production** (A–D closeout / 051E). Git push `4ec5d90` → deploy `ba2d475b`. Pinch-zoom on. Advisor gates still PASS. | Production `buildTime=2026-08-09T04:08:39.829Z` · `RFSN-051D-production-validation.md` |
| 2026-08-09 | **051D Preview** via Git-only push `b8306ec` → deploy `625e86dc`. Readability validated. **READY FOR PRODUCTION** pending explicit ask. | Preview `buildTime=2026-08-09T03:20:44.489Z` · `RFSN-051D-preview-validation.md` |
| 2026-08-09 | **P0 Preview=Git proven.** Push `e48b34e` (ops SOT docs only) → Railway Git deploy `0afa371e` SUCCESS. CLI `b3639df7` REMOVED. Gate smokes PASS on Preview + Production. | Preview `buildTime=2026-08-09T02:51:01.724Z` · artifacts `RFSN-052JK-preview-git-smoke.md` + `RFSN-052JK-production-smoke.md` |
| 2026-08-09 | **052J + 052K Production smoke** (ESPN 457622) **5/6 PASS**. `railway down` accidentally removed the prior SUCCESS deploy (brief Production 404); restored with `railway redeploy --from-source`. Stuck INITIALIZING `670a86c2` gone. | Production `fea8db3c` · `buildTime=2026-08-09T02:39:50.181Z` |
| 2026-08-09 | **052J + 052K** committed + pushed (`f85797d` Preview, `49649b8` release) | Preview `buildTime=2026-08-09T02:26:16.308Z` |
| 2026-08-08 | **RFSN-052 A–I CLOSED** — Advisor Production close. 5/5 ESPN 457622 first-answer smoke. LOZELL still **2** on that snapshot | Production then `06b35ba` / `buildTime=2026-08-08T22:14:10.014Z` (historical close-out artifact — do not rewrite) |
| 2026-08-08 | **051A/B/C contrast** on `feature/provider-expansion` | Preview only (`2b6ec62`). Production still without 051 contrast |
| 2026-08-07 | **RFSN-049 / 049A / 049B / 049C** | Production via later 052 stack |
| 2026-08-06–07 | **RFSN-047 / 048 / 048B / 048C** | Production |
| 2026-08-05 | Sleeper workbook Preview smoke · later **RFSN-050** | Preview DB only |
| 2026-07-29 | Encyclopedia Editions 1.1–1.3 authored in chat | **Never committed. Retired 2026-08-09.** |
| 2026-07-19 | RFSN-030A closed · 030B planning · 031 durable ADP | Docs + branches |
| 2026-07-18 | RFSN-027C nav · RFSN-024 Live Draft UX closed | Production lineage |

---

## Known Issues

| Issue | Env | Severity |
| --- | --- | --- |
| Health `gitSha` stays stale (`dff6154`) even on Git Preview deploys — trust `buildTime` + Railway `commitHash` | Preview | Ops caveat (not a P0 blocker) |
| CLI `railway up` can still clobber a Git Preview deploy (happened to `f6ce7484` / `f85797d`) | Preview | Discipline — do not `railway up` Preview |
| **Never `railway down` a serving SUCCESS** to kill INITIALIZING — it removes the live deploy. Use cancel on the stuck row, or `redeploy --from-source` if Production 404s | Production | **P0 ops lesson** (2026-08-09 brief outage) |
| 052K “What's my biggest win?” returns generic no-margins while league-wide largest margin works (Rod 129.5 vs Maurice Welch W4 2010) | Production | **Open** — personal `my` not bound to margin owner |
| 052J Preview run 1 failed 3/8 (LLM invented 2009 record/score) | Preview (superseded) | Fixed in run 2; do not cite run 1 |
| Aside “Players” label missing in an older 049B prod smoke | Production (historical) | Not re-verified |
| 053C gallery screenshot Clerk mint can time out on localhost | Local | Fixture shots used |
| Decorative draft `→` / history watermarks still fail raw AA | Preview post-051C | Meaningful AA largely cleared |

---

## Known Limitations

| Limitation | Honest behavior |
| --- | --- |
| 2009 (and any podium-only season) | Championship/RU/3rd from `league_medals` + approved aliases. **No** RS record, championship score, or Week N matchups. 052J sentence: “{year} is preserved as a partial legacy season…” |
| Matchup coverage vs championship coverage | H2H / records / week asks use full `gmMatchups` span (often 2010+). Titles may start earlier after 052J |
| No in-game timeline | Comeback / Miracle Comeback / halftime deficit unsupported |
| No pre-game projections in margin tool | Largest upset unsupported (052K missing-dataset sentence) |
| Playoff tier thin on some leagues | Championship **games** vs medals: 052I honesty; gallery championship filter may empty |
| Box scores / week standings sparse | Historical Viewer: scores always; lineups/standings null with CTA |
| Sleeper / Workbook | Not used to validate 052/053 historical facts |
| Pinch-zoom | Restored on Preview + **Production** (051D) |
| Light theme | Not in 051 measurement |
| The League SKU | Not sold in V1 |
| FantasyPros multiplayer live pick wire | Blocked on authenticated MUD evidence (030B-3) |

---

## Architecture Milestones

| Milestone | Status |
| --- | --- |
| FFR 2.0 six-section IA | **Locked** |
| One-fact-one-authority | **Locked** — constitution |
| Deterministic-first Advisor | **Production git** (052 A–K) |
| Distinct championship vs matchup coverage + partial-legacy | **052J Production live** (LOZELL 3 + 2009 limitation smoke PASS) |
| Matchup margin largest-win / combined / unsupported upset | **052K Production live** (league-wide PASS; personal biggest-win FAIL) |
| Matchup Gallery query + UI | **053C Production live** `2ad6e04` / `buildTime=2026-08-09T13:17:56.373Z`. Preview `539dfea`. |
| Draft Intelligence Authority | **055 Preview live** — deterministic `draft_intelligence`. Reach/steal coverage-honest until pick IDs join ADP. Not Production. |
| Preview Git = Preview deploy | **Proven** `e48b34e` → `0afa371e` (2026-08-09) |
| Product Encyclopedia | **Retired** — this file is permanent operational SOT |

---

## Recently Completed RFSNs

| ID | Title | Impl | Preview | Production |
| --- | --- | --- | --- | --- |
| 047 | Active vs historical rivals | done | yes | yes |
| 048 / B / C | Dossier rivalry evidence scope | done | yes | yes |
| 049 / A / B / C | Margin analytics + Advisor intent/context | done | yes | yes |
| 050 | Founder test league connection cleanup | done (Preview DB) | n/a | n/a |
| 051 | Typography & readability **audit** | audit only | measured | — |
| **051A** | Foundation | done | yes | **yes** `4ec5d90` |
| **051B** | Contrast Migration | done | yes | **yes** |
| **051C** | Contrast Completion | done | yes | **yes** |
| **051D** | Typography Readability | done | yes `b8306ec` | **yes** `4ec5d90` / `ba2d475b` |
| **051E** | Typography closeout | done | yes | **yes** — A–D on both envs |
| **054** | UI Density & Scanability | done | yes `a9b7d87` / `4e447c06` | **yes** `2db9b77` / `803d531b` |
| **054A** | Compact Live Draft Control | done | yes `fa65ab5` / `3bdcd8f3` | **yes** `2a80eca` / `3d25ff96` |
| 052 A–I | GM Advisor historical intelligence | done | yes | yes (closed 08-08) |
| 052J | Partial-legacy championships | done | **Git Preview** `e48b34e` | **Production live** LOZELL 3 + 2009 limitation PASS |
| 052K | Matchup margin intent expansion | done | **Git Preview** `e48b34e` | **Production live** league-wide PASS · personal biggest-win FAIL |
| **052L** | Advisor Clear true session reset | done | **Git Preview** `68fa655` | **yes** `ee9ed04` / `buildTime=2026-08-09T09:07:04.929Z` |
| **055** | Draft Intelligence Authority | done | **Git Preview** `c9284f9` / `ed72c194` | **no** |
| 053A | Gallery architecture | docs | yes | **yes** |
| 053B | Gallery query contract | done (16/16) | **yes** `539dfea` | **yes** `2ad6e04` |
| **053C** | Historical Matchup Gallery | done | **yes** `539dfea` / `ba0bbd5a` | **yes** `2ad6e04` / `ad8e93d3` / `buildTime=2026-08-09T13:17:56.373Z` |
| **053D** | Advisor gallery visual | done | **yes** `dc912a8` / `3ebed032` / `buildTime=2026-08-09T14:01:47.305Z` | **yes** `798aa8a` / `9f2d70ff` / `buildTime=2026-08-09T14:32:05.217Z` |
| **053E** | Historical Story Collections | done Preview | **yes** `eca6da1` / `874954b5` / `buildTime=2026-08-09T16:34:43.599Z` | **no** |
| **053F** | Premium Historical Share Cards | done Preview | **yes** `e6c0cf7` / `5af3da2f` / `buildTime=2026-08-09T19:12:00.470Z` | **no** |
| **053G** | Share Card PNG Export | done Preview | **yes** `0c5d94a` / `d3518077` / `buildTime=2026-08-09T20:34:42.594Z` | **no** |

---

## Pending RFSNs

| ID | Title | Blocked on |
| --- | --- | --- |
| **052K-follow** | Personal “What's my biggest win?” | Owner resolution into `query_matchup_margins` |
| **053H–I** | AI narration / public sharing | 053G Preview live. Consume exported PNG. Production of 053E/F/G on explicit ask. |
| 025 / 026 | Mobile dock / synthetic ADP | Backlog |
| 030B remainder | FP multiplayer evidence + type freeze | Authenticated MUD session |

---

## Production Readiness Summary

| Candidate | Preview | Production-ready? | Action |
| --- | --- | --- | --- |
| **052 A–I** | yes | **Shipped** (08-08 close) | Closed |
| **052J** | yes | **Shipped** `49649b8` / `fea8db3c` | LOZELL 3 + 2009 limitation PASS |
| **052K** | yes | **Shipped** (partial) | League-wide largest margin PASS · personal biggest-win FAIL |
| **051A/B/C contrast** | yes | **Shipped** `4ec5d90` | Closed with 051E |
| **051D readability** | yes | **Shipped** `4ec5d90` / `ba2d475b` | Closed |
| **051E closeout** | yes | **Shipped** | A–D on Preview + Production |
| **054 density** | yes | **Shipped** `2db9b77` / `803d531b` | Closed |
| **054A compact Live Draft Control** | yes | **Shipped** `2a80eca` / `3d25ff96` | Closed |
| **052L Clear reset** | yes `68fa655` | **Shipped** `ee9ed04` | Preview + Production 12/12 |
| **055 Draft Intelligence** | yes `c9284f9` | **No** | Preview 9/9. Reach/steal coverage-honest. Production on explicit ask. |
| **053C gallery** | yes `539dfea` | **Shipped** `2ad6e04` / `ad8e93d3` | Preview + Production 12/12 ESPN 457622 |
| **053D Advisor gallery visual** | yes `dc912a8` | **Shipped** `798aa8a` / `9f2d70ff` / `buildTime=2026-08-09T14:32:05.217Z` | Preview 16/16 · Production 17/17 ESPN 457622 |
| **053E Story Collections** | yes `eca6da1` / **22/22** | **No** | Preview only. Production on explicit ask. |
| **053F Share Cards** | yes `e6c0cf7` / **10/10** | **No** | Preview only. HTML renderer. Production on explicit ask. |
| **053G PNG export** | yes `0c5d94a` / **9/9** | **No** | Preview only. Snapshots ShareCardRenderer. Production on explicit ask. |
| **053H–I / MKT-001** | no | No | Not ready |

**Production must not receive** marketing or **055 Draft Intelligence** until explicitly requested. 051 stays closed. **054 + 054A + 052L + 056A + 053C + 053D are live.**

---

## Inconsistencies found (doc vs impl vs live)

1. **Encyclopedia retired.** Path now exists only as a retirement stub. Do not cite Editions 1.1–1.3.
2. **051 numbering is now locked** (A Foundation → E Closeout). Older audit text may still say “051C scale” / “next 051D measure”; those aliases map to **051D readability** and **cancelled census** respectively. Density follow-up is **RFSN-054**, not 051F.
3. **052 Production close artifact still documents LOZELL = 2.** That snapshot is historical (`06b35ba`, 2026-08-08). Do not rewrite it. Current Production live probe: LOZELL **3 (2009, 2011, 2021)**.
4. **Preview=Git is proven** (`e48b34e` → `0afa371e`). Health `gitSha` still stale (`dff6154`) on Git deploys — do not use it as the alignment signal.
5. **053C routes** are live on Preview + **Production** (`/league/history/matchups`, `/no-mercy`, `/:matchupId`).
6. **053E** Story Collections, **053F** Share Cards, and **053G** PNG export are **Preview only** (`0c5d94a`). Championship Glory stays honest-empty on ESPN 457622 (`insufficient_playoff_tier`). Blood Rival home count is “Pick a rival” until an opponent is named. Download is live on Preview.
7. **`todo.md`** is legacy planning only (banner added). Not SOT.
8. **`railway down` is not a cancel.** 2026-08-09 it removed the serving SUCCESS deploy (`0b79799b`) and left Production 404 until `redeploy --from-source` (`fea8db3c`). Stuck INITIALIZING `670a86c2` is gone.

---

## Recommendations still open

1. Fix 052K personal biggest-win (`my` → margin `ownerName`) and re-smoke Production only when asked.
2. Next increment is **053H video overlays**, **052K-follow**, or **055 ADP-join follow-up** — explicit ask only; Git push only, no `railway up`. Do not promote **053E/F/G** until asked.
3. When 053 ships to Preview/Production, flip route inventory rows from WIP → live (including `/m/:shareCode` at 053I).
4. Extension version stays a dashboard footnote (v1.14.2); bump here when the zip ships.
5. Never use `railway down` against a serving SUCCESS to clear INITIALIZING.
