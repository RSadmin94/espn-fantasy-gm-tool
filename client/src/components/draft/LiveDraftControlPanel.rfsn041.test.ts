/**
 * RFSN-041 — Live Draft Control panel height compression (layout-only).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(
  join(process.cwd(), "client/src/components/draft/LiveDraftControlPanel.tsx"),
  "utf8",
);

describe("RFSN-041 Live Draft Control compression", () => {
  it("uses a compact status card instead of a tall instructional stack", () => {
    expect(panel).toContain("data-live-compact-status");
    expect(panel).toContain('label="Status"');
    expect(panel).toContain('label="Source"');
    expect(panel).toContain('label="Session"');
    expect(panel).toContain('label="Mirror"');
    expect(panel).toContain('label="Picks Locked"');
    expect(panel).toContain("data-rfsn-041");
  });

  it("moves diagnostics into a collapsed Advanced section", () => {
    expect(panel).toContain("data-live-advanced");
    expect(panel).toContain("<details");
    expect(panel).toContain("data-live-board-driver");
    expect(panel).toContain("data-live-status-lines");
    // Board driver / multi-line status live under Advanced, not the primary card.
    const advancedIdx = panel.indexOf("data-live-advanced");
    const boardIdx = panel.indexOf("data-live-board-driver");
    const linesIdx = panel.indexOf("data-live-status-lines");
    expect(advancedIdx).toBeGreaterThan(0);
    expect(boardIdx).toBeGreaterThan(advancedIdx);
    expect(linesIdx).toBeGreaterThan(advancedIdx);
  });

  it("preserves control surface hooks and actions", () => {
    expect(panel).toContain("data-live-draft-control");
    expect(panel).toContain("data-live-source-picker");
    expect(panel).toContain("data-live-draft-power");
    expect(panel).toContain("data-live-espn-connect");
    expect(panel).toContain("data-live-session-actions");
    expect(panel).toContain("onToggleActive");
    expect(panel).toContain("onSourceChange");
    expect(panel).not.toContain("space-y-3");
  });

  it("does not alter UX phase helpers (behavior stays in liveDraftUx)", () => {
    expect(panel).toContain("resolveLiveDraftUiPhase");
    expect(panel).toContain("liveDraftStatusLines");
  });
});
