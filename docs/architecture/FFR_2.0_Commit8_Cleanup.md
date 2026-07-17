# FFR 2.0 — Commit 8 disposition report

Final cleanup and canonicalization after Commits 1–7. Authority: `FFR_2.0_Product_Architecture.md`.

## Summary

| Category | Count |
| --- | --- |
| Completed backlog items | 18 |
| Deferred (no new authority / infra) | 9 |
| Preserved legacy aliases | 8 |
| Safe redirects added | 24 |
| Dead files removed | 2 |
| Product decisions unresolved | 4 |

---

## Backlog disposition

### Completed

- [x] **ChampionshipPath.tsx** — Removed unused `client/src/pages/ChampionshipPath.tsx`. Canonical `/my-team/championship-path` mounts `ChampionshipDiagnosis` via `MyTeamChampionshipPath`. Server authority `server/championshipPath.ts` unchanged.
- [x] **gmBriefing / welcomeBackCoachBriefing legacy URLs** — Updated to canonical V2 hrefs (Rivals, My Team, Draft, League).
- [x] **RFSN article reader canonical routes** — Added `/rfsn/wire/article/:articleId` and `/rfsn/stories/article/:articleId`. Legacy `/rfsn/news/article/:id` redirects to wire article route.
- [x] **RFSN `/rfsn/news`** — Redirects to `/rfsn/wire`. `/league-wire` redirects to `/rfsn/wire`.
- [x] **RFSN Wire vs Stories** — Documented honest overlap: both use `LeagueWireNewsroom` (no distinct classification authority). Stories context uses stories article URLs; Wire uses wire article URLs.
- [x] **Draft legacy redirects** — `/draft-history`, `/keeper-advisor`, `/keeper-forecast` → canonical Draft routes.
- [x] **League legacy redirects** — `/standings`, `/dynasty-power-rankings`, `/hall-of-fame`, `/transactions`, `/acquisition-impact`, `/commissioner-command-center` → canonical League routes.
- [x] **My Team legacy redirects** — `/roster`, `/matchups`, `/trades`, `/advisor`, `/championship-diagnosis`, `/championship-path`, `/why-havent-i-won` → canonical My Team routes.
- [x] **Rivals partial redirect** — `/the-cast` → `/rivals/cast`.
- [x] **V2PlaceholderRoute duplicate fix** — `LIVE_PARAM_ROUTES` excluded from auto-placeholder expansion (`/rivals/owners/:ownerId` no longer shadowed).
- [x] **All V2 destinations live** — Zero `kind: "placeholder"` entries remain in `v2Navigation.ts`.
- [x] **Keeper nested headers** — `embedded` prop on `LeagueKeeperForecast` / `KeeperAdvisor` when mounted inside `DraftKeepers`.
- [x] **mockDraftIntelligence.test.ts** — Removed obsolete test. Production `MockDraftSimulator` and `mockDraftUtils` were removed in an earlier refactor; mock draft intelligence now lives inside `DraftWarRoom`.
- [x] **League Hub title summary** — Verified presentation-only (Commit 7 safeguard retained).
- [x] **Playoff Picture** — Retained honest final-standings labeling (Commit 7).
- [x] **Strength of Schedule** — Retained honest empty state at `/league/standings/strength-of-schedule`.
- [x] **Settings utilities** — No `/league/settings` invented; `/settings`, `/league-settings`, `/sync` remain header utilities.
- [x] **Canonical route inventory** — See `FFR_2.0_Canonical_Route_Inventory.md`.

### Deferred (documented)

- [ ] **RFSN breaking-news classification** — Current implementation composes live broadcast + featured articles; no dedicated breaking authority. Do not invent.
- [ ] **RFSN route-change TTS/audio E2E** — Requires browser E2E infrastructure; deferred.
- [ ] **Draft War Room route-transition E2E** — Shared layout exists; full lifecycle E2E deferred.
- [ ] **Draft pause/clock/grading route-level coverage** — Engine tests exist; route-level E2E deferred.
- [ ] **League HallOfFame / Standings UI tests** — Page-level UI harness not in scope for cleanup commit.
- [ ] **League archive-layout route-transition E2E** — Shared `LeagueArchiveLayout` implemented; E2E deferred.
- [ ] **Commissioner/settings authorization E2E** — `FeatureRouteGate` preserved on canonical wrappers; E2E deferred.
- [ ] **SeasonExplorerTab** — Orphaned under `plugins/league-history`; not wired to V2 routes. Retained; needs product decision.
- [ ] **Unrelated War Room bugs** — Not fixed in cleanup commit per scope guardrails.

### Requires product decision

- [ ] **`/draft-commentary`** — Preserved as standalone archive page with distinct `DraftCommentary` component. Live commentary remains in War Room + `/rfsn/live`. Future: dissolve into RFSN archive surfaces or redirect when parity confirmed.
- [ ] **`/draft-war-room` vs `/draft/war-room`** — Dual mount preserved: legacy uses separate `DraftWarRoom` instance (avoids redirect resetting active draft). Canonical uses shared `DraftWarRoomLayout`.
- [ ] **`/draft-reality` (`DraftRealitySimulator`)** — Distinct “untouched roster” season sim, not Mock Draft. Route preserved; not in V2 sidebar.
- [ ] **`/history` (Dynasty Board) vs `/league/history/dynasties`** — Distinct surfaces: `LeagueHistory` board vs HoF dynasty timeline. Both preserved.

### Removed as no longer relevant

- Placeholder expansion for fully live V2 destinations (except unknown future param routes).
- `client/src/pages/ChampionshipPath.tsx` (dead duplicate page).
- `server/mockDraftIntelligence.test.ts` (tested removed production module).

---

## Legacy route classification

| Legacy route | Disposition | Canonical target / notes |
| --- | --- | --- |
| `/standings` | **B** Redirect | `/league/standings` |
| `/dynasty-power-rankings` | **B** | `/league/standings/power-rankings` |
| `/hall-of-fame` | **B** | `/league/history/hall-of-fame` |
| `/transactions` | **B** | `/league/history/transactions` |
| `/acquisition-impact` | **B** | `/league/acquisition-impact` |
| `/commissioner-command-center` | **B** | `/league/commissioner` |
| `/roster`, `/rosters` | **B** | `/my-team/roster` |
| `/matchups` | **B** | `/my-team/matchup` |
| `/trades`, `/trade*` | **B** | `/my-team/trades` |
| `/advisor` | **B** | `/my-team/advisor` |
| `/championship-diagnosis`, `/championship-path`, `/why-havent-i-won` | **B** | `/my-team/championship-path` |
| `/draft-history` | **B** | `/draft/history` |
| `/keeper-advisor`, `/keeper-forecast` | **B** | `/draft/keepers` |
| `/the-cast` | **B** | `/rivals/cast` |
| `/rfsn/news` | **B** | `/rfsn/wire` |
| `/rfsn/news/article/:id` | **B** | `/rfsn/wire/article/:id` |
| `/league-wire` | **B** | `/rfsn/wire` |
| `/league-wire/article/:id` | **B** | `/rfsn/wire/article/:id` |
| `/ring-of-honor`, `/championships` | **B** | `/league/history/hall-of-fame` |
| `/dashboard` | **A** Preserve | Distinct from curated `/home` |
| `/owner-profiles` | **C** Preserve | Differs from `/rivals/owners` wrapper (titles, `syncSelectionToRoute`) |
| `/rivalry-center` | **C** Preserve | Full `RivalryCenter` variant vs `/rivals/rivalries` focused variant |
| `/league-dna` | **C** Preserve | Distinct from Rivals League Map / Relationships |
| `/draft-war-room` | **C** Preserve | Separate instance; redirect risks draft state reset |
| `/draft-commentary` | **C** Preserve | Standalone archive surface |
| `/draft-reality` | **E** Product decision | Distinct sim product |
| `/history` | **E** Product decision | Dynasty Board vs HoF archive |

---

## Deleted files

| File | Reason |
| --- | --- |
| `client/src/pages/ChampionshipPath.tsx` | Unreferenced; superseded by `ChampionshipDiagnosis` at canonical route |
| `server/mockDraftIntelligence.test.ts` | Tested removed `mockDraftUtils` module; no production equivalent to restore without re-extracting from War Room |

## Intentionally retained (not dead)

| File | Reason |
| --- | --- |
| `client/src/pages/rfsn/RfsnNews.tsx` | Reference implementation; legacy deep links redirect |
| `client/src/pages/DraftRealitySimulator.tsx` | Active distinct route `/draft-reality` |
| `client/src/pages/LeagueHistory.tsx` | Dynasty Board at `/history` |
| `client/src/plugins/league-history/components/SeasonExplorerTab.tsx` | Orphaned plugin tab; deferred |
| `client/src/pages/v2/V2PlaceholderRoute.tsx` | Infrastructure for future V2 destinations |
| `server/championshipPath.ts` | Server authority (not the removed page file) |

---

## Remaining test gaps

- RFSN route-change audio/TTS end-to-end
- Draft War Room canonical ↔ legacy instance switching under active draft
- League archive shared-layout scroll transitions
- Commissioner authorization browser E2E
- HallOfFame / Standings full UI regression harness

---

## Draft commentary ownership (final)

| Content | Canonical home | Legacy |
| --- | --- | --- |
| Live booth / audio / replay | `/rfsn/live`, War Room broadcast panel | `/draft-commentary` (archive page) |
| War Room tools | `/draft/war-room`, `/draft/mock` (shared layout) | `/draft-war-room` (separate instance) |
| Written newsroom | `/rfsn/wire`, `/rfsn/stories` | `/rfsn/news` → wire redirect |
| Mock draft engine | `DraftWarRoom` mock section | same as War Room legacy |
| Season untouched-roster sim | — | `/draft-reality` |
