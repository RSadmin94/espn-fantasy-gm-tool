import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("RFSN-030C DraftWarRoom FantasyPros wiring", () => {
  const warRoom = readFileSync(
    resolve(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
    "utf8",
  );

  it("exposes FantasyPros mock controls on Mock surface", () => {
    expect(warRoom).toContain("FantasyProsMockControlPanel");
    expect(warRoom).toContain("useFantasyProsMockDraftMonitor");
    expect(warRoom).toContain("!preferLiveDraft");
  });

  it("passes fantasyProsSessionActive into ESPN / booth gates", () => {
    expect(warRoom).toContain("fantasyProsSessionActive");
    expect(warRoom).toMatch(/isConnectedLeagueLiveActive\(\{[\s\S]*fantasyProsSessionActive/);
    expect(warRoom).toMatch(/isRfsnWarRoomBroadcastActive\(\{[\s\S]*fantasyProsSessionActive/);
  });

  it("disables in-app notify while FantasyPros session is active", () => {
    expect(warRoom).toMatch(
      /useRfsnLiveLockedPickNotify\(\{[\s\S]*fpMockActive && !preferLiveDraft/,
    );
  });
});
