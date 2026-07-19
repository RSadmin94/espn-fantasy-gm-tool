/**
 * Draft surface ownership — Live = real league; Mock = RFSN local / FantasyPros.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isConnectedLeagueLiveActive } from "@/lib/liveDraftSurfaceActive";
import { isFantasyProsSimulationBroadcastActive } from "@/lib/fantasyProsMockSession";
import {
  availableSourcesForExperience,
  LIVE_DRAFT_SOURCES,
  MOCK_DRAFT_SOURCES,
} from "@shared/draftSource";

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
  it("product catalog: Live = ESPN League; Mock = RFSN Local + FantasyPros", () => {
    expect(availableSourcesForExperience("live").map((s) => s.id)).toEqual(["espn-live"]);
    expect(availableSourcesForExperience("mock").map((s) => s.id)).toEqual([
      "rfsn-local-mock",
      "fantasypros-mock",
    ]);
    expect(LIVE_DRAFT_SOURCES.find((s) => s.id === "espn-live")?.label).toBe("ESPN League");
    expect(MOCK_DRAFT_SOURCES.find((s) => s.id === "rfsn-local-mock")?.label).toBe(
      "RFSN Local Mock",
    );
  });

  it("control panel uses shared catalog + board driver copy", () => {
    expect(livePanel).toContain("LIVE_DRAFT_SOURCES");
    expect(livePanel).toContain("MOCK_DRAFT_SOURCES");
    expect(livePanel).toContain("data-live-source-picker");
    expect(livePanel).toContain("data-live-board-driver");
    expect(livePanel).toContain("shared Draft Engine");
  });

  it("internal sim controls are gated to Mock + RFSN Local (allowInternalSimPicks)", () => {
    expect(warRoom).toContain("data-live-sim-controls");
    expect(warRoom).toMatch(
      /\{allowInternalSimPicks && \(\s*<div[^>]*data-live-sim-controls/,
    );
    expect(warRoom).toContain('allowInternalSimPicks = !preferLiveDraft && mockSource === "rfsn"');
  });

  it("FantasyPros panel only mounts on Mock + fantasypros source", () => {
    expect(warRoom).toMatch(
      /\{!preferLiveDraft && mockSource === "fantasypros" && \(\s*<FantasyProsMockControlPanel/,
    );
  });

  it("LiveDraftControlPanel mounts for both experiences", () => {
    expect(warRoom).toContain("experience={preferLiveDraft ? \"live\" : \"mock\"}");
    expect(warRoom).toContain("sessionActions=");
    expect(livePanel).toContain("data-live-draft-ops");
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

  it("FP monitor enabled expression requires Mock + fantasypros source (not commentary toggle)", () => {
    expect(warRoom).toMatch(
      /useFantasyProsMockDraftMonitor\(\{[\s\S]*enabled:\s*Boolean\(leagueId\)\s*&&\s*fpSessionArmed,/,
    );
    expect(warRoom).not.toMatch(
      /useFantasyProsMockDraftMonitor\(\{[\s\S]*enabled:\s*Boolean\(leagueId\)\s*&&\s*fpSessionArmed\s*&&\s*fpCommentaryEnabled/,
    );
  });
});
