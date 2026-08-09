/**
 * RFSN-041 — Live Draft Control panel height compression (layout-only).
 * RFSN-054A further collapses the default strip; diagnostics stay in Advanced.
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
  it("uses a dense dashboard metric row", () => {
    expect(panel).toContain("data-live-compact-status");
    expect(panel).toContain('label="Status"');
    expect(panel).toContain('label="Session"');
    expect(panel).toContain('label="Source"');
    expect(panel).toContain('label="Picks"');
    expect(panel).toContain("data-rfsn-041");
    expect(panel).toContain("liveDraftPhaseBadgeLabel(phase)");
  });

  it("keeps board driver, source picker, mirror, and errors under Advanced", () => {
    expect(panel).toContain("data-live-advanced");
    expect(panel).toContain("<details");
    const advancedIdx = panel.indexOf("data-live-advanced");
    expect(panel.indexOf("data-live-board-driver")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-source-picker")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-draft-error")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf("data-live-status-lines")).toBeGreaterThan(advancedIdx);
    expect(panel.indexOf('label="Mirror"')).toBeGreaterThan(advancedIdx);
  });

  it("filters duplicate explanatory sentences from the primary path", () => {
    expect(panel).toContain("HIDDEN_PRIMARY_EXPLANATIONS");
    expect(panel).toContain("Live Draft will resume when the Mirror recovers");
    expect(panel).toContain("Keep the ESPN draft tab open");
  });

  it("preserves control surface hooks and actions", () => {
    expect(panel).toContain("data-live-draft-control");
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
