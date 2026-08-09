# FFR 2.0 — Canonical route inventory

Generated from final `client/src/main.tsx` implementation state (Commit 8).  
Authority: `FFR_2.0_Product_Architecture.md`.

**Legend**

- **Auth**: requires signed-in user (`ProtectedLayout`)
- **Gate**: `FeatureRouteGate` plan/feature key
- **Legacy**: backward-compatible path; behavior per disposition report

---

## Home

| Canonical route | Component | Section | Auth | Gate | Legacy aliases |
| --- | --- | --- | --- | --- | --- |
| `/home` | `Home` | Home | Yes | — | — |
| `/dashboard` | `Dashboard` | — (legacy hub) | Yes | — | `/command-center` → dashboard |

---

## Rivals

| Canonical route | Component | Authority / query | Auth | Gate | Legacy |
| --- | --- | --- | --- | --- | --- |
| `/rivals` | `RivalsHub` | Hub curation | Yes | — | — |
| `/rivals/cast` | `RivalsCast` → `TheCast` | Cast roster | Yes | — | `/the-cast` → redirect |
| `/rivals/owners` | `RivalsOwners` → `OwnerProfiles` | Owner directory | Yes | `/owner-profiles` | `/owner-profiles` alias (different chrome) |
| `/rivals/owners/:ownerId` | `RivalsOwnerDossier` | `routeOwnerId` + canonical owner key | Yes | `/owner-profiles` | — |
| `/rivals/head-to-head` | `RivalsHeadToHead` | `RivalryCenter` H2H variant | Yes | — | — |
| `/rivals/rivalries` | `RivalsRivalries` | `RivalryCenter` rivalries variant | Yes | — | `/rivalry-center` alias (full variant) |
| `/rivals/league-map` | `RivalsLeagueMap` | `owners.ownerList`, `rivalry.h2h` | Yes | — | — |
| `/rivals/relationships` | `RivalsRelationships` | `rivalry.getScores`, `rivalry.h2h` | Yes | — | — |
| `/league-dna` | `LeagueDna` | League DNA (legacy) | Yes | — | Preserved (distinct from Rivals maps) |

---

## My Team

| Canonical route | Component | Authority / query | Auth | Gate | Legacy |
| --- | --- | --- | --- | --- | --- |
| `/my-team` | `MyTeamHub` | `me.ownerHome` | Yes | — | — |
| `/my-team/roster` | `MyTeamRoster` → `Roster` | ESPN roster sync | Yes | — | `/roster`, `/rosters` → redirect |
| `/my-team/matchup` | `MyTeamMatchup` → `Matchups` | Matchup data | Yes | — | `/matchups` → redirect |
| `/my-team/trades` | `MyTeamTrades` → `Trades` | Trade intel | Yes | `/trades` | `/trades`, `/trade*` → redirect |
| `/my-team/advisor` | `MyTeamAdvisor` → `Advisor` | Advisor engine | Yes | `/advisor` | `/advisor` → redirect |
| `/my-team/profile` | `MyTeamProfile` | `authenticatedOwnerOnly` | Yes | — | — |
| `/my-team/championship-path` | `MyTeamChampionshipPath` → `ChampionshipDiagnosis` | Championship diagnosis | Yes | `/championship-diagnosis` | `/championship-diagnosis`, `/championship-path`, `/why-havent-i-won` → redirect |

---

## RFSN

| Canonical route | Component | Authority / query | Auth | Gate | Legacy |
| --- | --- | --- | --- | --- | --- |
| `/rfsn` | `RfsnHome` | Newsroom feed, featured article | Yes | — | Hub landing |
| `/rfsn/live` | `RfsnLive` | `rfsnBroadcast`, TTS/audio | Yes | Live access query | Sidebar (RFSN-027C) |
| `/rfsn/stories` | `RfsnStories` | `LeagueWireNewsroom` (shared feed) | Yes | — | Sidebar; primary storytelling |
| `/rfsn/stories/article/:articleId` | `RfsnStories` | Article reader | Yes | — | Canonical article URL |
| `/rfsn/recaps` | `RfsnRecaps` | Postgame reports | Yes | — | Sidebar |
| `/rfsn/wire` | Redirect → Stories | — | Yes | — | Engine via Stories (RFSN-027C) |
| `/rfsn/wire/article/:articleId` | Redirect → Stories article | — | Yes | — | `/rfsn/news/article/:id` → Stories |
| `/rfsn/breaking` | `RfsnBreaking` | Live broadcast + featured articles | Yes | — | Deep link only |
| `/rfsn/analysts` | `RfsnAnalysts` | `COMMENTATOR_META` | Yes | — | Deep link only |
| `/league-wire` | Redirect | — | Yes | — | → `/rfsn/stories` |
| `/draft-commentary` | `DraftCommentary` | Archived commentary | Yes | `/draft-commentary` | Preserved (Draft-tied archive) |

**Nav (RFSN-027C):** Live · Stories · Recaps. Wire is an internal feed engine, not a primary destination.
**Wire vs Stories:** Same newsroom authority; Stories is the user-facing home. No separate classification engine.

---

## Draft

| Canonical route | Component | Authority / query | Auth | Gate | Legacy |
| --- | --- | --- | --- | --- | --- |
| `/draft` | `DraftHub` | Hub curation | Yes | — | — |
| `/draft/war-room` | `DraftWarRoomLayout` → `DraftWarRoom` | War Room / live draft | Yes | — | `/draft-war-room` alias (separate instance) |
| `/draft/mock` | `DraftWarRoomLayout` → `DraftWarRoom` | Mock section (`dwr-mock`) | Yes | — | same legacy mount |
| `/draft/keepers` | `DraftKeepers` | Forecast + Advisor tabs | Yes | — | `/keeper-advisor`, `/keeper-forecast` → redirect |
| `/draft/history` | `DraftHistoryPage` → `DraftHistory` | Draft history | Yes | — | `/draft-history` → redirect |
| `/draft-reality` | `DraftRealitySimulator` | Season untouched-roster sim | Yes | — | Product decision (not in V2 nav) |

---

## League

| Canonical route | Component | Authority / query | Auth | Gate | Legacy |
| --- | --- | --- | --- | --- | --- |
| `/league` | `LeagueHub` | HoF preview, standings links | Yes | — | — |
| `/league/standings` | `LeagueStandings` → `Standings` | `trpc.espn.standings` | Yes | — | `/standings` → redirect |
| `/league/standings/power-rankings` | `LeaguePowerRankings` | Dynasty power rankings | Yes | — | `/dynasty-power-rankings` → redirect |
| `/league/standings/playoffs` | `LeaguePlayoffs` | Final ranks only (not bracket) | Yes | — | — |
| `/league/standings/strength-of-schedule` | `LeagueStrengthOfSchedule` | Empty state (no SOS authority) | Yes | — | — |
| `/league/history` | `LeagueArchiveLayout` → `HallOfFame` | `espn.hallOfFame` | Yes | — | — |
| `/league/history/champions` | Archive focus scroll | HoF championships section | Yes | — | — |
| `/league/history/hall-of-fame` | Archive focus scroll | HoF inductees | Yes | — | `/hall-of-fame` → redirect |
| `/league/history/records` | Archive focus scroll | Records | Yes | — | — |
| `/league/history/dynasties` | Archive focus scroll | Dynasty timeline | Yes | — | — |
| `/league/history/timeline` | Archive focus scroll | Milestones | Yes | — | — |
| `/league/history/transactions` | `LeagueTransactions` → `Transactions` | Transaction authority | Yes | `/transactions` | `/transactions` → redirect |
| `/league/history/matchups` | `HistoricalMatchupGalleryPage` | `matchupGallery.query` (053B) | Yes | — | **053C Production live** `2ad6e04` |
| `/league/history/matchups/no-mercy` | Gallery No Mercy preset | same + margin ≥ 50 + wins | Yes | — | **053C Production live** |
| `/league/history/matchups/:matchupId` | Historical Matchup Viewer V1 | `matchupGallery.get` | Yes | — | **053C Production live** — lineups/bench when recorded |
| `/league/acquisition-impact` | `LeagueAcquisitionImpact` | Acquisition impact | Yes | `/acquisition-impact` | `/acquisition-impact` → redirect |
| `/league/commissioner` | `LeagueCommissioner` | Commissioner tools | Yes | `/commissioner-command-center` | `/commissioner-command-center` → redirect |
| `/history` | `LeagueHistory` | Dynasty Board | Yes | — | Preserved (distinct from HoF archive) |

---

## Header utilities (outside six-section IA)

| Route | Component | Auth | Notes |
| --- | --- | --- | --- |
| `/settings` | `Settings` | Yes | Account / billing |
| `/league-settings` | `LeagueSettings` | Yes | League admin |
| `/sync` | `SyncData` | Yes | Data sync |
| `/connected-leagues` | `ConnectedLeagues` | Yes | League connections |
| `/connect`, `/connect/sleeper` | Connect flows | Yes | Onboarding |
| `/player-database` | `PlayerDatabase` | Yes | Utility |
| `/league-data-health` | `LeagueDataHealth` | Yes | Admin utility |
| `/owner-identity-review` | `OwnerIdentityReview` | Yes | Admin utility |
| `/rivalry/:shareCode` | `RivalryShare` | Yes | Existing rivalry share (not 053I) |
| `/m/:shareCode` | Planned hype/share card | — | **053I — not implemented.** Do not treat as live. |

---

## Placeholder infrastructure

| Mechanism | Status |
| --- | --- |
| `V2PlaceholderRoute` | Retained for future destinations; **no live canonical route renders a placeholder** |
| `v2PlaceholderRoutes` expansion | Skips `V2_PARAM_ROUTES` and all `kind: "live"` destinations |

---

## Redirect chains (safe)

```
/league-wire → /rfsn/wire
/league-wire/article/:id → /rfsn/wire/article/:id
/rfsn/news → /rfsn/wire
/rfsn/news/article/:id → /rfsn/wire/article/:id
/ring-of-honor, /championships → /league/history/hall-of-fame
```

Do **not** redirect `/draft-war-room` → `/draft/war-room` while an active draft session may be in progress (separate React instances).
