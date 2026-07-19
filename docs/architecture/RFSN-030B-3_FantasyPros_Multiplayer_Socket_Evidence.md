# RFSN-030B-3 — FantasyPros Multiplayer / Socket Evidence

**Status:** Partial complete — enough to sequence architecture; **one gap remains** (live in-draft pick wire under authenticated MUD)  
**Date:** 2026-07-19  
**Question:** What is the most reliable FantasyPros mock draft event source?

---

## Verdict (evidence hierarchy)

| Rank | Source | Finding |
| ---- | ------ | ------- |
| **Preferred (when available)** | Draft-room `syncEvent` / `draftEvent` via `ng_onSocketEvent` **plus** MUD `checkSync` → `/spaDraft` | Real pick authority exists in the Vue room handler. `syncEvent.pickLog` + `teamIds` reconstructs the full board. MUD schedules `checkSync` on the clock. |
| **Acceptable (proven today)** | Vue draft store (`window.__debugStore.draftState` / `ng_draftPlayer`) | Works for **solo** mock (`vueDraftTarget: "local"`). |
| **Last resort** | DOM MutationObserver on `.vue-draftroom-player-cell` | Not required for MVP if Vue store / sync path is used. |
| **Not a pick source** | Lobby Socket.IO (`draftlobby.fantasypros.com`) | Lobby membership / availability / status only — **no player pick payloads**. |

**Hard rule (unchanged from 030A):** Do not reuse ESPN `mDraftDetail` polling against FantasyPros.

**Do not freeze `LockedPickInput` yet** until an authenticated multiplayer session confirms the live transport that *feeds* `ng_onSocketEvent` (socket host + raw frames). Schema of the **consumer** is known; wire carrier for MUD picks is inferred, not captured live.

---

## 1. Multiplayer room creation (checklist)

| Field | Evidence |
| ----- | -------- |
| Lobby URL | `https://draftwizard.fantasypros.com/football/mock-drafts/lobby/` |
| Create private | `https://draftwizard.fantasypros.com/livemocks/edit-mud.jsp?sport=nfl` → **redirects to Sign In** |
| Join public | Click `Join` (`.js-join`, `data-did` UUID, `data-slot`) → **Account Required** signup/signin with `next=` back to lobby |
| Draft / room ID | UUID `id` on lobby rows / socket payloads (e.g. `a5498f48-a29e-419d-b360-ed26ad030539`); display title uses numeric nickname (`Standard Mock Draft 69967`) |
| Auth state | **Signed-out can browse lobby**; **must be signed in** to join public MUD or create private MUD |
| Network (lobby) | Socket.IO client → `https://draftlobby.fantasypros.com` (`EIO=3`, polling then upgrade); REST/JSONP ` /json/draftLobby?sport=nfl` (+ `action=join\|leave`) |

**Blocker for remaining wire capture:** No FantasyPros account in this automation session. Live in-draft multiplayer pick frames were not observed on the wire.

---

## 2. Socket inventory

### A) Lobby Socket.IO (observed live)

```
io('https://draftlobby.fantasypros.com', { query: { sport: 'nfl' } })
```

| Event | Role |
| ----- | ---- |
| `draftLobby` | Full lobby hydrate |
| `availableDrafts` | Available public drafts list |
| `userJoined` / `userLeft` | Seat occupancy |
| `statusUpdate` | Draft status (`mudId`, `status`, `onTheClock`, `participants`, `public`, …). Status `6` = completed |

**Sample draft object (from `availableDrafts`):**

```json
{
  "id": "a5498f48-a29e-419d-b360-ed26ad030539",
  "title": "Standard Mock Draft 69967 (10 teams)",
  "sport": "nfl",
  "scoring": "STD",
  "teamCount": 10,
  "participants": 1,
  "pickCount": 0,
  "status": 1,
  "clockTime": 30,
  "onTheClock": "Team One",
  "isPublic": true,
  "inLobby": true,
  "startTime": 1784435220214,
  "teams": [{ "id": 1, "name": "Team One" }, { "id": 2, "name": "Fred J", "participant": { "human": true } }]
}
```

**Implication:** Lobby socket is **not** the LockedPick event source.

### B) Draft-room event consumer (from `draft-room` bundle + live injection)

Globals:

- `window.ng_onSocketEvent` → `cQ(e)` (requires `e.eventType`)
- `window.skippedSocketEvents` — buffers events while `document.hidden`
- `#force-socket-event` hidden input polled every 300ms **only when** `hasSideAssistant` (Draft Assistant path)

**Handled `eventType` values:**

| eventType | Pick-relevant? | Payload notes |
| --------- | -------------- | ------------- |
| `syncEvent` | **Yes — full board** | `pickLog: number[]` (player IDs), `teamIds: number[]`, optional `bidLog`, `keepers`, `clockSeconds`, `userIsOnTheClock`, `teamIndexTheClock` / `teamOnTheClock`, `teams`, `userTeamId`, `nominee` |
| `draftEvent` | Progress signal | `totalPicks`; may trigger refresh / on-the-clock sound |
| `startEvent` | Draft start | Triggers sync refresh |
| `predraftEvent` | Lobby→draft seats | `teams[]` with join status |
| `queueEvent` | Suggestions | `currentQueue` CSV of player IDs |
| `cheatsheetEvent` / `copilotEvent` | Assistant | Not pick authority |

**Proven via synthetic `syncEvent` injection in live solo room:** board hydrated to 3 picks from `pickLog` + `teamIds`; clock set from `clockSeconds`.

**Not observed on the wire in this session:** the upstream connection that *emits* these events into `ng_onSocketEvent` during a real MUD (auth blocked). Bundle does **not** open `io(draftlobby…)` inside the draft-room app for picks.

### C) MUD durable refresh path (bundle)

When `Ms.mudId` is set:

```
yu() → Eu({ cmd: "checkSync", socketEvent }) → /spaDraft
_u() schedules next check from clockExpires
```

So multiplayer authority is likely **hybrid**: socket nudge (`draftEvent` / `syncEvent`) + **`checkSync` hydrate**. That is closer to ESPN poll durability than solo Vue.

---

## 3. Vue state inspection (solo live room)

| Item | Evidence |
| ---- | -------- |
| Root | `#vue-draft-room-app` / `.vue-draft-room-app` |
| Debug store | `window.__debugStore = { draftState: Cs, uiState: Bs, config: Ms }` |
| Pick list | `Cs.draftedPlayers[]` → `{ id, pick, round, posInRound, owner, ownerPos, isUserTeam }` |
| Clock / turn | `Cs.overallPick`, `Cs.onTheClock`, `Cs.userIsOnTheClock`, `Cs.clockExpires` |
| Local pick API | `ng_draftPlayer({ player })` → internal engine |
| Mode flags (solo) | `isMultiUserDraft: false`, `vueDraftTarget: "local"`, `isLoggedOut: true` |
| Bundle | `https://dwcdnstatic.fantasypros.com/assets/js/min/pages/draft-room/bundle-2876d43d047dbcd0bb91.js` |

Equivalent of ESPN diff:

```
ng_draftPlayer / AI fill
        ↓
Cs.draftedPlayers mutation
        ↓
board update
```

---

## 4. Stability test (solo reload)

| Before reload | After reload of `/live/` |
| ------------- | ------------------------ |
| `draftedPlayers.length = 23`, `overallPick = 24` | `drafted = 0`, `overallPick = 1` (clock `Pick 1.01`) |
| No socket resources | Still none |
| — | One `/spaDraft` resource entry |

**Durability (solo mock):** **D) client memory only** (session not restored on bare `/live/` reload). Not A/B/C in this path.

**Implication for connector:** Solo MVP must observe **in-page state/events** continuously; cannot rely on reload-safe polling alone. MUD/`checkSync` is the durability path to validate next under auth.

---

## Architecture implication (do not start 030B-1 freeze yet)

```
Lobby Socket.IO  ──► seats / status only
                         │
                         ▼  (auth required)
              MUD draft room (mudId)
                │              │
                │              ├── checkSync → /spaDraft   (durable hydrate)
                │              └── ng_onSocketEvent
                │                     syncEvent.pickLog + teamIds
                │                     draftEvent.totalPicks
                ▼
         map → LockedPickInput   ← freeze fields after live MUD wire capture
                ▼
         notifyLockedPick / Draft Intelligence

Solo mock (today):
  Vue local store / ng_draftPlayer  → same LockedPickInput mapper
```

**Recommended next evidence step (closes 030B-3):** Sign in → join or create MUD → capture:

1. WebSocket / Socket.IO URL(s) on the **live room** (not only lobby)
2. Raw frames that become `syncEvent` / `draftEvent`
3. Whether `checkSync` responses alone are sufficient without socket

Until then: treat **Vue store observer** as the shippable solo path; treat **`syncEvent.pickLog` shape** as the target multiplayer mapper input; keep adapter types provisional.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Vue internals change | Prefer `__debugStore.draftState.draftedPlayers` + `ng_draftPlayer` hooks over DOM |
| MUD wire unknown | One authenticated capture session before freezing types |
| Lobby socket mistaken for picks | Documented — do not map `availableDrafts` to LockedPick |

---

## Non-goals completed / not started

- No FantasyPros connector code
- No `LockedPickInput` type freeze
- No ESPN poller reuse
