# GM War Room / Fantasy Football Rivals — Developer Architecture & Progress Assessment

**Prepared:** June 2026
**Repo:** `github.com/RSadmin94/espn-fantasy-gm-tool` (master) · local `C:\Users\RODERICK\Projects\espn-fantasy-gm-tool`
**Live:** https://gmwarroom.online · **Deploy branch:** `cursor/frontend-rebuild-stage1-9b20`
**Scale snapshot:** 545 commits · ~47 database tables · ~150 backend modules · 30 frontend pages · 1 Chrome extension · 3 CI workflows

---

## 0. How to read this sheet

This is a plain-English-plus-technical map of the whole system: what exists, how the pieces fit, what's solid, what's fragile, and what's next. It's written so you (non-coder/owner) can hand any section to a developer or AI and they'll immediately know where things live. Section 18 is the "operating manual" of hard-won quirks — that section alone saves hours.

---

## 1. Executive summary

GM War Room (consumer brand **Fantasy Football Rivals**) is a **mature, feature-rich fantasy-football intelligence SaaS** — far past prototype. It ingests a private ESPN league's full history, normalizes it into a clean database, and turns it into opponent-specific "intelligence desk" features: behavioral owner profiles (League DNA), a draft war room, rivalry dossiers, a career-arc analyzer ("Why Haven't I Won / Why You Won"), weekly storylines, a hall of fame, trade analysis, and an AI advisor.

The codebase is large and layered: a React 19 front end, a tRPC/Express back end with ~150 modules, a Drizzle/MySQL data layer of ~47 tables, a multi-platform provider abstraction (ESPN today; Sleeper/Yahoo adapters scaffolded), Stripe billing, and an automated patch-based deploy pipeline to Railway. Commercialization plumbing (billing, onboarding funnel, usage metering) is already substantially built.

**Current focus area** (this work stream): hardening the historical-data foundation and the League DNA / career-report surfaces that are the product's differentiator.

---

## 2. Product identity & strategy

- **Positioning:** a *private intelligence desk for beating specific league opponents* — not a generic fantasy toolbox. **League DNA** (behavioral profiling of opponents across seasons) is the core differentiator and product identity.
- **Anchor league:** "ATLANTAS FINEST FF" — 14-team PPR keeper league, `leagueId 457622`, history back to 2010.
- **Retention thesis:** weekly ritual hooks (Tuesday waiver briefing, Thursday matchup prep) + emotional onboarding impact matter more than raw feature count.
- **Onboarding "reveal" sequence:** show the user their own DNA profile → the current champion's profile → their biggest rival.

---

## 3. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript 5.9 | Strict-ish; tsx for scripts/probes (transpile-only, no type-check at runtime) |
| Frontend | React 19.2 + Vite 7 | SPA; bundle ~1.9 MB (single chunk — see tech debt) |
| Styling | Tailwind CSS v4 + Radix UI (shadcn/ui) | ~40 `components/ui/*` primitives; dark palette (`#0c090e`) |
| Client data | tRPC client v11 + TanStack Query v5 + superjson | Typed end-to-end RPC; `httpBatchLink` at `/api/trpc` |
| Routing | react-router v7 (wouter also present) | |
| Charts/UI extras | recharts, framer-motion, lucide-react, sonner (toasts), vaul, embla | |
| Backend | Express 4 + tRPC server v11 | `server/_core/index.ts` is the entrypoint |
| ORM / DB | Drizzle ORM 0.44 + mysql2 → MySQL | Schema in `drizzle/schema.ts`; migrations in `drizzle/migrations` |
| Validation | Zod 4 | Inputs/outputs validated on tRPC procedures |
| Auth | JWT via `jose` (+ Clerk SDKs in deps) | Health checks `JWT_SECRET`; encryption key for stored ESPN creds |
| Billing | Stripe (`stripe` SDK, webhook, products) | `billingRouter`, `stripeWebhook.ts`, `usageTracker.ts` |
| LLM | Pluggable provider — `server/_core/llm.ts` (~34 KB) | Prod health currently reports `LLM_PROVIDER=openai`; Anthropic/Claude integration also in tree |
| Storage | AWS S3 SDK (presigned URLs) | `storage.ts`, `_core/storageProxy.ts` |
| Build | Vite (client) + esbuild (server bundle) + `copy-migrations.mjs` | `dist/public` (client) + `dist/index.js` (server ~1.6 MB) |
| Package mgr | pnpm 10 (frozen lockfile enforced) | |
| Tests | Vitest (~60 `*.test.ts` files) | Strong unit coverage on services/engines |
| Data sync | Chrome extension (MV3) | ESPN auth + draft/history import |
| Deploy | Railway (Linux container) | Auto-deploys on push to the deploy branch (~90–95 s) |
| CI/CD | GitHub Actions: `ci.yml`, `patch.yml`, `scheduled-refresh.yml` | Patch-zip release flow + nightly refresh |

---

## 4. System architecture (high level)

```
                 ┌────────────────────────────────────────────┐
   ESPN Fantasy   │  Chrome Extension (MV3)                     │
   (private API) →│  background.js / gmwarroom-bridge.js        │── authenticated pulls
                 └───────────────────────┬────────────────────┘
                                         │ raw JSON
                                         ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  BACKEND  (Express + tRPC, server/_core/index.ts)                      │
   │                                                                        │
   │  Ingest/Normalize        Domain Services            Routers (tRPC)     │
   │  espnService (54KB)  →   leagueDNA, rivalry,    →   routers.ts (536KB  │
   │  espnPersistence(79KB)   championshipEngine,        aggregator) +      │
   │  providers/* (ESPN,      ownerProfileService,       ~30 focused        │
   │  Sleeper, Yahoo)         careerReport, hallOfFame,  routers            │
   │                          weeklyStorylines, etc.                        │
   │            │                      │                      │             │
   │            ▼                      ▼                      ▼             │
   │   ┌───────────────────────── MySQL (Drizzle, ~47 tables) ───────────┐ │
   │   │ cache layer (espn_raw_cache, espn_season_cache, fantasy_data…)   │ │
   │   │ canonical gm_* tables (teams, matchups, draft_picks, players…)   │ │
   │   │ feature tables (rivalry_scores, weekly_storylines, fear_index…)  │ │
   │   │ platform tables (users, billing/usage, onboarding, memory…)      │ │
   │   └──────────────────────────────────────────────────────────────────┘ │
   │            │   LLM layer (_core/llm.ts) · Stripe · S3 storage          │
   └────────────┼───────────────────────────────────────────────────────────┘
                ▼  /api/trpc (superjson, batched)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  FRONTEND  (React 19 + Vite, 30 pages)                                 │
   │  Dashboard · Draft War Room · Owner Profiles · Why Haven't I Won ·     │
   │  Rivalry Center · Hall of Fame · Player Database · Advisor · …         │
   └──────────────────────────────────────────────────────────────────────┘
                ▼
        Railway (prod)  ←  GitHub Actions (patch.yml zip-apply / push auto-deploy)
```

---

## 5. Repository layout (top level)

| Dir | Purpose |
|---|---|
| `client/` | React front end (Vite). `src/pages/` (30 pages), `src/components/` (incl. `ui/` shadcn primitives + `dashboard/`), `src/lib/` (trpc client, helpers), `main.tsx` (tRPC/superjson setup) |
| `server/` | ~150 modules: tRPC routers, domain services, ingestion/normalization, `_core/` (entry, trpc, llm, auth, health, vite), `providers/` (ESPN/Sleeper/Yahoo adapters), `stripe/` |
| `drizzle/` | `schema.ts` (~47 tables), `migrations/` (SQL), `meta/_journal.json` (migration journal — tracked) |
| `chrome-extension/` | MV3 extension: `background.js`, `gmwarroom-bridge.js`, `popup.*`, `manifest.json` |
| `scripts/` | ~60 ops/ingestion/audit scripts (draft seeders, P2 player pipeline, audits, verifiers) |
| `shared/` | Code shared between client & server (`shared/_core`) |
| `ml/` | ML assets (paired with `mlRouter`/`mlService`) |
| `.github/workflows/` | `ci.yml`, `patch.yml`, `scheduled-refresh.yml` |
| `docs/` | Capability docs + data doctrines (this file lives here) |
| `patches/`, `_dryrun/`, `qwen_takeover_bundle/`, `references/`, `data/` | Patch zips, backfill backups (gitignored), context bundles, reference material |
| `dist/` | Build output (gitignored) |

---

## 6. Data layer — MySQL via Drizzle (~47 tables)

**Source-of-truth doctrine:** ESPN raw payloads are captured into cache tables, then *transformed* into clean canonical `gm_*` tables. Several features read the raw cache directly; others read the canonical tables. (See `docs/HISTORICAL_DATA_TRUTH_DOCTRINE.md`.)

**Cache / raw layer**
- `espn_raw_cache` — raw ESPN JSON per `(leagueId, season, viewName)`. `combined.draftDetail.picks` present 2018–2026, empty 2009–2017.
- `espn_season_cache` — per-season cache (⚠ global key, no leagueId scoping — multi-league risk, see tech debt).
- `fantasy_data_cache`, `adp_trend_snapshots`, `standings_snapshots`, `refresh_manifest`, `espn_view_health`, `sync_runs`.

**Canonical `gm_*` (transformed truth)**
- `gm_teams` (`teams`) — per season; `ownerName`, `finalStanding` (⚠ pre-2018 offset +1), `playoffSeed`, `pointsFor`.
- `gm_matchups` (`matchups`) — `isPlayoff` (⚠ includes consolation), `isCompleted`, home/away/winner.
- `gm_draft_picks` (`draft_picks`) — now **contiguous 2010–2026** (post-backfill); `overallPick`, `playerId` (ESPN id), `isKeeper`, `bidAmount`.
- `gm_transactions`, `gm_roster_entries`, `gm_season_rosters`, `gm_players`, `gm_standings_snapshots`.
- `gm_player_registry` — canonical one-row-per-player identity (`espnPlayerId` varchar); `gm_weekly_player_stats` — proven weekly performance (source-confidence gated ≥85).

**Feature / intelligence tables**
- `rivalry_scores`, `trade_narratives`, `weekly_storylines`, `fear_index`, `reputation_events`, `league_medals`, `owner_aliases`, `league_events`, `gm_decisions` / `gm_decision_tags`, `champ_equity_predictions`, `monte_carlo_calibration`, `player_news_signals`, `mock_draft_results`, `start_sit_decisions`, `trade_decisions`, `pick_trades`, `scraped_trades`.

**Platform tables**
- `users`, `league_connections`, `league_identity`, `user_memory`, `chat_history`, `llm_usage`, `usage_events`, `funnel_events`, `onboarding_state`, `scheduled_jobs`, `weekly_player_stats`.

---

## 7. Data pipeline (ESPN → canonical)

1. **Auth & capture** — ESPN private-league JSON requires authentication. Direct browser navigation to the JSON API redirects to homepage; cookie-injection approaches failed. The **Chrome extension** is the working path (MAIN-world script injection / draft-recap scraping). Raw payloads land in `espn_raw_cache`.
2. **Normalize/transform** — `espnService.ts` (~54 KB) + `espnPersistence.ts` (~79 KB) parse raw payloads into the canonical `gm_*` tables. Key entry points: `upsertDraftPicks()`, `runEspnRawCacheNormalizedBackfill()`, normalization helpers (`buildPlayerIdMap`, `normalizeDraftPicks`). Idempotent upserts keyed on unique indexes.
3. **Provider abstraction** — `server/providers/` has `espnAdapter`, `sleeperAdapter`, `yahooAdapter` (+ `yahooOAuth`), `registry`, `types`. ESPN is live; Sleeper/Yahoo are scaffolding for future multi-platform support.
4. **Scheduled refresh** — `scheduledRefresh.ts` / `espnSeasonRefresh.ts` driven by `scheduled-refresh.yml` (nightly).
5. **Player pipeline (P2)** — `scripts/` `p2:discover` → `p2:ingest` → `p2:validate` → `p2:sanity` (+ rollback) populate `gm_player_registry` and `gm_weekly_player_stats`.

**Important data-truth facts (load-bearing):**
- `gm_teams.finalStanding` is reliable but **offset +1 for 2010–2017** (best team stored as 2, no rank-1). 2018+ start at 1. Career-report code detects this per-season dynamically (no hardcoded years).
- `gm_matchups.isPlayoff` is **unusable as a playoff filter** — it flags consolation games too. True playoff logic must come from corrected `finalStanding` ranks.
- ESPN **stat-id mapping** matters: `statId 4 = passingTD = 6 pts` (was once misread as passing yards) — fixed in `leagueScoringService.ts`.
- ESPN **2026 trade model** changed: `TRADE_UPHOLD`/`TRADE_ACCEPT` replaced legacy `TRADE`/`EXECUTED`.

---

## 8. Backend (Express + tRPC)

**Entrypoint:** `server/_core/index.ts` → Express app + tRPC mounted at `/api/trpc` (superjson transformer, batched). Health at `/api/health` (checks DATABASE_URL, JWT_SECRET, ESPN creds, encryption key, LLM provider, DB).

**Router structure**
- `routers.ts` (~536 KB) — large aggregator / legacy monolith combining most procedures. *(Candidate for decomposition — see tech debt.)*
- ~30 focused routers, e.g. `draftWarRoomRouter` (50 KB), `leagueNewsroomRouter`, `offseasonRouter`, `providerRouter`, `playerStatsRouter`, `playerStatsCacheRouter`, `weeklyAssessmentRouter`, `dnaRouter`, `leagueIntelRouter` (career report), `rivalry`/`dossier`, `billingRouter`, `onboardingRouter`, `beatReporterRouter`, `injuryRouter`, `vegasRouter`, `simulationRouter`, `backtestingRouter`, `agentRouter`, `mlRouter`, `champRouter`, `gmDecisionRouter`, `activityDnaRouter`, `meRouter`.

**Domain service layer (selected, by theme)**
- *League DNA / behavioral:* `leagueDNA.ts` (25 KB), `ownerProfileService.ts` (49 KB), `activityDnaService.ts`, `reputationService.ts`, `leagueIdentityService.ts`.
- *Rivalry / opponents:* `rivalryService.ts` (28 KB), `rivalryDossierService.ts`, `liveOpponentProfile.ts`, `biggestThreatService.ts`, `h2hContextBuilder.ts`, `opponentData.ts`.
- *Career / championship:* `careerReportService.ts`, `championshipEngine.ts` (27 KB), `championshipPath.ts`, `whyHaventIWon.ts`, `championshipHistoryBuilder.ts`, `hallOfFameService.ts`.
- *Draft:* `draftWarRoomRouter.ts`, `draftStrategyEngine.ts`, `draftRealitySimulator.ts`, `draftHelperService.ts`, `keeperRecommendationEngine.ts`, `canonicalDraftBoard.ts`.
- *Weekly / narrative:* `weeklyStorylinesService.ts` (34 KB), `weeklyAssessmentService.ts` (32 KB), `tradeNarrativeService.ts`, `beatReporterService.ts`, `recentLeagueEventsService.ts`.
- *Analytics / prediction:* `analytics.ts` (35 KB), `monteCarloService.ts`, `fearIndexService.ts`, `vegasOddsService.ts`, `injuryService.ts`, `backtestingService.ts`, `mlService.ts`.
- *Platform:* `usageTracker.ts` (31 KB), `_core/llm.ts` (34 KB), `db.ts` (50 KB), `rateLimiter.ts`, `memCache.ts`, `funnelService.ts`, `stripeWebhook.ts`.

**Auth:** JWT session via `jose` (Clerk SDKs present in deps); ESPN credentials stored encrypted (`_core/crypto.ts` + `CREDENTIAL_ENCRYPTION_KEY`).
**LLM:** single integration point `_core/llm.ts` with usage metering (`llm_usage`, `usageTracker`); provider configurable (prod health shows `openai`).

---

## 9. Frontend (React 19 + Vite)

**Data pattern:** every page calls typed `trpc.<router>.<proc>.useQuery(...)` (TanStack Query) against `/api/trpc`. `main.tsx` wires `httpBatchLink` + `superjson` + an auth-token header. Public procedures (e.g. `leagueIntel.careerReport`) are GET-able directly for debugging.

**Pages (30)** — by size/importance:

| Page | Size | Role |
|---|---|---|
| `SyncData.tsx` | 91 KB | ESPN sync / data-health control center |
| `DraftWarRoom.tsx` | 85 KB | Live draft board, ADP, keeper/scarcity intelligence |
| `OwnerProfiles.tsx` | 68 KB | League DNA desk: Snapshot / Draft DNA / Keeper DNA / Activity DNA tabs + rivalry dossier + compare |
| `Dashboard.tsx` | 55 KB | League Pulse + Intelligence Hero (live engine data) |
| `Transactions.tsx` / `Trades.tsx` | 48 / 31 KB | Transaction & trade history/analysis |
| `RivalryCenter.tsx` | 41 KB | Head-to-head rivalry hub |
| `HallOfFame.tsx` | 40 KB | Champions, records, medals |
| `Roster.tsx` | 34 KB | Roster views |
| `LeagueTimeline.tsx` | 32 KB | Season-by-season timeline |
| `PlayerDatabase.tsx` | 26 KB | Canonical player table (+ photos, **AVG Pick** column) |
| `WhyHaventIWon.tsx` | 23 KB | Career-arc analyzer ("Why You Won" when champion) |
| `Advisor.tsx` | 22 KB | AI advisor chat |
| `KeeperAdvisor` · `PlayerIntelligence` · `ConnectESPN` · `DraftWarRoomDesk` · `DraftHistory` · `Standings` · `Settings` · `ChampionshipPath` · `AcquisitionImpact` · `DraftRealitySimulator` · `CommandDashboard` · `Matchups` · `LeagueSettings` · `LeagueDataHealth` · `OwnerIdentityReview` · `LeagueWire` | — | supporting surfaces |

**Design system:** Tailwind v4 + ~40 Radix/shadcn `ui/*` primitives; dark theme (base `#0c090e`, lime/amber accents); `cn()` class merge; `lucide-react` icons. `AppShell.tsx` is the nav/layout frame. `components/dashboard/*` holds dashboard widgets; `RivalryDossierPanel`, `ActivityDnaCard` are reusable intel cards.

---

## 10. Deployment & CI/CD

- **Host:** Railway (Linux container). **Auto-deploys on push** to `cursor/frontend-rebuild-stage1-9b20` (~90–95 s rebuild).
- **Build:** `vite build` (client → `dist/public`) + `esbuild` (server → `dist/index.js`) + `copy-migrations.mjs`. `start` script must use **native Linux syntax** (`NODE_ENV=production node dist/index.js`); `cross-env` handles Windows-dev parity.
- **Package manager rule:** pnpm with **`--frozen-lockfile`**. Any `package.json` change requires committing the updated `pnpm-lock.yaml` too (run `pnpm install --no-frozen-lockfile` first), or Railway fails.
- **GitHub Actions:**
  - `ci.yml` — build/type/test checks.
  - `patch.yml` — **zip-based patch flow**: upload a patch zip to a GitHub release → workflow applies & deploys.
  - `scheduled-refresh.yml` — nightly ESPN refresh.
- **Env vars** (Railway-only; not in git): `DATABASE_URL`, `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ESPN_LEAGUE_ID`, `ESPN_S2`, `ESPN_SWID`, `LLM_PROVIDER` (+ keys), Stripe keys, S3 creds.
- **DB note:** local dev probes connect to the **production MySQL** — local reads/writes are live data. DB backfills go live immediately (no deploy); only *code* changes need a push.

---

## 11. Feature inventory (what's built)

- **League DNA suite** — owner behavioral profiles across Draft / Keeper / Activity dimensions; reputation, identity resolution, owner aliases.
- **Career analyzer** — "Why Haven't I Won" / "Why You Won": corrected playoff brackets, champion-by-year, readiness score, biggest rival/threat, positional gaps vs champions.
- **Draft tools** — Draft War Room (ADP composite 80/20, scarcity, keeper detection), Draft Reality Simulator, Draft History, keeper recommendation engine, canonical draft board.
- **Rivalry** — Rivalry Center + dossiers, head-to-head context, biggest-threat service, live opponent profiles.
- **Narrative/engagement** — weekly storylines, weekly assessment, beat reporter, league newsroom/wire, trade narratives, league timeline, hall of fame, fear index.
- **Analysis/prediction** — Monte Carlo, Vegas odds, injuries, backtesting, acquisition impact, ML service, champ-equity predictions.
- **AI advisor** — chat with streaming, context builder, weekly intel.
- **Platform** — Stripe billing, onboarding funnel, usage metering, multi-league/provider scaffolding, user memory, ESPN credential vault, health/heartbeat.

---

## 12. Recent accomplishments (current work stream)

**Live & verified on prod:**
- **Career-report refinements** (`0797fc0`, shipped & verified): true playoff-bracket logic via per-season `finalStanding` offset correction; pre-2018 champion names backfilled; Biggest Rival / Biggest Threat chips added to the Career Snapshot. Verified across 11 acceptance checks (health, page load, Rod 2010 Champion, Rod 2017 = 5th, named champions, both chips, Mark playoff trips corrected 9→10, no schema changes, `.gitignore` safe).
- **`draft_picks` historical backfill** (DB-only, live): filled the 2018–2025 gap from cached `combined.draftDetail.picks` (1,330 rows), enriched 366 player names from `gm_players`. Table now **contiguous 2010–2026**; `playerId` 100% intact; backups in `_dryrun/`. Verified arcs (e.g., CMC 2017#26→2025#4; Chase 2021#75→2025#1).

**Committed, awaiting push approval (`19503ff`):**
- **Player Database — photos:** added `loading="lazy"` + `decoding="async"` (deferred, non-blocking image loads); kept 48px fixed container + initials fallback + one-shot `onError` (no retry loop).
- **Player Database — AVG Pick column:** new column = `AVG(overallPick)` from `draft_picks` per player (read-only join on `playerId`), 1-decimal, "—" when none. Validated: CMC 6.3, Chase 49.2, Jefferson 57.2, never-drafted → "—". tsc baseline-clean + build green.

**Earlier in this branch's arc** (from git history): activity-DNA engine + UI, championship-path & acquisition-impact LeagueDNA surfaces, draft-reality simulator + weekly-stats capture, transactions/trades cleanups, owner-GUID removal from UI, hall-of-fame recast, draft-war-room recolor.

---

## 13. Known issues & technical debt

| Area | Issue | Risk |
|---|---|---|
| **Multi-league** | `espn_season_cache` uses a **global key with no leagueId scoping** | Unsafe for multi-user/multi-league — must fix before broader launch |
| **Monolith** | `routers.ts` ~536 KB | Hard to maintain; decompose into focused routers over time |
| **Hardcoded constants** | League constants (e.g. `457622`) embedded in places; `rivalryService` is **Rod-coupled** (`ROD_NAMES`/`isRod`/`avgRodPF`) | Blocks clean generalization to arbitrary owners/leagues |
| **Owner Profiles seeds** | Snapshot tab shows **raw per-season seed** (e.g., 2017 seed 7), not the corrected career-report rank | Cosmetic inconsistency vs the corrected bracket logic |
| **Player photos** | ESPN combiner returns a generic **silhouette with HTTP 200** for unknown/retired IDs → `onError` can't catch it | Some "broken-looking" photos remain; true fix needs out-of-scope detection |
| **Draft names** | 127 `draft_picks` rows still have `null playerName` (deep/cut players not in `gm_players`); `playerId` preserved | Cosmetic; resolvable later via ESPN player API |
| **Bundle size** | Client is a single ~1.9 MB chunk | Slower first load; code-splitting would help |
| **tsc baseline** | 2 known pre-existing errors: `DraftWarRoom.tsx(968,60)` & `(968,83)` `'myPick' possibly null` | Baseline only — any *other* tsc error = regression signal |
| **ESPN auth** | Private-league JSON needs auth; cookie injection failed; relies on extension MAIN-world injection / recap scrape | Fragile dependency on ESPN internals |

---

## 14. Commercialization status

Billing infrastructure is already substantially built (`billingRouter`, `stripeWebhook.ts`, `stripe/products.ts`, `usageTracker.ts`, `funnelService.ts`, `onboardingRouter`, `onboarding_state`/`funnel_events`/`usage_events` tables).

**Intended model (per strategy):** Chrome Web Store submission with a pre-sale founding-member campaign ($99 lifetime, ~200 seats) ahead of the **August 2026** draft season; ongoing **$29/mo or $249/yr** (first weekly cycle free, no permanent free tier); a **League Pack** at $8.99/member/month for commissioner-driven growth; the War Room gated behind the paid tier.

---

## 15. Roadmap

**Near-term**
- Push & live-verify the Player Database images + AVG Pick commit (`19503ff`).
- Decide next priority: public-procedure **security audit** vs. **hardcoded league-constants cleanup**.
- Align Owner Profiles seed display with corrected career ranks.

**Mid-term**
- **Rival Profile** feature ("How do I beat Demetri?") — opponent-specific game plan.
- Chase the remaining 127 `draft_picks` names via ESPN player API.
- `leagueDnaRank` into the career snapshot (Phase 5).
- Commissioner Command Center; CSV historical importer.

**Pre-launch hardening**
- **Multi-league cache isolation** (scope `espn_season_cache` by leagueId).
- De-Rod-ify `rivalryService` (generic focal owner).
- Chrome Web Store submission + founding-member pre-sale (target: before Aug 2026 draft).

---

## 16. Developer environment & workflow playbook

This is the operating manual. Following it avoids the most common failures on this stack.

**Shell rules (Windows)**
- `git`, `node`, `tsx`, `npm` work in **`cmd.exe`**, not PowerShell (PowerShell lacks `git` on PATH and rejects `&&`).
- **ripgrep is not installed** — use PowerShell `Select-String` for content search (Desktop Commander `start_search` fails without the rg binary).
- `cmd` `&&` chains stop on the first non-zero exit (e.g. `findstr` with no match) — use `&` to separate when that's not desired.

**Editing existing source files (critical)**
- `Filesystem:write_file`/`edit_file` **fail with EPERM** when overwriting existing files (editor/watcher lock on the rename step).
- **Reliable method:** PowerShell **.NET LF-anchor splice** — `ReadAllText(UTF8)` → build ASCII anchors as single-quoted line arrays joined by `[char]10` → verify each anchor matches **exactly once** (`[regex]::Matches(...).Count -eq 1`) → `.Replace()` → `WriteAllText(..., UTF8 no-BOM)`. Keep inserted content **ASCII-only**; render special glyphs via escapes (e.g. em-dash as `{"\u2014"}` in JSX). All source files here are **LF, no BOM** — confirm before splicing.
- `Desktop Commander:write_file` does a direct write (no rename) and works for **new** files (probes, patch scripts, this doc).

**Probes & verification**
- tsx probe pattern: write `_x.ts` at repo root with `import "dotenv/config"`, run in cmd: `node_modules\.bin\tsx.cmd _x.ts 2>&1`. tsx transpiles **without** type-checking (so `db as any` runs fine). Never inline complex TS via `tsx -e` (quotes/backticks mangle) — always write a file.
- Probes hit **production MySQL** — they're live reads/writes. Back up before any write.
- Type-check: `node_modules\.bin\tsc.cmd --noEmit` — **clean = only the 2 known DraftWarRoom baseline errors**.
- Build: `npm run build` → `✓ built in ~8s`, client ~1.9 MB, `dist/index.js` ~1.6 MB, migrations copied.
- Health: `(Invoke-WebRequest 'https://gmwarroom.online/api/health' -UseBasicParsing).Content`.
- **Live tRPC verification (any public proc):** navigate browser to `https://gmwarroom.online/api/trpc/<router>.<proc>?batch=1&input=<urlencoded {"0":{"json":{...}}}>` and read the JSON (superjson batched format). Used to confirm deployed behavior for arbitrary owners.

**Git / delivery discipline**
- **Gated commits & pushes** — never push without explicit approval ("push now" / "publish" / "Proceed"). Prefer isolated commits with **single-token hyphenated messages, no spaces** (in cmd use no quotes: `git commit -m fix-thing`).
- Scratch files (`_*` at repo root) are gitignored via root-anchored `/_*`; `_dryrun/` keeps backups. Verify `server/_core`, `shared/_core`, `drizzle/meta/_journal.json` stay **tracked & unignored** after any `.gitignore` change.
- Preferred delivery: drop-in files / small patches over big rewrites; preserve the tRPC/Express/Drizzle/MySQL stack.

**Encoding traps (PowerShell)**
- `ConvertTo-Json` writes a BOM that breaks JSON parsing — use `New-Object System.Text.UTF8Encoding($false)` + `WriteAllText`.
- PowerShell 5.1 reads `.ps1` as ANSI — keep patch scripts ASCII-only to avoid mojibake of anchors.

---

## 17. Appendix — key file reference

| Need to touch… | Go to |
|---|---|
| Server entry / tRPC mount | `server/_core/index.ts`, `server/_core/trpc.ts` |
| DB schema / tables | `drizzle/schema.ts` (+ `drizzle/migrations`, `drizzle/meta/_journal.json`) |
| ESPN ingest/normalize | `server/espnService.ts`, `server/espnPersistence.ts`, `server/providers/*` |
| LLM integration | `server/_core/llm.ts` |
| Career report | `server/careerReportService.ts`, `server/championshipPath.ts`, `client/src/pages/WhyHaventIWon.tsx`, `server/leagueIntelRouter.ts` |
| Owner / League DNA | `server/ownerProfileService.ts`, `server/leagueDNA.ts`, `client/src/pages/OwnerProfiles.tsx` |
| Player DB + AVG Pick | `client/src/pages/PlayerDatabase.tsx`, `server/playerStatsRouter.ts`, `server/playerStatsTypes.ts` |
| Draft War Room | `server/draftWarRoomRouter.ts`, `client/src/pages/DraftWarRoom.tsx` |
| Billing | `server/billingRouter.ts`, `server/stripeWebhook.ts`, `server/stripe/*`, `server/usageTracker.ts` |
| Client tRPC/auth setup | `client/src/main.tsx`, `client/src/lib/trpc*` |
| Chrome extension | `chrome-extension/background.js`, `chrome-extension/gmwarroom-bridge.js`, `manifest.json` |
| CI/CD | `.github/workflows/{ci,patch,scheduled-refresh}.yml` |
| Data doctrines | `docs/HISTORICAL_DATA_TRUTH_DOCTRINE.md`, `docs/DRAFT_HISTORY_CANONICAL.md`, `docs/GM_WAR_ROOM_CAPABILITIES.md` |

---

*End of dev sheet. Generated from a live scan of the repository (structure, schema, routers, services, scripts, CI) cross-checked against the current branch state (`cursor/frontend-rebuild-stage1-9b20`, 545 commits, HEAD `19503ff`).*
