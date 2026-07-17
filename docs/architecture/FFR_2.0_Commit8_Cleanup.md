# FFR 2.0 — Commit 8 cleanup backlog

Tracked during the V1 → V2 IA migration. Do not execute until Commit 8.

## Backlog

- [ ] Evaluate and remove or document the unused `client/src/pages/ChampionshipPath.tsx` implementation (canonical Championship Path mounts `ChampionshipDiagnosis` at `/my-team/championship-path` and legacy `/championship-diagnosis`).
- [ ] Replace remaining legacy URLs emitted by `gmBriefing` (and related briefing builders) where canonical V2 routes are available (My Team, Rivals, Draft, etc.).
- [ ] RFSN: separate Wire and Stories reader behavior if product needs distinct feeds instead of the shared newsroom reader.
- [ ] RFSN: redirect or retire legacy `/rfsn/news` once Wire/Stories readers are fully canonical; keep article deep-link compatibility.
- [ ] RFSN: move article reader to a canonical RFSN route when legacy route cleanup begins.
- [ ] RFSN: evaluate a real breaking-news classification only if an existing factual authority supports it.
- [ ] RFSN: dissolve standalone `/draft-commentary` into RFSN media surfaces per architecture (after Commit 6 Draft lands).
- [ ] RFSN: add route-change TTS/audio end-to-end coverage if practical.
- [ ] Draft: redirect/retire legacy `/draft-war-room`, `/keeper-forecast`, `/keeper-advisor`, `/draft-history` once canonical routes are universal.
- [ ] Draft: evaluate the separate legacy `/draft-war-room` mount vs the shared canonical War Room layout (avoid dual live instances long-term).
- [ ] Draft: final redirect/removal decision for `/draft-commentary` (live commentary remains in War Room + `/rfsn/live`; archive presentation belongs to RFSN).
- [ ] Draft: decide disposition of DraftRealitySimulator and `/draft-reality` (season “untouched roster” sim, not Mock Draft).
- [ ] Draft: evaluate nested Keeper Center headers (Forecast/Advisor pages still render their own page chrome inside tabs).
- [ ] Draft: repair or remove the broken `server/mockDraftIntelligence.test.ts` import of missing `client/src/lib/mockDraftUtils`.
- [ ] Draft: add War Room route-transition / shared-layout state-preservation E2E coverage.
- [ ] Draft: add pause, clock, grading, and audio-cleanup route-level coverage where practical.
- [ ] Draft: record unrelated War Room bugs discovered during route migration without fixing them in Commit 6.

## Draft commentary ownership (Commit 5–6)

| Content | Canonical home now | Still legacy / Draft-tied |
| --- | --- | --- |
| Live booth commentary / audio / replay | `/rfsn/live` (+ War Room broadcast panel) | `/draft-commentary` preserved |
| War Room draft tools & controls | `/draft/war-room` | `/draft-war-room` preserved |
| Mock draft (same engine) | `/draft/mock` (shared War Room layout) | same as War Room legacy |
| Written newsroom / recaps | RFSN Wire / Stories / Recaps | — |
| Standalone Draft Commentary page | — | `/draft-commentary` until Commit 8 |

## ESPN mock / real draft support (Commit 6 note)

| Capability | Status |
| --- | --- |
| Synced ESPN draft board / picks via extension + Sync | Supported (War Room Draft Truth, Draft History) |
| Interactive mock / live sim inside War Room | Supported (local seeded simulation) |
| Direct remote control of an ESPN mock/real draft UI | Not implemented — do not invent |
| Observing ESPN draft via synced data | Supported when sync has ingested picks |

## Notes

- Legacy routes remain registered until Commit 8 redirects / orphan cleanup.
- Do not delete functionality solely for apparent redundancy without architecture authority.
