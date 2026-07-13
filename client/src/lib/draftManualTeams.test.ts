import { describe, expect, it } from "vitest";
import { isPickManual } from "./draftClock";
import {
  buildDefaultManualTeamIds,
  isAiCountdownActive,
  manualTeamIdsAfterScheduleIdentityChange,
  resetTeamControlsManualIds,
  shouldRefreshClockOnManualUncheck,
  shouldStopClockForManualCheck,
  toggleManualTeamIds,
} from "./draftManualTeams";

describe("manual team controls", () => {
  it("defaults to the signed-in user team only", () => {
    expect([...buildDefaultManualTeamIds(11)]).toEqual([11]);
    expect(buildDefaultManualTeamIds(null).size).toBe(0);
  });

  it("zero selected = full AI draft", () => {
    const m = new Set<number>();
    expect(isPickManual(m, 3)).toBe(false);
    expect(isPickManual(m, 11)).toBe(false);
  });

  it("one selected = only that team is manual", () => {
    const m = new Set<number>([11]);
    expect(isPickManual(m, 11)).toBe(true);
    expect(isPickManual(m, 3)).toBe(false);
  });

  it("multiple selected = each checked team is manual", () => {
    const m = toggleManualTeamIds(toggleManualTeamIds(new Set([3]), 7), 11);
    expect(isPickManual(m, 3)).toBe(true);
    expect(isPickManual(m, 7)).toBe(true);
    expect(isPickManual(m, 11)).toBe(true);
    expect(isPickManual(m, 5)).toBe(false);
  });

  it("all selected = fully manual draft", () => {
    const all = new Set(Array.from({ length: 14 }, (_, i) => i + 1));
    for (let id = 1; id <= 14; id++) expect(isPickManual(all, id)).toBe(true);
  });

  it("checking the on-clock AI team stops the countdown", () => {
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

  it("unchecking the on-clock manual team starts a fresh countdown", () => {
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

  it("draft reset preserves manual-team selections", () => {
    const preserved = toggleManualTeamIds(new Set([11]), 7);
    const afterReset = new Set(preserved);
    expect([...afterReset].sort((a, b) => a - b)).toEqual([7, 11]);
  });

  it("schedule/league identity change resets to the user team", () => {
    const dirty = toggleManualTeamIds(new Set([11]), 7);
    expect(dirty.size).toBe(2);
    const reset = manualTeamIdsAfterScheduleIdentityChange(11);
    expect([...reset]).toEqual([11]);
  });

  it("Reset team controls restores user team only", () => {
    const dirty = toggleManualTeamIds(toggleManualTeamIds(new Set([11]), 7), 3);
    const restored = resetTeamControlsManualIds(11);
    expect([...restored]).toEqual([11]);
    expect(dirty.has(7)).toBe(true);
  });
});
