# RFSN-055 — Draft Intelligence Authority

**Status:** Implemented locally. Deterministic Advisor path. Not Preview/Production until explicit ask.

## Intent

`draft_intelligence` — `deterministicFirst: true`, `narrativeAllowed: false`.

Tool: `query_draft_intelligence`.

## Reach convention

`reachDelta = ADP − actual pick` (`shared/reachClassification.ts`). Positive = earlier than ADP.

Steal magnitude = `actual pick − ADP`.

Undrafted ESPN sentinel ADP (~170) is rejected.

## ADP vs board

- Reach / steal / average reach / frequency / value / aggression require a **same-season** ADP join.
- QB / RB / WR timing, philosophy, and first-time draftees use the recorded draft board only.
- One season’s ADP is never applied to another season.
- If ADP is missing: return **coverage years**, never “this league lacks draft strategy.”
- Partial ADP: `Draft reach data is available from X–Y; earlier draft boards (A–B) are preserved without reliable ADP.`

## Rookies

NFL debut year is not stored. Rookie preference = first appearance of that `playerId` on this league’s recorded draft board, stated as such.

## Do not

LLM rankings, invented personalities, 053/marketing, Advisor redesign.
