# RFSN-030C — FantasyPros Solo Mock Connector

**Status:** Implemented on `feature/rfsn-030c-fantasypros-solo-mock-connector`  
**Date:** 2026-07-19  
**Scope:** Solo mock only (`vueDraftTarget === "local"`, `isMultiUserDraft === false`). Multiplayer/MUD deferred.

---

## Hard rules

1. Do **not** reuse ESPN `mDraftDetail`.
2. Solo FantasyPros picks come from Vue `__debugStore.draftState.draftedPlayers`.
3. All providers normalize to `LockedPickInput` → `rfsnBroadcast.notifyLockedPick`.
4. Live-only services require an active surface/session gate (sticky toggle ≠ active surface).
5. FantasyPros IDs are **provider** IDs, not assumed ESPN IDs.
6. DOM observation is fallback only (not primary).
7. Multiplayer/MUD is separate future work.

---

## Architecture

```text
FantasyPros page (page-world observer)
    → sanitized window.postMessage
    → isolated content script
    → extension background relay
    → FFR gmwarroom-bridge
    → useFantasyProsMockDraftMonitor
    → mapFantasyProsDraftedPick (shared)
    → notifyLockedPick
    → DraftMoment → scheduleLiveBroadcast → booth / commentary / voice
```

No parallel FantasyPros commentary pipeline. No FantasyPros-specific DraftMoment model. No ESPN adapter reuse.

---

## Event source

| Item | Detail |
| ---- | ------ |
| Primary | Growth of `__debugStore.draftState.draftedPlayers` |
| Room gate | `vueDraftTarget === "local"`, `isMultiUserDraft === false` |
| Session id | `fp-mock-{mockDraftKey|dcId|generated}` |
| Dedupe | `draftSessionId + overallPick + providerPlayerId` |
| Keepers | Detected via `isKeeper`; excluded from notify (War Room policy) |
| Baseline | On arm/reconnect, existing picks are baselined — **not** replayed |

---

## Extension layout

```text
chrome-extension/
  manifest.json                    # host: draftwizard.fantasypros.com
  providers/fantasypros/
    page-observer.js               # page world; reads __debugStore
    content.js                     # validates + relays
  background.js                    # ARM/DISARM/PICK_BATCH → FFR tabs
  gmwarroom-bridge.js              # FFR page ↔ background
```

Provider selection is **host-based**. ESPN poller unchanged.

---

## Field mapping

| LockedPick / metadata | FantasyPros |
| --------------------- | ----------- |
| overallPick | `draftedPlayers[].pick` |
| round | `round` |
| roundPick | `posInRound` |
| teamId | FFR teamId when seat mapped; else `String(ownerPos)` |
| ownerName | Mapped FFR owner or safe fallback |
| playerId | Canonical ESPN id if joined; else FP id |
| providerPlayerId | `String(id)` |
| playerName / position / nflTeam / adp | `playerMap[id]` |
| keeper | `isKeeper` |

Identity join: normalized name + NFL team + position. Missing join → still notify with `identityConfidence` metadata; avoid owner-history claims when seat mapping unconfirmed.

---

## Session lifecycle (FFR)

1. User on **Mock Draft** selects league/season (already in War Room context).
2. **Start FantasyPros Mock Commentary** → arms extension; Live Draft ESPN path stays off.
3. Open FantasyPros live solo mock; observer baselines then emits new picks.
4. Booth polls `getLiveSnapshot` for `fp-mock-*` draft id (Mock surface gate).
5. **Stop** disarms observer, stops booth for FP session, clears audio pause state.
6. **New Draft** resets RFSN live session + forces new FP session key / clears dedupe.
7. Navigating to **Live Draft** forces FP session off (no sticky leak).

Session mode enum (client):

- `LIVE_CONNECTED_LEAGUE`
- `IN_APP_SIMULATION`
- `FANTASYPROS_SIMULATION`

---

## Security boundary

- Page world never receives FFR auth tokens.
- Bridge accepts only `provider: "fantasypros"` sanitized pick/session payloads.
- Background relays to FFR origins only.
- Malformed / wrong-provider / empty batches rejected.
- No full Vue store dumps across the bridge.

---

## Limitations

- Solo mock only; MUD/socket path deferred (see RFSN-030B-3).
- FantasyPros refresh may wipe client-local draft; connector rebaselines.
- Vue `__debugStore` shape may change — isolate adapter; fail visibly with backoff.
- Seat mapping is user-confirmed for the user’s seat; other seats follow draft order heuristics.
- Extension must be reloaded to pick up v1.10+ FantasyPros hosts.

---

## Test evidence

| Suite | Coverage |
| ----- | -------- |
| `shared/fantasyProsMockDraftMonitor.test.ts` | Adapter + observer diff + 23-pick rapid |
| `client/.../fantasyProsMockBridge.test.ts` | Bridge accept/reject |
| `client/.../fantasyProsMockSession.test.ts` | Surface gates / ESPN off |
| `client/.../fantasyProsMockIntegration.test.ts` | Simulated E2E notify once |

Regression: RFSN-030 Live→Mock ESPN/booth gates remain; Mock does not arm ESPN; FP stop clears booth gate when inactive.
