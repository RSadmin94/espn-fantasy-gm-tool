# RFSN-030A — FantasyPros Mock Draft Connector Discovery

**Status:** Complete — merged to `fix/rfsn-production-recovery` (`52df22f` / `a9aa407`)  
**Date:** 2026-07-19  
**Follow-on:** RFSN-030B (planning only; **030B-3 evidence before 030B-1 freeze**). Do not reuse ESPN poller. See `RFSN-030B-3_FantasyPros_Multiplayer_Socket_Evidence.md`.

---

## Summary verdict

| Question | Finding |
| -------- | ------- |
| Network pick source? | **Mostly client-side Vue state** for FP Mock Simulator. Initial/state hydrate via `POST/GET /spaDraft`. Individual mock picks did **not** hit a durable pick API in this session. |
| DOM structure? | Vue 3 SPA under `.vue-draft-room-app` with player cells / draft board. |
| Pick event source? | In-page `ng_draftPlayer({ player })` → internal Vue draft engine; socket hooks exist for sync/assistant modes. |
| Auth required? | **Not for free mock start** — settings → live room worked signed-out. Premium settings/features locked without account. |
| Can current extension switch providers? | **No.** Extension is ESPN-only (cookies + `mDraftDetail` JSON). No FantasyPros hosts/content scripts. |

**Implication:** FantasyPros Mock is a **different adapter class** than ESPN Live. Do not bolt FP mock onto the ESPN poller. Treat as a new source behind the existing `notifyLockedPick` booth contract (same pattern as connected-league vs manual).

---

## 1. FantasyPros draft surfaces (distinct products)

| Surface | URL pattern | Role |
| ------- | ----------- | ---- |
| Mock settings | `/football/mock-draft-simulator/settings/` | Config form → POST `action=startMock` |
| Mock live room | `/football/mock-draft-simulator/live/` | Vue draft room (inspected) |
| Mock lobby / assistant | Draft Wizard nav | Multiplayer / host sync (not fully exercised) |
| Public API | `api.fantasypros.com` | Rankings/projections/ADP — **no live draft pick stream** |

FantasyPros’ own **Draft Assistant w/ Sync** connects *outbound* to ESPN/Yahoo/etc. (often via **their** Chrome extension for ESPN). That is the inverse of what we need (we want picks **into** RFSN).

---

## 2. Network calls (observed)

### Settings → start
- Form `POST` → `/football/mock-draft-simulator/live/`
- Hidden fields include: `leagueType`, `scoringSystem`, `draftType`, `oppPickLogic`, `teamCount`, `userPos`, `pickClock`, `positions`, `draftAgainst`, `action=startMock`, `sport=nfl`

### Live room
| Endpoint | Role |
| -------- | ---- |
| `/spaDraft` | Primary draft-room state hydrate (`config.url = "/spaDraft"`). Returns `pick`, `picks[]`, `draftOrder`, `teams`, `onTheClock`, suggestions, etc. |
| `/json/getCheatSheet` | Cheat sheet payload |
| `/comparePlayers` | Compare / advice |
| `draft-room/bundle-*.js` | Vue room bundle (`dwcdnstatic.fantasypros.com`) |

### Pick execution (this session)
After `ng_draftPlayer({ player: 19202 })`:
- UI advanced (e.g. clock moved past 1.01 → later overall picks; board showed Gibbs at 1.01).
- **No WebSocket open observed.**
- **No pick-specific REST POST observed** — mock AI fills appear **local to the Vue app**.
- Re-fetching `/spaDraft` without the room’s session body returned empty `picks[]` / `pick: 0` — state is **not** a simple public poll like ESPN `mDraftDetail`.

### Socket hooks (present, unused in solo mock)
Globals: `ng_onSocketEvent`, `skippedSocketEvents`. Likely used for lobby / assistant / multiplayer sync — **confirm in 030B** with Mock Draft Lobby or Draft Assistant Sync, not solo simulator.

---

## 3. DOM structure (live mock room)

Root / chrome:
- `.vue-draft-room-app`
- Tabs: Suggestions / Cheat Sheets / **Draft Board** / Rankings / Teams / Queue
- Clock copy: `Pick 1.01 (1 Overall)`, later `Pick 2.12 (24 Overall)`

Player list cells:
- `.vue-draftroom-player-cell`
- Name: `.vue-draftroom-player-cell__name`
- Position/team: `.vue-draftroom-player-cell__details`
- Action: primary **Draft** buttons (`.vue-top-suggestion__draft-btn` / cell draft buttons)

Globals of interest:
- `window.draftRoomData` — config, `playerData`, maps (not the live pick list)
- `window.ng_draftPlayer` — `{ player, draftTarget?, draftSource? }`
- `window.__VUE__` / Vue 3 app

**Reliable connector strategy for FP Mock (solo):** content-script observe Vue state **or** MutationObserver on Draft Board + intercept `ng_draftPlayer` / board updates — not ESPN-style JSON polling alone.

---

## 4. Authentication

| Mode | Result |
| ---- | ------ |
| Signed out | Settings + free Basic/Standard/Snake mock **works** |
| Premium locks | Custom scoring, salary cap, advanced opp logic, keepers require upgrade |
| Account prompts | Sign-in sidebar present; not blocking free mock start |
| Session | Cookie/session used by `/spaDraft`; not equivalent to ESPN `SWID`/`espn_s2` |

No FantasyPros public API key unlocks live mock pick streams (API is rankings/news/projections).

---

## 5. Current extension — provider switching?

### Today (`chrome-extension/`)
- Name: **GM War Room — ESPN**
- Hosts: ESPN + FFR/War Room only
- Content script: **FFR origins only** (bridge) — **not** ESPN draft room, **not** FantasyPros
- Live path: War Room page → bridge → background → ESPN `mDraftDetail` poll
- Product seam: `connected-league` \| `manual` (ESPN adapter renamed; still ESPN-only)

### Can it “switch” to FantasyPros without new work?
**No.**

| Capability | ESPN Live (today) | FP Mock (needed) |
| ---------- | ----------------- | ---------------- |
| Host permissions | ESPN | Need `draftwizard.fantasypros.com` / `*.fantasypros.com` |
| Content script on draft host | No (poll API) | **Likely yes** (Vue/DOM/hooks) |
| Pick detection | Diff `mDraftDetail.picks` | Intercept room state / DOM / `ng_draftPlayer` |
| Auth | ESPN cookies | FP session optional for free mock |
| Booth contract | `notifyLockedPick` | Reuse |

---

## 6. Recommended architecture (next tickets)

```
RFSN booth (notifyLockedPick)   ← unchanged
        ↑
  LiveDraftSource adapters
        ├── connected-league (ESPN mDraftDetail)     ← exists
        ├── manual / in-app mock                    ← exists
        └── fantasypros-mock (NEW)                  ← 030B+
              content script on draftwizard.*
              OR page hook → postMessage → War Room
```

**Do not:**
- Reuse ESPN poller against FantasyPros URLs
- Treat public FantasyPros API as a live draft feed
- Expand the current extension “blindly” without a provider interface

**030B candidates:**
1. Confirm whether Mock Lobby / multiplayer uses WebSockets (`ng_onSocketEvent`) and capture message schema.
2. Define `FantasyProsMockLockedPick` → map to `LockedPickInput`.
3. Extension MVP: content script on `draftwizard.fantasypros.com/*/live/` observing board + `ng_draftPlayer`.
4. Product: Mock Draft source picker (RFSN-028 ownership: Mock under Draft, not RFSN Live Draft).

---

## 7. Evidence collected

- Live browser session: settings → live mock (signed out), drafted Jahmyr Gibbs via `ng_draftPlayer`, Draft Board showed 1.01 Gibbs, clock advanced through AI fills.
- Network hooks: spaDraft/comparePlayers/cheatSheet; no WS; no pick POST on solo mock.
- Codebase: `espnLiveDraftFetch.ts`, `useEspnLiveDraftMonitor.ts`, `liveDraftConnectedLeague.ts`, `chrome-extension/manifest.json`.

---

## Explicit non-goals of 030A

- No FantasyPros connector implementation
- No extension permission expansion yet
- No product nav / Mock Draft UI changes
- No changes to ESPN live pipeline
