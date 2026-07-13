/**
 * Pure helpers for Live Draft manual-team control — mirrors LiveDraftEngine semantics.
 */

/** Default: full AI draft — user must explicitly check teams to pause for manual picks. */
export function buildDefaultManualTeamIds(_myTeamId?: number | null | undefined): Set<number> {
  return new Set<number>();
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
  _myTeamId?: number | null | undefined,
): Set<number> {
  return buildDefaultManualTeamIds();
}

export function resetTeamControlsManualIds(_myTeamId?: number | null | undefined): Set<number> {
  return buildDefaultManualTeamIds();
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
