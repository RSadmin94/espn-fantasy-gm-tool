# Draft history JSON seeds

Files named `<season>.json` are consumed by:

```bash
pnpm exec tsx scripts/seed-draft-history.ts <season>
# optional:
pnpm exec tsx scripts/seed-draft-history.ts 2011 --file=./path/to/custom.json --league-id=457622
```

Seed every four-digit JSON in this folder (requires `DATABASE_URL`):

```bash
pnpm seed:all-drafts
```

Regenerate slim `{ season, leagueId, picks }` files for 2010 and generated 2011–2015 / 2017:

```bash
pnpm emit:draft-all-slim
```

## Shape

- `season` (optional if CLI `<season>` matches): file-level season used when picks omit per-row `season`.
- `leagueId` (optional): defaults to `ESPN_LEAGUE_ID` or `457622`.
- `teams` (optional): `{ teamId, teamName, ownerName? }[]` — stub rows upserted into `teams` so `draft_picks` joins work. If omitted, `teamId` on each pick (or stable order of first-seen `teamName`) is used to synthesize stubs.
- `picks` (required): each pick includes `overallPick`, `round`, `roundPick`, `teamName`, `playerName`, `position`, `nflTeam`, optional `season` (defaults to file `season` / CLI), `teamId`, `isKeeper`, `playerId`.

`nflTeam` is stored inside `draft_picks.rawPick` as `proTeam` for the Draft History UI.

## 2010 vs 2011–2017

- **2010** full 16-round snake is produced from `build2010DraftDocument.mjs` (archival board + generated depth).
- **2011–2015, 2017** use `historicalStarBoards.mjs` for early picks and `leagueSnakeGenerator.mjs` for placeholder bench rows through round 16. Replace with ESPN recap exports when you have them.

## Full 2010 board (224 picks)

To regenerate only the legacy full document variant:

```bash
pnpm emit:draft-2010
pnpm exec tsx scripts/seed-draft-history.ts 2010
```
