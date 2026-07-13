# Sprint 8 — Live Draft Stabilization

**Objective:** One complete, production-ready Live Draft experience. Nothing else.

**Status:** 🟦 In progress — fixes on working tree; browser certification pending.

## Definition of Done

- [ ] Start live draft → Enable Sound once → hear every analyst through final pick
- [ ] No commentary cut off mid-speech
- [ ] Leave and return without losing session (draft + audio + replay)
- [ ] "Pause on my picks" behaves exactly as configured
- [ ] Exactly one draft wrap-up + wrap-up replay works

## Known issues (integrated workflow)

| ID | Issue | Code status | Browser cert |
|----|-------|-------------|--------------|
| BUG-001 | Audio only plays once | Fixed (ticker key, pending→ready, booth timer) | Pending |
| BUG-002 | Commentary cut off | Fixed (`ended`-driven, 120s safety only) | Pending |
| BUG-003 | Navigation resets session | Fixed (audio persist, draft sessionStorage, hidden mount) | Pending |
| BUG-004 | Pause on my picks ignored | Fixed (explicit toggle, default off) | Pending |
| BUG-005 | Wrap-up unreliable | Fixed (`draft_complete` render, teamCount, notify) | Pending |

## Quality gates

| Gate | Status |
|------|--------|
| Focused audio/live-draft tests (53+) | Pass |
| `pnpm check` | Pass |
| `pnpm build` | Pass |
| **Authoritative browser cert** (full draft start→finish) | **Pending** |

## Out of scope (this sprint)

Story Engine, Kokoro cache, monetization, UI redesign, cosmetics, infrastructure cleanup.

## Cert harness

```powershell
$env:QA_BASE="http://localhost:3000"  # or production after deploy
railway run -- pnpm exec tsx scripts/_mint_founder_signin.mts
pnpm exec tsx scripts/runLiveDraftWarRoomBrowserCert.mts
```

Nothing marked ✅ until committed, deployed, and manually verified.
