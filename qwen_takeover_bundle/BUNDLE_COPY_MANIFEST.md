# Bundle copy manifest

Files in this snapshot were copied **only if they existed** in the source repo at bundle creation time.

## Present under `repo/`

See tree under `repo/` — includes `package.json`, lockfile, `tsconfig.json`, `drizzle.config.ts`, `drizzle/schema.ts`, listed `server/**` files that existed, `client/src/main.tsx`, `client/src/pages/SyncData.tsx`, `client/src/pages/LeagueTimeline.tsx`, `railway.json`, `nixpacks.toml`, `.env.example`.

## Additional client snapshots (closest to requested missing paths)

Because `App.tsx`, `DraftBoard.tsx`, `ManagerBehavior.tsx`, and `hubs/TradeLab.tsx` were absent, these nearby files were also copied for routing/UI context:

- `client/src/components/AppShell.tsx`
- `client/src/pages/DraftHistory.tsx`, `Trades.tsx`, `Advisor.tsx`, `Dashboard.tsx`

- `client/src/pages/DraftBoard.tsx`
- `client/src/pages/ManagerBehavior.tsx`
- `client/src/pages/hubs/TradeLab.tsx`

Closest related pages observed in this snapshot include **`DraftHistory.tsx`**, **`Trades.tsx`**, **`Advisor.tsx`**, **`Dashboard.tsx`**, **`AppShell.tsx`** — verify in a full checkout.

## Extension

- **`ext_v177/`** — not present at bundle time; see `extension/README.md`.

## Tests

- **`tests/espnTrade2026.test.ts`** — copied when `server/espnTrade2026.test.ts` existed (see `tests/`).
