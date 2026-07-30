# Board Mirror Baseline

**Status:** Frozen known-good  
**Milestone:** Board Mirror Baseline  
**Date recorded:** 2026-07-30  

## Definition of Done (validated)

- [x] ESPN mock connects (random mock league IDs OK)
- [x] Board sync via ESPN Mirror → extension → Rivals
- [x] Commentary / booth path wired (`notifyLockedPick` / `getLiveSnapshot`)
- [x] Voice / TTS flags enabled on preview
- [x] Grades path present (`computeDraftGradesFromRosters` / wrap-up)
- [x] Pause / Resume / Reset available on Live Draft control
- [x] No duplicate picks (ingest fingerprint + eventKey dedupe)

## Freeze pointers

| Item | Value |
|------|--------|
| **Git tag** | `known-good-boardmirror-860bde4` |
| **Backup branch** | `backup/working-boardmirror-860bde4` |
| **Feature line (from baseline)** | `feature/from-boardmirror-baseline` |
| **Commit SHA** | `860bde47a75358f49fa447e012a7ba53acb4de1c` |
| **Commit subject** | `fix(extension): re-arm ESPN publisher after mirror readiness` |

## Environment snapshot (preview)

| Item | Value |
|------|--------|
| **Preview host** | https://sprint-8-preview.fantasyfootballrivals.com |
| **Railway environment** | `sprint-8-preview` |
| **Railway service** | `espn-fantasy-gm-tool` |
| **Railway deployment ID** | `b82e909c-0b85-4687-99d7-4993b399dd8f` |
| **Health gitSha** | `860bde47a75358f49fa447e012a7ba53acb4de1c` |
| **Health buildTime** | `2026-07-30T15:06:55.539Z` |
| **Health gitBranch** | `fix/rfsn-production-recovery` |
| **Client bundle** | `index-Dkg-Mwvn.js` |
| **Bundle SHA256** | `f3336b2e35763e0774d553f01bc625e18aef287b91a18ba0927a2e8161f969fe` |
| **Bundle bytes** | `2851601` |

## Extension / bookmarklet

| Item | Value |
|------|--------|
| **Extension version** | `1.13.0` |
| **Extension load path** | `chrome-extension/` at SHA above |
| **Frozen zip** | `GM-War-Room-Extension-v1.13.0-Working.zip` (repo root; never overwrite) |
| **Reader** | No separate `espn-live-reader.iife.js` at this SHA — Board Mirror IIFE **is** the reader |
| **Monitor / bookmarklet version** | `1.3.1-standalone` (`MONITOR_VERSION`) |
| **Protocol version** | `1` (`ESPN_BM_PROTOCOL_VERSION`) |
| **Drag-drop installer** | `standalone/draft-board-monitor/dist/install-mirror.html` |
| **console-paste SHA256** | `1F47343C6906B0F2F1F7789D628A343F9811E97BF0C67F337D3F9555DC6F4787` |

## Feature flags / vars (preview at freeze)

| Variable | Value |
|----------|--------|
| `RFSN_ESPN_AUTO_INJECT_ENABLED` | **ABSENT** (must stay absent for this baseline) |
| `RFSN_LIVE_BROADCAST_ENABLED` | `true` |
| `RFSN_VOICE_BETA` | `true` |
| `RFSN_TTS_ENABLED` | `true` |
| `GIT_COMMIT` | `860bde47a75358f49fa447e012a7ba53acb4de1c` |

`armLeagueMatchesPage()` / page-league ARM matching must **not** be present (introduced in `848818d`).

## Architecture invariant (do not break)

Transport identity is **Rivals-owned** at ARM time:

- Publisher stamps `leagueId` / `draftId` / `sessionNonce` from ARM config.
- ESPN mock URL `leagueId` need **not** equal the connected Rivals league.
- Regression that broke random mocks: `848818d` (`armLeagueMatchesPage`).

## Browser at freeze

| Item | Value |
|------|--------|
| **Chrome (Windows BLBeacon)** | `150.0.7871.187` |
| **OS** | Windows 10 / 11 (`win32 10.0.26200`) |

## Production

| Item | Value |
|------|--------|
| **Production SHA (untouched)** | `3de74e57c00e6daee1aed379e5c21b9c2bd20a8f` |

## How to recover

```bash
git fetch origin
git checkout known-good-boardmirror-860bde4
# or
git checkout backup/working-boardmirror-860bde4
```

Load extension from the frozen zip or `chrome-extension/` at that commit.  
Drag-drop Board Mirror from `dist/install-mirror.html` (rebuild with `node standalone/draft-board-monitor/scripts/build.mjs` then `node standalone/draft-board-monitor/scripts/make-installer.mjs` if `dist/` is missing).

## Forward rule

Do **not** continue feature work on `fix/rfsn-production-recovery` for Board Mirror evolution.  
Branch from this baseline (`feature/from-boardmirror-baseline` or a fresh branch off the tag).  
Reintroduce later commits (headshots, keepers, awards, 031B, …) **one at a time** with a full DoD pass after each.
