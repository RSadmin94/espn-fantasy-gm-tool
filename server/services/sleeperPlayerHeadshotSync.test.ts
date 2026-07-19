/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildEspnIdToSleeperIdMap,
  categorizeUnmatchedRegistryRow,
  planSleeperIdUpdates,
  type SleeperNflPlayerRow,
} from "../services/sleeperPlayerHeadshotSync";
import {
  espnPlayerHeadshotUrl,
  resolvePlayerHeadshotUrl,
  sleeperPlayerHeadshotUrl,
} from "../../shared/playerHeadshot";

describe("sleeperPlayerHeadshotUrl", () => {
  it("builds thumb and full CDN URLs", () => {
    expect(sleeperPlayerHeadshotUrl("4046")).toBe(
      "https://sleepercdn.com/content/nfl/players/thumb/4046.jpg",
    );
    expect(sleeperPlayerHeadshotUrl("4046", { size: "full" })).toBe(
      "https://sleepercdn.com/content/nfl/players/4046.jpg",
    );
  });

  it("rejects empty / unsafe ids", () => {
    expect(sleeperPlayerHeadshotUrl(null)).toBeNull();
    expect(sleeperPlayerHeadshotUrl("../x")).toBeNull();
  });
});

describe("resolvePlayerHeadshotUrl", () => {
  it("prefers ESPN then Sleeper", () => {
    expect(
      resolvePlayerHeadshotUrl({ espnPlayerId: "3139477", sleeperPlayerId: "4046" }),
    ).toBe(espnPlayerHeadshotUrl("3139477"));
    expect(
      resolvePlayerHeadshotUrl({ espnPlayerId: null, sleeperPlayerId: "4046" }),
    ).toBe(sleeperPlayerHeadshotUrl("4046"));
  });
});

describe("buildEspnIdToSleeperIdMap / planSleeperIdUpdates", () => {
  it("maps sleeper espn_id onto registry updates and skips already-matched", () => {
    const catalog: Record<string, SleeperNflPlayerRow> = {
      "4046": { player_id: "4046", full_name: "Patrick Mahomes", espn_id: 3139477 },
      "6794": { player_id: "6794", full_name: "Justin Jefferson", espn_id: "4262921" },
      "SF": { player_id: "SF", full_name: "San Francisco 49ers", espn_id: "" },
    };
    const map = buildEspnIdToSleeperIdMap(catalog);
    expect(map.get("3139477")).toBe("4046");
    expect(map.get("4262921")).toBe("6794");
    expect(map.has("")).toBe(false);

    const planned = planSleeperIdUpdates({
      espnToSleeper: map,
      registry: [
        { id: 1, espnPlayerId: "3139477", sleeperPlayerId: null },
        { id: 2, espnPlayerId: "4262921", sleeperPlayerId: "6794" },
        { id: 3, espnPlayerId: null, sleeperPlayerId: null },
        { id: 4, espnPlayerId: "9999999", sleeperPlayerId: null },
      ],
    });
    expect(planned.updates).toEqual([{ id: 1, sleeperPlayerId: "4046" }]);
    expect(planned.alreadyMatched).toBe(1);
    expect(planned.unmatchedEspnIds).toEqual(["9999999"]);
  });

  it("second plan after apply is idempotent (0 updates)", () => {
    const map = new Map([["3139477", "4046"]]);
    const after = planSleeperIdUpdates({
      espnToSleeper: map,
      registry: [{ id: 1, espnPlayerId: "3139477", sleeperPlayerId: "4046" }],
    });
    expect(after.updates).toEqual([]);
    expect(after.alreadyMatched).toBe(1);
  });
});

describe("categorizeUnmatchedRegistryRow", () => {
  it("labels missing espn, DEF, and no match", () => {
    const empty = new Map<string, string>();
    expect(
      categorizeUnmatchedRegistryRow({
        espnPlayerId: null,
        espnToSleeper: empty,
        catalogByEspn: new Map(),
      }),
    ).toBe("missing_espn_id_on_registry");
    expect(
      categorizeUnmatchedRegistryRow({
        espnPlayerId: "1",
        position: "DEF",
        espnToSleeper: empty,
        catalogByEspn: new Map(),
      }),
    ).toBe("defense_or_team_id");
    expect(
      categorizeUnmatchedRegistryRow({
        espnPlayerId: "1",
        position: "WR",
        espnToSleeper: empty,
        catalogByEspn: new Map(),
      }),
    ).toBe("no_sleeper_match");
  });
});
