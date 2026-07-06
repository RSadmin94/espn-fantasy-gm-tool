import { describe, expect, it } from "vitest";
import { proposedActiveProfileKeySet } from "../activeOwners";
import { buildChoiceLedger, formatChoiceRecordPlain } from "./choiceLedger";
import { buildTeamsBySeason } from "../../resolveDraftPickOwner";
import type { DraftPickRow } from "./types";

const LEAGUE = "457622";
const BRUCE = "id:{34381793-095A-4099-B91E-04FB92B016A7}";
const STEVE = "name:steven hibbard";

function team(season: number, teamId: number, ownerName: string, ownerId: string) {
  return {
    leagueId: LEAGUE,
    season,
    teamId,
    teamName: `Team ${teamId}`,
    ownerName,
    ownerId,
  };
}

function openPick(args: Partial<DraftPickRow> & Pick<DraftPickRow, "season" | "overallPick" | "teamId" | "playerName">) {
  return {
    position: "RB",
    roundId: Math.ceil(args.overallPick / 2),
    roundPick: ((args.overallPick - 1) % 2) + 1,
    isKeeper: 0,
    rawPick: JSON.stringify({ keeper: false, reservedForKeeper: false }),
    ...args,
  } satisfies DraftPickRow;
}

describe("buildChoiceLedger", () => {
  it("emits choice-over-available records for open picks only", () => {
    const draftRows: DraftPickRow[] = [
      openPick({ season: 2024, overallPick: 1, teamId: 1, playerName: "Alice RB", position: "RB" }),
      openPick({ season: 2024, overallPick: 2, teamId: 2, playerName: "Bob WR", position: "WR" }),
      {
        season: 2024,
        overallPick: 3,
        teamId: 1,
        playerName: "Keeper Guy",
        position: "WR",
        roundId: 3,
        roundPick: 1,
        isKeeper: 1,
        rawPick: JSON.stringify({ keeper: true }),
      },
      openPick({ season: 2024, overallPick: 4, teamId: 2, playerName: "Charlie RB", position: "RB" }),
    ];
    const allLeagueTeams = [
      team(2024, 1, "Bruce Edwards", "{34381793-095A-4099-B91E-04FB92B016A7}"),
      team(2024, 2, "Rod Sellers", "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}"),
    ];
    const ledger = buildChoiceLedger({
      leagueId: LEAGUE,
      draftRows,
      allLeagueTeams,
      activeProfileKeys: proposedActiveProfileKeySet(),
    });
    expect(ledger.stats.openChoiceEvents).toBe(3);
    expect(ledger.choiceRecords[0]!.availableSet).toHaveLength(4);
    expect(ledger.choiceRecords[1]!.availableSet).toHaveLength(3);
  });

  it("tags departed owners as board context without excluding their picks", () => {
    const draftRows: DraftPickRow[] = [
      openPick({ season: 2020, overallPick: 1, teamId: 9, playerName: "Veteran RB", position: "RB" }),
      openPick({ season: 2020, overallPick: 2, teamId: 1, playerName: "Bruce RB", position: "RB" }),
    ];
    const allLeagueTeams = [
      team(2020, 9, "steven hibbard", ""),
      team(2020, 1, "Bruce Edwards", "{34381793-095A-4099-B91E-04FB92B016A7}"),
    ];
    const ledger = buildChoiceLedger({
      leagueId: LEAGUE,
      draftRows,
      allLeagueTeams,
      activeProfileKeys: proposedActiveProfileKeySet(),
    });
    const departed = ledger.choiceRecords.find((r) => r.chooserProfileKey === STEVE);
    const active = ledger.choiceRecords.find((r) => r.chooserProfileKey === BRUCE);
    expect(departed?.chooserRole).toBe("departed_context");
    expect(active?.chooserRole).toBe("active");
    expect(ledger.stats.departedChooserChoices).toBe(1);
  });

  it("formats plain-English choice lines", () => {
    const draftRows: DraftPickRow[] = [
      openPick({ season: 2024, overallPick: 1, teamId: 2, playerName: "Bijan Robinson", position: "RB" }),
      openPick({ season: 2024, overallPick: 2, teamId: 3, playerName: "Ja'Marr Chase", position: "WR" }),
      openPick({ season: 2024, overallPick: 3, teamId: 4, playerName: "Jonathan Taylor", position: "RB" }),
      openPick({ season: 2024, overallPick: 4, teamId: 1, playerName: "Nico Collins", position: "WR" }),
      openPick({ season: 2024, overallPick: 5, teamId: 2, playerName: "Drake London", position: "WR" }),
    ];
    const allLeagueTeams = [
      team(2024, 1, "Bruce Edwards", "{34381793-095A-4099-B91E-04FB92B016A7}"),
      team(2024, 2, "Rod Sellers", "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}"),
      team(2024, 3, "Demetri Clark", "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}"),
      team(2024, 4, "Mark Deroux", "{1130450A-E524-475A-96E2-F45C79CDBE21}"),
    ];
    const ledger = buildChoiceLedger({
      leagueId: LEAGUE,
      draftRows,
      allLeagueTeams,
      activeProfileKeys: proposedActiveProfileKeySet(),
    });
    const brucePick = ledger.choiceRecords.find(
      (r) => r.chooserProfileKey === BRUCE && r.chosenPlayer.playerName === "Nico Collins",
    )!;
    const line = formatChoiceRecordPlain(brucePick);
    expect(line).toContain("Nico Collins");
    expect(line).toContain("Drake London");
  });
});
