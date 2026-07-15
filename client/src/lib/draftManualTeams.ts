/**
 * Pure helpers for Live Draft manual-team control — mirrors LiveDraftEngine semantics.
 */

export function buildDefaultManualTeamIds(myTeamId: number | null | undefined): Set<number> {
  return myTeamId != null ? new Set<number>([myTeamId]) : new Set<number>();
}

export function toggleManualTeamIds(prev: ReadonlySet<number>, teamId: number): Set<number> {
  const next = new Set(prev);
  if (next.has(teamId)) next.delete(teamId);
  else next.add(teamId);
  return next;
}

/** Unchecking the on-clock manual team starts a fresh countdown. */
export function shouldRefreshClockOnManualUncheck(input: {
  wasManual: boolean;
  teamId: number;
  onClockTeamId: number | null | undefined;
}): boolean {
  return (
    input.wasManual &&
    input.onClockTeamId != null &&
    Number(input.onClockTeamId) === Number(input.teamId)
  );
}

/** Checking the on-clock AI team stops the countdown immediately. */
export function shouldStopClockForManualCheck(input: {
  wasManual: boolean;
  teamId: number;
  onClockTeamId: number | null | undefined;
}): boolean {
  return (
    !input.wasManual &&
    input.onClockTeamId != null &&
    Number(input.onClockTeamId) === Number(input.teamId)
  );
}

export function manualTeamIdsAfterScheduleIdentityChange(
  myTeamId: number | null | undefined,
): Set<number> {
  return buildDefaultManualTeamIds(myTeamId);
}

export function resetTeamControlsManualIds(myTeamId: number | null | undefined): Set<number> {
  return buildDefaultManualTeamIds(myTeamId);
}

export function isAiCountdownActive(input: {
  running: boolean;
  done: boolean;
  holding: boolean;
  onClockIsManual: boolean;
  isKeeperSlot: boolean;
}): boolean {
  return (
    input.running &&
    !input.done &&
    !input.holding &&
    !input.onClockIsManual &&
    !input.isKeeperSlot
  );
}
