# FFR 2.0 — Commit 8 cleanup backlog

Tracked during the V1 → V2 IA migration. Do not execute until Commit 8.

## Backlog

- [ ] Evaluate and remove or document the unused `client/src/pages/ChampionshipPath.tsx` implementation (canonical Championship Path mounts `ChampionshipDiagnosis` at `/my-team/championship-path` and legacy `/championship-diagnosis`).
- [ ] Replace remaining legacy URLs emitted by `gmBriefing` (and related briefing builders) where canonical V2 routes are available (My Team, Rivals, etc.).

## Notes

- Legacy routes remain registered until Commit 8 redirects / orphan cleanup.
- Do not delete functionality solely for apparent redundancy without architecture authority.
