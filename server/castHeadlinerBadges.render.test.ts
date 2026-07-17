import { describe, expect, it } from "vitest";
import { computeEarnedBadges } from "./leagueDnaProfile";
import { trophyByMemberFromHofLeaderboard } from "./castChampionshipsFromHof";
import { orderCastHeadliners } from "../client/src/lib/castHeadlinerOrder";
import { headlinerDisplayedBadgeText } from "../client/src/lib/castHeadlinerDisplay";

/** Authoritative HoF counts for Atlantas Finest verification. */
const HOF = [
  { ownerKey: "id:{AE295BDF-FC02-479E-969E-0E712690503C}", displayName: "LOZELL STYLES", titles: 3, titleSeasons: [2015, 2016, 2017] },
  { ownerKey: "id:{6042EE3C-4B54-42BE-A2A7-52E939D2C706}", displayName: "Rod Sellers", titles: 2, titleSeasons: [2010, 2011] },
  { ownerKey: "id:{34381793-095A-4099-B91E-04FB92B016A7}", displayName: "Bruce Edwards", titles: 2, titleSeasons: [2014, 2024] },
  { ownerKey: "id:{B7DED29D-BF48-441C-91B8-34CCFBB09271}", displayName: "Randy Broner Jr", titles: 2, titleSeasons: [2012, 2013] },
  { ownerKey: "id:{F468B611-D262-466C-992F-23D7360C5CC0}", displayName: "Nate West", titles: 1, titleSeasons: [2025] },
  { ownerKey: "id:{0C4B6DC7-265E-4A23-99DE-2B67369E9141}", displayName: "Christian Graham", titles: 3, titleSeasons: [2018, 2020, 2022] },
  { ownerKey: "id:{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}", displayName: "Demetri Clark", titles: 3, titleSeasons: [2019, 2021, 2023] },
] as const;

const GUID = {
  styles: "{AE295BDF-FC02-479E-969E-0E712690503C}",
  rod: "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}",
  bruce: "{34381793-095A-4099-B91E-04FB92B016A7}",
  randy: "{B7DED29D-BF48-441C-91B8-34CCFBB09271}",
  nate: "{F468B611-D262-466C-992F-23D7360C5CC0}",
  christian: "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}",
  demetri: "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}",
} as const;

function badgeStatsFromHof() {
  const trophy = trophyByMemberFromHofLeaderboard({
    leaderboard: [...HOF],
    memberIds: Object.values(GUID),
  });
  const stats = new Map<
    string,
    {
      titles: number;
      titleSeasons: number[];
      runnerUps: number;
      thirds: number;
      seasons: number;
      winPct: number;
      playoffRate: number;
    }
  >();
  // Prefer Christian for Villain so Styles title-tier badges stay Dynasty + 3x Champion.
  const winPctById: Record<string, number> = {
    [GUID.christian]: 62,
    [GUID.demetri]: 58,
    [GUID.styles]: 54,
    [GUID.rod]: 50,
    [GUID.bruce]: 50,
    [GUID.randy]: 50,
    [GUID.nate]: 48,
  };
  for (const id of Object.values(GUID)) {
    const tr = trophy.get(id);
    stats.set(id, {
      titles: tr?.championships ?? 0,
      titleSeasons: tr?.championshipYears ?? [],
      runnerUps: 0,
      thirds: 0,
      seasons: 8,
      winPct: winPctById[id] ?? 50,
      playoffRate: 50,
    });
  }
  return stats;
}

describe("Cast rendered headliner badges — HoF title counts", () => {
  const stats = badgeStatsFromHof();

  const cases: Array<{
    id: string;
    name: string;
    titles: number;
    expectChampionLabel: string;
    expectEyebrowIncludes?: string;
    expectEyebrowExcludes?: string;
  }> = [
    {
      id: GUID.styles,
      name: "LOZELL STYLES",
      titles: 3,
      expectChampionLabel: "3x Champion",
      expectEyebrowIncludes: "Dynasty Architect",
    },
    {
      id: GUID.rod,
      name: "Rod Sellers",
      titles: 2,
      expectChampionLabel: "2x Champion",
      expectEyebrowExcludes: "Dynasty Architect",
    },
    {
      id: GUID.bruce,
      name: "Bruce Edwards",
      titles: 2,
      expectChampionLabel: "2x Champion",
      expectEyebrowExcludes: "Dynasty Architect",
    },
    {
      id: GUID.randy,
      name: "Randy Broner Jr",
      titles: 2,
      expectChampionLabel: "2x Champion",
      expectEyebrowExcludes: "Dynasty Architect",
    },
    {
      id: GUID.nate,
      name: "Nate West",
      titles: 1,
      expectChampionLabel: "Champion",
      expectEyebrowExcludes: "Dynasty Architect",
    },
  ];

  for (const c of cases) {
    it(`${c.name}: ${c.titles} titles → Headliner shows "${c.expectChampionLabel}"`, () => {
      expect(stats.get(c.id)?.titles).toBe(c.titles);
      const badges = computeEarnedBadges(c.id, stats);
      const display = headlinerDisplayedBadgeText(badges);

      expect(display.championLabel).toBe(c.expectChampionLabel);
      if (c.expectEyebrowIncludes) {
        expect(display.eyebrowText ?? "").toContain(c.expectEyebrowIncludes);
      }
      if (c.expectEyebrowExcludes) {
        expect(display.eyebrowText ?? "").not.toContain(c.expectEyebrowExcludes);
        expect(display.allLabels).not.toContain(c.expectEyebrowExcludes);
      }
    });
  }

  it("reports exact displayed badge text for the five owners", () => {
    const report: Record<
      string,
      { titles: number; eyebrowText: string | null; championLabel: string | null; allLabels: string[] }
    > = {};
    for (const c of cases) {
      const badges = computeEarnedBadges(c.id, stats);
      const display = headlinerDisplayedBadgeText(badges);
      report[c.name] = {
        titles: c.titles,
        eyebrowText: display.eyebrowText,
        championLabel: display.championLabel,
        allLabels: display.allLabels,
      };
    }
    expect(report["LOZELL STYLES"]).toEqual({
      titles: 3,
      eyebrowText: "Dynasty Architect",
      championLabel: "3x Champion",
      allLabels: ["Dynasty Architect", "3x Champion"],
    });
    expect(report["Rod Sellers"]).toEqual({
      titles: 2,
      eyebrowText: null,
      championLabel: "2x Champion",
      allLabels: ["2x Champion"],
    });
    expect(report["Bruce Edwards"]).toEqual({
      titles: 2,
      eyebrowText: null,
      championLabel: "2x Champion",
      allLabels: ["2x Champion"],
    });
    expect(report["Randy Broner Jr"]).toEqual({
      titles: 2,
      eyebrowText: null,
      championLabel: "2x Champion",
      allLabels: ["2x Champion"],
    });
    expect(report["Nate West"]).toEqual({
      titles: 1,
      eyebrowText: null,
      championLabel: "Champion",
      allLabels: ["Champion"],
    });
  });

  it("orders headliners by titles so the 1-title champion is last (no name rule)", () => {
    const cast = cases.map((c, i) => {
      const badges = computeEarnedBadges(c.id, stats);
      return {
        memberId: c.id,
        ownerName: c.name,
        championships: c.titles,
        badges,
        identityRank: { rank: i + 1, of: 5 },
      };
    });
    const shuffled = [cast[4]!, cast[0]!, cast[2]!, cast[1]!, cast[3]!];
    const headliners = orderCastHeadliners(shuffled);
    expect(headliners.map((m) => m.championships)).toEqual([3, 2, 2, 2, 1]);
    expect(headliners.at(-1)?.memberId).toBe(GUID.nate);
  });
});
