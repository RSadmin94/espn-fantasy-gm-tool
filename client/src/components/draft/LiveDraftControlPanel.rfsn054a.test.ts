/**
 * RFSN-054A — Compact Live Draft Control strip (layout-only).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(
  join(process.cwd(), "client/src/components/draft/LiveDraftControlPanel.tsx"),
  "utf8",
);
const warRoom = readFileSync(
  join(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
  "utf8",
);
const rfsnLive = readFileSync(
  join(process.cwd(), "client/src/pages/rfsn/RfsnLive.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(process.cwd(), "client/src/components/rfsn/RfsnMediaShell.tsx"),
  "utf8",
);

describe("RFSN-054A compact Live Draft Control", () => {
  it("defaults to a single status strip", () => {
    expect(panel).toContain("data-rfsn-054a");
    expect(panel).toContain("data-live-compact-strip");
    expect(panel).toContain("SPACE_STRIP");
    expect(panel).toContain('label="Status"');
    expect(panel).toContain('label="Session"');
    expect(panel).toContain('label="Source"');
    expect(panel).toContain('label="Picks"');
    expect(panel).toContain("data-live-draft-power");
  });

  it("moves mirror, ESPN connect, timestamps, and diagnostics under Advanced", () => {
    const advancedIdx = panel.indexOf("data-live-advanced");
    expect(advancedIdx).toBeGreaterThan(-1);
    expect(panel.indexOf('label="Mirror"')).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-espn-connect")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("Updated {new Date(status.lastPollAt)")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-board-driver")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-source-picker")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-draft-error")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-connector-status")).toBeGreaterThan(advancedIdx);
  });

  it("keeps Status/Session/Source/Picks on the primary strip", () => {
    const compactIdx = panel.indexOf("data-live-compact-status");
    const advancedIdx = panel.indexOf("data-live-advanced");
    expect(panel.indexOf('label="Status"')).toBeGreaterThan(compactIdx);
    expect(panel.indexOf('label="Status"')).toBeLessThan(advancedIdx);
    expect(panel.indexOf('label="Session"')).toBeGreaterThan(compactIdx);
    expect(panel.indexOf('label="Session"')).toBeLessThan(advancedIdx);
    expect(panel.indexOf('label="Source"')).toBeGreaterThan(compactIdx);
    expect(panel.indexOf('label="Source"')).toBeLessThan(advancedIdx);
    expect(panel.indexOf('label="Picks"')).toBeGreaterThan(compactIdx);
    expect(panel.indexOf('label="Picks"')).toBeLessThan(advancedIdx);
  });

  it("tightens Live page chrome on /rfsn/live and /draft/live", () => {
    expect(rfsnLive).toContain("compactHeader");
    expect(shell).toContain("compactHeader");
    expect(warRoom).toContain("data-live-draft-ops-page");
    expect(warRoom).toContain('compact');
    expect(warRoom).toContain("preferLiveDraft ? \"p-3\" : \"p-4\"");
  });

  it("does not change UX phase helpers", () => {
    expect(panel).toContain("resolveLiveDraftUiPhase");
    expect(panel).toContain("liveDraftStatusLines");
    expect(panel).toContain("onToggleActive");
    expect(panel).toContain("onSourceChange");
    expect(panel).not.toContain("space-y-3");
  });
});
