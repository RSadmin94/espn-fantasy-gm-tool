# Product priority — Post-Draft Evaluation

Draft season is over. **Live Draft is tabled** (code stays; do not expand unless another current feature depends on it).

Current order:

1. Google logout / account switching
2. Post-Draft Evaluation (who you should have drafted, given the actual roster and players still available)
3. Everything else

## Deferred Live Draft

Existing Live Draft implementation is preserved. Do not treat Live Draft bugs/features as the current product priority.

### LIVE-DRAFT-RESUME (backlog — not in this ticket)

**Restore/reconnect an authenticated user to an active draft session automatically when they return to the application.**

A user who leaves or loses access during an active draft may return and the Live Draft experience does not automatically resume. Implement later: rehydrate the in-progress session (picks, clock, booth audio/replay) for the signed-in user without starting a new draft.

Do not implement LIVE-DRAFT-RESUME unless a current non-Live-Draft feature depends on it.

---

# Sprint 8 — Live Draft Stabilization (DEFERRED)

**Status:** ⬜ Tabled — working-tree Live Draft fixes remain; not the current product priority.

## Definition of Done (when Live Draft is resumed)

- [ ] Start live draft → Enable Sound once → hear every analyst through final pick
- [ ] No commentary cut off mid-speech
- [ ] Leave and return without losing session (draft + audio + replay) — overlaps **LIVE-DRAFT-RESUME**
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
| LIVE-DRAFT-RESUME | Return to an in-progress draft does not auto-reconnect | Deferred | — |

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
