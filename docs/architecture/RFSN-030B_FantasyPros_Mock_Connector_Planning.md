# RFSN-030B — FantasyPros Mock Connector (Planning)

**Status:** Open — planning only (0% implementation)  
**Depends on:** RFSN-030A discovery (closed)  
**Product home:** Draft → Mock Draft (not RFSN Live Draft)

## Non-goals until evidence

- Do not extend ESPN `mDraftDetail` polling to FantasyPros.
- Do not build multiplayer sync before **030B-3** socket evidence.
- Do not couple core draft intelligence / RFSN booth to FantasyPros DOM.

## Downstream contract (unchanged)

All providers must converge here:

```
ProviderAdapter
      ↓
LockedPickInput
      ↓
notifyLockedPick()
      ↓
Draft moment / RFSN intelligence
```

## Controlled slices

### 030B-1 — Provider adapter contract

Make ESPN and FantasyPros identical downstream.

Deliverables (when started):

- Shared adapter interface / types
- ESPN adapter wraps existing live monitor (no behavior change)
- FantasyPros mapper stub → `LockedPickInput`
- Tests: mapper shape only

### 030B-2 — FantasyPros observer prototype (solo mock)

MVP:

```
draftwizard.fantasypros.com
        ↓
content script observes Vue/DOM / ng_draftPlayer
        ↓
detect locked pick
        ↓
emit LockedPickInput
```

Avoid scraping everything; avoid reverse-engineering unused APIs; no multiplayer yet.

### 030B-3 — Multiplayer / socket investigation

Determine whether lobby/multiplayer exposes durable events with:

- draft ID
- pick number
- player ID
- team ID
- timestamp

If yes → prefer socket. If no → Vue/DOM observer remains authority.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Vue internals change | Semantic selectors/events; isolate adapter |
| Unknown multiplayer source | 030B-3 evidence before architecture commit |
