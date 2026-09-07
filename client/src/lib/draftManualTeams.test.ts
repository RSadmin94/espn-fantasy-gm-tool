import { describe, expect, it } from "vitest";
import { isPickManual } from "./draftClock";
import {
  buildDefaultManualTeamIds,
  formatManualOwnerLabel,
  isAiCountdownActive,
  isTeamPausedForManualPick,
  manualTeamIdsAfterScheduleIdentityChange,
  resetTeamControlsManualIds,
  shouldRefreshClockOnManualUncheck,
  shouldStopClockForManualCheck,
  toggleManualTeamIds,
} from "./draftManualTeams";

describe("manual team controls", () => {
  it("1. zero teams selected by default", () => {
    expect([...buildDefaultManualTeamIds(11)]).toEqual([]);
    expect(buildDefaultManualTeamIds(null).size).toBe(0);
    expect(isPickManual(new Set(), 11)).toBe(false);
  });

  it("2. one team can be selected", () => {
    const m = toggleManualTeamIds(new Set(), 11);
    expect([...m]).toEqual([11]);
    expect(isPickManual(m, 11)).toBe(true);
    expect(isPickManual(m, 3)).toBe(false);
  });

  it("3. multiple teams can be selected", () => {
    const m = toggleManualTeamIds(toggleManualTeamIds(new Set([3]), 7), 11);
    expect(isPickManual(m, 3)).toBe(true);
    expect(isPickManual(m, 7)).toBe(true);
    expect(isPickManual(m, 11)).toBe(true);
  });

  it("4. deselecting one team does not clear the others", () => {
    const selected = new Set([3, 7, 11]);
    const after = toggleManualTeamIds(selected, 7);
    expect([...after].sort((a, b) => a - b)).toEqual([3, 11]);
    expect(isPickManual(after, 7)).toBe(false);
  });

  it("5. checked current team pauses (countdown inactive)", () => {
    expect(
      shouldStopClockForManualCheck({ wasManual: false, teamId: 4, onClockTeamId: 4 }),
    ).toBe(true);
    expect(
      isAiCountdownActive({
        running: true,
        done: false,
        holding: false,
        onClockIsManual: true,
        isKeeperSlot: false,
      }),
    ).toBe(false);
  });

  it("6. unchecked current team auto-picks (countdown active)", () => {
    expect(
      shouldRefreshClockOnManualUncheck({ wasManual: true, teamId: 4, onClockTeamId: 4 }),
    ).toBe(true);
    expect(
      isAiCountdownActive({
        running: true,
        done: false,
        holding: false,
        onClockIsManual: false,
        isKeeperSlot: false,
      }),
    ).toBe(true);
  });

  it("7. selections survive navigation (session-shaped copy)", () => {
    const preserved = toggleManualTeamIds(new Set([11]), 7);
    const afterNav = new Set(preserved);
    expect([...afterNav].sort((a, b) => a - b)).toEqual([7, 11]);
  });

  it("8. reset team controls clears all selections", () => {
    const dirty = toggleManualTeamIds(toggleManualTeamIds(new Set([11]), 7), 3);
    expect(dirty.size).toBe(3);
    const restored = resetTeamControlsManualIds(11);
    expect(restored.size).toBe(0);
    expect(dirty.has(7)).toBe(true);
  });

  it("9. pause-on-my-picks does not add the user's team to manualTeamIds", () => {
    const empty = buildDefaultManualTeamIds(11);
    expect(empty.has(11)).toBe(false);
    // pause preference affects pause helper, not the set
    expect(
      isTeamPausedForManualPick({
        manualTeamIds: empty,
        teamId: 11,
        pauseOnMyPicks: true,
        myTeamId: 11,
      }),
    ).toBe(true);
    expect(empty.has(11)).toBe(false);
    expect(
      isTeamPausedForManualPick({
        manualTeamIds: empty,
        teamId: 3,
        pauseOnMyPicks: true,
        myTeamId: 11,
      }),
    ).toBe(false);
  });

  it("does not auto-select the user's own team on default/reset", () => {
    expect(buildDefaultManualTeamIds(11).size).toBe(0);
    expect(manualTeamIdsAfterScheduleIdentityChange(11).size).toBe(0);
    expect(resetTeamControlsManualIds(11).size).toBe(0);
  });

  it("formats owner — team labels for checkbox copy", () => {
    expect(formatManualOwnerLabel("Rod Sellers", "SMASHVILLE TITANS")).toBe(
      "Rod Sellers — SMASHVILLE TITANS",
    );
  });
});
