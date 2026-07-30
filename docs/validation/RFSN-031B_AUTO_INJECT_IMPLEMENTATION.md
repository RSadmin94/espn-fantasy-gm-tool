# RFSN-031B — Production ESPN Auto-Injection

**Ticket:** RFSN-031B  
**Branch:** `fix/rfsn-production-recovery`  
**Date:** 2026-07-30  
**Status:** **PARTIAL — IMPLEMENTED, LIVE GATE BLOCKED**  
**031A decision:** PASS / GO (closed)  
**Parser relocation:** not required / not performed  

---

## Implementation summary

Production **Rivals Live Draft Connector** auto-injection ships behind a kill switch (default **off**):

1. Extension detects a supported ESPN live draft room URL.
2. If the feature flag is enabled, injects the bundled dormant reader **once** (WAR + page `<script>`).
3. Reader reports READY / handshake; **no PICK_BATCH until valid ARM**.
4. Rivals remains session authority (`isLiveDraftSurfaceActive`, session nonce, destination `live-draft`).
5. Existing PICK_BATCH transport, ingest, replay, and board path are unchanged.

Manual connector path remains available under **Advanced Troubleshooting**.

---

## Architecture

```text
ESPN live draft tab
  → espn-live content (isolated) — URL match + flag gate + inject once
  → espn-live-reader.iife.js (MAIN) — preferPopup:false bootstrap + publisher
  → READY (dormant)
  → Rivals Live Draft ON + getAccess.espnAutoInjectEnabled
  → SET_AUTO_INJECT / ARM (league, season, nonce, destination)
  → capture → existing GMWR_ESPN_BM_* transport → ingest → board
```

Rivals owns session. Injection ≠ capture.

---

## Changed files (031B)

| Path | Why |
|------|-----|
| `chrome-extension/espnLiveDraftRoom.js` (+test) | Narrow live-draft URL classifier |
| `chrome-extension/espnAutoInject.js` (+test) | Flag helpers, inject plan, telemetry names, version gate |
| `chrome-extension/providers/espn-live/content.js` (+bundle) | Production inject; spike stays disabled |
| `chrome-extension/providers/espn-live/espn-live-reader.iife.js` | Bundled dormant reader |
| `chrome-extension/manifest.json` / `package.json` | WAR + v1.14.0 |
| `chrome-extension/background.js` | SET_AUTO_INJECT, availability, telemetry, diagnostics |
| `chrome-extension/gmwarroom-bridge.js` | Forward SET_AUTO_INJECT + availability |
| `chrome-extension/espnBookmarkletTransport.js` | `destination` on ARM; new message types |
| `chrome-extension/popup.html` / `popup.js` | Advanced Troubleshooting diagnostics + local override |
| `standalone/.../autoInjectEntry.ts` + `build-auto-inject.mjs` | Dormant bootstrap entry |
| `standalone/.../espnBookmarkletPublisher.ts` (+tests) | Destination, league mismatch, readerVersion on STATUS |
| `server/services/sofia/liveBroadcastFeature.ts` | `RFSN_ESPN_AUTO_INJECT_ENABLED` |
| `server/rfsnBroadcastRouter.ts` | `getAccess.espnAutoInjectEnabled` |
| `client/src/lib/espnLiveConnectorUx.ts` (+test) | Customer match phases + diagnostics model |
| `client/src/lib/espnBookmarkletBridge.ts` | destination + `postEspnAutoInjectEnabled` |
| `client/src/hooks/useEspnBookmarkletDraftMonitor.ts` | Push flag, availability UX, destination ARM |
| `client/src/lib/liveDraftUx.ts` (+test) | Customer connector terminology |
| `docs/validation/RFSN-031B_AUTO_INJECT_IMPLEMENTATION.md` | This doc |
| `docs/DECISION_LOG.md` | 031B entry |
| `chrome-extension/rfsn031aAutoInjectSpike.test.js` | Closed spike asserts production WAR |

Frozen: `espnAdapter` DOM parsing, normalize, protocol semantics, replay/dedupe, board grading, RFSN, FantasyPros reader.

---

## URL match rules

**Supported (`live_draft_room`):**

- `https://fantasy.espn.com/football/draft?leagueId=…`
- `https://fantasy.espn.com/football/league/draft?leagueId=…`
- `https://fantasy.espn.com/ffl/draft?leagueId=…`
- League home with `[?&]draft=` query (SPA redirect)

**Not injected:**

- `draftrecap` → `draft_recap`
- League / team home without draft → `league_home`
- History → `historical`
- Other ESPN / non-ESPN → `unsupported`

---

## Feature flag

| Field | Value |
|-------|--------|
| **Name** | `RFSN_ESPN_AUTO_INJECT_ENABLED` (server env) |
| **Default** | `false` / unset → disabled |
| **Read** | `isEspnAutoInjectEnabled()` → `rfsnBroadcast.getAccess.espnAutoInjectEnabled` |
| **Extension** | Rivals pushes `GMWR_ESPN_BM_SET_AUTO_INJECT`; storage key `rfsnEspnAutoInjectEnabled` |
| **Local override** | Popup → Advanced Troubleshooting checkbox |
| **Remote disable** | Set env to not `"true"` (or remove); Live Draft pushes `enabled:false` |
| **UI when disabled** | “Waiting for your ESPN draft room” + Advanced Troubleshooting note; manual path remains |

---

## Lifecycle states

`not_present` → `injecting` → `reader_ready` → `armed` → `capturing` → (`complete` \| `disconnected` \| `error`)

Idempotent: compatible `__RFSN_ESPN_LIVE_READER__` handshake prevents re-inject across poll/SW wake.

---

## Compatibility handshake

| Field | Value |
|-------|--------|
| `readerVersion` | `1.0.0` |
| `protocolVersion` | `1` (`ESPN_BM_PROTOCOL_VERSION`) |
| `extensionVersion` | manifest `1.14.0` |
| `supportedCapabilities` | `pick_batch`, `replay`, `dormant_until_arm` |
| ARM destination | `live-draft` (required; defaults for legacy tests) |

Incompatible → customer copy: **Live Draft Connector update required**.

---

## Diagnostics (Advanced Troubleshooting)

extension version, reader version, protocol version, detected URL type, ESPN league ID, Rivals league ID, session nonce **suffix**, lifecycle, ARM state, last heartbeat, last batch revision, last successful pick, last replay, last error, feature-flag state. No cookies/credentials/full nonce.

---

## Telemetry (event-only)

`draft_room_detected`, `injection_attempted/succeeded/failed`, `reader_ready`, `reader_duplicate_prevented`, `league_matched/mismatched`, `arm_sent/accepted/rejected`, `first_batch_received`, `reconnect_*`, `replay_*`, `capture_completed` — logged via `GMWR_ESPN_BM_TELEMETRY` / console `[rfsn-031b-telemetry]`.

---

## Tests run

```text
npx vitest run chrome-extension/espnLiveDraftRoom.test.js chrome-extension/espnAutoInject.test.js chrome-extension/rfsn031aAutoInjectSpike.test.js chrome-extension/espnBookmarkletTransport.test.js chrome-extension/espnBookmarkletTransport.integration.test.js chrome-extension/espnBookmarkletArmHandoff.test.js client/src/lib/espnLiveConnectorUx.test.ts client/src/lib/espnBookmarkletIngest.test.ts client/src/lib/espnBookmarkletBridge.test.ts client/src/lib/liveDraftUx.test.ts standalone/draft-board-monitor/tests/espnBookmarkletPublisher.test.ts
→ 112 passed

npx vitest run standalone/draft-board-monitor/tests
→ 55 passed

npm run check  → tsc --noEmit OK
npm run build  → production build OK
cd chrome-extension && npm run build → OK
```

---

## Live validation evidence

**BLOCKED** — no operator-controlled ESPN live draft room in this session.

Operator checklist (required before PASS):

1. Open supported ESPN live draft room  
2. Extension detects room  
3. Reader injects exactly once (`RFSN_ESPN_AUTO_INJECT_ENABLED=true` + Live Draft on)  
4. Reader READY  
5. No pick before ARM  
6. League match  
7. Session create/restore  
8. ARM accepted  
9. Existing picks reconciled  
10. New live pick → transport  
11. Rivals board updates  
12. ESPN tab reload recovers  
13. Rivals reload → replay recovers  
14. No duplicate reader  
15. No duplicate pick  
16. Flag off → no auto-inject; manual Advanced path still works  

---

## Known limitations

- Live gate not executed.
- Multiple Rivals Live Draft tabs: still rely on existing surface gate; ambiguity UX covers multiple ESPN rooms.
- Full telemetry → analytics backend not wired (event log + console only).
- Board Mirror WIP in working tree is **out of scope** for 031B commits.

---

## Rollback procedure

1. Set `RFSN_ESPN_AUTO_INJECT_ENABLED` ≠ `true` (or unset).  
2. Or uncheck Advanced Troubleshooting auto-connect / send `SET_AUTO_INJECT enabled:false`.  
3. Reload extension; manual reader path remains.  
4. Optional: revert 031B commits on `fix/rfsn-production-recovery`.

---

## Production enablement checklist

- [ ] Live operator checklist 1–16 PASS  
- [ ] Preview deploy with flag **off**, then enable for internal accounts  
- [ ] Confirm kill switch disables inject without broken intermediate UI  
- [ ] Extension 1.14.0 packaged (Web Store **not** part of 031B unless separately authorized)  
- [ ] Decision log updated with live PASS + release decision  

---

## Release recommendation

**not ready for preview** as fully validated Live Draft Connector — implementation + static validation only. After live gate: **ready for preview** with flag default off.
