/**
 * Draft surface ownership — Live keeps RFSN sim; Mock is FantasyPros-only.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isConnectedLeagueLiveActive } from "@/lib/liveDraftSurfaceActive";
import { isFantasyProsSimulationBroadcastActive } from "@/lib/fantasyProsMockSession";

const warRoom = readFileSync(
  join(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
  "utf8",
);
const fpPanel = readFileSync(
  join(process.cwd(), "client/src/components/draft/FantasyProsMockControlPanel.tsx"),
  "utf8",
);
const livePanel = readFileSync(
  join(process.cwd(), "client/src/components/draft/LiveDraftControlPanel.tsx"),
  "utf8",
);

describe("Draft surface ownership (Live vs Mock)", () => {
  it("Live Draft source radios are rfsn | espn", () => {
    expect(livePanel).toContain('onSourceChange("rfsn")');
    expect(livePanel).toContain('onSourceChange("espn")');
    expect(livePanel).toContain("Connected League");
    expect(livePanel).not.toContain("Manual Draft");
  });

  it("internal sim controls are gated to preferLiveDraft + RFSN source", () => {
    expect(warRoom).toContain("data-live-sim-controls");
    expect(warRoom).toMatch(
      /\{preferLiveDraft && liveSource === "rfsn" && \(\s*<div[^>]*data-live-sim-controls/,
    );
    expect(warRoom).toContain("allowInternalSimPicks");
  });

  it("FantasyPros panel only mounts when !preferLiveDraft", () => {
    expect(warRoom).toMatch(/\{!preferLiveDraft && \(\s*<FantasyProsMockControlPanel/);
  });

  it("LiveDraftControlPanel mounts on Live surface (always, not only when active)", () => {
    expect(warRoom).toMatch(/\{preferLiveDraft && \(\s*<LiveDraftControlPanel/);
    expect(warRoom).toContain("sessionActions=");
    expect(livePanel).toContain("data-live-draft-ops");
    expect(livePanel).toContain("data-live-source-picker");
    expect(livePanel).toContain("data-live-board-driver");
    expect(livePanel).toContain("data-live-session-actions");
  });

  it("Mock diagnostics are collapsed by default", () => {
    expect(fpPanel).toContain("data-fp-diagnostics");
    expect(fpPanel).toContain("useState(false)");
    expect(fpPanel).toContain("<details");
  });

  it("liveOpsOnly page omits analytics section chrome", () => {
    expect(warRoom).toContain("data-live-draft-ops-page");
    expect(warRoom).toMatch(/if \(liveOpsOnly\) \{[\s\S]*?data-live-draft-ops-board/);
    expect(warRoom).toContain("preferLiveDraft={forceLive}");
  });

  it("switch copy names the destination route", () => {
    expect(warRoom).toContain("Switch to Mock Draft");
    expect(warRoom).toContain("Switch to Live Draft");
    expect(warRoom).toContain('to="/draft/mock"');
    expect(warRoom).toContain('to="/draft/live"');
  });

  it("ESPN ingestion requires Live + espn source", () => {
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "espn",
      }),
    ).toBe(true);
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "rfsn",
      }),
    ).toBe(false);
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: false,
        source: "espn",
      }),
    ).toBe(false);
  });

  it("FantasyPros booth arms only on Mock surface", () => {
    expect(
      isFantasyProsSimulationBroadcastActive({
        fantasyProsSessionActive: true,
        preferLiveDraft: false,
      }),
    ).toBe(true);
    expect(
      isFantasyProsSimulationBroadcastActive({
        fantasyProsSessionActive: true,
        preferLiveDraft: true,
      }),
    ).toBe(false);
  });

  it("FP monitor enabled expression requires Mock surface", () => {
    expect(warRoom).toMatch(
      /useFantasyProsMockDraftMonitor\(\{[\s\S]*enabled:\s*Boolean\(leagueId\)\s*&&\s*fpMockActive\s*&&\s*!preferLiveDraft/,
    );
  });
});
