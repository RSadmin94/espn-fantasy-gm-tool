# Draft History — canonical vs legacy paths

## Rule (V3+)

**Draft History display** must use **`draft_recap_canonical` only** — the tRPC query `espn.draftRecapCanonical` backed by `server/draftRecapCanonical.ts`.

That path reads **only** `gm_draft_picks` rows whose `rawPick.source === "draft_recap_html"` (ESPN visual Draft Recap scrape). It does **not** merge API picks, snake slots, or `gmTeams` name overrides.

## Legacy paths — keep but quarantine

These remain in the codebase for other features. **Do not import them from Draft History UI or a new canonical builder.**

| Path | Status | Used by |
|------|--------|---------|
| `espn.draftPicks` | **Live / current season** | Draft War Room, live cache reads |
| `ingestParsedDraftPicks` | **Ingest only** | Chrome extension, Sync Data browser import; writes `draft_recap_html` rows |
| `getSeasonDraftPicks` | **Legacy / coverage** | `historicalCoverage`, analytics aggregates — mixed DB + mDraftDetail + combined cache |
| Manager / player `draftHistory` field | **Different feature** | Player profile cards (per-player draft timeline) |
| `draftHelperService` | **Active draft tools** | Pick recommendations, tendencies — not historical board |

## Deletion policy

Do **not** delete quarantined paths until a repo-wide search shows no active consumer needs them.

Before deletion, verify:

1. No `DraftHistory*.tsx` imports `getSeasonDraftPicks`, `draftPicks`, or `cleanSeasonDraftPicks`.
2. No display router calls `importSeasonDraftFromEspnApi` for board rendering.
3. Coverage/analytics have an alternative or explicitly accept legacy semantics.

## Ingest vs display

`ingestParsedDraftPicks` may still load scrape rows into `draft_picks`. That does **not** make those rows safe for display until read through **`draftRecapCanonical`**, which filters to `draft_recap_html` only and applies chronological order rules.
