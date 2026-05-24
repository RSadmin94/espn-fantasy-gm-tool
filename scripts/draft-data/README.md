# Draft history JSON seeds

Files named `<season>.json` are consumed by:

```bash
pnpm exec tsx scripts/seed-draft-history.ts <season>
# optional:
pnpm exec tsx scripts/seed-draft-history.ts 2011 --file=./path/to/custom.json --league-id=457622
```

## Shape

- `leagueId` (optional): defaults to `ESPN_LEAGUE_ID` or `457622`.
- `teams` (optional): `{ teamId, teamName, ownerName? }[]` — stub rows upserted into `teams` so `draft_picks` joins work. If omitted, `teamId` on each pick (or stable order of first-seen `teamName`) is used to synthesize stubs.
- `picks` (required): each pick includes `season`, `overallPick`, `round`, `roundPick`, `teamName`, `playerName`, `position`, `nflTeam`, optional `teamId`, `isKeeper`, `playerId`.

`nflTeam` is stored inside `draft_picks.rawPick` as `proTeam` for the Draft History UI.

## Full 2010 board (224 picks)

The committed `2010.json` includes **rounds 1–3** (42 picks) as a hand-checked archival slice. To regenerate the **full 16-round snake** (224 picks) from `build2010DraftDocument.mjs`:

```bash
pnpm emit:draft-2010
pnpm exec tsx scripts/seed-draft-history.ts 2010
```
