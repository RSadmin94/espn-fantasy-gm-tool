import { describe, expect, it } from "vitest";
import {
  hofTitlesForMember,
  pastChampionsFromHofLeaderboard,
  trophyByMemberFromHofLeaderboard,
} from "./castChampionshipsFromHof";

/** Atlantas Finest — authoritative HoF championships.leaderboard counts. */
const HOF_LEADERBOARD = [
  {
    ownerKey: "id:{0C4B6DC7-265E-4A23-99DE-2B67369E9141}",
    displayName: "Christian Graham",
    titles: 3,
    titleSeasons: [2018, 2020, 2022],
  },
  {
    ownerKey: "id:{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}",
    displayName: "Demetri Clark",
    titles: 3,
    titleSeasons: [2019, 2021, 2023],
  },
  {
    ownerKey: "id:{AE295BDF-FC02-479E-969E-0E712690503C}",
    displayName: "LOZELL STYLES",
    titles: 3,
    titleSeasons: [2015, 2016, 2017],
  },
  {
    ownerKey: "id:{34381793-095A-4099-B91E-04FB92B016A7}",
    displayName: "Bruce Edwards",
    titles: 2,
    titleSeasons: [2014, 2024],
  },
  {
    ownerKey: "id:{B7DED29D-BF48-441C-91B8-34CCFBB09271}",
    displayName: "Randy Broner Jr",
    titles: 2,
    titleSeasons: [2012, 2013],
  },
  {
    ownerKey: "id:{6042EE3C-4B54-42BE-A2A7-52E939D2C706}",
    displayName: "Rod Sellers",
    titles: 2,
    titleSeasons: [2010, 2011],
  },
  {
    ownerKey: "id:{F468B611-D262-466C-992F-23D7360C5CC0}",
    displayName: "Nate West",
    titles: 1,
    titleSeasons: [2025],
  },
  {
    ownerKey: "id:{82E515D1-73FF-466C-A7A8-099B050278B5}",
    displayName: "steven hibbard",
    titles: 1,
    titleSeasons: [2009],
  },
] as const;

const GUID = {
  christian: "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}",
  demetri: "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}",
  styles: "{AE295BDF-FC02-479E-969E-0E712690503C}",
  bruce: "{34381793-095A-4099-B91E-04FB92B016A7}",
  randy: "{B7DED29D-BF48-441C-91B8-34CCFBB09271}",
  rod: "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}",
  nate: "{F468B611-D262-466C-992F-23D7360C5CC0}",
  steven: "{82E515D1-73FF-466C-A7A8-099B050278B5}",
} as const;

describe("castChampionshipsFromHof — Hall of Fame title authority for The Cast", () => {
  it("matches Rod=2, Styles=3, Bruce=2, Randy=2, Nate=1 by ownerKey GUID", () => {
    const memberIds = [GUID.rod, GUID.styles, GUID.bruce, GUID.randy, GUID.nate];
    const map = trophyByMemberFromHofLeaderboard({
      leaderboard: [...HOF_LEADERBOARD],
      memberIds,
    });

    expect(map.get(GUID.rod)?.championships).toBe(2);
    expect(map.get(GUID.styles)?.championships).toBe(3);
    expect(map.get(GUID.bruce)?.championships).toBe(2);
    expect(map.get(GUID.randy)?.championships).toBe(2);
    expect(map.get(GUID.nate)?.championships).toBe(1);
  });

  it("resolves titles via canonical ownerKey (not display name)", () => {
    const rod = hofTitlesForMember({
      leaderboard: [...HOF_LEADERBOARD],
      memberId: GUID.rod,
      ownerKey: `id:${GUID.rod}`,
    });
    expect(rod.championships).toBe(2);

    const wrongName = hofTitlesForMember({
      leaderboard: [...HOF_LEADERBOARD],
      memberId: "{00000000-0000-0000-0000-000000000000}",
      ownerKey: "id:{00000000-0000-0000-0000-000000000000}",
    });
    expect(wrongName.championships).toBe(0);
  });

  it("lists departed champions from the same HoF source", () => {
    const current = new Set([
      GUID.christian,
      GUID.demetri,
      GUID.styles,
      GUID.bruce,
      GUID.randy,
      GUID.rod,
      GUID.nate,
    ]);
    const currentKeys = new Set([...current].map((id) => `id:${id}`));
    const past = pastChampionsFromHofLeaderboard({
      leaderboard: [...HOF_LEADERBOARD],
      currentMemberIds: current,
      currentOwnerKeys: currentKeys,
    });
    expect(past).toHaveLength(1);
    expect(past[0]?.memberId).toBe(GUID.steven);
    expect(past[0]?.championships).toBe(1);
  });
});
