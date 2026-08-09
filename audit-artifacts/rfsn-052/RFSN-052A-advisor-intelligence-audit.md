# RFSN-052A — GM Advisor Historical Intelligence Audit

**Status:** Audit only. No code changed, nothing committed, nothing deployed.
**Scope:** How GM Advisor resolves league, season, authorities, deterministic tools, and LLM context — as implemented today.
**Stop for review.** Do not start RFSN-052B until this is accepted.

---

## A. Executive summary

GM Advisor is **one chat surface** with **one deterministic tool** and **one LLM persona**. It is not the League Intelligence Engine described in the historian brief.

1. **Almost every question goes to the LLM.** The only pre-LLM short-circuit is `query_matchup_margins` (RFSN-049). Rivalries, championships, Why Haven’t I Won, dossiers, draft reaches, trades, records, timeline, and awards all exist as product authorities — and are **not** called as Advisor tools.
2. **Season defaults to the selected / current season**, not “entire league history.” The client always sends a season (max cached, hardcoded fallback `2025`). The server uses `input.season ?? 2025`. Standings, VORP, injuries, and “this week’s opponent” are that one year. Full-history blocks attach only when the question classifier opens those gates.
3. **Classifier gates context; it does not retrieve authorities.** Categories decide which prompt bags to attach (career lines, trophy leaderboard, DNA, draft order, H2H). They do not invoke `h2hAuthority`, `rivalryService`, `whyHaventIWon`, `hallOfFameService` records, or `completedTradeAuthority`.
4. **Two H2H stacks.** Canonical Head-to-Head Authority reads `gmMatchups` + Owner Identity. Advisor H2H reads ESPN combined cache via `h2hContextBuilder` and only for this week’s opponent or a named OWNER_COMPARISON.
5. **Suggested prompts on the Advisor page do not match the best existing services.** “Why haven’t I won?” and “Who is my biggest rival?” are LLM questions. The deterministic engines (`leagueIntel.whyHaventIWon` / `careerReport`, `rivalry.getScores`, `me.biggestThreat`) already answer them on other surfaces.

---

## 1. GM Advisor entry points

### In scope (the chat product)

| Surface | Path / API | Notes |
| --- | --- | --- |
| UI (canonical) | `/my-team/advisor` | `MyTeamAdvisor` → `FeatureRouteGate` → `Advisor.tsx` |
| UI (legacy redirect) | `/advisor` | `Navigate` → `/my-team/advisor` |
| tRPC chat | `advisor.chat` | Subscribed. Client uses this. `withLeagueSalt({ message, season }, leagueContextKey)` |
| tRPC history | `advisor.history` | Last messages, keyed by season + sanitized league id |
| tRPC memory | `advisor.getMemory` / `updateMemory` | GM profile injected into system prompt |
| tRPC clear | `advisor.clearHistory` | Per league |
| SSE (unused by UI) | `POST /api/advisor/stream` | Same margin short-circuit + same `buildAdvisorMessages`. No client `fetch` to this route. |

Nav: My Team hub “GM Advisor”, Settings “AI Advisor” still href `/advisor` (redirects). Feature registry label: “GM Advisor”.

### Adjacent (not Advisor chat — do not confuse)

| Surface | What it is |
| --- | --- |
| `me.biggestThreat` card on Advisor page | Deterministic, no LLM. Uses `computeRivalryScores` + ChampionshipAuthority. |
| Keeper Advisor `/draft/keepers` | Deterministic keeper valuations. Not chat. |
| Agent War Room | 5-agent draft/decision debate. Can emit `promptBlockForAdvisor`; not the Advisor route. |
| `champ.variance` LLM | “Championship Equity advisor” — separate prompt. |
| `offseason` briefing LLM | “GM advisor preparing the offseason briefing.” |
| Waiver Lab start/sit | Injury router, not Advisor. |

---

## 2. Active league resolution

**Client**

- `useLeagueActiveGate()` → `leagueContextKey`
- `withLeagueSalt(input, leagueContextKey)` adds `activeLeagueKey` (React Query cache participation + server override)
- Chat disabled until `leagueKeyReady`

**Server (`advisor.chat` / stream)**

1. If `activeLeagueKey` is present and does not start with `__`, use it as requested league id (trimmed to 32).
2. `resolveActiveLeagueId({ user }, requestedLid, undefined)` — **season is intentionally not passed** (RFSN-049: margin analytics need the full matchup corpus, not a season-scoped league resolve).
3. `sanitizeAdvisorChatLeagueId` for chat-history scoping.

**`resolveActiveLeagueId` order**

1. Demo account → demo league only
2. Explicit input league (Advisor’s `activeLeagueKey`) + access check
3. Active ESPN credentials `leagueId`
4. Active profile `league_connections.leagueId`
5. User `sync_runs` for a requested season (only if season was passed — Advisor does not pass it here)
6. Empty → `no_user_league_configured`

**Prompt league framing** is a second path: `resolveLeaguePromptContext(userId, season)` inside `buildAdvisorSystemPrompt` (profile + latest cache; not the same call as step 2).

---

## 3. Season scope resolution

| Layer | Behavior |
| --- | --- |
| Client state | `useState(2025)`, then `max(cachedSeasons)` |
| Client send | Every `advisor.chat` includes `season` |
| Server fallback | `input.season ?? 2025` (stream: `rawSeason ?? 2025`) |
| Owner alias load | `listAdvisorOwnerAliases(userId, season = 2025)` |
| Standings / VORP / injuries / this-week H2H | **Single season** combined cache for that year |
| Career / trophy blocks | **All** `getAllCachedSeasons` when gates allow |
| Matchup-margin tool | **All** `gmMatchups` for the league. Year range only if the user text parses (`in 2019`, `2018-2022`, `since 2020`). Default **phase = regular season**, not all-time including playoffs |
| Question classifier | Does **not** parse season / range / playoffs (except the margin tool) |

There is **no** Advisor path that means “entire league history” unless (a) the classifier opens career/trophy gates, or (b) the margin tool runs without a year filter.

---

## 4. Deterministic tools vs LLM

### Short-circuit today (exactly one)

`tryMatchupMarginToolAnswer` → tool name `query_matchup_margins`.

Triggers on margin / close-game language (one-point, nail-biter, closest game, average margin, ties, blowout, heartbreak, “league history” as a *cue inside a margin parse*, etc.).

Metrics: `closest_game`, `average_margin`, `ties`, `wins_by_margin`, `losses_by_margin`, `decided_by_at_most`, `largest_comeback`.

Uses Owner Identity + `gmMatchups`. No LLM. Returns immediately.

`largest_comeback` cannot be computed: analytics explicitly report that in-game score timelines are not stored.

### Everything else → LLM

`buildAdvisorSystemPrompt` + last 20 chat turns + `invokeLLM`. Persona: **“War Room AI”** (entertaining GM), not the historian brief. No function-calling loop. No second tool.

Classifier (`AdvisorQuestionCategory`) only **trims which prompt bags attach**:

| Category | Analytics | Injuries | Career | Trophy | This-week H2H | Opp trophy | Named H2H | DNA | Draft order |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| START_SIT | Y | Y | — | — | Y | — | — | — | — |
| TRADE_STRATEGY | Y | Y | — | — | — | — | — | Y | Y |
| RIVALRY_HISTORY | — | — | Y | Y | Y | Y | — | Y | — |
| LEAGUE_HISTORY | — | — | Y | Y | — | — | — | — | — |
| CURRENT_LEAGUE | Y | Y | — | — | Y | — | — | — | — |
| TEAM_IMPROVEMENT | Y | Y | — | — | Y | — | — | — | — |
| OWNER_COMPARISON | Y | Y | Y* | — | Y | — | Y | Y | — |
| GENERAL_SMALL | Y | Y | — | — | Y | — | — | — | — |
| GENERAL_FULL | Y | Y | Y | Y | Y | Y | — | Y | Y |

\* OWNER_COMPARISON career lines filtered to focal + named owners.

Default / empty message → `GENERAL_FULL`.

---

## 5. Which questions still go directly to the LLM

**All non-margin questions.** Including the page’s suggested prompts:

- “Why haven’t I won?” → **GENERAL_FULL** (does not match Why-Haven’t-I-Won service; does not match LEAGUE_HISTORY keywords)
- “Who is my biggest rival?” → **RIVALRY_HISTORY** (LLM + this-week H2H + trophy; not `rivalry.getScores`)
- “What does a championship team look like…?” / “What patterns do champions follow?” → typically **GENERAL_FULL** or TEAM_IMPROVEMENT if “championship window” phrasing hits
- “Who always reaches in the draft?” → **GENERAL_FULL** (upcoming draft **order**, not historical reach rates)
- “How can I win this year?” → **TEAM_IMPROVEMENT** → **current-season coaching bag only** (no career, no trophy)

---

## 6–7. Authority inventory vs Advisor

| Domain | Existing authority / service | Full history | Season range | Playoffs | Owner filter | Wired into Advisor chat? |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| Championships | `championshipAuthority` / `computeAllTrophyHistory` | Y | per-season maps | titles only | by owner key | **Prompt bag only** (trophy/career gates). Not a tool. |
| Owner identity | `ownerIdentityAuthority` | Y | (season, teamId) | n/a | person | Margin tool + rivalry/H2H authorities. Advisor H2H uses ESPN member ids via `h2hContextBuilder`, **not** this authority. |
| Owner dossiers | `ownerProfileService`, `owners.ownerProfile`, `ownerCareerProfileService` | Y | timeline seasons | playoff stats on profile | `ownerKey` | **No** |
| H2H (canonical) | `h2hAuthority` (`gmMatchups`) | Y (2010+) | `seasonHistory` | separate playoff layer | person A/B | **No** |
| H2H (cache) | `h2hContextBuilder` | cached seasons | breakdown | playoff W/L + elims | member ids | **Yes, narrow:** this week’s opponent or named comparison |
| Rivalries | `rivalryService` / `rivalry.getScores` | career score | recent-3 in formula | elims | focal vs all | **No** (page card `me.biggestThreat` yes) |
| Matchups | `gmMatchups` | Y | Y | `isPlayoff` | via identity | **Yes** via margin tool only |
| Matchup margins | `matchupMarginTool` / `matchupMarginAnalytics` | Y | parsed from text | parsed phase | parsed owner name | **Yes** (only deterministic tool) |
| Playoffs | `playoffPositionSplit`, `whyHaventIWon`, `championshipPath`, `careerReport` (`leagueIntel.*`) | multi-season | season cards | dedicated | `ownerKey` | **No.** Career block has cache-derived playoff W/L only. |
| League records / HoF | `hallOfFameService` / `espn.hallOfFame` | Y | `seasonsTouched` | RS games for records | leaderboards | Trophy merge uses HoF RU/3rd. **Single-game records / awards leaderboards not in prompt.** |
| Draft history | `espn.draftHistory`, draft DNA on owner profile, canonical board | multi-season | per season | n/a | owner | **Upcoming draft order + keepers only** (TRADE_STRATEGY / GENERAL_FULL) |
| Trades | `completedTradeAuthority` / `gmTransactions` | Y | by season | n/a | owner | **No** (DNA may mention trade *style*, not the ledger) |
| Transactions | `getSeasonTransactions` / historicalDataService | 2022+ legs; 2018–21 counts only | per season | n/a | team | **No** |
| Timeline | `careerReportService` timeline / owner profile timelines | Y | per season | in cards | owner | **No** |
| Awards | Draft Night Show awards only. No season-awards authority found. | draft session | n/a | n/a | n/a | **No** |

---

## 8. Defaults to current season when the user did not ask for it

1. **Hardcoded `2025`** if season omitted (`advisor.chat`, stream, `listAdvisorOwnerAliases`, client initial state).
2. **Client always sends the season selector value** (max cached year) on every message — including all-time history questions.
3. **System prompt always leads with that year’s standings** (“Current Season: {year} (ACTIVE)” or “{year} season is COMPLETE”).
4. **CURRENT_COACHING_GATES** (START_SIT, CURRENT_LEAGUE, TEAM_IMPROVEMENT, GENERAL_SMALL, and TRADE_STRATEGY without career): no trophy, no career history.
5. **“How can I win / improve / fix my team”** → TEAM_IMPROVEMENT even without “this year” → current bag only.
6. **Light feedback** (“what do you think”, “how am I doing”) → GENERAL_SMALL → current only.
7. **This-week H2H** only if the *selected* season’s `currentMatchupPeriod` is still regular season.
8. **Margin tool default phase = regular**, not all games / not playoffs, unless the user says so.
9. **Draft block** is upcoming/selected draft **order**, not historical draft performance.

---

## 9. “I don’t have that information” / unavailable — vs authorities that exist

| What the user hears / can hear | Source | Authority that could answer |
| --- | --- | --- |
| “I don’t have completed historical matchups to run that margin query…” | `matchupMarginTool` when league id empty | `gmMatchups` once league resolves |
| Comeback / in-game timeline missing | `matchupMarginAnalytics` (honest) | **None** — snapshots not stored |
| “no recorded H2H games in cache” (prompt injection) | named OWNER_COMPARISON via `h2hContextBuilder` | `h2hAuthority` + `gmMatchups` (full corpus) |
| LLM “I don’t have…” / vague dodge | War Room persona; **no prompt rule forbidding it** | Rivalry scores, Why Haven’t I Won, championship path, HoF records, completed trades, draft DNA, career timeline |
| Suggested “Who is my biggest rival?” answered from this-week H2H + vibe | RIVALRY_HISTORY LLM bag | `rivalry.getScores` / `me.biggestThreat` |
| Suggested “Why haven’t I won?” answered from career lines or hedge | GENERAL_FULL LLM | `leagueIntel.whyHaventIWon` / `careerReport` |
| “Who always reaches in the draft?” answered from this year’s pick order or hedge | GENERAL_FULL draft-order bag | Owner draft DNA / `espn.draftHistory` |
| Trade fairness / history hedge | TRADE_STRATEGY without trade ledger | `completedTradeAuthority` |

The historian phrases (“This league has not recorded that information.” / “No completed historical data exists…”) are **not** in the Advisor system prompt.

---

## 10. Authority / intent matrix (deliverable)

| Intent | Current path | Current scope | Existing authority | Full-history capable? | Gap |
| --- | --- | --- | --- | :---: | --- |
| Start / sit | LLM `START_SIT` | Selected season roster + injuries + VORP | Injury analytics (Waiver Lab is a separate UI) | N (this week) | No deterministic start/sit tool on Advisor |
| Trade strategy | LLM `TRADE_STRATEGY` | Selected season + DNA + upcoming draft order | `completedTradeAuthority`, `tradeIntelligence` | Y (trades) | Ledger not attached; LLM guesses fairness |
| Biggest rival / rivalry lore | LLM `RIVALRY_HISTORY` | Career+trophy+**this week’s** H2H + DNA | `rivalryService`, `h2hAuthority` | Y | Scores/H2H authority unused; this-week opponent ≠ biggest rival |
| H2H record vs named owner | LLM `OWNER_COMPARISON` if comparison phrasing + alias hit; else miss | Cache H2H (`h2hContextBuilder`) | `h2hAuthority` | Y | Dual stack; comparison keywords required; no tool |
| Most titles / GOAT / league history | LLM `LEAGUE_HISTORY` (keyword-gated) else `GENERAL_FULL` | Trophy + career all cached seasons + **selected-year standings framing** | ChampionshipAuthority, HoF | Y | Works when gates open; still framed as current season; HoF single-game records unused |
| Why haven’t I won / championship drought | LLM `GENERAL_FULL` (suggested prompt) | Career+trophy dump | `whyHaventIWon`, `careerReport`, `championshipPath` | Y | Deterministic diagnosis unused |
| Championship team patterns / playoff profile | LLM (GENERAL_FULL / TEAM_IMPROVEMENT) | Coaching or full bag | `playoffPositionSplit`, `championshipPath` | Y | Unused |
| Current standings / biggest threat “right now” | LLM `CURRENT_LEAGUE` + page card `me.biggestThreat` | Selected season; card is all-time rivalry composite | Standings cache; `biggestThreatService` | Card: Y / chat: N | Chat and card can disagree |
| How do I win / improve team | LLM `TEAM_IMPROVEMENT` | **Current season only** | Career report, championship path, DNA | Y | History stripped even when user didn’t specify year |
| Light “how am I doing” | LLM `GENERAL_SMALL` | Current season only | Career + trophy | Y | History stripped |
| Closest game / 1-pt losses / nail-biters | **Tool** `query_matchup_margins` | Full `gmMatchups`; RS default; years if parsed | Matchup Margin + Identity | Y | Only deterministic win. Playoffs/all-time must be asked explicitly |
| Draft reaches / draft history | LLM `GENERAL_FULL` / TRADE_STRATEGY | **Upcoming** pick order + keepers | `espn.draftHistory`, owner draft DNA | Y | Historical draft unused |
| Trades / transaction history | LLM (if at all) | DNA style at best | `completedTradeAuthority`, `getSeasonTransactions` | Partial (txns 2022+) | Unused |
| Owner dossier / timeline / awards | LLM paraphrase from career lines | Career W/L + titles | `owners.ownerProfile`, career timeline, draft-night awards | Y / awards: draft-only | Unused |
| Hall of Fame records (PF, blowouts) | LLM from trophy/career | Titles + W/L | `hallOfFameService` | Y | Records unused |
| Ambiguous / “tell me everything” | LLM `GENERAL_FULL` | Full prompt bag + selected-year standings | Several | Partial | Kitchen-sink LLM, not authority-routed |

---

## A2. Addenda (independent code pass)

Confirmed the same architecture. Additional facts worth tracking:

- **Sync current season is 2026** (`ESPN_SYNC_CURRENT_SEASON` in `db.ts`); Advisor still hardcodes **2025** as fallback and UI initial state. Those can disagree after rollover.
- **Chat history is per `(user, season, leagueId)`.** Switching the season picker loads a different thread. An all-time question asked while 2025 is selected is stored against 2025.
- **`OWNER_COMPARISON` turns trophy leaderboard off** (`includeTrophyHistory: false`). Named “am I better than X?” gets filtered career + H2H, not the league title board.
- **This-week H2H is skipped once `currentMatchupPeriod` is in the playoffs** for the selected season.
- **LLM cap:** `invokeLLM` `callType: "advisor"` → **1024** max tokens (`_core/llm.ts`).
- **More unused authorities:** `h2hAuthority`, `rivalryStory.*`, `rivalryDossier`, `espn.ownerAllTimeRecords`, `espn.hallOfFame` records, `agents.openQuestion` / Agent War Room (`promptBlockForAdvisor` exists, not wired to the Advisor UI).

---

## B. Implications for RFSN-052B (not started)

If Advisor is to become the historian engine:

1. **Stop defaulting season to current** unless the user (or classifier) asks for current-season coaching.
2. **Route intents to existing authorities** before the LLM — championships, H2H, rivalry, why-haven’t-I-won, records, trades, draft DNA — same pattern as `query_matchup_margins`.
3. **One H2H stack:** `h2hAuthority` + Owner Identity, not cache-only `h2hContextBuilder`.
4. **Replace or constrain the War Room persona** for historical questions (evidence-first; forbid “I don’t have that” when an authority exists).
5. **Do not start that work until this audit is accepted.**

---

## C. Source map (primary files)

- `client/src/pages/Advisor.tsx`, `client/src/pages/my-team/MyTeamAdvisor.tsx`
- `server/routers.ts` (`advisor` router ~10553)
- `server/advisorStreamHandler.ts`
- `server/advisorQuestionClassify.ts`
- `server/advisorContextBuilder.ts`
- `server/matchupMarginTool.ts`, `server/matchupMarginAnalytics.ts`
- `server/leaguePromptContext.ts`, `server/db.ts` (`resolveActiveLeagueId`)
- Authorities: `championshipAuthority.ts`, `ownerIdentityAuthority.ts`, `h2hAuthority.ts`, `h2hContextBuilder.ts`, `rivalryService.ts`, `hallOfFameService.ts`, `completedTradeAuthority.ts`, `whyHaventIWon.ts`, `careerReportService.ts`, `ownerProfileService.ts`, `playoffPositionSplit.ts`
