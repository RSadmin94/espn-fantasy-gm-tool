# Project rules (handoff)

These rules are **contract-level** for this codebase. Violations create user-visible bugs or bad data.

## Shell and environment

- **Windows PowerShell only** for scripts and CI-like commands in this environment unless the real project CI explicitly uses something else. Do not assume bash-isms.

## Data and product semantics

1. **History-first architecture**  
   Prefer normalized tables, sync boundaries, and explicit season/league keys. Do not paper over missing history with silent defaults that look like real data.

2. **No hardcoded league outcomes**  
   Never encode “team X won league Y in season Z” or similar in app logic, tests that masquerade as production rules, or seed data that production could pick up.

3. **One feature per commit**  
   Keep changes reviewable and revertible. If you touch unrelated areas, split commits.

4. **Titles from `league_medals` only**  
   Championship / special titles displayed as authoritative league outcomes must come from **`league_medals`** (or the documented equivalent), not from heuristics on standings or playoff guesses unless explicitly documented as a fallback with clear labeling.

5. **H2H from `gmMatchups` only**  
   Head-to-head results, weekly pairing truth, and matchup-derived aggregates for GM-facing H2H views should be grounded in **`gmMatchups`** (and related schema), not reconstructed from unrelated caches or ESPN blobs without a defined pipeline.

6. **Drafts from ESPN draft recap only**  
   For the supported “recap” ingestion story, treat **ESPN draft recap** (HTML scrape → parsed picks → `draft_picks` / `gmDraftPicks`) as the source of truth for that path—not ad-hoc JSON shapes or workbook imports in that flow.

## When in doubt

- Read `KNOWN_FAILURES.md` before “fixing” totals or titles.
- Prefer Drizzle + existing persistence patterns over raw SQL in app code.
- Ask for a full `git` checkout if this bundle is stale; file copies here can drift.
