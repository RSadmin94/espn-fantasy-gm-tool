# Rivals Draft Intelligence Engine (blank-sheet)

**Isolated behavioral draft engine** — models the person, not the pick.

- Does **not** import into or modify Trade Analyzer, Owner Profiles, mock draft, or valuation.
- Read-only reuse of `ownerProfileService` attribution + person-merge helpers.
- Primary league: `457622` (ATLANTAS FINEST FF).

## Engine rules

1. **League-walled history** — personality fits use only picks in league 457622.
2. **Active owners only** — departed managers never get personality fits or sim seats.
3. **Departed board context** — their historical picks stay in the Choice Ledger (board shape).

This folder is intentionally separate from `draftWarRoomRouter` / Phase 1–3 mock intelligence.
