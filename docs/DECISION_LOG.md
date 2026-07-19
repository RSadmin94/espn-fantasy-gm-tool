# Decision Log

Product and architecture decisions with dates. Newest first.

---

## 2026-07-19 — RFSN-030C FantasyPros Solo Mock Connector (implement)

**Decision:** Ship the **solo** FantasyPros mock connector as a first-class RFSN provider that normalizes to existing `notifyLockedPick` / DraftMoment / booth pipeline. Do **not** implement MUD/multiplayer in this ticket.

**Upstream source (locked):** Vue `__debugStore.draftState.draftedPlayers` growth on `draftwizard.fantasypros.com` with `vueDraftTarget === "local"` and `isMultiUserDraft === false`. No pick WebSocket for solo; do not reuse ESPN `mDraftDetail`.

**Extension:** Host-based FantasyPros content script + page-world observer + background relay into FFR (v1.10). ESPN paths unchanged.

**Product surface:** Start/stop lives on **Mock Draft** as “RFSN FantasyPros Mock / Simulation Mode” — not ESPN Live Draft labeling. Session mode `FANTASYPROS_SIMULATION` arms booth on Mock only; ESPN connected-league monitor stays off; leaving Live/Mock tears down correctly (sticky toggle ≠ active session).

**Authority:** `docs/architecture/RFSN-030C_FantasyPros_Solo_Mock_Connector.md`

**Deferred:** Authenticated FantasyPros multiplayer / MUD durable pick wire (030B-3).

---

## 2026-07-19 — RFSN-030B-3 first; hold 030B-1 type freeze

**Decision:** Run **030B-3** evidence capture **before** **030B-1**. Do not freeze `LockedPickInput` until FantasyPros upstream event source is confirmed. Downstream shape is obvious; upstream `?` is not.

**030B-3 status:** Partial — lobby + draft-room consumer schemas captured; **live MUD pick wire blocked by auth**. Authority: `docs/architecture/RFSN-030B-3_FantasyPros_Multiplayer_Socket_Evidence.md`.

| Source | Result |
| ------ | ------ |
| Lobby Socket.IO (`draftlobby.fantasypros.com`) | Seats / availability / `statusUpdate` only — **not** pick events |
| Draft-room `ng_onSocketEvent` | Handles `syncEvent` (`pickLog` + `teamIds`), `draftEvent`, `startEvent`, `predraftEvent`, … |
| MUD path (`mudId`) | `checkSync` → `/spaDraft` + clock-scheduled refresh (hybrid durability) |
| Solo mock | `vueDraftTarget: "local"`; reload **resets** picks (client memory only) |
| Public/private MUD join/create | **Requires FantasyPros account** |

**Next:** One authenticated MUD session to capture live-room transport into `ng_onSocketEvent` (see `RFSN-030B-3_Draft_Room_Transport_ng_onSocketEvent.md`). Until then keep types provisional; solo path can still plan around Vue `__debugStore.draftState.draftedPlayers`. Multiplayer durable path evidenced without auth: `/spaDraft` `checkSync` → `picks[]`.

**Still do not start 030B-1 code/types freeze.**

---

## 2026-07-19 — RFSN-030A closed; RFSN-030B opened as planning

**Decision:** Merge **RFSN-030A** discovery into recovery and **close** the ticket. Open **RFSN-030B** as implementation **planning only** — do not start broad connector coding until the split below is sequenced, and do not commit multiplayer architecture until socket evidence exists.

**030A closed:**

| Field | Value |
| ----- | ----- |
| Status | Complete |
| Merge | `52df22f` on `fix/rfsn-production-recovery` |
| Doc commit | `a9aa407` |
| Authority | `docs/architecture/RFSN-030A_FantasyPros_Mock_Draft_Connector_Discovery.md` |

**Hard constraint from discovery:** Do **not** reuse the ESPN `mDraftDetail` poller against FantasyPros.

**030B planning split (evidence-first order):**

| Slice | Goal | Code now? |
| ----- | ---- | --------- |
| **030B-3** | Multiplayer / socket evidence — strongest upstream event source | **Next / in progress** |
| **030B-1** | Provider adapter contract → `LockedPickInput` | **After 030B-3** (types not frozen early) |
| **030B-2** | FantasyPros observer prototype (solo / then MUD) | After contract shaped by evidence |

**Product ownership:** FantasyPros Mock stays under **Draft → Mock Draft**, not RFSN Live Draft (RFSN-028).

**Risks:** Vue internals may change (isolate adapter; prefer semantic hooks). Multiplayer **live pick wire** still needs authenticated capture.

---

## 2026-07-19 — RFSN-030A FantasyPros Mock Draft Connector Discovery

**Decision:** Close **RFSN-030A** as discovery-only. FantasyPros Mock Draft is **not** an ESPN-style JSON poll target.

**Findings (see `docs/architecture/RFSN-030A_FantasyPros_Mock_Draft_Connector_Discovery.md`):**

| Area | Result |
| ---- | ------ |
| Network | `/spaDraft` hydrates room; solo mock picks largely **client Vue**; sockets present but unused in solo mock |
| DOM | `.vue-draft-room-app` / `.vue-draftroom-player-cell`; `ng_draftPlayer` |
| Auth | Free mock works signed-out; premium settings locked |
| Extension | Current ESPN extension **cannot** switch providers without new hosts + content script + adapter |

**Next:** RFSN-030B — define FantasyPros mock adapter contract (map to `notifyLockedPick`); do not overload ESPN live poller.

---

## 2026-07-18 — RFSN-027C RFSN Navigation Consolidation

**Decision:** Consolidate RFSN primary navigation to **Live · Stories · Recaps**. Do not invent Wire-vs-Stories product differentiation or new content categories.

**Before:** Wire, Breaking, Stories, Recaps, Analysts as competing sidebar choices.  
**After:** Sidebar shows Live, Stories, Recaps under RFSN. Hub (`/rfsn`) remains the landing; Breaking/Analysts stay as deep-link pages; Wire redirects to Stories (engine preserved via `LeagueWireNewsroom`).

**Ownership:**

| Content | Home |
| ------- | ---- |
| Live commentary | RFSN Live |
| Historical narratives | RFSN Stories |
| Draft/game summaries | RFSN Recaps |
| Raw feed | Internal engine only |
| Rivalry profiles | Rivals |
| Owner analysis | My GM / Owner Dossier |

**Non-goals:** Backend changes; new routes; splitting engines; content redesign.

---

**Decision:** Next product work is **implementation against existing audits**, not another IA/UX discovery pass. Discovery cost was already paid (RFSN-019, RFSN-023, prior RFSN surface / Draft nav discussions).

**Parent:** RFSN-027 — UX Consolidation Execution  
**Rules:** No new redesign. No new navigation concepts. No new feature surfaces. Execute approved consolidation findings only.

**Slices (isolated commits):**

| Slice | Focus | Source |
| ----- | ----- | ------ |
| **RFSN-027A** | War Room remaining consolidation | RFSN-019 follow-through |
| **RFSN-027B** | My GM / Owner Dossier final polish | RFSN-023 follow-through |
| **RFSN-027C** | RFSN navigation consolidation (Live · Stories · Recaps) | Too many competing RFSN destinations |
| **RFSN-027D** | Draft navigation terminology (Live vs Mock vs War Room vs History) | Known mental model |

**027A ownership (Briefing = scan only):**

| Information | Home |
| ----------- | ---- |
| Quick draft state | Briefing |
| Owner behavior | Draft DNA |
| Roster needs | Roster Priorities |
| Position timing | Position Landscape |
| Deep analytics | Detail sections |

**027B lens distinction:** My GM = identity / improve (no scouting language). Owner Dossier = beat this manager (keep scouting).

**027C hierarchy (nav consolidation — corrected):** One RFSN entry with **Live · Stories · Recaps**. Wire / Breaking / Analysts / Hub are not competing primary destinations. Wire remains the internal feed engine powering Stories/Home. No new content categories or routes.

**027D mental model:** Live Draft (real) · Mock Draft (practice) · War Room (strategy) · Draft History (past). No “Live” on mock/sim surfaces.

**Explicit non-goals until 027A–D land:** new UX audits; further Live Draft polish; RFSN-025/026 remain backlog-only.

---

## 2026-07-18 — RFSN-024 closed; Live Draft foundation stable

**Decision:** Close **RFSN-024 — Live Draft UX Polish**. Do not open another Live Draft UI polish sprint.

**Deploy:** `0a7747f` on `fix/rfsn-production-recovery` (ACTIVE).

**Release note:** RFSN-024 improved Live Draft usability without changing draft intelligence, pool ownership, eligibility, or broadcast architecture. Validation confirmed status clarity, booth state visibility, timeline behavior, and preserved ADP ordering.

**Acceptance (closed):**

| Area | Status |
| ---- | ------ |
| Live status UX | PASS |
| Booth presence / silence UX | PASS |
| Timeline | PASS |
| Player pool readability | PASS |
| RFSN-017B ordering regression | PASS |
| Mobile dock active-draft validation | Follow-up → RFSN-025 |
| Synthetic ADP classification | Follow-up → RFSN-026 |

**Foundation milestone (stable — treat as contract):**

```
Live Draft
├── League connection layer        ✅
├── Live shell                     ✅
├── Format eligibility             ✅
├── Live/mock pool separation      ✅
├── ADP integrity                  ✅
├── Booth behavior                 ✅
├── UX clarity                     ✅
```

**Backlog (do not block roadmap):**

### RFSN-025 — Mobile Live Draft Dock Verification
- Priority: Low
- Status: Validation follow-up
- Needs: active live draft, real ~390px viewport, bottom safe-area check
- Acceptance: dock reaches viewport bottom; ticker does not overlap; controls remain accessible

### RFSN-026 — Synthetic ADP Source Metadata
- Priority: Medium (technical cleanup)
- Problem: synthetic inferred from `ADP >= 200` or missing ADP; observed fallbacks ~169.7 can look “real”
- Preferred: explicit `adpSource: espn | fallback | estimated` instead of value heuristics
- Do not block product roadmap

**Next strategic preference (not scheduled):**

1. **Option 1 — Real Draft Experience Validation** — prove ESPN lock → RFSN reaction → league context → audio → timeline on a real draft
2. **Option 3 — Draft Night Show Expansion** — awards, league story, winner/loser narratives, season outlook

Defer Option 2 (storytelling layer) and further Live Draft UI polish until real-draft proof or wrap-up expansion earns the next sprint.

**RFSN-027B (in progress on feature branch):** My GM / Owner Dossier language ownership — same engine; self = reflection; scout = attack framing. No new analytics.

---

## 2026-06-25 — V1 commercial simplification: Free + Rivals only

**Decision:** Version 1 ships with **two commercial tiers** — Free and Rivals. **The League** commissioner subscription is removed from billing, Stripe catalog setup, checkout, pricing UI, and commercial copy.

**Rationale:** Focus launch on competitive intelligence (Rivals). Commissioner engagement features may remain in the codebase for future development but must not appear as a purchasable tier.

**Pricing:**

- Rivals Monthly: $8.99/mo
- Rivals Annual: $79.99/yr

**Removed:**

- League Stripe products and price env vars
- League checkout and Rivals→League upgrade paths
- `billing.getUpgradeQuote`
- Third pricing column on landing page

**Still intentional in codebase:**

- `subscriptionPlan` DB enum may retain `league` for legacy rows
- Commissioner routes (e.g. Commissioner Command Center) — not subscription-gated as a separate tier in V1
- Nav category `"league"` in feature registry — ESPN league content grouping, not a billing tier

**Docs:** `docs/V1_COMMERCIAL_PRICING.md`, `PRODUCT_CONSTITUTION.md` §4b, `docs/FREEMIUM_GATING_SPEC.md` §12.

---

## Prior decisions

See `docs/FREEMIUM_GATING_SPEC.md`, `PRODUCT_CONSTITUTION.md`, and `docs/playerid-crosswalk-decision.md` for feature-specific history.
