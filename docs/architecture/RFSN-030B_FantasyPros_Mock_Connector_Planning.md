# RFSN-030B — FantasyPros Mock Connector (Planning)

**Status:** Open — planning only (0% implementation)  
**Depends on:** RFSN-030A discovery (closed)  
**Product home:** Draft → Mock Draft (not RFSN Live Draft)

## Sequencing (evidence-first)

Do **not** start **030B-1** (adapter contract freeze) until **030B-3** answers the upstream event source.

```
FantasyPros Solo / Multiplayer
        ?
        ↓
   Event Source   ← 030B-3 must resolve this
        ↓
 LockedPickInput  ← fields frozen after evidence
        ↓
 notifyLockedPick / Draft Intelligence
```

**Rationale:** Downstream `LockedPickInput` is obvious. Upstream signal (`?`) is not. Design the adapter around the strongest available source.

## Non-goals until evidence

- Do not extend ESPN `mDraftDetail` polling to FantasyPros.
- Do not freeze `LockedPickInput` field set until 030B-3 multiplayer evidence.
- Do not couple core draft intelligence / RFSN booth to FantasyPros DOM.

## Controlled slices (order)

### 030B-3 — Multiplayer / socket evidence (NEXT — in progress)

**One question:** What is the most reliable FantasyPros mock draft event source?

Evidence hierarchy:

| Rank | Source | Status |
| ---- | ------ | ------ |
| Preferred | Multiplayer socket pick events | Capture now |
| Acceptable | Vue store mutation / board change | Proven in solo (030A) |
| Last resort | DOM MutationObserver on cells | Brittle |

Checklist:

1. Multiplayer room creation — URL, room/draft ID, auth, network
2. Socket inventory — WS URLs, handshake, message names, pick payload shape
3. Vue state — root instance, draft store, picks, clock (vs `ng_draftPlayer`)
4. Stability on reload — API hydrate vs socket replay vs embedded JSON vs memory-only

Authority doc: `docs/architecture/RFSN-030B-3_FantasyPros_Multiplayer_Socket_Evidence.md` (**partial** — lobby + consumer schema done; live MUD pick wire needs signed-in session).

**Interim answer to “most reliable source?”**

1. Prefer `syncEvent.pickLog` / MUD `checkSync` when multiplayer.
2. Accept Vue `__debugStore.draftState` for solo.
3. Lobby Socket.IO is **not** a pick source.
4. DOM scrape last.

### 030B-1 — Provider adapter contract (after 030B-3)

Make ESPN and FantasyPros identical downstream — **only after** event-source choice.

Deliverables (when started):

- Shared adapter interface / types shaped by 030B-3 source
- ESPN adapter wraps existing live monitor (no behavior change)
- FantasyPros mapper → `LockedPickInput`
- Tests: mapper shape only

### 030B-2 — FantasyPros observer prototype (solo mock)

MVP after contract:

```
draftwizard.fantasypros.com
        ↓
content script observes chosen source (socket and/or Vue)
        ↓
detect locked pick
        ↓
emit LockedPickInput
```

Avoid scraping everything; avoid reverse-engineering unused APIs.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Vue internals change | Semantic selectors/events; isolate adapter |
| Unknown multiplayer source | 030B-3 evidence before architecture commit |
| Premature LockedPickInput freeze | Hold types until socket/Vue durability known |
