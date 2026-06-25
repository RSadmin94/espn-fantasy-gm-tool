# Duplicate Card Survivor Audit
**Fantasy Football Rivals — Architecture & Consolidation Review**
*Prepared for external architecture / product review*

> ### Guiding principle
> **Whenever duplicate functionality exists, the survivor should combine the _most
> trustworthy data source_ with the _clearest user experience_ — not necessarily the
> newest implementation.**

---

## Purpose

This audit identifies every place where the product tells the same story more than
once, or computes the same fact from more than one source.

The review follows two principles:

- **One fact, one authority** — every factual statement has exactly one canonical computation.
- **One page, one question** — every page answers its primary question before presenting supporting evidence.

The objective is **not to add features**. It is to determine, wherever duplicate
functionality exists, which implementation should survive. The audit deliberately
separates **data authority** (which computation is correct) from **UI quality** (which
presentation is clearest) — the two do not always live in the same card, and the
survivor should inherit the best of each.

## Operating Principles

These are the operating principles the product now runs on. They outlast any single
roadmap and are intended to guide every future feature and refactor:

1. **One fact → one authority.**
2. **One page → one question.**
3. **Evidence before explanation** (show the data, then the conclusion — never the reverse).
4. **The survivor combines the most trustworthy data with the best UX**, regardless of which is newer.
5. **Delete duplicates** rather than maintain parallel implementations.
6. **Architecture exists to support user trust** — not the other way around.

---

## Decisions Already Locked

The following decisions are settled. They are recorded here so reviewers can see the
ground that is no longer in play.

| Decision | Status |
|---|---|
| Championship Diagnosis replaces Championship Path and "Why Haven't I Won" | ✅ Locked |
| Rivalry Center is the canonical rivalry experience | ✅ Locked |
| League Legacy Center replaces Hall of Fame branding | ✅ Locked |
| Dynasty Power Rankings stays **separate from** (adjacent to) Legacy Center | ✅ Locked |
| The Owner Identity Authority is the single canonical owner-resolution source | ✅ Locked (decision) |
| One page = one question | ✅ Locked |
| One fact = one authority | ✅ Locked |

> **Reviewers:** please challenge a locked decision only if you believe it is
> *fundamentally* incorrect. Otherwise, focus feedback on the unresolved items below.

## Current Implementation Status

A locked *decision* is not the same as a shipped *implementation*. The Owner Identity
Authority exists and has been validated, but the product does **not** yet consume it
everywhere — that migration is the next step.

| Item | Status |
|---|---|
| Owner Identity Authority | ✅ Prototype implemented & validated (226/226 owner-seasons resolved, 0 silent guesses) |
| Consumer migration | 🔄 Pending — no production surface consumes it yet |
| H2H Authority | ⏳ Planned — not yet started |

---

## Audit Findings

Each row pairs the cleanest data source with the best existing UI, and states how
confident we are and where the work stands. *Confidence* reflects how thoroughly the
claim has been traced in code; *Status* reflects what remains.

| Feature / Fact | Cleanest Source | Best UI | Confidence | Status | Recommended Fix |
|---|---|---|---|---|---|
| "Why haven't I won / how do I win" | `careerReport` | Championship Diagnosis | HIGH | ✅ Complete | Fold `closestChampion`+`championshipProfile` into careerReport; drop Diagnosis's second `championshipPath` query; delete the retired page files |
| Rivalry summary card | `rivalry.getScores` | `RivalrySummaryCard` | HIGH | ✅ Complete (UI) | None — UI consolidation done; data handled by the H2H Authority row |
| **Rivalry H2H number itself** | none canonical yet | Rivalry Center | HIGH | 🔴 Needs Authority | Build the H2H Authority on the Owner Identity Authority; collapse `getScores` + `h2h` + `rivalryDossier` into it |
| HoF / Legacy rivalry records | should = H2H Authority | Legacy records tab | HIGH | 🟡 Needs Authority | **Verified** a separate path (`gmMatchups` + person-merged spine); repoint to the H2H Authority once it exists |
| Legacy / champions / dynasties | `espn.hallOfFame` | HallOfFame → Legacy Center | HIGH | 🟡 Finish consolidation | Complete the rename; retire the `/history` stub; keep Dynasty Power Rankings **adjacent**, not absorbed |
| HoF Rivalries tab | `rivalry.getScores` | Rivalry Center | HIGH | ✅ Complete | None — redirect already shipped |
| "How do I beat this owner" (H2H) | H2H Authority (not `matchupIntel`) | redesign paused | HIGH | ⏸ Paused on H2H Authority | Do **not** ship the redesign on `matchupIntel` (inflated ~2.5×); source H2H from the authority |
| Owner "DNA" cards | `ownerProfile` payload | 4 DNA tabs | MEDIUM | ✅ Keep as depth | Demote from "everything we know" hero to supporting detail |
| Draft War Room / Desk | — | — | LOW | 🔍 Needs Investigation | Not scored — duplication not yet verified. Investigate whether Desk duplicates War Room |
| Keeper Advisor / Forecast | — | — | LOW | 🔍 Needs Investigation | Not scored — investigate whether both share one valuation core |

**On Legacy vs Dynasty.** These answer different questions and are kept adjacent, not
merged: Legacy asks *"who has been the greatest?"* (backward-looking); Dynasty asks
*"who is built to dominate next?"* (forward-looking). The Legacy Center's Dynasties tab
links out to Dynasty Power Rankings rather than absorbing it.

**On the rivalry / H2H paths (the core finding).** The audit observed that the same
head-to-head fact is currently computed several different ways — `rivalry.getScores`
(ESPN cache, 2018+, raw owner id), `rivalry.h2h`, `owners.rivalryDossier`
(`gmMatchups`), the Legacy records path (`gmMatchups` + person-merged spine), and
`matchupIntel` in Owner Profiles (inflated). These compute over different season ranges
with different identity resolution, so they can and do disagree. This is the central
problem the next phase exists to eliminate.

---

## Dependency Graph

Every authority may only consume facts from the layer above it. This is the single
clearest explanation of the roadmap order — in particular, why the H2H Authority must
exist *before* Owner Profiles, Legacy records, or the rivalry surfaces can be trusted.

```text
              Owner Identity Authority
                        │
                        ▼
                   H2H Authority
                        │
        ┌───────────────┼───────────────┬──────────────────┐
        ▼               ▼               ▼                  ▼
  Rivalry Center   Legacy Center   Owner Profiles    Championship
  (cards + page)   (records)       ("beat this        Diagnosis
                                    owner")          (biggest threat)
```

Nothing below the H2H Authority should compute head-to-head itself; each consumer
reads the one canonical number. The same shape applies upstream: every owner lookup
resolves through the Owner Identity Authority, never independently.

---

## Roadmap — Two Phases

### Phase 1 — Canonical Data
*Goal: every fact shown anywhere in the product is identical everywhere.*

- **Owner Identity Authority** — prototype implemented & validated. Foundation for everything below; consumer migration still pending.
- **H2H Authority** — the keystone. Computes head-to-head once, on top of the Owner Identity Authority. Unblocks four surfaces at once (Rivalry Center, Legacy records, Owner Profiles, and the rivalry card's trustworthiness).
- **Legacy Authority cleanup** — finish the Legacy Center rename, retire the `/history` stub, wire Dynasty Power Rankings as an adjacent link.

### Phase 2 — User Experience
*Goal: every page answers one question immediately.*

- **Owner Profiles redesign** — "How do I beat this owner?", sourced from the H2H Authority.
- **Dashboard polish.**
- **League DNA simplification.**
- **Draft / Keeper audit** — confirm or rule out duplication before any change.

The sequencing is deliberate: **Phase 2 cannot safely begin until Phase 1 holds**,
because every Phase-2 page would otherwise risk presenting a number that contradicts
another page.

---

## Unresolved Questions for Reviewers

These are the questions where outside perspective is most valuable:

1. **Survivor selection.** Where duplicate functionality existed, did we keep the right one — the cleanest source paired with the clearest UI?
2. **Wrong question.** Is any surviving page still answering the wrong primary question, or burying its answer below the fold?
3. **Multiple authorities.** Is any fact still computed from more than one authority that we have not flagged?
4. **Missing duplicates.** Are there important duplicate experiences this audit failed to capture?
5. **Cleaner path.** Is there a simpler consolidation route than the H2H-Authority-first plan proposed above?

---

## Definition of Done

| Success Metric | Target | Current |
|---|---|---|
| Duplicate authority paths | 0 | Multiple (H2H computed several ways) |
| Pages answering more than one primary question | 0 | A few (e.g. Owner Profiles "everything we know") |
| Contradictory facts between pages | 0 | Present (H2H differs across surfaces) |
| Duplicate feature pages | 0 | Draft/Keeper unconfirmed |
| Canonical data authority documented | 100% | Partial (Owner Identity done; H2H pending) |

---

## What We Intentionally Did NOT Do

During this audit we deliberately did **not**:

- add new product features;
- redesign pages whose data authority is unresolved (e.g. Owner Profiles);
- merge conceptually different products (Legacy vs Dynasty);
- optimize architecture without a demonstrated user benefit;
- infer owner identity from name similarity without canonical evidence;
- preserve a duplicate authority path just because a card looked good.

Each of these was a conscious choice, not an oversight.

---

## Forward Discipline — the three-question gate

From here, every change passes all three before it ships:

1. **Is this the canonical source of this data?**
2. **Is this the clearest UI we have already built for this information?**
3. **Does this page answer its primary question within the first screen?**

All three *yes* → keep it. Any *no* → pair the cleanest source with the best existing UI,
remove the duplicate, and move on.

> The consolidation effort has largely succeeded: most duplicate **UI** is already gone.
> The remaining work is not a UI problem — it is a **data-authority** problem. The next
> phase should add no new features; it should eliminate the remaining duplicate authority
> paths so that every fact has exactly one canonical source. Once that foundation holds,
> the deferred experience work can proceed with zero risk of contradictory information.
> This is no longer feature design — it is finishing the product.
