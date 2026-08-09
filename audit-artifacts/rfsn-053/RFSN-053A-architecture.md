# RFSN-053A — Historical Matchup Gallery & AI Screenshot Engine

**Status:** Architecture only. No product code changed. Nothing committed. Nothing deployed.
**Stop for review.** Do not start RFSN-053B until this is accepted.

This is a historical storytelling feature on top of `gmMatchups`, not a standalone screenshot toy. Advisor, Records, Owner Dossiers, and Rivalry Center consume one gallery query + one screenshot service.

---

## A. Executive summary

1. **One query authority.** A typed `GalleryFilter` compiles to Drizzle over `gmMatchups` + Owner Identity. Reuse margin bands, playoff-tier classification, H2H meetings, and championship *game* detection. Do not add a second matchup table, a user SQL box, or a new W-L engine.
2. **One reusable gallery UI.** `MatchupGallery` + `MatchupGalleryCard` plug into League History, Advisor visual replies, Rivalry presets, Owner Dossier, and No Mercy. Do not redesign Advisor, Rivalry Center, or live `/my-team/matchup`.
3. **Two image pipelines.** Share/hype cards = resvg SVG (clone `rivalryOg.ts`). Viewer PNGs = headless capture of the Historical Viewer after that page exists. Cache both. Batch/ZIP comes last.
4. **Advisor returns a gallery, not a wall of text.** Planner gains `matchup_gallery`. Deterministic path returns a one-line summary + `visual: { type: "matchup_gallery", filter, matchups }`. Example: “You have 11 No Mercy Rule victories.” + gallery.
5. **Stories never hallucinate.** V1 headlines/archetypes are 100% deterministic from League Wire + margin + playoff tier + rivalry documentary facts. “Miracle Comeback” stays unsupported until in-game timelines exist.

---

## B. Architecture

```
                    Owner Identity Authority
                              │
gmMatchups ──► Gallery Query Service ◄── matchupPlayoffTier
                              │          matchupMarginAnalytics
                              │          championshipAuthority (labels only)
                              │          h2hAuthority.meetings
                              ▼
                    GalleryMatchup[]  (+ coverage note)
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
 League History  Advisor   Rivalry   Owner Dossier  No Mercy
 /matchups       visual    presets   presets        preset
        │
        ▼
 Historical Matchup Viewer  ◄── gmWeeklyPlayerStats / gmRosterEntries
        │                   ◄── standings_snapshots (week rank, if present)
        │                   ◄── gmTransactions (that week, if present)
        │                   ◄── League Wire MatchupReport + story archetypes
        │
        ├──────────────► Share / hype card (resvg SVG → PNG/WebP/JPEG)
        └──────────────► Viewer screenshot (headless → PNG/WebP/JPEG)
                              │
                              ▼
                    Image cache (S3 / storagePut)
                    Batch job + ZIP (scheduled HTTP, not Bull)
```

**Hard rules**

- No duplicate H2H, championship identity, owner merge, margin bands, or playoff-tier logic.
- Championship **game** ≠ championship **medal**. Title games come from `classifyEspnPlayoffTier` + `placementWinnersBracketKeys`. Medals label “X was champion that year.”
- “Custom SQL-backed filters” means the service compiles `GalleryFilter` to Drizzle `WHERE` / in-memory filter over loaded completed games. **Not** a user-facing SQL textarea.
- No Redis/Bull. Background work follows existing `/api/scheduled/*` + GitHub/Railway heartbeat.
- Do not push. Do not deploy until explicitly asked. Stop after each increment.

---

## C. Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `/league/history/matchups` | Clerk | Primary gallery home (League History child). |
| `/league/history/matchups/no-mercy` | Clerk | Dedicated No Mercy Rule gallery (`marginMin: 50`). |
| `/league/history/matchups/:matchupId` | Clerk | Historical Matchup Viewer (game-day layout). |
| `/my-team/matchup?season=&week=` | Clerk | Existing scoreboard, **add search params only**. Secondary “open this week.” |
| `/my-team/advisor` | Clerk | Unchanged chrome. Chat bubble may embed `MatchupGallery`. |
| `/rivals/rivalries` | Clerk | Unchanged Center. Dossier overlay / “All meetings” → gallery with pair filter. |
| `/rivals/owners/:ownerId` | Clerk | Unchanged dossier. `dossier-matchups` → gallery presets. |
| `/league/history/records` | Clerk | Records keep aggregates. Link out to filtered gallery (blowouts / closest / championships). |
| `/m/:shareCode` | Public | Matchup share landing (clone rivalry share pattern). |
| `GET /api/share/matchup/:shareCode/image` | Public | OG / hype card image. |
| `POST /api/scheduled/matchup-screenshots` | Secret | Batch generation heartbeat (053K). |

**Nav**

- Add League History child in `v2Navigation.ts` + `LeagueHub` + `leagueRoutes.test.ts` / `v2Navigation.test.ts`.
- Do **not** add a seventh sidebar category.
- Do **not** cram the gallery into `ARCHIVE_NAV_ITEMS` scroll sections; it is a sibling page like Transactions, not another HoF anchor.

**tRPC / HTTP**

| API | Role |
| --- | --- |
| `matchupGallery.query(filter)` | Filtered `GalleryMatchup[]` + coverage + summary line. |
| `matchupGallery.get({ matchupId })` | One card + viewer payload (lineups, standings, trades, story). |
| `matchupGallery.story({ matchupId })` | Deterministic story block. |
| `matchupShare.mint` / `matchupShare.get` | Signed snapshot token (clone `rivalryShare`). |
| `matchupScreenshot.generate` | Single image (card or viewer), cache-aware. |
| `matchupScreenshot.batch` / `status` / `downloadZip` | Batch + progress + ZIP. |
| `advisor.chat` return | Additive `visual?: AdvisorVisual`. Stream `done.meta.visual` same shape. |

---

## D. Components (client)

| Component | Lives | Notes |
| --- | --- | --- |
| `MatchupGallery` | `client/src/components/matchup-gallery/` | Grid + empty/coverage states. Accepts `filter` or prefetched rows. |
| `MatchupGalleryCard` | same | Season, week, RS/Playoffs, owners, scores, margin, winner, team logos, FFR `/logo.png` watermark, small preview, CTAs. |
| `MatchupGalleryFilters` | same | Owner, opponent, season/range, week, phase, championship, margin, one-point, blowout, sort. |
| `NoMercyGallery` | thin wrapper | Preset `marginMin: 50`, title **NO MERCY RULE**. |
| `HistoricalMatchupViewer` | `client/src/pages/league/HistoricalMatchupViewer.tsx` | Game-day layout. Honest nulls when box scores / standings / trades missing. |
| Advisor embed | `Advisor.tsx` only | If `visual.type === "matchup_gallery"`, render gallery under the text summary. **Do not redesign** Advisor. |
| Rivalry / Dossier embeds | `RivalryDossierPanel`, `OwnerProfiles` `dossier-matchups` | Preset filter + “See all” link. **Do not redesign** those hubs. |
| Share CTA | clone `RivalryShareButton` | Web Share / copy / download PNG. |

**Card CTAs**

| Button | Action |
| --- | --- |
| View Matchup | `/league/history/matchups/:matchupId` (Historical Viewer). |
| Open in Historical Viewer | Same destination. Spec as one primary CTA to avoid duplicate buttons; optional secondary “Open week scoreboard.” |
| Generate Screenshot | Viewer capture if viewer renderable; else hype card. |
| Share | Mint share token + Web Share / copy link. |
| Download | Cached PNG (or JPEG/WebP if requested). |

**Preview thumbnail:** team logos + score strip first. Cached share-card thumb later. Gallery must ship without waiting on screenshot generation.

**League logo:** there is **no** league logo column. Use both **team** `logoUrl`s + product `/logo.png`.

---

## E. Services (server)

### E1. Gallery Query Service (new, thin composer)

`server/matchupGalleryQuery.ts` (name TBD)

**Input `GalleryFilter`**

| Field | Source / rule |
| --- | --- |
| `leagueId` | Active league (Advisor scope / `resolveActiveLeagueId`). |
| `ownerPersonId` / display | Owner Identity + Advisor `findMentionedOwners`. `"I"` / `"my"` → user’s franchise. |
| `opponentPersonId` | Same. |
| `seasonFrom` / `seasonTo` / `week` | Scope resolver + explicit week. |
| `phase` | `regular` \| `playoffs` \| `all` (existing `MatchupPhaseFilter`). |
| `championshipGames` | Title games via playoff tier + placement exclusion. If tier coverage too thin, honest label (052I pattern) — do not fake elims/title games. |
| `marginMin` / `marginMax` / `onePoint` | Reuse `exactMarginBand` / `absMargin` from `matchupMarginAnalytics`. One-point uses decimal band `0.50–1.49` when league scoring is decimal. |
| `noMercy` / `blowout` | **`marginMin: 50`** — same threshold as League Wire `gameType === "blowout"` and Advisor 50-point blowouts. New **name**, not new math. |
| `scoreMin` / `scoreMax` / `side` | Highest / lowest / Christian scored over 200. |
| `result` | win / loss / tie relative to `ownerPersonId`. |
| `streak` | Derived from that owner’s chronological completed games. Filter games that sit inside a W or L streak of length ≥ N. Do not persist a streak column. |
| `sort` | closest, blowout, highest score, lowest score, most/least points, newest, oldest. |
| `limit` / `offset` | Pagination. Advisor default cap (e.g. 50) + “See all in gallery.” |

**Output `GalleryMatchup`**

Stable card DTO: `matchupId`, season, week, `matchupPeriodId`, phase, playoffTier, `isChampionshipGame`, home/away person + display + teamId + logoUrl, scores, margin, winnerPersonId, `gameType`, storyArchetype?, coverage flags, deep links.

Load completed `gmMatchups` for the league (same corpus H2H/margins use), resolve owners via `buildOwnerIdentityAuthority`, then filter. Prefer SQL `WHERE` for league/season/week/completed/playoff when selective; keep identity/margin/championship/streak in the composer so we do not fork authority math.

**Summary line** (Advisor + gallery header)

Deterministic, coverage-scoped. Examples:

- “You have 11 No Mercy Rule victories.”
- “LOZELL STYLES has 4 one-point losses (recorded regular season, 2010–2025).”
- Never say “all-time” unless coverage is verified.

### E2. Historical Viewer payload

Compose, do not invent:

| Slice | Source | If missing |
| --- | --- | --- |
| Final score / owners | `gmMatchups` + Owner Identity + `gmTeams.logoUrl` | Do not show viewer without scores. |
| Lineups / player scores / bench | `gmWeeklyPlayerStats` + `gmRosterEntries` | Null section + “Box score not imported for this week.” |
| Week standings | `standings_snapshots` | Null. |
| Trades that week | `gmTransactions` involving either team | Null. |
| Commentary / recap | League Wire `MatchupReport` (`headline`, `shortRecap`, `keyStat`, `gameType`) | Null fields already guarded. |
| AI Story | Deterministic archetype service (E3) | Honest skip. |

### E3. Matchup Story Service (deterministic)

`server/matchupStoryService.ts`

Every game may get: Headline, Story, Key Moment, Turning Point, Legacy Impact.

**Archetype map (facts only)**

| Label | Gate |
| --- | --- |
| No Mercy Rule | margin ≥ 50 |
| Heartbreaker | one-point loss (existing decimal band) |
| Statement Win | blowout (50+) or comfortable (≥25) vs named rival / playoff |
| Championship Clincher | proven WINNERS_BRACKET title game |
| Upset of the Year | only if week standings/seed snapshot proves underdog; else omit |
| Miracle Comeback | **unsupported** (same reason as margin `largest_comeback` — no in-game timeline) |

Reuse League Wire headline/recap copy and rivalry `DocumentaryFactKey` (`BLOWOUT_WIN`, `HEARTBREAK_LOSS`, `PLAYOFF_ELIMINATION`, …) when the pair exists. **No LLM in V1.** Optional later polish may wrap labeled facts only; never invent scores, weeks, or opponents.

### E4. Screenshot / share service (reusable)

`server/matchupScreenshotService.ts` + `server/matchupOg.ts`

| Pipeline | When | How |
| --- | --- | --- |
| **Hype / share card** | Always available once gallery DTO exists | SVG → `@resvg/resvg-js` (clone `rivalryOg.ts`). Formats below. |
| **Viewer screenshot** | After Historical Viewer ships | Headless Chromium (Playwright already in repo) hits an authenticated or tokenized render URL, wait for `[data-matchup-viewer-ready]`, PNG. |

**Sizes / targets**

| Target | Size |
| --- | --- |
| Instagram / 1080×1350 | 1080×1350 |
| Twitter / Discord landscape | 1920×1080 (also 1200×630 OG if needed) |
| TikTok / 1080×1920 | 1080×1920 |
| Discord square-ish default | 1080×1080 optional |

Outputs: PNG required; WebP / JPEG optional conversions from the same raster.

**Cache key**

`leagueId : season : week : homeTeamId : awayTeamId : scoreHash : template : size : format`

Do not regenerate unless scores (or template version) change. Store via existing `storagePut` (S3/Forge). Optional DB row `matchup_screenshot_cache` for lookup + invalidation.

**Batch**

Filter → enqueue matchupIds → scheduled worker generates missing cache entries → ZIP via `archiver` (or equivalent) → signed download. Progress: `{ total, done, failed, zipReady }`. No Bull. No `setInterval` inside the web process.

Hype card example (No Mercy):

```
NO MERCY RULE
Week 8
Rod Sellers    184.7
Defeated
Bruce Edwards  126.2
Won by 58.5
Fantasy Football Rivals
```

---

## F. Advisor integration (no redesign)

**Planner** (`advisorEvidencePlanner.ts`)

New intent: `matchup_gallery`.

Triggers (natural language → filter), examples from the brief:

| Utterance | Filter sketch |
| --- | --- |
| Show me every game I won by 50 points | owner=me, result=win, noMercy |
| Show me Rod's biggest blowouts | owner=Rod, sort=blowout, marginMin=50 |
| Show every one-point game | onePoint, phase=all or RS default |
| Show my playoff losses | owner=me, phase=playoffs, result=loss |
| Show every championship game | championshipGames |
| Show every game against Bruce | opponent=Bruce |
| Show every game Rod beat Bruce by more than 30 | owner=Rod, opponent=Bruce, result=win, marginMin=30 |
| Show the closest games in league history | sort=closest, coverage-scoped (not “all-time” unless verified) |
| Show every game LOZELL lost by one point | owner=LOZELL, result=loss, onePoint |
| Show all games Christian scored over 200 | owner=Christian, scoreMin=200 |

Planner still only **plans**. Executor calls Gallery Query (not a second engine). Margin-tool leaderboard questions (“who has the most one-point losses?”) stay on `query_matchup_margins` text. “Show me the games” → gallery intent.

**Return shape (additive)**

```ts
visual?: {
  type: "matchup_gallery";
  summary: string;          // also in message
  filter: GalleryFilter;
  matchups: GalleryMatchup[]; // cap + seeAllHref
  seeAllHref: string;
}
```

`advisor.chat` and SSE `done.meta` both carry `visual`. Client: text summary + `<MatchupGallery>`. Conversation continuity (052H) still applies: “their” after a compare keeps the same pair, now as a gallery filter.

---

## G. Surface presets (Parts 6–8)

### No Mercy Rule (Part 6)

- Title: **NO MERCY RULE**
- Qualification: victory margin ≥ 50
- Dedicated route + Advisor sentence + gallery
- Card: season, week, opponent, score, margin, thumbnail, screenshot, share, generate hype card

### Rivalry galleries (Part 7)

Preset filters on the same component (link out from Rivalry Center, do not densify the Center):

- All meetings
- Closest games
- Biggest blowouts
- Playoff meetings
- Championship meetings
- Screenshots / timeline = sort newest + viewer/share CTAs

Data: `h2hAuthority.getH2H(A,B).meetings` fed through Gallery Query (same rows, gallery DTO).

### Owner Dossier (Part 8)

Under existing `dossier-matchups` / “See all”:

- Historical Games
- Biggest Wins
- Worst Losses
- Closest Games
- Highest / Lowest Score
- Playoff History
- Championship Games
- Screenshots

Self dossier (`/my-team/profile`) uses the signed-in owner key.

---

## H. Data flow (one request)

1. Resolve active `leagueId` (existing `resolveActiveLeagueId` / Advisor scope).
2. Resolve mentioned owners via `listAdvisorOwnerAliases` + `buildOwnerIdentityAuthority` (no fuzzy surname merge).
3. Load completed `gmMatchups` for league (optionally season-bounded).
4. Map each row → person ids, margin, playoff tier, championship-game flag, `gameType`.
5. Apply `GalleryFilter` (including streak derivation).
6. Sort / paginate → `GalleryMatchup[]` + coverage `{ seasonFrom, seasonTo, recordedGames, phase, notes }`.
7. Format summary line (never “all-time” unless verified).
8. UI renders gallery. Viewer/share/screenshot are separate fetches keyed by `matchupId`.

---

## I. Reuse opportunities (do not rebuild)

| Need | Reuse |
| --- | --- |
| Game corpus | `gmMatchups` |
| Owners | `buildOwnerIdentityAuthority` + Advisor aliases |
| H2H meeting lists | `h2hAuthority.getH2H().meetings` / `loadRivalryDossier().headToHeadHistory` |
| Margin / one-point / blowout | `matchupMarginAnalytics` (`exactMarginBand`, `absMargin`, `filterMarginGames`) |
| Playoff vs RS / title game | `matchupPlayoffTier.ts` |
| Champion *identity* labels | `championshipAuthority` + `leagueMedals` |
| Recap copy / `gameType` | `leagueWireRouter` `MatchupReport` |
| Rivalry documentary facts | `rivalryStoryAuthority` `DocumentaryFactKey` |
| Scoreboard visual language | `Matchups.tsx` `TeamColumn`, `WireCard` badges |
| Share / OG pattern | `rivalryShareRouter` + `rivalryOg.ts` (resvg) |
| Storage | `storagePut` |
| Advisor planning | `advisorEvidencePlanner` / executor / scope resolver (extend, do not fork) |
| Jobs | `/api/scheduled/*` + GHA heartbeat |

**Do not use as a second engine:** `h2hContextBuilder` (legacy cache-scan H2H).

---

## J. Honest gaps / non-goals for V1

| Gap | Handling |
| --- | --- |
| No league logo column | Team logos + `/logo.png` |
| Box scores sparse (`gmWeeklyPlayerStats` / roster actuals) | Viewer shows scores always; lineups/bench null with import CTA |
| `standings_snapshots` incomplete | Week standings section omitted |
| Playoff `playoffTierType` thin on some leagues | Championship-game filter uses 052I honesty, not fake title games |
| Comebacks | Unsupported — do not emit “Miracle Comeback” |
| No Bull/Redis | Scheduled HTTP + cache table only |
| Sleeper / Workbook | Not in 053 scope; do not fabricate validation (founder ESPN 457622 first) |
| Live `/my-team/matchup` redesign | Out of scope. Search-param deep link only |
| Advisor / Rivalry / Planner redesign | Out of scope |

---

## K. Implementation plan (increments — stop after each)

| Inc | Scope | Exit |
| --- | --- | --- |
| **053A** | This architecture | Accepted. No code. |
| **053B** | Gallery Query Service + `GalleryFilter` + unit tests (owner, opponent, season, week, RS/PO, championship, margin, one-point, No Mercy, scores, closest, streaks). tRPC `matchupGallery.query` only. | Tests green. No UI. No deploy. |
| **053C** | `MatchupGallery` + `MatchupGalleryCard` + `/league/history/matchups` + filters UI + View Matchup → viewer **stub** or week scoreboard deep link. | Preview-ready UI against ESPN 457622. No deploy until asked. |
| **053D** | Planner intent `matchup_gallery` + Advisor visual return + Advisor.tsx embed. | Five “show me the games” questions return gallery, not a wall of text. |
| **053E** | No Mercy dedicated route + Advisor “You have N No Mercy Rule victories.” + gallery. | Matches Preview margin≥50 counts. |
| **053F** | Rivalry + Owner Dossier presets (link out, no hub redesign). | All-meetings / closest / blowouts / playoffs / championships. |
| **053G** | Historical Viewer (game-day layout, honest nulls). | Deep link from cards works. |
| **053H** | Deterministic story archetypes on viewer + card badge. | No LLM. No fabricated comebacks. |
| **053I** | Share/hype cards (resvg) + sizes + cache + public `/m/:shareCode`. | Download/Share work without Playwright. |
| **053J** | Viewer screenshot engine (headless) + cache. | PNG for a known 457622 blowout. |
| **053K** | Batch + progress + ZIP + scheduled job. | “Every No Mercy win” zip. |
| **053L** | Regression + Preview smoke (Advisor + gallery + No Mercy + one-point + championship). Production only if explicitly asked. | Close 053 when smoke passes. |

---

## L. Tests (map to increments)

| Area | Increment | Assert |
| --- | --- | --- |
| Gallery filters | 053B | Owner, opponent, season range, week, RS/PO, championship flag, margin min/max, one-point band, No Mercy ≥50, score ≥200, closest sort, streak membership. Coverage notes. |
| No Mercy / one-point / championship galleries | 053B/E | Same numbers as margin tool / 052G live 457622 where overlapping (e.g. Christian Graham 32 blowout *wins* is a leaderboard; gallery lists the games). |
| Advisor integration | 053D | Planner intent; visual payload; pronoun continuity; “I” → user franchise; no generic missing-data filler when games exist. |
| Historical Viewer | 053G | Scores always; lineups null when stats missing; title game labeling honest. |
| Story | 053H | Archetype gates; no Miracle Comeback; no invented opponents. |
| Screenshot + cache | 053I/J | Same key hits cache; score change busts cache; size/format matrix. |
| Batch | 053K | Progress counts; zip contains only matching matchupIds; idempotent cache. |
| Regression | 053L | 052 close-out five text questions still pass; new “show the games” probes return gallery. |

---

## M. Out of scope until later increments

- Production deploy / git push
- Redesign of GM Advisor, League Intelligence Planner, Rivalry Center, or live scoreboard
- User-authored SQL
- LLM story generation
- Sleeper/Workbook gallery validation
- RFSN-051D typography follow-ups

---

**RFSN-053A complete. Stop.**
