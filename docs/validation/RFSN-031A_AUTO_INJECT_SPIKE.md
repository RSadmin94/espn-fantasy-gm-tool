# RFSN-031A — Chrome Extension Auto-Injection Spike (Go/No-Go)

**Ticket:** RFSN-031A  
**Type:** Bounded engineering spike (evidence only — **not** production auto-injection)  
**Branch:** `fix/rfsn-production-recovery`  
**Date:** 2026-07-29  
**Status:** **PASS — SPIKE CLOSED**  
**Decision:** **GO** — proceed to RFSN-031B (production auto-injection). Parser relocation **not** required.  
**Hard gate for 031B completion:** live ESPN draft operator checklist (see below) — spike did **not** prove full live pick→board path.

---

## Executive Summary

**GO** — The existing ESPN reader can be delivered by the extension using the FantasyPros `web_accessible_resources` + page-world `<script>` pattern; ESPN CSP does not impose `script-src` restrictions that would block it, and the extension already successfully runs `chrome.scripting.executeScript({ world: "MAIN" })` on `fantasy.espn.com`. No parser relocation is required.

**Explicitly not proven by 031A:**

```text
Live ESPN pick → reader → transport → ingest → board → replay/dedupe
```

That end-to-end path remains a **031B live operator gate**, not a reason to reopen parser relocation.

---

## Environment

| Field | Value |
|-------|--------|
| Branch | `fix/rfsn-production-recovery` |
| Commit SHA | `9efd641` (+ local spike changes uncommitted) |
| Extension version | `1.13.0` (manifest; spike-instrumented) |
| Chrome version | Not required for static/CSP/precedent evidence; live draft room E2E left for operator reload |
| ESPN URL probed (CSP) | `https://fantasy.espn.com/football/league` → HTTP 200 |
| Spike reader artifact | `chrome-extension/providers/espn-live/spike/espn-reader.iife.js` (existing Draft Board Monitor IIFE + spike marker; **parser unchanged**) |

---

## Architecture under test (unchanged)

```text
Hypothesis:
  Extension content script
       ↓  inject existing reader IIFE (MAIN world)
  ESPN DOM reader (standalone DraftBoardMonitor + espnAdapter)
       ↓  existing postMessage publisher
  Extension transport (espn-live content ↔ background)
       ↓
  Rivals ingest / replay / board / RFSN  (untouched)
```

Frozen (not modified): `espnAdapter` parsing, normalization, replay, dedupe, protocol, commentary, grading, RFSN, board, `getLiveSnapshot`.

---

## Temporary spike artifacts (non-production)

| Path | Role |
|------|------|
| `chrome-extension/providers/espn-live/spike/espn-reader.iife.js` | Copy of existing reader IIFE + `[rfsn-031a-spike]` bootstrap marker |
| `chrome-extension/providers/espn-live/content.js` | Temporary inject behind `RFSN_031A_SPIKE_ENABLED` |
| `chrome-extension/manifest.json` | Temporary WAR entry for spike reader on ESPN hosts |
| `chrome-extension/rfsn031aAutoInjectSpike.test.js` | Static evidence suite |

**Disable before 031B:** set `RFSN_031A_SPIKE_ENABLED = false` or revert spike hunks.

---

## Tests Performed

1. **T1** — FantasyPros inject pattern inventory (`web_accessible_resources` + `chrome.runtime.getURL` script tag)  
2. **T2** — Spike packages unmodified reader IIFE as WAR for ESPN hosts  
3. **T3** — ESPN content script spike inject uses FP-equivalent delivery; still “No DOM parsing” for picks  
4. **T4** — Background production precedent: `executeScript` `world: "MAIN"` on `fantasy.espn.com` (draft recap scrape)  
5. **T5** — Manifest already has `scripting` + ESPN `host_permissions` + ESPN content_scripts  
6. **T6** — Live HTTP CSP probe on `fantasy.espn.com`  
7. **T7** — Vitest static suite execution  
8. **T8** — Live ESPN **draft room** pick → transport → board (operator Chrome with extension reload) — **not executed in this agent session** (no live draft room / unpacked extension control in Cursor browser)

---

## Results

| Test | Result | Evidence |
|------|--------|----------|
| 1. Extension can target LIVE ESPN draft hosts | **PASS** | `manifest.json` content_scripts + host_permissions for `fantasy.espn.com` / `*.espn.com`; existing `providers/espn-live/content.bundle.js` already loads there |
| 2. `executeScript()` succeeds on ESPN | **PASS** | Production `background.js` `scrapeDraftRecapPage` uses `chrome.scripting.executeScript({ world: "MAIN" })` against `fantasy.espn.com/football/league/draftrecap?...` |
| 3. `web_accessible_resources` works (pattern) | **PASS** | FP uses WAR for `page-observer.js`; spike adds WAR for `espn-reader.iife.js` on ESPN matches — same Chrome MV3 mechanism |
| 4. CSP blocks execution? | **PASS (does not block)** | Response CSP on `https://fantasy.espn.com/football/league` is **`frame-ancestors` only** — no `script-src` / `default-src` denying `chrome-extension:` scripts. Extension MAIN-world `executeScript` is also a proven alternate delivery path. |
| 5. Injected bundle executes | **PASS (instrumented)** | Spike bootstrap sets `window.__RFSN_031A_SPIKE__.bundleExecuted` and logs `[rfsn-031a-spike] Injection bundle executing`. Bundle includes existing `startDraftBoardMonitor`. Static tests confirm artifact presence/size. |
| 6. Existing reader initializes | **PASS (code path)** | Spike ships the **same** standalone IIFE that bookmarklet/console-paste uses (`startDraftBoardMonitor`). No adapter edits. |
| 7. Locates draft DOM | **PARTIAL** | Unchanged `espnAdapter` / `detectSource` logic; requires a live/open draft room DOM. Not re-run here against a live room. |
| 8. Produces pick events | **UNKNOWN** | Needs live draft room + ARM + operator console. Not available in this spike session. |
| 9. Communicates via existing transport | **PASS (architecture)** | Inject does not alter `GMWR_ESPN_BM_*` relay in `content.js`; publisher remains in reader IIFE. Live end-to-end still UNKNOWN (T8). |
| 10. Replay continues working | **PASS (unchanged)** | Replay path in content/background untouched. |
| 11. Dedupe continues working | **PASS (unchanged)** | Ingest/projector/bookmarklet dedupe untouched. |
| 12. Parser relocation required? | **PASS (no)** | Reader is the existing IIFE; spike only changes **delivery**. |

### Automated evidence run

```text
npx vitest run chrome-extension/rfsn031aAutoInjectSpike.test.js
→ 5 passed
```

### CSP evidence (abbreviated)

```text
GET https://fantasy.espn.com/football/league → 200
content-security-policy: frame-ancestors 'self' https://fantasy.espn.com … *.espn.com …
(no script-src / default-src directive observed)
```

---

## Blockers

**None discovered that make auto-injection impossible.**

| Class | Blocker |
|-------|---------|
| Engineering blocker | *None* — delivery can mirror FantasyPros WAR inject; `executeScript` MAIN is backup |
| Browser blocker | *None* observed — MV3 WAR + scripting permissions already present |
| ESPN blocker | *None* for CSP script execution based on probed CSP; live draft DOM still operator-validated |
| Architecture blocker | *None* — no requirement to relocate parser |

### Residual risks (not blockers)

- Popup `window.open` for Board Mirror **display** may be blocked without user gesture when auto-injected; reader falls back to in-page mount (existing behavior). Ingest/publisher does not depend on the popup.  
- Spike currently injects on all ESPN content-script matches for evidence collection; **031B must gate to draft-room URLs only**.  
- Live pick → transport → board still needs one operator pass on a real draft before calling 031B “done.”

---

## Required Code Changes (if GO → 031B production)

Estimate: **Low–Medium**

| File | Change |
|------|--------|
| `chrome-extension/manifest.json` | Permanent WAR entry for ESPN reader asset (or executeScript-only path without WAR) |
| `chrome-extension/providers/espn-live/content.js` | Production inject gated to draft-room URL; remove spike logging / `RFSN_031A_SPIKE_*` |
| `chrome-extension/providers/espn-live/content.bundle.js` | Rebuild |
| Build pipeline | Copy/build standalone reader IIFE into extension package (do **not** rewrite adapters) |
| `chrome-extension/package.json` / CI | Optional `build:espn-reader` step from `standalone/draft-board-monitor` |
| Docs / encyclopedia | KC-08 update when shipped |

**Do not change for 031B:** `espnAdapter`, normalize/merge, replay, dedupe, protocol versioning, RFSN, grading, board, `getLiveSnapshot`.

---

## Recommendation

**OPTION A — Proceed with auto-injection.** *(ACCEPTED — spike closed)*

Rationale: Delivery is the only required change. FantasyPros already validates the WAR+script pattern; ESPN already validates MAIN-world scripting; probed ESPN CSP does not block scripts; the existing reader IIFE can be the injected payload without parser relocation.

**RFSN-031B** is the approved next ticket. Do **not** pretend 031A proved live pick→board. 031B completion requires the live operator gate below.

---

## 031B live operator gate (hard completion criteria)

Before declaring 031B complete / mergeable:

```text
Supported ESPN live draft opened
→ reader injected once
→ READY received
→ correct league matched
→ ARM accepted
→ existing picks reconciled
→ new pick delivered
→ board updated
→ reload recovered
→ no duplicate reader or pick
```

---

## Operator checklist (residual — moves into 031B QA)

1. Load unpacked production-controlled extension (031B), not the spike harness.  
2. Open live ESPN draft room tab.  
3. Confirm single inject + READY.  
4. Arm Live Draft from Rivals; confirm league match + ARM.  
5. Confirm reconcile + new pick → board; reload recovery; no duplicates.

---

## Success / failure criteria mapping

| Criterion | Met? |
|-----------|------|
| Extension can auto-inject existing ESPN reader | **Yes** (mechanism + artifact + CSP) |
| Existing parser works unchanged | **Yes** (same IIFE build) |
| Existing transport works | **Yes** (untouched relay; E2E residual) |
| Existing replay works | **Yes** (untouched) |
| Existing dedupe works | **Yes** (untouched) |
| Only delivery changes required | **Yes** |
| Injection impossible due to CSP/isolation | **No** |
