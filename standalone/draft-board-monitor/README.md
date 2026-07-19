# Standalone Dual-Source Draft Board Monitor

**Status:** Implementation complete — live FantasyPros + ESPN manual validation still required  
**Scope:** Read / reconstruct / display only. No Rivals backend, no `notifyLockedPick`, no War Room changes.

## Architecture

```text
FantasyPros Adapter (__debugStore.draftState)
        \
         → NormalizedDraftSnapshot → Shared Board Renderer
        /
ESPN Adapter (Pick History DOM in active draft tab)
```

## Proven sources reused

| Source | Reused from | Notes |
|---|---|---|
| FantasyPros | `chrome-extension/providers/fantasypros/page-observer.js` + `shared/fantasyProsMockDraftMonitor.ts` | `__debugStore.draftState.draftedPlayers` |
| ESPN live DOM | **Not found in repo** (`.draft-columns` Board Monitor absent) | New adapter encodes brief’s lessons; historical recap scrape is separate |

## Layout

```text
standalone/draft-board-monitor/
  src/draft-monitor/
    adapters/fantasyProsAdapter.ts
    adapters/espnAdapter.ts
    normalize/{draftTypes,eventKey,pickOwnership,mergeSnapshot}.ts
    board/{DraftBoardMonitor,renderBoard,boardStyles}.ts
    runtime/{detectSource,monitorController}.ts
  tests/draftBoardMonitor.test.ts
  scripts/build.mjs
  install.html
  MANUAL_VALIDATION.md
```

## Build & run

```bash
node standalone/draft-board-monitor/scripts/build.mjs
npx vitest run standalone/draft-board-monitor/tests/draftBoardMonitor.test.ts
```

Then follow `install.html` (console-paste into the draft tab).

## Out of scope

- Rivals integration / session projector
- Announcers, grades, wrap-up feed
- Excel / WebSocket outbound
- Production deploy
