# ADR-001: Platform Information Architecture v2

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-11 |
| **Deciders** | Product architecture review (RFSN evolution, Platform IA v2) |
| **Supersedes** | Ad-hoc navigation decisions; implicit "League Wire as news hub" model |
| **Related** | `docs/DECISION_LOG.md`, `PRODUCT_CONSTITUTION.md`, RFSN presentation commits (`543a4e9`, `dd27af6`, `ff1c9e7`) |

---

## Status justification

**Accepted** — the architectural decision is settled. Planning exercises covering RFSN evolution, League Wire migration, navigation ownership, and feature placement have converged. Implementation is intentionally phased and has not started; this ADR governs all future work regardless of current route or nav state.

---

## Context

The application has outgrown its original information architecture.

- **Feature expansion** added draft intelligence, GM diagnostics, rivalry media, commissioner tooling, and a broadcast presentation layer (RFSN) while navigation remained anchored to early groupings (`Weekly`, `Know Rivals`, `Know Yourself`).
- **League Wire** was introduced as a weekly news surface. It now hosts two distinct backends (LLM newsroom articles and deterministic postgame wire) and is insufficient as the top-level media concept.
- **RFSN** began as a draft broadcast prototype and has matured into a league media platform (live draft, news, weekly packages, archive, future specials). It must not be nested under operational or intelligence nav groups.
- **Navigation drift** causes duplicate mental models: framework labels (`Know Rivals`) vs user jobs (`prepare for draft`), media mixed with rosters/matchups, personal tools split across groups, and orphan routes without nav homes.
- **Feature ownership** must be explicit so new capabilities (trade-deadline coverage, documentaries, podcasts, notifications) have a declared home without re-litigating navigation each sprint.

---

## Decision

Adopt **Platform Information Architecture v2** as the product constitution.

### Target navigation (sidebar)

```
Home
RFSN
Season
Draft
League
My Team
History
```

**Utility (header, not sidebar):** Settings, Connected Leagues, Sync Data, League Settings, Commissioner Hub

### Target domains

| Domain | Nav group | Primary user job |
|---|---|---|
| **Home** | Home | Orient — what matters now, where to go next |
| **RFSN** | RFSN | Consume — watch, read, revisit league story |
| **Season** | Season | Operate — act on the current season week |
| **Draft** | Draft | Prepare and execute draft decisions |
| **League** | League | Understand the league as a whole |
| **My Team** | My Team | Understand and improve yourself as a GM |
| **History** | History | Preserve and browse what happened |
| **Settings** | Utility | Configure account, connections, sync, admin |

### RFSN internal routes

| Route | Label | Absorbs |
|---|---|---|
| `/rfsn` | Home | Platform front door |
| `/rfsn/news` | News | League Wire written content |
| `/rfsn/live` | Live | Draft broadcast shell |
| `/rfsn/weekly` | This Week | In-season wire and weekly packages |
| `/rfsn/archive` | Archive | Articles, replays, specials |

Redirect: `/league-wire` → `/rfsn/news`. League Wire retires as a product name.

### Draft domain disposition

**Draft is an independent domain**, not a sub-domain of My Team.

| Factor | Rationale |
|---|---|
| User job | "Prepare for and run the draft" is distinct from "understand my GM profile" |
| Audience | Draft War Room serves drafters and league context; not personal-only |
| Seasonality | Draft justifies its own nav group during draft season without polluting year-round groups |
| Current state | Draft tools today live under `knowRivals` nav and embedded capabilities — **legacy placement, not target** |

New draft features declare **Draft** domain ownership. Navigation promotion to the Draft group follows migration Phase 3.

### Settled feature placements (target)

| Feature | Domain |
|---|---|
| The Briefing | Home |
| League Wire | RFSN → News |
| Rosters, Matchups, Trade Analyzer | Season |
| GM Advisor | My Team |
| Draft War Room, Keeper Forecast, Keeper Advisor | Draft |
| Draft Commentary | RFSN → Archive (replay); retire standalone nav |
| Rivalries, League DNA, The Cast, Power Rankings, Acquisition Impact, Standings | League |
| My GM Profile, Championship Path | My Team |
| Hall of Fame, League History, Draft History, Transactions | History |
| Connect, Sync, Settings, Commissioner Hub | Settings |

---

## Product pillars

Pillars describe **product logic**. Nav groups describe **user-facing structure**. They are related but not 1:1.

| Pillar | Definition | Primary domains |
|---|---|---|
| **Media** | Storytelling, broadcast, articles, recaps, specials | RFSN |
| **Operational** | Weekly actions on rosters, matchups, trades | Season |
| **League Intelligence** | League-wide analysis and standings | League |
| **Personal Intelligence** | Self-improvement and personal diagnosis | My Team |
| **Historical** | Records, timelines, transactions, legacy | History |
| **Administration** | Account, data, commissioner operations | Settings |

**Home** spans pillars — it composes beats from all domains but owns no canonical data.

**Draft** spans Operational preparation and Personal Intelligence inputs but is owned as a **domain** because its seasonal job is cohesive.

Experience categories (`GM Intelligence`, `League Intelligence`, etc.) remain valid for **pricing and marketing only**. They must not drive sidebar structure.

---

## Domain ownership rules

Every future feature must declare **exactly one primary domain**.

| If the feature… | Domain |
|---|---|
| Orients the user or composes cross-domain beats | Home |
| Is a show, article, broadcast, recap, or special | RFSN |
| Helps the user act during the current season week | Season |
| Supports draft preparation, execution, or replay tooling | Draft |
| Describes the league, rivals, or league-wide standings | League |
| Describes the user as a GM or prescribes personal change | My Team |
| Preserves or browses past events and records | History |
| Configures account, connections, sync, or commissioner admin | Settings |

### Explicit examples

| Feature type | Domain | Notes |
|---|---|---|
| Broadcasts, Breaking News, Trade Deadline coverage | RFSN | Not Season |
| Articles, News wire | RFSN → News | Backend routers may retain legacy names |
| Draft War Room, Keeper tools | Draft | Cross-link to RFSN Live; do not merge |
| Historical records, HOF, transactions | History | RFSN may tease; History is canonical |
| Commissioner tools | Settings | May surface in Briefing for commish role |
| Player Database | League | Reference utility, not media |
| AI advisors (GM Advisor) | My Team | League-scoped trade AI stays Season or League by action type |
| Power Rankings, DNA, Rivalries | League | RFSN summarizes; does not replace |

**Secondary surfaces** (dashboard widgets, Briefing cards, push notifications) must link to the primary domain home. They do not create a second primary home.

---

## Navigation principles

1. **Describe user jobs**, not internal frameworks. Retire `Know Rivals` / `Know Yourself` as nav concepts.
2. **One primary home per feature.** No duplicate sidebar entries for the same capability.
3. **Cross-links are encouraged.** Duplication of canonical UIs is discouraged.
4. **Prefer plain names** over clever labels (`Season` not `Weekly`, `My Team` not `Know Yourself`).
5. **Separate media from operations.** RFSN must not live inside Season or League nav groups.
6. **Separate intelligence from media.** League pages are canonical; RFSN covers them.
7. **Utility stays out of the sidebar.** Settings, Sync, Connect remain header/account flows.
8. **Orphan routes are not allowed.** Every route must map to a domain; if none fits, architecture review is required before shipping.
9. **RFSN is a single sidebar entry** with internal routing — not a nav group with five siblings.

---

## RFSN principles

### Why RFSN exists

RFSN is the league's **media platform** — the permanent destination for consuming league story across the full year, not only during draft.

### Belongs inside RFSN

| Content | RFSN section |
|---|---|
| Draft Night (live) | Live |
| Draft replay / commentary archive | Archive |
| Written journalism (ex–League Wire) | News |
| Postgame wire, weekly packages | This Week |
| Breaking news | Home hero + News pin |
| Trade Deadline, Championship Show, documentaries | Archive + Home feature |
| Future podcasts, press conferences, community reactions | Archive or Home |

### Does not belong inside RFSN

| Content | Correct domain |
|---|---|
| Draft War Room (decision tooling) | Draft |
| Rosters, Matchups, Trade Analyzer | Season |
| Power Rankings, DNA, Rivalries (canonical views) | League |
| Championship Path, GM Advisor | My Team |
| Hall of Fame, transaction log | History |

Operational tools may **cross-link** to RFSN (e.g., "Watch on RFSN Live"). They must not be embedded as primary RFSN lanes.

### Broadcast talent rule

Sofia, Coach, and Roxanne appear in **broadcast contexts** (Live, narrated specials). Written News uses desk bylines (`RFSN`), not broadcast talent cards.

---

## Intelligence principles

Five roles — each domain has one:

| Role | Domain | Rule |
|---|---|---|
| **Canonical** | League, My Team, History | Source of truth for structured intel |
| **Summarize** | RFSN | Audience layer; links inward for depth |
| **Preserve** | History | Immutable record; RFSN Archive points here |
| **Act** | Season, Draft | Tools that change or inform immediate decisions |
| **Explain** | My Team (AI) | Personalized diagnosis and counsel |

RFSN must never become the canonical store for standings, H2H records, or championship diagnosis. It references and links.

---

## Migration strategy

Phased architectural direction only. Order is significant.

| Phase | Scope |
|---|---|
| **0** | Adopt this ADR (complete) |
| **1** | Brand & routing — RFSN top-level nav, `/league-wire` redirect, widget rebrand |
| **2** | RFSN composition — Home, News wrapper, internal subnav, Live when broadcast stack ready |
| **3** | Sidebar regroup — Season, Draft, My Team, League, History; retire old nav groups |
| **4** | Consolidation — Draft Commentary → Archive, Commissioner → Settings, orphan route homes |
| **5** | Growth slots — specials, notifications, mobile deep links into RFSN routes |

Display and nav migrate before backend renames. `leagueWireRouter` and `leagueNewsroomRouter` may retain legacy identifiers.

---

## Consequences

### Positive

- Single reference for feature placement decisions
- RFSN can scale to specials, podcasts, and notifications without nav redesign
- Clear separation of media, operations, and intelligence
- Reduced cognitive load — plain nav group names
- Intel pages protected from media-layer duplication

### Negative

- Short-term divergence between ADR target and current `featureRegistry.ts`
- Users familiar with League Wire and Know Rivals/Know Yourself need migration guidance
- Seven sidebar groups approach mobile density limits

### Deferred

- Implementation of all migration phases
- Backend/router renames
- Draft Commentary retirement
- RFSN Live production wiring

### Technical debt introduced

- Dual naming (ADR labels vs current registry IDs) until Phase 3
- League Wire backend names persist after brand retirement
- Draft features temporarily misaligned with `knowRivals` nav category

### Future opportunities

- Push notifications deep-linking to `/rfsn/*`
- Mobile app parity with domain structure
- RFSN Archive as home for all long-form league media
- Role-aware Briefing without restructuring domains

---

## Future decisions (intentionally open)

Do not decide in this ADR. Require separate ADRs or architecture review.

| Topic | Notes |
|---|---|
| Draft promotion timing | Phase 3 vs seasonal auto-surface |
| Season + Draft merge in offseason | Collapse to reduce nav count? |
| Community reactions / forums | No domain assigned |
| Global search | Cross-domain; placement TBD |
| Mobile navigation pattern | Tab bar vs drawer mapping |
| Push notification taxonomy | Deep-link rules TBD |
| Role-aware navigation | Commissioner/Briefing surfacing without nav fork |
| Podcast RSS / external distribution | RFSN Archive vs separate |
| Trade Analyzer domain | Season (act) vs League (market intel) — lean Season |
| Player Database prominence | League footer vs Season utility |
| Draft Reality Simulator | Draft domain vs retire |
| Pro gating per RFSN section | Live likely pro; News likely free |
| Experience category restructure | Marketing-only for now |

---

## Compliance

Before shipping a new feature, confirm:

1. Primary domain declared
2. Primary route/home identified
3. Canonical owner identified (if data-bearing)
4. RFSN role (if any) is summarize/link only
5. No orphan route introduced
6. Migration phase noted if current nav contradicts ADR

---

## References

- Platform IA v2 planning session (2026-07)
- RFSN architecture revision (News, Home, top-level nav)
- Current registry: `client/src/lib/featureRegistry.ts`
- Current routes: `client/src/main.tsx`
