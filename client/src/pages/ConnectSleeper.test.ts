import { describe, expect, it } from "vitest";
import {
  leagueIdInputError,
  previewDetailsFromValidation,
  previewErrorFromValidation,
  savedSelectionFromConnection,
} from "./ConnectSleeper";

describe("ConnectSleeper helpers", () => {
  it("valid league preview renders league details", () => {
    const details = previewDetailsFromValidation({
      valid: true,
      leagueName: "Champions",
      season: "2025",
      teamCount: 12,
    });
    expect(details).toEqual({
      leagueName: "Champions",
      season: "2025",
      teamCount: 12,
      provider: "Sleeper",
    });
  });

  it("invalid league ID shows an error", () => {
    expect(leagueIdInputError("")).toBe("Enter a Sleeper league ID");
    expect(leagueIdInputError("abc")).toBe("League ID must be numeric");
    expect(
      previewErrorFromValidation({ valid: false, error: "Sleeper returned 404" }, null),
    ).toBe("Sleeper returned 404");
  });

  it("reload shows saved selection from connection", () => {
    const saved = savedSelectionFromConnection({
      provider: "sleeper",
      leagueId: "123",
      selectedTeamId: 4,
      selectedOwnerKey: "id:user_1",
      selectedOwnerName: "Pat",
      selectedFranchiseName: "Team Pat",
    });
    expect(saved).toEqual({
      leagueId: "123",
      teamId: 4,
      ownerKey: "id:user_1",
      ownerName: "Pat",
      teamName: "Team Pat",
    });
    expect(
      savedSelectionFromConnection({
        provider: "sleeper",
        leagueId: "123",
        selectedTeamId: null,
        selectedOwnerKey: null,
        selectedOwnerName: null,
        selectedFranchiseName: null,
      }),
    ).toBeNull();
  });
});
