# GM War Room — Product Constitution

**Status:** Active — higher priority than any single implementation request.  
**Audience:** Engineers, agents, and designers shipping Rivalry Center and adjacent league-intelligence features.  
**Read this file before every major Rivalry Center implementation.**

When a task conflicts with this document, **stop, explain the conflict, and resolve with the product owner** — do not silently weaken the rule.

---

## 1. What we are building

GM War Room is a **league-memory and storytelling product** for long-tenure fantasy leagues — not a generic stats dashboard.

Rivalry Center is the **signature surface**: users come to **relive feuds, settle arguments with receipts, and share status** — not to browse tables.

---

## 2. Non-negotiable data doctrine

### 2.1 One fact, one authority

| Fact | Authority | Consumers must not recompute |
|------|-----------|------------------------------|
| Canonical owner identity | `ownerIdentityAuthority` | Profile keys, merge-aware GUIDs |
| Head-to-head record | `h2hAuthority` | Rivalry, HoF, diagnosis, dossier |
| League-scoped weekly stats | `getLeagueWeeklyStats` | Championship path, playoff split, future positional H2H |
| Championship / titles | `championshipAuthority` | Path, diagnosis, HoF, rivalry implications |
| Playoff positional scoring | `computePlayoffPositionSplit` | UI panels — no duplicated joins |

**Violation examples:** a new `JOIN teams … ON teamId+season` without `w.ownerKey = t.ownerId`; a second H2H loop over `espn_raw_cache` matchups when `gmMatchups` + H2H Authority exist.

### 2.2 Regular season ≠ playoffs

- **Career H2H** = regular season only (default number users quote).
- **Playoffs** = separate record and separate narrative chapter — never blended into the headline W–L without explicit labeling.
- Playoff eliminations and “when it counted” moments are first-class, not folded into RS totals.

### 2.3 Deterministic first

- Every user-visible claim must trace to a **measurable input** (matchup row, starter points, draft pick, trade row, title flag).
- **No invented opinions.** LLM may polish prose only when each clause maps 1:1 to an evidence object (metric id + value). Primary rivalry copy must work with **zero LLM**.
- Threshold-gated labels (“Owns,” “Nemesis,” “Inferno”) require **documented sample-size minimums** — no label on thin data.

### 2.4 Golden rule of data

Normalized tables are **re-derived from `espn_raw_cache`**. If data is wrong, ask “is it in raw cache?” before re-fetching ESPN.

---

## 3. Rivalry Center product law

### 3.1 Story before spreadsheet

- **Lead with receipts** (one undeniable sentence), then proof chips — not raw columns.
- **One rivalry pair per story** at a time; league-wide tables are context, not the hero.
- Demote generic H2H grids to “view full log”; hero = headline, brief, timeline, moments.

### 3.2 Emotional language is earned

Dominance tags, heat labels, and badges fire only when numeric rules pass. Otherwise show **“Too early to call”** or **“Deadlocked”** with `n=` sample size visible.

### 3.3 Shareability is a deliverable

Major sections must be exportable as **share cards** (claim + proof bullets + league context). Free tier may watermark; paid gets full export.

### 3.4 Do not ship “another analytics dashboard”

If a proposed UI is primarily sortable tables without narrative hierarchy, **reject and redesign** before implementation.

---

## 4. Freemium law (distribution + monetization)

From `docs/FREEMIUM_GATING_SPEC.md`:

| Free | Paid |
|------|------|
| **Identity** — who you are in the league | **Transformation** — full depth, exploit patterns, full logs |
| Proof / Pain / Promise | Resolution |
| Wound visible | Diagnosis + cure |

- **Redaction is server-side** before serialization — not CSS-hidden paid content.
- Free rivalry: heat, headline record, one killer fact / turning point, teaser card.
- Paid rivalry: full timeline, positional H2H, trade ledger, draft overlap, full dossier, HD share cards.

**Violation:** exposing full H2H game logs, positional warfare, or trade verdict detail on `publicProcedure` without gating.

---

## 4b. Commercial tiers (V1)

Version 1 ships **two commercial tiers only**:

| Tier | Price | Billing |
|------|-------|---------|
| **Free** | $0 | Default — identity shell + one rivalry preview |
| **Rivals** | $8.99/mo or $79.99/yr | Stripe subscription — full competitive intelligence |

**The League** (commissioner engagement suite) is **deferred** — not sold, not in checkout, not in pricing UI. Commissioner routes may exist in code for future work but are not a purchasable subscription in V1.

See `docs/DECISION_LOG.md` and `docs/V1_COMMERCIAL_PRICING.md`.

---

## 5. Engineering constraints (implementation)

- **Routers expose engines; they do not duplicate calculations.**
- **Minimal scope** — no drive-by refactors, no new abstractions for one-liners.
- **Existing APIs** — extend via new procedures; do not break championship/identity/H2H contracts without explicit approval.
- **Decontaminated weekly stats only** — all new weekly consumers go through `getLeagueWeeklyStats`.
- **Commits/deploys** — only when explicitly requested.

---

## 6. Pre-implementation checklist (required)

Before writing code for a **major** Rivalry Center change, answer in the open:

1. **Authorities** — Which authority owns each new fact? Any duplicate computation?
2. **Evidence** — Can every new string be shown with a proof chip? Any LLM-only claims?
3. **RS vs playoffs** — Are records and copy correctly separated?
4. **Gating** — What crosses the free/paid wire? Is redaction server-side?
5. **Story** — What is the one-sentence receipt? Is this a dashboard in disguise?
6. **Sample size** — Do new labels/badges gate on `n`?
7. **Conflict** — Does this task conflict with any section above?

If **#7 is yes** → stop and explain before coding.

---

## 7. Related documents

| Doc | Use |
|-----|-----|
| `docs/FFR_PRODUCT_TRACKING.md` | Operational SOT — Preview vs Production, RFSNs, roadmap, backlog |
| `docs/ARCHITECTURE.md` | Pipeline, season discovery, deploy (**deploy-branch/URL section may be stale**; trust tracking doc for env SHAs) |
| `docs/FREEMIUM_GATING_SPEC.md` | Free/paid splits |
| `server/h2hAuthority.ts` | H2H contract |
| `server/leagueWeeklyStats.ts` | Weekly stats contract |
| `server/rivalryService.ts` | Rivalry score formula |

---

## 8. Amendment

Changes to this constitution require explicit product-owner approval. Implementation convenience is not sufficient grounds for amendment.
