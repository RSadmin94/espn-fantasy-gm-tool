# FFR 2.0 — Commit 8 cleanup backlog

Tracked during the V1 → V2 IA migration. Do not execute until Commit 8.

## Backlog

- [ ] Evaluate and remove or document the unused `client/src/pages/ChampionshipPath.tsx` implementation (canonical Championship Path mounts `ChampionshipDiagnosis` at `/my-team/championship-path` and legacy `/championship-diagnosis`).
- [ ] Replace remaining legacy URLs emitted by `gmBriefing` (and related briefing builders) where canonical V2 routes are available (My Team, Rivals, etc.).
- [ ] RFSN: separate Wire and Stories reader behavior if product needs distinct feeds instead of the shared newsroom reader.
- [ ] RFSN: redirect or retire legacy `/rfsn/news` once Wire/Stories readers are fully canonical; keep article deep-link compatibility.
- [ ] RFSN: move article reader to a canonical RFSN route when legacy route cleanup begins.
- [ ] RFSN: evaluate a real breaking-news classification only if an existing factual authority supports it.
- [ ] RFSN: dissolve standalone `/draft-commentary` into RFSN media surfaces per architecture (after Commit 6 Draft lands).
- [ ] RFSN: add route-change TTS/audio end-to-end coverage if practical.

## Draft commentary ownership (Commit 5 note — do not delete yet)

| Content | Canonical home now | Still Draft-tied until Commit 6 |
| --- | --- | --- |
| Live booth commentary / audio / replay | `/rfsn/live` (+ Analysts link) | War Room controls at `/draft-war-room` |
| Written newsroom stories | `/rfsn`, `/rfsn/stories`, legacy `/rfsn/news` | — |
| Weekly matchup recaps | `/rfsn/recaps`, Wire | — |
| Chronological wire / reports | `/rfsn/wire` | — |
| Standalone Draft Commentary page | — | `/draft-commentary` preserved |

## Notes

- Legacy routes remain registered until Commit 8 redirects / orphan cleanup.
- Do not delete functionality solely for apparent redundancy without architecture authority.
