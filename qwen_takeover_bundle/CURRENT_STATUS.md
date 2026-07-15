# Current status (bundle snapshot)

**This file describes the repository at the time this takeover bundle was generated.** It is not auto-updated.

## Snapshot intent

- See **`BUNDLE_COPY_MANIFEST.md`** for which requested paths existed vs were missing in this checkout.
- `repo/` holds copies of key root configs, Drizzle schema, core server entrypoints, and selected client pages **as they existed when the bundle was built**.
- `extension/` would hold `ext_v177` if that folder existed in the source tree at bundle time (see note inside `extension/` if absent).
- `tests/` may include `espnTrade2026.test.ts` if present at bundle time.

## Likely active themes (verify in live repo)

- **Draft recap:** HTML scrape → parse → direct `draft_picks` ingest path (no combined JSON / `normalizeDraftPicks` for that flow) is the direction of travel for recap-based draft history.
- **Client:** Pages under `client/src/pages/` include draft, sync, timeline, trade lab, and manager behavior surfaces—confirm routes in `App.tsx` / router against production deploy.
- **Server:** `server/_core/index.ts` wires HTTP + tRPC; `routers.ts` is large and central; `espnService.ts` and `espnPersistence`-related modules own ESPN shapes.

## What you should do first on a real machine

1. Clone the full repo (do not rely on this bundle alone).
2. `pnpm install` (from repo root), then `pnpm check` / `pnpm build` per project README.
3. Align `.env` with `.env.example` (copy not bundled with secrets).

## Unknown at snapshot time

- Exact deploy branch, Railway/Nixpacks revisions, and production DB migration state—check `deploy/` copies and live CI.
