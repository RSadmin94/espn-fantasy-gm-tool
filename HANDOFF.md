# ESPN Fantasy Football GM Tool — Project Handoff Document

**Date:** May 16, 2026  
**Prepared for:** Incoming Manus account  
**Project:** ATLANTAS FINEST FF — GM War Room  
**League:** ESPN League ID `457622` · 14 teams · PPR · 1 keeper/year · 18 seasons (2009–2026)  
**Manus Project Path:** `/home/ubuntu/espn_ff_gm_tool`  
**Live Dev URL:** `https://3000-it6h2fctwh6efz7a3sjy0-a06ae522.us1.manus.computer`

---

## 1. What This Project Is

The GM War Room is a full-stack private web application built exclusively for the ATLANTAS FINEST FF keeper league. It is not a generic fantasy tool — every feature is purpose-built around this league's specific rules: **14 teams, PPR scoring, 1 keeper per team per year, 2-consecutive-year keeper limit, 7-team playoffs, snake draft with round-based keeper cost (kept round − 1).**

The application aggregates 18 seasons of ESPN API data into a single intelligence platform, giving the owner (Roderick Sellers) and other league members AI-powered analysis, behavioral DNA profiling, rivalry tracking, trade intelligence, draft simulation, and a full SaaS subscription funnel.

The app is deployed on the Manus platform and accessible only to authenticated users via Manus OAuth. The owner account has `admin` role; all other league members are `user` role.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React 19 + Vite 7 | 19.2.1 / 7.1.7 |
| Styling | Tailwind CSS 4 + shadcn/ui | 4.1.14 |
| Routing | Wouter | 3.3.5 |
| Data fetching | tRPC 11 + React Query 5 | 11.6.0 / 5.90.2 |
| Serialization | Superjson | 1.13.3 |
| Charts | Recharts | 2.15.2 |
| Animation | Framer Motion | 12.23.22 |
| Backend | Express 4 | 4.21.2 |
| ORM | Drizzle ORM | 0.44.5 |
| Database | MySQL / TiDB (Manus managed) | — |
| Auth | Manus OAuth (PKCE + JWT session cookie) | — |
| LLM | Manus Built-in LLM (`invokeLLM` / `invokeLLMStream`) | — |
| Payments | Stripe (test sandbox active) | — |
| Language | TypeScript 5.9 strict mode | 5.9.3 |
| Testing | Vitest | 2.1.4 |
| Package manager | pnpm | 10.15.1 |

---

## 3. How to Run, Build, and Test

```bash
# Development (hot reload)
pnpm dev

# Type check (must exit 0 before any checkpoint)
pnpm check

# Run all tests (must be 726/726 passing as of last checkpoint)
pnpm test

# Push schema changes to database
pnpm db:push

# Production build
pnpm build

# Serve production build
pnpm start
```

The dev server starts on port 3000 (or the next available port). The Vite frontend and Express backend are served from the same process — do **not** run them separately.

---

## 4. Architecture

```
Browser (React 19 + Vite)
        │
        │  HTTP /api/trpc/*  (tRPC over HTTP)
        ▼
Express 4 Server
        │
        ├── /api/oauth/callback          (Manus OAuth)
        ├── /api/yahoo/oauth/*           (Yahoo OAuth — deferred)
        ├── /api/stripe/webhook          (Stripe webhooks)
        ├── /api/trpc/*                  (tRPC router — all features)
        ├── /api/advisor/stream          (SSE streaming for AI GM chat)
        ├── /api/scheduled/espn-refresh  (Manus cron: ESPN data refresh)
        ├── /api/scheduled/weekly-intel  (Manus cron: weekly assessment)
        └── /*                           (Vite SPA / static assets)
                │
                ├── MySQL / TiDB  (Drizzle ORM)
                ├── ESPN v3 Fantasy API  (cookie-authenticated)
                └── Manus Built-in LLM API  (BUILT_IN_FORGE_API_KEY)
```

**Key architectural constraint:** The Stripe webhook route (`/api/stripe/webhook`) must be registered with `express.raw()` **before** `express.json()` middleware. This ordering is already correct in `server/_core/index.ts` — do not reorder middleware.

**tRPC request lifecycle:** Client calls `trpc.feature.procedure.useQuery()` → serialized POST to `/api/trpc/feature.procedure` → Express routes to tRPC handler → context built from session cookie (`ctx.user`) → procedure executes → typed response returned via React Query.

---

## 5. Environment Variables & Secrets

All secrets are injected by the Manus platform at runtime. They are **never** committed to source control. To view or update them, go to **Settings → Secrets** in the Manus Management UI.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing |
| `ESPN_LEAGUE_ID` | ESPN league identifier (457622) — global fallback |
| `ESPN_SWID` | ESPN auth cookie (SWID) — global fallback |
| `ESPN_S2` | ESPN auth cookie (espn_s2) — global fallback |
| `BUILT_IN_FORGE_API_KEY` | Manus LLM API bearer token (server-side) |
| `BUILT_IN_FORGE_API_URL` | Manus LLM API base URL (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus LLM API key (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | Manus LLM API URL (frontend) |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `OWNER_OPEN_ID` | Owner's Manus OpenID (auto-promotes to admin) |
| `OWNER_NAME` | Owner's display name |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting per-user ESPN credentials |
| `STRIPE_SECRET_KEY` | Stripe secret key (test sandbox) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
| `STRIPE_PRICE_ID_MONTHLY` | Stripe Price ID for the monthly subscription |
| `THE_ODDS_API_KEY` | The Odds API key (injury/odds data — optional) |
| `VITE_APP_TITLE` | App title shown in sidebar (e.g., "ATLANTAS FINEST") |
| `VITE_APP_LOGO` | App logo URL |

**ESPN Cookie Rotation:** `ESPN_SWID` and `ESPN_S2` expire periodically. When ESPN returns 401/403, the Data Refresh page shows an error. Update these in Settings → Secrets. Per-user credentials (stored encrypted in `league_connections`) take precedence over the global env vars.

---

## 6. Database Schema (Current — May 2026)

The schema is defined in `drizzle/schema.ts`. Run `pnpm db:push` after any schema change. The full list of tables is:

| Table | Purpose |
|---|---|
| `users` | Manus OAuth users; `role` enum (`user`/`admin`); `stripeCustomerId`, `subscriptionStatus`, `trialStartedAt`, `currentPeriodEnd`, `active_league_id` |
| `espn_season_cache` | Raw ESPN API JSON per season/view; core data store |
| `refresh_manifest` | Health/metadata for each season's last ESPN refresh |
| `chat_history` | Per-user AI GM Advisor conversation history |
| `league_connections` | Per-user ESPN/Yahoo/Sleeper credentials (AES-256 encrypted); `leagueName`, `isActive`, `provider` |
| `user_memory` | Per-user GM memory injected into AI advisor system prompt |
| `llm_usage` | Token counts, cost estimates, model, call type per LLM invocation |
| `usage_events` | Client-side behavioral events: `eventType`, `sessionId`, `page`, `action`, `featureName`, `metadata`, `userId` |
| `funnel_events` | Conversion funnel events (5 steps: `connected_league`, `completed_reveal`, `clicked_cta`, `started_checkout`, `completed_payment`) |
| `onboarding_state` | Sequential reveal progress per user (self → champion → rival) |
| `rivalry_scores` | Deterministic rivalry scores between all owner pairs; `lore_sentence` (LLM-generated) |
| `trade_narratives` | Trade narrative labels (8 types) + LLM sentences per trade |
| `weekly_storylines` | Weekly story triggers (8 types) + LLM headlines per week |
| `fear_index` | Per-team fear scores (5-component formula) per week |
| `reputation_events` | Per-owner reputation events (8 types) with LLM sentences |
| `mock_draft_saves` | Saved mock draft results with strategy label, equity score, grade |
| `pick_trades` | Draft pick trade log (Rod's pick trade history) |

---

## 7. Key Server Files

| File | Purpose |
|---|---|
| `server/_core/index.ts` | Express bootstrap, middleware ordering, scheduled route handlers |
| `server/_core/context.ts` | tRPC context builder (`ctx.user` from session cookie) |
| `server/_core/llm.ts` | `invokeLLM()` + `invokeLLMStream()` with token tracking |
| `server/_core/crypto.ts` | AES-256-GCM encrypt/decrypt for ESPN credentials |
| `server/routers.ts` | Main tRPC `appRouter` — all feature procedures wired here |
| `server/providerRouter.ts` | `importEspnLeague`, `previewEspnLeague`, Yahoo/Sleeper import |
| `server/espnService.ts` | ESPN API fetching: `fetchEspnViewsHardened()`, `normalizeDraftPicks()`, `fetchTradeProposals()` |
| `server/db.ts` | Drizzle query helpers: `getCachedView()`, `getActiveEspnCredentials()`, `getActiveLeagueForUser()` |
| `server/scheduledRefresh.ts` | ESPN data refresh handler (cron-triggered) |
| `server/weeklyIntelHandler.ts` | Weekly assessment refresh pipeline |
| `server/leagueDNA.ts` | `calcLeagueDNA()` — 6 GM archetypes, exploitability, trade DNA |
| `server/rivalryService.ts` | Deterministic rivalry scoring engine |
| `server/tradeNarrativeService.ts` | 8-label trade narrative engine |
| `server/weeklyStorylinesService.ts` | 8-trigger weekly storyline engine |
| `server/fearIndexService.ts` | 5-component fear score formula |
| `server/reputationService.ts` | 8-event reputation system |
| `server/draftHelperService.ts` | AI draft pick recommendation engine |
| `server/keeperRecommendationEngine.ts` | DNA-driven keeper scoring |
| `server/draftStrategyEngine.ts` | 2026 draft strategy per team |
| `server/usageTracker.ts` | Usage/cost analytics queries (6 behavioral + 4 feature utilization) |
| `server/behavioralAnalytics.ts` | 6 behavioral analytics query functions |

---

## 8. Key Client Files

| File | Purpose |
|---|---|
| `client/src/App.tsx` | All routes + `PageTracker` (page_view events) + `DropOffTracker` |
| `client/src/components/AppLayout.tsx` | Sidebar nav with all feature groups + `LeagueSwitcher` footer |
| `client/src/components/LeagueSwitcher.tsx` | Multi-league switcher + UserMenu (login/logout) |
| `client/src/lib/trackEvent.ts` | Client-side behavioral event helper (fire-and-forget) |
| `client/src/pages/Home.tsx` | Landing page / Command Center |
| `client/src/pages/Reveal.tsx` | Conversion funnel reveal page (sequential 3-profile flow) |
| `client/src/pages/LeagueConnect.tsx` | ESPN/Yahoo/Sleeper credential entry + extension auto-fill |
| `client/src/pages/Advisor.tsx` | AI GM Chat (streaming SSE) |
| `client/src/pages/AIDraftHelper.tsx` | Live ESPN draft board + AI pick recommendations |
| `client/src/pages/hubs/WeeklyIntelligence.tsx` | Weekly intel hub (Storylines, Rivalry, Assessments tabs) |
| `client/src/pages/hubs/TradeLab.tsx` | Trade Lab hub (Analyzer, Aging, Notorious, Offer Generator tabs) |
| `client/src/pages/hubs/KeeperLab.tsx` | Keeper Lab hub |
| `client/src/pages/UsageMonitor.tsx` | Admin usage/cost monitor (8 tabs) |
| `client/src/pages/BehavioralAnalytics.tsx` | Admin behavioral analytics (6 panels) |
| `client/src/pages/OffseasonHub.tsx` | Keeper recommendations + 2026 draft board |
| `client/src/pages/MockDraftSimulator.tsx` | Full mock draft simulator with AI opponents |

---

## 9. Feature Inventory (All Shipped)

### Intelligence Layer
- **AI GM Advisor** — streaming chat with 18-season context, GM memory injection, rate limiting
- **Weekly Intelligence Hub** — storylines feed (8 trigger types), rivalry heat panel, 14-team assessments, batch trigger
- **Offseason Intel Hub** — keeper recommendations (DNA-driven), 2026 draft board, live ESPN team names
- **Owner DNA Profiles** — 6 GM archetypes, exploitability score, trade DNA, waiver DNA, tilt score
- **Rivalry System** — deterministic rivalry scores, LLM lore sentences, revenge opportunity badges
- **Fear Index** — 5-component fear formula, 6 heat labels (UNTOUCHABLE → COLLAPSING), interactive tooltips
- **Reputation System** — 8 event types, LLM sentences, timeline view on Owner Stats page
- **Weekly Storylines** — 8 deterministic triggers, journalist-voice LLM headlines

### Trade & Draft Tools
- **Trade Analyzer** — VORP + championship equity delta, DNA enrichment for both trade partners
- **Trade Aging** — reconstructed completed trades with narrative badges (8 label types)
- **Notorious Trades** — most impactful historical trades with emotional framing
- **Trade Offer Generator** — pick tradability intelligence (HOT/WARM/COLD), strict pick parity (1-for-1, 2-for-2, 3-for-3), value-gap explanation card
- **AI Draft Helper** — live ESPN 2026 draft picks (auto-sync, 30s poll), survival probability, position run alerts, opponent pick prediction, championship equity
- **Mock Draft Simulator** — DNA-driven AI opponents, keeper lock, pause/override, post-draft summary, save/compare, best fit panel
- **Draft Pick Trade Evaluator** — pick value chart delta, owner DNA acceptance probability

### Weekly Tools
- **Start/Sit Advisor** — AI recommendation with opponent DNA context
- **Waiver Wire Intelligence** — desperate team targeting, waiver overlap analysis
- **Keeper Deadline Countdown** — color-escalating banner (configurable deadline)

### Data & History
- **18-Season League History** — 2009–2026, smart refresh (skip closed seasons)
- **Owner Career Stats** — full career records, H2H matrix, rivals tab, reputation timeline
- **Player Profiles** — historical performance, keeper history
- **Rosters** — current rosters per team

### SaaS / Admin
- **Conversion Funnel** — /connect → /generating-dna → /reveal (sequential 3-profile) → Stripe checkout
- **Stripe Subscription** — trial (7 days on connect), active, past_due, canceled; `subscribedProcedure` middleware gates AI features
- **Trial Banner** — color-escalating countdown on Command Center
- **Usage Monitor** — 8-tab admin page: cost summary, feature breakdown, daily trend, LLM call log, feature usage, AI by feature, user retention, onboarding funnel
- **Behavioral Analytics** — 6-panel admin page: active leagues, feature retention, ignored tabs, league switching, return visit drivers, drop-off map
- **Multi-League Support** — per-user `league_connections` table; extension auto-fill; real league name preview; add/switch/remove leagues from sidebar

---

## 10. Scheduled Jobs (Manus Heartbeat Crons)

Two cron jobs are active. They are configured via the Manus platform (Settings → Schedules) and POST to the Express server.

| Job | Schedule | Route | What it does |
|---|---|---|---|
| ESPN Data Refresh | Weekly (Mondays 6AM UTC) | `POST /api/scheduled/espn-refresh` | Fetches all ESPN views for 2025+2026, merges trade proposals, upserts league identity, writes refresh manifest |
| Weekly Intelligence | Weekly (Tuesdays 9AM UTC) | `POST /api/scheduled/weekly-intel` | Runs weekly assessments, refreshes storylines, fear index, reputation events, rivalry scores |

Both handlers authenticate the caller via `sdk.authenticateRequest(req)` and reject non-cron callers.

---

## 11. Authentication & Multi-League Flow

**Manus OAuth:** Users sign in via Manus OAuth (PKCE flow). The callback at `/api/oauth/callback` upserts the user in the DB, creates a JWT session cookie, and redirects to `/`. The owner's `OWNER_OPEN_ID` env var auto-promotes that user to `admin` role on every login.

**Per-user ESPN credentials:** Each user connects their ESPN league via `/connect`. Credentials (`leagueId`, `SWID`, `espn_s2`) are AES-256-GCM encrypted and stored in `league_connections`. The `getActiveEspnCredentials(userId)` helper in `db.ts` returns the active league's decrypted credentials for any ESPN API call. The global `ESPN_SWID` / `ESPN_S2` env vars are only used as a fallback when no per-user credentials exist.

**Multi-league:** One user can have multiple `league_connections` rows. The sidebar `LeagueSwitcher` component lists all connected leagues (with real names from ESPN), allows one-click switching (`league.setActive`), and provides an "Add Another League" CTA that opens `/connect` in add-league mode. The browser extension auto-fills credentials via URL params (`?provider=espn&leagueId=...&swid=...&s2=...`) and triggers a `previewEspnLeague` call to show the real league name before connecting.

**Subscription gating:** `subscribedProcedure` middleware (in `routers.ts`) allows `trialing` (within 7 days of `trialStartedAt`) and `active` users; blocks `free`, `past_due`, and `canceled`. AI GM chat, Trade Offer Generator, and weekly intelligence are gated. Standings, rosters, and draft history remain free.

---

## 12. Browser Extension

The Chrome extension (`espn_dna_extension_v1.3.0.zip`) is packaged in the project root. It:

- Reads ESPN cookies (`SWID`, `espn_s2`) from the browser via `chrome.cookies` API
- Detects the current ESPN league ID from the page DOM
- Injects a "Connect to War Room" button in the ESPN Fantasy UI
- Opens `/connect?provider=espn&leagueId=...&swid=...&s2=...` in a new tab, auto-filling the credential form
- Has a popup showing the 2025 final standings for all 14 teams (offseason mode)
- Extension version: **v1.3.0** — manifest v3, requires ESPN host permissions

---

## 13. Test Suite

The test suite has **726 tests across 37 test files**, all passing as of checkpoint `8ac0e448`. Run with `pnpm test`. Key test files:

| File | Tests | What it covers |
|---|---|---|
| `server/leagueDNA.test.ts` | 32 | All 6 archetypes, tilt score, trade DNA, exploit windows |
| `server/mockDraftIntelligence.test.ts` | 56 | 5 pure mock draft functions, DNA weights, scarcity |
| `server/keeperRecommendationEngine.test.ts` | 28 | Value scoring, need scoring, DNA behavior prediction |
| `server/rivalryService.test.ts` | 16 | Heat labels, score computation, ordering invariants |
| `server/behavioralAnalytics.test.ts` | 37 | All 6 behavioral analytics query functions |
| `server/usageTracker.test.ts` | 17 | Cost estimation, funnel ordering, retention bucketing |
| `server/multiLeague.test.ts` | 24 | Ownership guard, active-league fallback, display helpers |
| `server/multiLeagueExtension.test.ts` | 15 | Extension flow, previewEspnLeague, add-league mode |
| `server/fearIndexService.test.ts` | 21 | 5-component formula, heat labels |
| `server/reputationService.test.ts` | 17 | 8 event types, LLM sentence generation |
| `server/weeklyStorylinesService.test.ts` | 24 | 8 deterministic triggers |
| `server/draftHelperService.test.ts` | 26 | Positional need, survival risk, position run detection |

---

## 14. Last Checkpoint

| Field | Value |
|---|---|
| Checkpoint ID | `8ac0e448` |
| Date | May 16, 2026 |
| TypeScript errors | 0 |
| Tests passing | 726 / 726 (37 files) |
| GitHub | Pushed to `main` |

To roll back to this checkpoint: use the **Version History** panel in the Manus Management UI → find `8ac0e448` → click Rollback.

---

## 15. Open Items / Known Issues

The following items are pending or deferred as of this handoff:

| Item | Status | Notes |
|---|---|---|
| **Publish to production** | Pending | Click the Publish button in the Manus Management UI header (requires checkpoint first) |
| **Yahoo Fantasy integration** | Deferred (v2) | Backend code is built (`yahooAdapter.ts`, `yahooOAuth.ts`); deferred until ESPN-first release is stable. Requires `YAHOO_CLIENT_ID` + `YAHOO_CLIENT_SECRET` secrets from a Yahoo developer app |
| **Sleeper integration** | Deferred (v2) | LeagueConnect has a Sleeper tab; backend adapter not yet built |
| **Settings modal (display name + avatar upload)** | In progress | User requested this feature; not yet started |
| **ESPN cookie expiry** | Ongoing | `ESPN_SWID` and `ESPN_S2` expire every few weeks. When ESPN API calls fail with 401/403, update these in Settings → Secrets |
| **Stripe live keys** | Pending | Currently in Stripe test sandbox. After Stripe KYC verification, enter live keys in Settings → Payment |
| **`VITE_ANALYTICS_ENDPOINT` / `VITE_ANALYTICS_WEBSITE_ID`** | Optional | Manus analytics integration — not required for core functionality |

---

## 16. How to Pick Up Development

1. **Open the project** in the Manus Management UI. The dev server should already be running.
2. **Read `todo.md`** in the project root — it is the authoritative feature/bug tracker. All completed items are marked `[x]`; any new `[ ]` items are the next priorities.
3. **Read `DEVELOPER_DOCS.md`** for deep-dives on individual features (ESPN API views, DNA algorithm, keeper rules, etc.).
4. **Read `drizzle/schema.ts`** to understand the full current database schema before making any changes.
5. **Read `server/routers.ts`** to understand all tRPC procedures and their namespaces.
6. **Before any schema change:** edit `drizzle/schema.ts`, then run `pnpm db:push`.
7. **Before any checkpoint:** run `pnpm check` (must exit 0) and `pnpm test` (must be 726/726 passing).
8. **After implementing features:** mark them `[x]` in `todo.md`, then save a checkpoint.

The most immediately requested feature (not yet started) is a **Settings modal** where users can edit their display name and upload a custom avatar. This should be a modal accessible from the `LeagueSwitcher` / `UserMenu` in the sidebar footer, with a `user.updateProfile` tRPC mutation that updates `users.name` and stores an avatar URL via `storagePut()`.

---

## 17. Sidebar Navigation Structure

The sidebar is organized into 5 groups. All routes are registered in `client/src/App.tsx`.

| Group | Nav Items | Routes |
|---|---|---|
| **Win This Week** | Weekly Intel, Start/Sit, Waivers | `/weekly-intelligence`, `/start-sit`, `/waivers` |
| **Win Trades** | Trade Lab, Trade Aging, Offer Generator | `/trade-lab`, `/trade-aging`, `/trade-offers` |
| **Win Long Term** | Draft Room (AI), Keeper Lab, Offseason Intel, Mock Draft | `/draft-helper`, `/keeper-lab`, `/offseason`, `/mock-draft` |
| **Intelligence** | AI GM Advisor, Owner DNA, Rivalry, Rosters | `/advisor`, `/owner-dna`, `/rivalry`, `/rosters` |
| **Admin / Data** | Command Center, Data Refresh, Owner Stats, Usage Monitor, Behavioral Analytics, ML Forecast | `/`, `/data-refresh`, `/owner-stats`, `/usage-monitor`, `/admin/behavioral`, `/ml-forecast` |

---

*This document was generated on May 16, 2026 and reflects the state of checkpoint `8ac0e448`.*
