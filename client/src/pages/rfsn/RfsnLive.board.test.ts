import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnLive draft board layout", () => {
  const liveSource = readFileSync(
    resolve(process.cwd(), "client/src/pages/rfsn/RfsnLive.tsx"),
    "utf8",
  );

  it("renders RfsnDraftBoard on the standby path", () => {
    expect(liveSource).toContain("RfsnDraftBoard");
    expect(liveSource).toContain("RfsnLiveStandby");
    expect(liveSource).toContain("resolveRfsnLiveDisplaySnapshot");
    expect(liveSource).toContain("padBoardRows(snapshot.board)");
  });

  it("keeps commentary-active path on RfsnBroadcastShell", () => {
    expect(liveSource).toContain("RfsnBroadcastShell");
    expect(liveSource).toContain("commentarySnapshot");
    expect(liveSource).toContain("shouldRenderLiveCommentary");
  });

  it("polls a single getLiveSnapshot query", () => {
    const matches = liveSource.match(/getLiveSnapshot\.useQuery/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("uses league-context season for draft id", () => {
    expect(liveSource).toContain("useLeagueContext");
    expect(liveSource).toContain("buildRfsnLiveDraftId(season)");
    expect(liveSource).not.toContain("rfsn-live-internal");
  });
});
