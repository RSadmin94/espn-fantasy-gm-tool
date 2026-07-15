# Draft War Room — Multi-League Roster-Cap Validation

**Scope:** the production mock draft (`buildMockDraft` / `getDraftWarRoomData` in `server/draftWarRoomRouter.ts`) now derives its **DP (IDP)** and **DEF (team D/ST)** position caps from each league's real ESPN starting-lineup requirements instead of a hardcoded 457622 table.

**Shipped commits (branch `cursor/frontend-rebuild-stage1-9b20`, live on prod):**
- `7f5b408` — `fix(draft-war-room): honor league DP and D/ST roster slots`
- `f26dd8c` — `test(draft-war-room): regression tests for data-driven DP/DEF roster caps`

**Expected behavior (the contract this validates):**
- League requires `DP:1` → mock drafts exactly **1 IDP per team**, **0 team defenses**.
- League requires `DST:1` → mock drafts exactly **1 team defense per team**, **0 IDP**.
- League requires neither → mock drafts **0 IDP and 0 team defenses**.

---

## Covered by real cached fixtures

Validated end-to-end through the actual `getDraftWarRoomData` → `buildMockDraft` path against live league data:

| League | Archetype | Result |
|---|---|---|
| **457622** (ATLANTAS FINEST) | IDP (`DP:1`) + keeper(1) | 14/14 teams draft exactly 1 DP · 0 DEF · 196/196 picks (full rosters) |
| **158918** (Teco's League) | Team D/ST (`DST:1`) redraft | 16/16 teams draft exactly 1 DEF · 0 DP · 224/224 picks (full rosters) |

These two cover the IDP, team-D/ST, and keeper dimensions with real data.

*Additional real fixtures exist but were not executed* (their owners are not among the currently entitled test users, and we are intentionally **not** forcing league keys through `getDraftWarRoomData`): `480452315` (IDP dynasty, keeper 20), `314853797` and `71576679` (team D/ST redraft). The data-driven logic is league-agnostic, so these are expected to behave like their archetype above once a connected user is available.

## Covered synthetically (unit regression)

`server/draftWarRoomRosterCaps.test.ts` (vitest, 3 tests) exercises `buildMockDraft` with synthetic inputs where DP and DEF sit at the top of ADP and are CRITICAL needs, so the **only** thing that can keep them off a roster is the cap:

- IDP league (`DP:1`) → exactly 1 DP/team, 0 DEF (pass)
- Team D/ST league (`DEF:1`) → exactly 1 DEF/team, 0 DP (pass)
- **No-defense league** (no DP/DEF requirement) → 0 DP, 0 DEF (pass)  ← the no-defense case is covered **here**, since no real no-defense league is cached.

## Not covered yet (no real cached fixture)

| Archetype | Status | Notes |
|---|---|---|
| **Standard / no-defense** | Synthetic only | Every cached 2026 league rosters either IDP or team D/ST; none is defense-free. The unit test above validates the 0/0 behavior, but there is no live league to confirm against. |
| **Superflex / 2-QB (OP slot)** | Not covered | All five cached leagues are `QB:1`. No Superflex league exists in the cache, and Superflex is **out of scope** for this fix (see below). |

## Why Superflex is a separate future feature

This change generalized only the **DP/DEF** caps. Superflex/2-QB support is a distinct problem:

- It hinges on the ESPN **OP (offensive player) lineup slot** (or `QB > 1`), not the DP/DST slots this fix touches.
- The current `cap()` treats QB as `lateWindow ? 2 : 1` — a hardcoded single-QB assumption. Superflex would require driving the QB/OP cap from `lineupReqs` the same way DP/DEF now are, plus reach/ordering tuning so a second QB is valued correctly.
- That is additive draft-logic work, deliberately **not** done here to keep this change scoped to the DP/DEF roster-cap generalization.

## How to reproduce

- Unit: `pnpm exec vitest run server/draftWarRoomRosterCaps.test.ts`
- Full check: `pnpm check` · `pnpm build`
- Live archetype survey (read-only): `scripts/_archetype_survey.mts`
