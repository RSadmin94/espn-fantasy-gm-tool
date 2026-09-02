# Fantasy Football Rivals — Product Tracking

**Status:** Canonical operational tracking document. `FFR_PRODUCT_ENCYCLOPEDIA.md` is **permanently retired** (never committed; not recoverable). This file is the single operational source of truth until product-owner amendment.  
**Edition:** 2026-09-02 (RFSN-058C Preview certification — Production privacy/support **PENDING PRODUCTION PROMOTION**)  
**Authority:** Product + engineering. Conflicts with code or live environments are listed under **Inconsistencies**, not guessed away.  
**Does not replace:** `PRODUCT_CONSTITUTION.md` (product law) · `docs/architecture/FFR_2.0_Product_Architecture.md` (IA lock) · `docs/ARCHITECTURE.md` (ESPN cache / hist pipeline) · `docs/RFSN_VOICE_IMPLEMENTATION_PLAYBOOK.md` (voice/TTS mechanics) · per-ticket audit artifacts.

**Also not SOT (do not “fix” them as a second tracker):** `todo.md` (legacy planning) · `HANDOFF.md` / `DEVELOPER_DOCS.md` / `docs/GM_WAR_ROOM_CAPABILITIES.md` (historical) · `DEPLOYMENT.md` (generic bootstrap; **conflicts** with Git-only deploy — see warning there) · `docs/DEV_SHEET.md` (June 2026 system map; stack still useful, live URLs/status are stale) · `store-submission/` (Chrome Web Store package for 058B, not product status).

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
| Production | 🟢 **PRODUCTION PARTIAL** for ESPN install | Live `buildTime=2026-08-27T23:13:03.813Z` (fetched 2026-09-02). Health `gitSha` still stale `06b35ba`. Certified website commit **`433fdaf`** (RFSN-058P) · Railway deploy **`1aa8f4f2`**. Admin + PDE + provider-first onboarding present. Chrome Web Store install URL **not** live. |
| Preview | 🟢 RFSN-058C **PREVIEW CERTIFIED** | `/privacy` `/support` live. Git `23c7a4b` · Railway `d3c9a689` · `buildTime=2026-09-02T23:44:51.956Z` · bundle `index-DkpY0IP_.js`. Health gitSha stale — ignore. **Not Production.** |
| GM Advisor | 🟢 / 🟡 | 052J+K live: LOZELL **3**, HoF, largest margin, H2H, 2009 limitation. **“What's my biggest win?” still FAIL** unless a later ticket closed it in source (not re-smoked this edition). |
| RFSN | 🟢 | Live / Stories / Recaps. Voice/TTS optional via Kokoro Serverless. |
| Typography / density | 🟢 Production | 051A–E closed. **054** density Production. |
| Matchup Gallery | 🟢 Source on Production git `433fdaf` | Routes `/league/history/matchups*` exist on the Production website commit. Later 053 increment close-out was not re-certified this edition. |
| Mobile | 🟡 Partial | ESPN connect is **desktop Chrome required**. Sleeper can continue on mobile. RFSN-025 dock unvalidated. |
| Data Sync | 🟢 / 🟡 | **Primary onboarding:** ESPN + Sleeper only. Yahoo OAuth + Sleeper workbook exist as **secondary** (Connected Leagues / dedicated routes), **not** on `/connect` chooser. CBS = research stub only. |
| Release Pipeline | 🟢 Git-only | Do **not** `railway up` Node apps. Trust `buildTime` + Railway `commitHash`, not health `gitSha`. |
| Extension | 🟡 Store blocked | Internal **v1.14.3** (certified protocol). Store overlay **v1.14.4** packaged, **not submitted**, **no Store URL**. |
| Admin Console | 🟢 Production | Owner-only mutations. See Admin section. |
| PDE | 🟢 Production | Deterministic evaluator + optional generative narrative. |
| Kokoro / TTS | 🟢 Serverless both envs | OPS-002 + OPS-005 certified. Prod Node → Prod Kokoro; Preview Node → Preview Kokoro. Shared TTS **token** = known debt. |
| MySQL | 🟢 Unchanged | ~4.23 GB actual RAM. OPS-003 backup+restore certified. OPS-004: **no safe memory savings**. |

Founder leagues: ESPN **`457622` ATLANTAS FINEST FF**, ESPN **`480452315` Dynasty**, ESPN **`158918` Teco’s**. Do not fabricate Sleeper/Workbook validation.

---

## Environments

Live evidence for Production was re-fetched 2026-09-02 (`GET https://www.fantasyfootballrivals.com/api/health`). Preview health was **not** re-fetched this edition (timeout). Historical Aug 9 SHAs below remain valid as **prior** release evidence, not “current Preview tip.”

### Environment matrix

| COMPONENT | PRODUCTION | PREVIEW | AUTHORITY / DEPLOYMENT METHOD | NOTES |
| --- | --- | --- | --- | --- |
| Rivals Node app | `www.fantasyfootballrivals.com` · env `production` `87b948fd-…` · service `espn-fantasy-gm-tool` | `sprint-8-preview.fantasyfootballrivals.com` · env `sprint-8-preview` · same service name, different service id | **Git push** to the env’s linked branch, then Railway Git deploy. **Do not `railway up`.** | Trust `buildTime` + Railway `commitHash`. Health `gitSha` is **stale** on both. |
| MySQL | Shared Production DB · observed **~4.23 GB** actual RAM · leave unchanged | Preview has its own DB (do not mix) | Railway plugin; **no resize** (OPS-004) | OPS-003: Railway volume backup + isolated restore **CERTIFIED**. Unexplained ~3 GB process footprint vs 1 GB InnoDB pool = open debt. |
| Kokoro TTS | Production `kokoro-tts` · **Serverless CERTIFIED** (OPS-002) | Preview `kokoro-tts` · **Serverless CERTIFIED** (OPS-005) | Source-unconnected image services. Apply sleep with **`serviceInstanceUpdate` → `serviceInstanceRedeploy`**. **Do not** use `railway redeploy` / `deploymentRedeploy` — it clones a stale snapshot. Then verify active deployment has `sleepApplication=true`. | Sleep/wake/synthesize/re-sleep certified both envs. |
| TTS endpoint relationship | Production Node `RFSN_TTS_SERVICE_URL` → **Production Kokoro** | Preview Node `RFSN_TTS_SERVICE_URL` → **Preview Kokoro** (OPS-006 **CERTIFIED**) | Railway env vars on each Node service | Endpoints are **separate**. Bearer **token is currently shared** across environments = **KNOWN TECHNICAL DEBT** (do not paste the token here). |
| ESPN Connector | Store listing **does not exist**. Internal unpacked **v1.14.3**. Store package **v1.14.4** ready for founder review, **not published**. | Same protocol files; Store ZIP **refuses** Preview/localhost origins (saves Production www/apex only) | Chrome extension, not Railway | `VITE_CONNECTOR_INSTALL_URL` empty until a real Store URL exists. Do not invent one. |
| Privacy / Support URLs | **Not live** on Production (SPA `/privacy` still “Off the grid.”) | **PREVIEW CERTIFIED** `/privacy` `/support` | Git `23c7a4b` → Railway `d3c9a689` | Intended Production: `https://www.fantasyfootballrivals.com/privacy` and `/support` — **PENDING PRODUCTION PROMOTION**. Do not use 365globalsolutions.com. |

| Env | Host | Railway | Git trigger (intended) | Last verified live |
| --- | --- | --- | --- | --- |
| **Production** | `https://www.fantasyfootballrivals.com` | env `production` / `87b948fd-810d-4be2-a0b7-651ec0468200` | `release/promote-provider-expansion-dff6154` (058P commit `433fdaf` on that branch) | `buildTime=2026-08-27T23:13:03.813Z` · health `gitSha` stale `06b35ba` · `gitIdentitySource=build-meta` · Railway deploy **`1aa8f4f2`** (058P cert) |
| **Preview** | `https://sprint-8-preview.fantasyfootballrivals.com` | env `sprint-8-preview` · service `espn-fantasy-gm-tool` `55c68659-ee4c-4352-98f7-4fff0e4aad87` | `feature/provider-expansion` | RFSN-058C Git **`23c7a4b`**. Railway **`d3c9a689`**. `buildTime=2026-09-02T23:44:51.956Z` (gitSha stale `dff6154`). |
| **Local working tree** | localhost | — | uncommitted 058B | Store package + `/privacy` `/support` **not** on Production |

Trust **`buildTime`** + Railway deployment `commitHash`, not health `gitSha`.

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

Fantasy Football Rivals is a **live production product** (Clerk + Google account picker, provider-first ESPN/Sleeper onboarding, Rivalry Center, Draft War Room, RFSN, GM Advisor, Admin Console, Post-Draft Evaluation, Stripe billing).

**Headline remaining gaps:** (1) Chrome Web Store ESPN Connector **not published** — full ESPN *install* path is **PRODUCTION PARTIAL**. (2) 052K personal “What's my biggest win?” still failed at last smoke. (3) Privacy/support **PREVIEW CERTIFIED**; Production URLs **PENDING PRODUCTION PROMOTION**. (4) Yahoo / workbook are not primary onboarding.

| Layer | State |
| --- | --- |
| Production website | **RFSN-058P PRODUCTION** for store-independent onboarding (`433fdaf` / `buildTime=2026-08-27T23:13:03.813Z`). Admin + PDE retained. |
| ESPN Store install | **BLOCKED** on a real Chrome Web Store listing URL. 058A hygiene **v1.14.3**. 058B Store package **v1.14.4** ready for founder review, **not submitted**. |
| Preview | TTS isolated to Preview Kokoro (OPS-006). Website Preview not re-fetched this edition. |
| Local / unpushed | **RFSN-058B** Store overlay, legal pages, submission package. |

---

## Current product surface (reconciled 2026-09-02)

Status vocabulary: **IMPLEMENTED** (in current source) · **PARTIAL** · **PREVIEW** · **PRODUCTION** · **PRODUCTION PARTIAL** · **BLOCKED** · **DEFERRED** · **DEPRECATED** · **REMOVED**. Code on disk ≠ Production.

### Authentication

| Item | Status | Notes |
| --- | --- | --- |
| Clerk authentication | **PRODUCTION** | `ClerkProvider` + signed-in gate |
| Google login | **PRODUCTION** | Clerk Google; `oidcPrompt: select_account` |
| Logout / account-switch | **PRODUCTION** | `signOutOfRivals` clears tRPC token + query cache; does **not** hit `accounts.google.com/Logout` |
| Setup routing / SetupGate | **PRODUCTION** (058P) | Phase from connection counts + `isSetupComplete`, not UI copy |
| Returning-user routing | **PRODUCTION** | Setup complete → product; incomplete → `/connect` or team select |

### Onboarding

| Item | Status | Notes |
| --- | --- | --- |
| Provider chooser `/connect` | **PRODUCTION** | ESPN + Sleeper **only** |
| ESPN onboarding | **PRODUCTION PARTIAL** | Detect / sign-in ESPN / discover / choose league / save / team-if-needed works when connector is already installed. **Install-from-Store** blocked (no listing URL). |
| Sleeper onboarding | **PRODUCTION** | No browser add-on |
| Team selection | **PRODUCTION** | ESPN `select-team`; Sleeper/Yahoo/workbook have provider routes; only when unresolved |
| Mobile ESPN | **PRODUCTION** | Desktop Chrome required copy; Sleeper alternative offered |
| Connected Leagues | **PRODUCTION** | Management surface — **not** a mandatory onboarding ceremony |
| Manual upload / Sleeper workbook | **DEFERRED** from primary onboarding | Route `/import/sleeper-workbook` still exists from Connected Leagues |
| Privacy `/privacy` + Support `/support` | **PREVIEW CERTIFIED** `23c7a4b` · **not Production** | Production URLs **PENDING PRODUCTION PROMOTION**. No invented support email. |

### ESPN Connector

| Item | Status | Notes |
| --- | --- | --- |
| Internal extension | **v1.14.3** | Certified protocol commit `5b82dd54`. Name still “GM War Room — ESPN + FantasyPros” for **internal/dev**. |
| Store overlay | **v1.14.4** | Name **Fantasy Football Rivals — ESPN Connector**. Packaged; **not submitted**. |
| Bridge / background protocol | **UNCHANGED** 1.14.3→1.14.4 | `GMWR_CONNECT_ESPN`, presence `dataset.gmwrExtension="1"`. Origin gate before cookies. Production www/apex only. |
| League discovery / one-league / chooser / signed-out / presence | **IMPLEMENTED** | Website flow via connector; Store popup is status-only |
| Chrome Web Store | **BLOCKED** | No listing URL, no item ID. Do not invent. `VITE_CONNECTOR_INSTALL_URL` empty. |
| Store permissions | cookies + DNR + DNR host access | Hosts: ESPN + Rivals www/apex. No localhost, gmwarroom.online, FantasyPros, Preview wildcard. |

### Sleeper / other providers

| Item | Status | Notes |
| --- | --- | --- |
| Sleeper direct connect | **PRODUCTION** | Validate/import + team select in `/connect/sleeper` |
| Yahoo | **IMPLEMENTED** secondary · **not** primary chooser | OAuth + import exist; Yahoo API approval/productization still a backlog dependency |
| CBS | **DEFERRED** | Comment stub in `server/providers/registry.ts` only |
| Manual upload | **DEFERRED** from `/connect`; workbook route remains |

### Draft / PDE

| Item | Status | Notes |
| --- | --- | --- |
| Draft War Room / Live / Mock / Keepers / History | **PRODUCTION** | |
| Draft Receipts / Draft Intelligence | **PRODUCTION** | Existing Draft surfaces |
| Post-Draft Evaluation | **PRODUCTION** | `/post-draft-evaluation`. Evaluator `post-draft-eval-04` (deterministic). Narrative `post-draft-eval-06` (Rivals Take / Your Draft Story; generative, grounded). |
| Supported eval seasons | **2018–2026** | 2019 **LIMITED_SUPPORT** (league-order proxy). 2010–2017 not evaluated. |
| Keepers | **PRODUCTION** | Evaluator treats keeper picks distinctly |
| Cross-deployment first-load cache identity | **DEFERRED / open** | Known follow-up; do not mark fixed |

### RFSN / TTS

| Item | Status | Notes |
| --- | --- | --- |
| Sofia / Coach / Roxanne | **PRODUCTION** (written); voice **optional** | Personas in commentary + Kokoro voice map |
| Kokoro | **PRODUCTION + PREVIEW** Serverless | See environment matrix. Written path continues if TTS down. |
| `RFSN_VOICE_BETA` | Preview-oriented | Proven pattern: Preview on; Production unset unless explicitly enabled |
| Shared TTS token | **KNOWN TECHNICAL DEBT** | Endpoints isolated; token not |

### Admin

| Item | Status | Notes |
| --- | --- | --- |
| Owner-only Admin Console | **PRODUCTION** | `/admin/*`. Owner gets all caps; limited admin is view-only |
| Users / auth diagnostics / leagues / data health | **PRODUCTION** | |
| Usage/cost, providers, features, errors, jobs, integrations, audit | **PRODUCTION** | |
| SUSPENDED vs paid cancellation | **DISTINCT** | `SUSPENDED` blocks signed-in product (except session probe). Disable AI blocks LLM only. **No Admin control to cancel Stripe/paid membership entitlement** — **DEFERRED / missing**. |

### League history / legacy

| Item | Status |
| --- | --- |
| Hall of Fame, archives, championships, records, dynasties, timeline, transactions, rivalries | **PRODUCTION** |
| Historical matchup gallery | **IMPLEMENTED** on Production git `433fdaf` (`/league/history/matchups`) |
| Strength of Schedule | Route exists; **empty** — no SOS engine |

---

## Current Production Features

Shipped and live on `www.fantasyfootballrivals.com` as of `buildTime=2026-08-27T23:13:03.813Z` (RFSN-058P website `433fdaf`). Feature SHAs for older 051/052/054 closes remain in **Release History**.

| Area | What’s in Production |
| --- | --- |
| Auth / setup | Clerk · Google account picker · `signOutOfRivals` · SetupGate · `/connect` ESPN+Sleeper |
| Leagues | Connected Leagues management · ESPN connector protocol (user-installed) · Sleeper API · Yahoo/workbook **secondary routes** |
| Home / My Team | Home, Dashboard, Roster, Matchup, Trades, GM Advisor, My GM, Championship Path |
| Rivals | Cast, Owner Dossier, H2H, Rivalries, League Map, Relationships · RFSN-047/048 evidence scope |
| RFSN | Live, Stories, Recaps (+ deep-link Breaking/Analysts). Voice optional via Kokoro Serverless |
| Draft | War Room, Live Draft, Mock, Keepers, Draft History · FantasyPros solo mock remains **internal extension** (030C), not Store popup |
| PDE | Post-Draft Evaluation · Rivals Take · Your Draft Story |
| League | Standings, Power Rankings, Playoffs, History/HoF/Records/Dynasties/Timeline/Transactions, matchup gallery routes, Commissioner |
| Advisor (052 A–K) | Evidence-first planner · H2H + Championship Authority · 052J LOZELL **3** · 052K league-wide largest margin · personal “my biggest win” still broken at last smoke |
| Admin | Owner console: users, auth, leagues, data health, usage/cost, providers, features, errors, jobs, integrations, settings, audit |
| Commercial | Free + Rivals Pro Stripe · The League deferred · **no Admin paid-cancel entitlement control** |
| Extension | Internal **v1.14.3**. Store **v1.14.4** not published. Public Store branding: Fantasy Football Rivals — ESPN Connector |

051A–E typography **and RFSN-054 density** remain Production. Privacy/support pages are **not** in this Production build.

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
| **054A** Compact Live Draft Control | Last documented **Live Preview** | `fa65ab5` / `3bdcd8f3` historically. Not re-fetched this edition. |
| **053 matchup gallery** | Assume Production git if Preview tracks `433fdaf` lineage | **Not “local only.”** Routes exist on Production commit `433fdaf`. |

---

## Active Development

| ID | Work | Status |
| --- | --- | --- |
| **RFSN-058C** | Publish Privacy + Support | **PREVIEW CERTIFIED** `23c7a4b` / `d3c9a689`. Production **PENDING**. |
| **RFSN-058B** | Chrome Web Store submission package | **READY EXCEPT MANUAL STORE ASSETS** — **not submitted**. Privacy/support Preview live; Production URLs **PENDING PRODUCTION PROMOTION**. |
| **RFSN-058 / 058A** | ESPN connector Store availability | **PRODUCTION PARTIAL** — hygiene **v1.14.3** certified; listing URL still missing |
| **P0 Preview=Git** | Stop orphan CLI Preview uploads | **Proven** (keep). Also: Kokoro Serverless must use `serviceInstanceRedeploy`, not `railway redeploy` |
| **052K-follow** | Personal “What's my biggest win?” | **Open** at last smoke |
| **051D / 051E / 054** | Typography + density | **Closed / Production** |
| **054A** | Compact Live Draft Control | Last documented **Preview**; not re-certified this edition |
| **053 gallery** | `/league/history/matchups*` | **In Production git `433fdaf`**. Later 053D–L close-out **not re-certified** here — do not reopen as “local only” |

No Advisor / Rivalry Center / live Matchups **redesign** is in progress. Do **not** reopen OPS-001–006.

---

## Roadmap

Stop after each increment. Production only when explicitly asked.

1. **Founder:** promote 058C `/privacy` `/support` to Production (`23c7a4b` cherry-pick onto `release/promote-provider-expansion-dff6154`), then submit 058B Store package. **Do not invent a Store URL.**  
2. After a real listing URL exists: `VITE_CONNECTOR_INSTALL_URL` → Preview certify new-user install → Production (`store-submission/CONTINUATION.md`).  
3. **052K-follow — personal biggest win** (still open at last smoke).  
4. Remaining 053 increment close-out only if a later ticket left gaps — gallery **routes are already on Production git**.  
5. **RFSN-MKT-001** — We Got The Tape (Preview/local only).  
6. Backlog polish: RFSN-025 mobile dock, RFSN-026 synthetic ADP, 030B-3 authenticated MUD, The League commercial tier, Yahoo approval, CBS research, native/mobile ESPN connector.

**Do not** reopen 052 Advisor architecture. **Do not** start another typography census. **Do not** reopen OPS-001–006.

---

## Backlog

| Item | Notes |
| --- | --- |
| Chrome Web Store publish | 058B package exists; founder submit after live privacy/support. **No Store URL yet.** |
| Separate Preview/Production TTS **tokens** | Endpoints isolated; token still shared — **KNOWN TECHNICAL DEBT** |
| Admin paid-membership cancellation / entitlement | SUSPENDED ≠ Stripe cancel. Control **absent**. |
| Yahoo provider approval / primary onboarding | Secondary route only today |
| CBS provider research | Stub only |
| Manual-upload onboarding | Deferred from `/connect` |
| PDE cross-deployment first-load cache identity | Open investigation |
| `/api/health` stale `gitSha` / build-meta | Trust `buildTime` + Railway `commitHash` |
| MySQL unexplained ~3 GB process footprint | OPS-004: **no safe resize**. Cache/storage retention investigation remains |
| Native / mobile ESPN connector | Desktop Chrome required today |
| Historical Matchup Gallery later increments | Routes live on Production git; 053D–L close-out not re-certified this edition |
| Soundtrack / marketing assets | `scripts/marketing/we-got-the-tape/` · RFSN-MKT-001 · Preview/local only |
| RFSN-025 | Mobile dock active-draft validation |
| RFSN-026 | Synthetic ADP classification |
| RFSN-030B remainder | FP types freeze after authenticated MUD; solo mock already 030C **internal** |
| The League (commissioner suite as paid SKU) | Deferred commercially; Commissioner UI exists |
| Light-theme typography debt | 051 audit dark-only; unmeasured |
| Strength of Schedule authority | Route exists; empty — no SOS engine |

`todo.md` is **legacy planning only** — not backlog.

---

## Infrastructure / Railway (RFSN-OPS-001 through 006) — CLOSED

Do **not** reopen. Costs are **observed** (prior invoice) vs **projected** (after Serverless).

| ID | Result |
| --- | --- |
| **OPS-001** | Read-only memory/cost audit. Prior Rivals usage **observed ~$125.68/month** (Jul–Aug window; mostly Kokoro + MySQL RAM). |
| **OPS-002** | Production Kokoro **Serverless CERTIFIED** (sleep/wake/synthesize/re-sleep). |
| **OPS-003** | Production MySQL backup **CERTIFIED** + isolated restore **CERTIFIED**. Production was not overwritten. |
| **OPS-004** | **NO SAFE MYSQL MEMORY SAVINGS IDENTIFIED.** Observed actual ~**4.23 GB**. Leave unchanged. Unexplained process footprint vs 1 GB InnoDB pool remains debt. |
| **OPS-005** | Preview Kokoro **Serverless CERTIFIED** (same lifecycle). |
| **OPS-006** | Preview Node → Preview Kokoro TTS isolation **CERTIFIED**. Production Kokoro untouched. |

**Projected Railway run-rate** after Serverless: approximately **$47–51/month** under current activity (projection from OPS tickets, not a new invoice). Prior **~$125.68/month** is **historical observed**, not current projected spend.

### Kokoro configuration warning (this architecture only)

Production and Preview Kokoro are **source-unconnected** image services. `railway redeploy` / GraphQL `deploymentRedeploy` can **clone a stale snapshot** (`sleepApplication=false`). The proven path is:

`serviceInstanceUpdate` → `serviceInstanceRedeploy`

Then verify the **active** deployment snapshot contains `sleepApplication=true`.

Full mechanic: `docs/RFSN_VOICE_IMPLEMENTATION_PLAYBOOK.md`.

---

## Release History

| When | What | Where |
| --- | --- | --- |
| 2026-09-02 | **RFSN-058C PREVIEW CERTIFIED.** Git `23c7a4b` → Railway `d3c9a689`. Anonymous `/privacy` `/support`. No Store submit. No Production. | Preview `buildTime=2026-09-02T23:44:51.956Z` · bundle `index-DkpY0IP_.js` |
| 2026-09-02 | **RFSN-058B** Store package (v1.14.4 ZIP) + `/privacy` `/support` in source. **Not submitted. Not Production-deployed.** | Local `store-submission/` |
| 2026-08-27 | **RFSN-058P** Production promotion of store-independent onboarding. Git `433fdaf` · Railway `1aa8f4f2`. Live `buildTime=2026-08-27T23:13:03.813Z` (re-fetched 2026-09-02; health `gitSha` still stale). | Production |
| 2026-08-28–09-01 | **RFSN-OPS-001–006 CLOSED.** See Infrastructure section. No Node/MySQL/Kokoro code changes in those tickets except Preview Node TTS URL (OPS-006). | Railway config |
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
| Health `gitSha` stays stale even on Git deploys — trust `buildTime` + Railway `commitHash` | Production + Preview | Ops caveat (not a P0 blocker) |
| CLI `railway up` can still clobber a Git Preview/Production deploy | Both Node apps | Discipline — do not `railway up` |
| `railway redeploy` on Kokoro can restore always-on sleep=false snapshot | Kokoro Prod/Preview | Use `serviceInstanceRedeploy` only |
| Shared `RFSN_TTS_SERVICE_TOKEN` across Preview and Production | Both | **KNOWN TECHNICAL DEBT** — endpoints are isolated |
| **Never `railway down` a serving SUCCESS** to kill INITIALIZING | Production | **P0 ops lesson** (2026-08-09 brief outage) |
| 052K “What's my biggest win?” returns generic no-margins while league-wide largest margin works | Production | **Open** at last smoke |
| Chrome Web Store listing does not exist | — | Blocks full ESPN install UX |
| `/privacy` `/support` not on Production | Production | 058B source only until website deploy |
| 052J Preview run 1 failed 3/8 (LLM invented 2009 record/score) | Preview (superseded) | Fixed in run 2; do not cite run 1 |

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
| Yahoo / workbook | **Not** on primary `/connect` chooser |
| Chrome Web Store ESPN Connector | **Not published** |
| Pinch-zoom | Restored on Preview + **Production** (051D) |
| Light theme | Not in 051 measurement |
| The League SKU | Not sold in V1 |
| FantasyPros multiplayer live pick wire | Blocked on authenticated MUD evidence (030B-3) |
| FantasyPros in Store popup | **Removed from Store build**; remains internal 1.14.3 |

---

## Architecture Milestones

| Milestone | Status |
| --- | --- |
| FFR 2.0 six-section IA | **Locked** |
| One-fact-one-authority | **Locked** — constitution |
| Deterministic-first Advisor | **Production git** (052 A–K) |
| Distinct championship vs matchup coverage + partial-legacy | **052J Production live** (LOZELL 3 + 2009 limitation smoke PASS) |
| Matchup margin largest-win / combined / unsupported upset | **052K Production live** (league-wide PASS; personal biggest-win FAIL) |
| Matchup Gallery query + UI | **On Production git `433fdaf`** (`/league/history/matchups*`) |
| Provider-first onboarding (058P) | **Production** `433fdaf` / `buildTime=2026-08-27T23:13:03.813Z` |
| Kokoro Serverless both envs | **OPS-002 / OPS-005 CERTIFIED** |
| Preview TTS isolation | **OPS-006 CERTIFIED** |
| ESPN Connector Store | **v1.14.4 packaged, unpublished** |
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
| 052 A–I | GM Advisor historical intelligence | done | yes | yes (closed 08-08) |
| 052J | Partial-legacy championships | done | **Git Preview** `e48b34e` | **Production live** LOZELL 3 + 2009 limitation PASS |
| 052K | Matchup margin intent expansion | done | **Git Preview** `e48b34e` | **Production live** league-wide PASS · personal biggest-win FAIL |
| 053C | Gallery UI `/league/history/matchups` | done | yes (historically) | **yes** — routes on Production git `433fdaf` |
| **OPS-001–006** | Railway cost / Kokoro sleep / MySQL backup / TTS isolation | done | n/a | Railway config **CLOSED** |
| **058P** | Store-independent onboarding | done | yes | **yes** `433fdaf` |
| **058 / 058A** | Connector hygiene 1.14.3 | done | n/a | Protocol certified; Store URL **missing** |
| **058B** | Store package 1.14.4 + legal pages | **CURRENT** | not deployed | **not deployed / not submitted** |

---

## Pending RFSNs

| ID | Title | Blocked on |
| --- | --- | --- |
| **RFSN-058B** | Store submit | Founder review + live `/privacy` `/support` + CWS account. **Do not invent Store URL.** |
| **RFSN-058** | Full ESPN install | Real Chrome Web Store listing URL |
| **052K-follow** | Personal “What's my biggest win?” | Owner resolution into `query_matchup_margins` |
| 053 later increments | Gallery close-out if gaps remain | Explicit ticket — routes already on Production git |
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
| **058P onboarding** | yes | **Shipped** `433fdaf` | Store-independent path only |
| **058B Store package** | n/a | **No** — founder review | ZIP ready; listing unpublished |
| **053 gallery routes** | yes | **On Production git** | Do not treat as local-only |
| **053 later increments / MKT-001** | mixed | Not re-certified this edition | Explicit ask |

**Production must not receive** 058B website legal pages or a fake Store URL until explicitly requested. 051 stays closed. **054 is live.** **058P is live.**

---

## Inconsistencies found (doc vs impl vs live)

1. **Encyclopedia retired.** Path now exists only as a retirement stub. Do not cite Editions 1.1–1.3.
2. **051 numbering is now locked** (A Foundation → E Closeout). Older audit text may still say “051C scale” / “next 051D measure”; those aliases map to **051D readability** and **cancelled census** respectively. Density follow-up is **RFSN-054**, not 051F.
3. **052 Production close artifact still documents LOZELL = 2.** That snapshot is historical (`06b35ba`, 2026-08-08). Do not rewrite it. Current Production live probe: LOZELL **3 (2009, 2011, 2021)**.
4. **Preview=Git is proven** (`e48b34e` → `0afa371e`). Health `gitSha` still stale (`dff6154`) on Git deploys — do not use it as the alignment signal.
5. **053C gallery routes** are on Production git `433fdaf`. Older “local WIP” rows in this file (pre-058B edition) are **stale**. Route inventory still needs those rows if missing.
6. **053E** remaining work, if any, is Advisor copy — No Mercy route exists.
7. **`todo.md`** is legacy planning only. Not SOT.
8. **`railway down` is not a cancel.** 2026-08-09 it removed the serving SUCCESS deploy (`0b79799b`) and left Production 404 until `redeploy --from-source` (`fea8db3c`).
9. **`DEPLOYMENT.md` still documents `railway up`.** That conflicts with Git-only policy. Canonical deploy/ops: **this file**. `DEPLOYMENT.md` is a bootstrap leftover.
10. **`docs/DEV_SHEET.md`** is a June 2026 system map. Live status is **this file**. Health URL in the playbook section now points at `www.fantasyfootballrivals.com`.
11. **`services/kokoro-tts/README.md`** previously said “not yet integrated.” Voice playbook is the TTS mechanic SOT.
12. Store public name is **Fantasy Football Rivals — ESPN Connector** (v1.14.4). Internal unpacked build still says GM War Room. Do not call v1.14.2 the Store candidate.
13. **Yahoo/workbook as “onboarding”** in older dashboard rows was overstated — they are secondary, not `/connect`.

---

## Recommendations still open

1. Founder: Production-promote 058C privacy/support (`23c7a4b`), then Chrome Web Store submit of v1.14.4. After Google issues a URL, set `VITE_CONNECTOR_INSTALL_URL` (Preview then Production).
2. Fix 052K personal biggest-win (`my` → margin `ownerName`) and re-smoke Production only when asked.
3. Separate Preview/Production TTS tokens when scheduled.
4. Never use `railway down` against a serving SUCCESS to clear INITIALIZING.
5. Never `railway redeploy` Kokoro to “apply Serverless.”
