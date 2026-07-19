/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  espnPlayerHeadshotUrl,
  resolvePlayerHeadshotUrl,
  sleeperPlayerHeadshotUrl,
} from "./playerHeadshot";

describe("shared/playerHeadshot", () => {
  it("builds ESPN and Sleeper URLs", () => {
    expect(espnPlayerHeadshotUrl("3139477")).toContain("3139477.png");
    expect(sleeperPlayerHeadshotUrl("4046")).toContain("/thumb/4046.jpg");
  });

  it("prefers ESPN over Sleeper", () => {
    const url = resolvePlayerHeadshotUrl({
      espnPlayerId: "3139477",
      sleeperPlayerId: "4046",
    });
    expect(url).toContain("espncdn.com");
  });
});
