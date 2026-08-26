import { describe, expect, it } from "vitest";
import {
  espnOffenseAdpCacheKey,
  parseEspnAdpPayload,
  usableEspnAdp,
  usableEspnRank,
} from "./postDraftEvalBoard";

describe("ESPN season ranking discovery", () => {
  it("parses the stored ESPN ID-to-ADP map used by 2018 and 2020-2024", () => {
    const parsed = parseEspnAdpPayload({
      season: 2018,
      fetchedAt: "2026-08-10T00:00:00.000Z",
      players: {
        "13934": { adp: 5.5, projection: null, percentStarted: null },
        "2977644": { adp: 1.4, projection: null, percentStarted: null },
      },
    });
    expect(espnOffenseAdpCacheKey(2018)).toBe("espn:offense-adp:2018");
    expect(parsed).toHaveLength(2);
    const gurley = parsed.find((p) => p.playerId === 2977644);
    expect(gurley?.adp).toBe(1.4);
    expect(gurley?.ecrRank).toBe(1.4);
    expect(gurley?.name).toBe("");
  });

  it("parses 2025 ESPN PPR ranks and drops the 170 ADP sentinel", () => {
    const parsed = parseEspnAdpPayload({
      season: 2025,
      source: "espn_kona_player_info",
      players: {
        "4362628": { adp: 170, rank: 1, name: "Ja'Marr Chase", position: "WR" },
        "4430807": { adp: 170, rank: 2, name: "Bijan Robinson", position: "RB" },
      },
    });
    expect(usableEspnAdp(170)).toBeNull();
    expect(usableEspnRank(1)).toBe(1);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ playerId: 4362628, name: "Ja'Marr Chase", adp: null, ecrRank: 1 });
    expect(parsed[1]?.ecrRank).toBe(2);
  });

  it("does not invent rankings when a historical season has no ADP or rank", () => {
    expect(parseEspnAdpPayload({ season: 2019, players: {} })).toEqual([]);
    expect(
      parseEspnAdpPayload({
        players: [{ id: 3139477, fullName: "Patrick Mahomes", ownership: { averageDraftPosition: 0 } }],
      }),
    ).toEqual([]);
  });

  it("does not leak a later season's board into an earlier season key", () => {
    const y2025 = parseEspnAdpPayload({
      season: 2025,
      players: { "4362628": { rank: 1, name: "Ja'Marr Chase", position: "WR" } },
    });
    const y2026 = parseEspnAdpPayload({
      season: 2026,
      players: { "4429795": { adp: 1.46, rank: 1, name: "Jahmyr Gibbs", position: "RB" } },
    });
    expect(espnOffenseAdpCacheKey(2025)).not.toBe(espnOffenseAdpCacheKey(2026));
    expect(y2025[0]?.playerId).toBe(4362628);
    expect(y2026[0]?.playerId).toBe(4429795);
    expect(y2025[0]?.ecrRank).toBe(1);
    expect(y2026[0]?.adp).toBe(1.46);
  });

  it("keeps array payloads with names working for live ESPN kona rows", () => {
    const parsed = parseEspnAdpPayload([
      {
        id: 3929630,
        fullName: "Saquon Barkley",
        defaultPosition: "RB",
        ownership: { averageDraftPosition: 5.3 },
      },
    ]);
    expect(parsed[0]).toMatchObject({ playerId: 3929630, name: "Saquon Barkley", adp: 5.3, ecrRank: 5.3 });
  });
});
