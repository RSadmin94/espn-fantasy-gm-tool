# RFSN-030B-3 — Draft-Room Transport into `ng_onSocketEvent`

**Status:** Architecture note (docs only) — authenticated in-draft wire frames still blocked by FantasyPros sign-in  
**Date:** 2026-07-19  
**Scope:** How pick/sync events reach the Vue draft room, especially `syncEvent.pickLog` and `draftEvent`  
**Related:** `RFSN-030B-3_FantasyPros_Multiplayer_Socket_Evidence.md`, `RFSN-030A_…Discovery.md`

---

## One-sentence verdict

**Multiplayer pick durability is primarily `/spaDraft` `checkSync` (`e.picks[]`), while `ng_onSocketEvent` is a secondary inbound bridge** (Assistant / Extension / nudged refresh) whose richest pick payload is `syncEvent.pickLog` + `teamIds`. Lobby Socket.IO is not that bridge.

---

## Auth gate (this session)

| Attempt | Result |
| ------- | ------ |
| Lobby browse | Works signed-out; Socket.IO → `https://draftlobby.fantasypros.com` |
| Join public MUD | Redirects to Sign Up / Sign In |
| `…/live/?mudId=…` | Redirects to `fantasypros.com/accounts/signin/` |
| Session | **No FantasyPros account** in automation browser |

Therefore: **no live authenticated MUD WebSocket frames** were captured. Schemas below are from the draft-room bundle (`bundle-2876d43d047dbcd0bb91.js`) + synthetic/`checkSync` path analysis + prior solo injection.

---

## Transport map (draft room)

```
┌─────────────────────────────────────────────────────────────────┐
│ LOBBY (signed-out OK)                                           │
│  io('https://draftlobby.fantasypros.com')                       │
│  events: draftLobby | availableDrafts | userJoined |            │
│          userLeft | statusUpdate                                  │
│  → seats / lobby status ONLY — not LockedPick                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ DRAFT ROOM (Vue)  window.ng_onSocketEvent = uQ → cQ(e)          │
│                                                                 │
│  INBOUND feeders into ng_onSocketEvent (found in bundle):       │
│  1) #force-socket-event  (hasSideAssistant only)                │
│       poll 300ms → JSON.parse → ng_onSocketEvent(payload)       │
│  2) skippedSocketEvents replay on visibilitychange              │
│  3) (external) callers expected to invoke ng_onSocketEvent      │
│       — Vue bundle has NO socket.on('draftEvent'|'syncEvent')   │
│                                                                 │
│  OUTBOUND via window.socket.emit (when socket exists):          │
│  • cheatsheetEvent / copilotEvent                               │
│  • MUD post-/spaDraft: draftEvent | predraftEvent               │
│                                                                 │
│  MUD PICK AUTHORITY (durable):                                  │
│  yu() → Eu({ cmd:'checkSync', socketEvent }) → POST /spaDraft   │
│       → response.picks[] applied to Cs.draftedPlayers           │
│       → clock-scheduled _u() while mudId set                    │
└─────────────────────────────────────────────────────────────────┘
```

**Hard implication for RFSN:** Do not treat lobby Socket.IO as the pick bus. For FantasyPros multiplayer, prefer observing **`/spaDraft` checkSync `picks`** and/or **`ng_onSocketEvent` `syncEvent.pickLog`** once the live feeder is confirmed under auth.

---

## `ng_onSocketEvent` consumer contract (`cQ`)

Requires `e.eventType`. Handled types:

| `eventType` | Role | Pick payload |
| ----------- | ---- | ------------ |
| **`syncEvent`** | Full board hydrate (Extension / Side Assistant path; `extensionDetected=true`) | **`pickLog: number[]`** (player IDs) + **`teamIds: number[]`**, optional `bidLog`, `keepers`, `clockSeconds`, `userIsOnTheClock` / `teamIndexTheClock` / `teamOnTheClock`, `teams`, `userTeamId`, `nominee`, `completed` |
| **`draftEvent`** | Progress nudge | **`totalPicks: number`** — if ≠ `Cs.draftedPlayers.length`, calls `yu(true, 'draftEvent')` → **checkSync**; may fire on-the-clock sound |
| `startEvent` | Draft start | Triggers `yu(true)` + sound |
| `predraftEvent` | Waiting room seats | `teams[]` status/name |
| `queueEvent` | Suggestions | `currentQueue` CSV of player IDs |
| `cheatsheetEvent` / `copilotEvent` | Assistant chrome | Not pick authority |

### `syncEvent.pickLog` mapper (evidence)

Parallel arrays → `Cs.draftedPlayers[]` entries:

```ts
// Conceptual — from bundle mapper inside syncEvent branch
{
  id: pickLog[i],           // FantasyPros player id
  pick: i + 1,              // overall pick number
  round, posInRound,        // from draftOrder[i] when present
  owner, ownerPos,          // from teamIds[i] → teams[]
  isUserTeam,
  bid?, isKeeper?
}
```

Then: `Eu({ cmd: "crossNG", cancelPreviousTask: true })`.

**Synthetic injection (prior 030B-3 session, solo room):** `syncEvent` with `pickLog` + `teamIds` hydrated three board cells and applied `clockSeconds`.

### `draftEvent` payload (inbound consumer)

Minimum field used by consumer:

```json
{ "eventType": "draftEvent", "totalPicks": 17 }
```

Side effects: refresh via `checkSync` when count diverges; optional on-the-clock cue.

### `draftEvent` payload (outbound emit after MUD `/spaDraft`)

From client `socketEvents` builder (not the `eventType` wrapper):

```json
{
  "cmd": "revert",
  "pick": -1,
  "totalPicks": 12,
  "teamId": 0
}
```

Emitted as: `window.socket.emit("draftEvent", data)` (no `eventType` envelope on the wire for outbound).

**Inbound vs outbound shape mismatch:** Wire emit uses `{cmd, pick, totalPicks, teamId}`; Vue consumer expects `{eventType:'draftEvent', totalPicks}`. Something outside the Vue bundle (or a server→client transform) must adapt inbound frames into the `eventType` envelope before `ng_onSocketEvent`. **That adapter was not observed live (auth blocked).**

---

## MUD durable path: `/spaDraft` `checkSync` `picks[]`

When `Ms.mudId` is set:

1. `yu(force, socketEventName)` → `Eu({ cmd: "checkSync", preventScroll: true, socketEvent })`
2. POST `Ms.ajaxUrl + Ms.url` (typically `/spaDraft`)
3. Response handling (mud/assistant):
   - `Cs.draftedPlayers = e.picks || []`
   - rebuilds `takenPlayerIds` / `userPicks` from each pick’s `id`, `isUserTeam`, `isKeeper`, `bid`, `owner`
4. If `mudId && socketEvent && e.picks.length === draftedPlayers.length` → early return (no UI churn)
5. `_u()` reschedules next sync from `clockExpires`

**This is the strongest multiplayer pick source evidenced without auth** — closer to ESPN poll durability than solo Vue memory.

---

## What feeds `ng_onSocketEvent` (ranked confidence)

| Feeder | Confidence | Notes |
| ------ | ---------- | ----- |
| `#force-socket-event` → JSON → `ng_onSocketEvent` | **High** (in bundle) | Side Assistant only |
| Visibility replay of `skippedSocketEvents` | **High** | Same consumer |
| External Extension / host writing force-socket or calling `ng_onSocketEvent` | **High** (design of API) | Explains `syncEvent` + `extensionDetected` |
| Inbound Socket.IO `draftEvent`/`syncEvent` → adapter → `ng_onSocketEvent` | **Medium** (inferred) | Outbound emits exist; **no `socket.on` in Vue bundle**; adapter not captured live |
| Lobby `draftlobby` events | **None for picks** | Lobby-only |

---

## Architecture recommendation (still provisional on live MUD frames)

```
Preferred multiplayer LockedPick source:
  /spaDraft checkSync → picks[]  (id, pick order, ownerPos, …)

Secondary / Assistant-compatible:
  ng_onSocketEvent(syncEvent) → pickLog[] + teamIds[]

Progress hint only:
  ng_onSocketEvent(draftEvent) → totalPicks → triggers checkSync

Solo mock (unchanged from 030A):
  __debugStore.draftState.draftedPlayers / ng_draftPlayer
```

**Do not freeze `LockedPickInput` field names** until one authenticated MUD session captures:

1. Who assigns `window.socket` in the live MUD room (URI / handshake)
2. Raw inbound frames that become `eventType: 'syncEvent' | 'draftEvent'`
3. Whether `checkSync` alone is sufficient without any inbound socket

---

## Still open (blocks 030B-3 “complete”)

- [ ] Sign in to FantasyPros
- [ ] Join or create MUD → enter live room with `mudId`
- [ ] Log `window.socket.io.uri`, `socket.on` any event
- [ ] Capture at least one inbound `syncEvent` / `draftEvent` (or prove only `checkSync` moves picks)
- [ ] Diff `spaDraft` checkSync JSON vs `syncEvent.pickLog` for the same pick

Until then: consumer schemas above are **implementation truth**; **live feeder identity remains inferred**.

---

## Non-goals of this note

- No RFSN connector code
- No extension implementation
- No `LockedPickInput` freeze
