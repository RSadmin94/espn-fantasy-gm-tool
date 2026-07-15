\# ESPN Fantasy GM Tool — Historical Data Truth Doctrine



\## VERIFIED ARCHITECTURE (DO NOT REBREAK)



\### 1. Championship Truth



Source of truth:



\* `league\_medals`



Championship ownership logic:



```text

league\_medals championTeamName

→ same-season gmTeams/team rows

→ resolve owner

→ credit owner title

```



DO NOT:



\* derive champions from standings

\* derive champions from finalStanding

\* derive champions from matchup winners



Ring of Honor is the canonical championship implementation.



\---



\# 2. All-Time Owner Records (W-L-T)



Source of truth:



\* weekly matchup history



Primary source:



\* `gmMatchups`



Fallback source:



\* ESPN combined cache via:



&#x20; \* `getCachedViewWithTier()`

&#x20; \* `normalizeMatchups()`



Coverage pattern:



```text

DB first

→ cache fallback

→ ESPN fetch fallback if necessary

```



Correct record math:



```text

gamesPlayed = wins + losses + ties



winPct =

(wins + 0.5 \* ties) / gamesPlayed

```



DO NOT:



\* sum standings rows

\* use gmTeams.wins/losses

\* use standings snapshots

\* use finalStanding aggregates



Those create inflated/fake totals.



\---



\# 3. Critical ESPN Winner Bug (FIXED)



ESPN historical matchup payloads store:



```text

winner = "HOME"

winner = "AWAY"

```



NOT numeric team IDs.



Root cause discovered:



```ts

Number("HOME") => NaN

```



This caused:



\* `winnerTeamId = null`

\* `isCompleted = 0`

\* broken historical matchup records

\* broken H2H calculations



FIX:



```text

"HOME" → homeTeamId

"AWAY" → awayTeamId

```



This fix MUST remain in:



\* `espnPersistence.ts`

\* all cache fallback normalization paths



\---



\# 4. Historical Matchup Coverage Pattern (WORKING)



Verified successful architecture:



\## Phase 1



Read from:



\* `gmMatchups`



\## Phase 2



If missing/incomplete:



```text

getCachedViewWithTier("combined")

→ normalizeMatchups()

→ dedupe

```



\## Phase 3



If no cache:

Fetch live ESPN historical scoreboard data:



```text

mMatchupScore

```



Persist via:



```text

upsertMatchups()

```



\---



\# 5. Dedup Rules



Canonical matchup dedupe key:



```text

season | matchupPeriodId | homeTeamId | awayTeamId

```



Required everywhere:



\* ownerAllTimeRecords

\* H2H

\* matchup history

\* rivalry calculations



\---



\# 6. Verified Working Features



\## VERIFIED GOOD



\* Championships page

\* Ring of Honor

\* Owner all-time records

\* Rivalries/H2H

\* Historical Matchups page

\* Historical matchup fallback system

\* Cache fallback logic

\* Historical ESPN fetch flow



\---



\# 7. Matchups Page Architecture (WORKING)



The `/matchups` page now uses:



```text

DB first

→ cache fallback

→ normalized matchup fallback

```



It NO LONGER depends purely on gmMatchups existing.



Historical weeks like:



\* 2010 Week 1

\* playoff weeks

\* older seasons



can now render from cache.



\---



\# 8. H2H / Rivalries Truth



Correct source:



\* completed weekly matchups only



NOT:



\* standings

\* records

\* season summaries



H2H calculations:



```text

Owner A vs Owner B

→ matchup outcomes only

```



\---



\# 9. DO NOT REINTRODUCE



Never reintroduce:



\* multiple championship truth systems

\* standings-derived championships

\* aggregated standings W/L totals

\* duplicate record engines

\* alternate title calculations

\* partial season record math



One truth source per domain.



\---



\# 10. Successful Development Pattern



The workflow that worked:



```text

ONE FIX

→ VERIFY

→ BUILD

→ COMMIT

→ PUSH

→ DEPLOY

→ NEXT ISSUE

```



Avoid:



\* architecture drift

\* overlapping refactors

\* giant commits

\* speculative abstractions



Truth-first debugging worked.

Keep using it.



