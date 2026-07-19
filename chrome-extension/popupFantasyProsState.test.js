/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  MSG_FP_MOCK_ARM,
  MSG_FP_MOCK_DISARM,
  buildFantasyProsArmMessage,
  buildFantasyProsDisarmMessage,
  deriveFantasyProsPopupView,
  renderFantasyProsSectionHtml,
} from "./popupFantasyProsState.js";

describe("RFSN-030C FantasyPros popup state", () => {
  it("renders not-detected state", () => {
    const view = deriveFantasyProsPopupView(
      { ok: true, armed: false, config: null, lastStatus: null, lastPickAt: null },
      { ok: true, fantasyProsTabs: 0, reached: 0, armed: false },
      { selectedLeagueId: "457622", leagueOptions: [{ id: "457622", name: "Test" }] },
    );
    expect(view.detected).toBe(false);
    expect(view.armed).toBe(false);
    expect(view.detectionLabel).toMatch(/Not detected/i);
    const html = renderFantasyProsSectionHtml(view);
    expect(html).toContain("data-fantasypros-popup");
    expect(html).toContain("Not detected");
    expect(html).toContain('id="fpStart"');
    // League selected → Start enabled even before FP tab (background waits).
    expect(html).toMatch(/id="fpStart"(?![^>]*disabled)/);
  });

  it("renders detected + can start when league selected", () => {
    const view = deriveFantasyProsPopupView(
      { ok: true, armed: false, lastStatus: null },
      { ok: true, fantasyProsTabs: 1, reached: 1, armed: false },
      { selectedLeagueId: "457622", leagueOptions: [{ id: "457622", name: "ATL" }] },
    );
    expect(view.detected).toBe(true);
    expect(view.connectedLabel).toBe("Not connected");
    const html = renderFantasyProsSectionHtml(view);
    expect(html).toContain("Detected (1 tab)");
    expect(html).toMatch(/id="fpStart"(?![^>]*disabled)/);
  });

  it("renders armed/monitoring with session + picks emitted", () => {
    const view = deriveFantasyProsPopupView(
      {
        ok: true,
        armed: true,
        picksEmitted: 12,
        picksObserved: 12,
        ffrTabs: 1,
        lastPickAt: "2026-07-19T12:00:00.000Z",
        lastStatus: {
          status: "monitoring",
          draftId: "fp-mock-abc",
          providerDraftId: "abc",
          pickCount: 12,
          diagnostics: {
            picksEmitted: 12,
            rowsScanned: 12,
            duplicatesSuppressed: 0,
            picksObserved: 9999, // legacy inflation must be ignored
          },
        },
        config: { leagueId: "457622" },
      },
      { ok: true, fantasyProsTabs: 1, reached: 1, armed: true },
      { selectedLeagueId: "457622", leagueOptions: [{ id: "457622", name: "ATL" }] },
    );
    expect(view.armed).toBe(true);
    expect(view.monitoring).toBe(true);
    expect(view.picksEmitted).toBe(12);
    expect(view.picksObserved).toBe(12);
    expect(view.draftId).toBe("fp-mock-abc");
    const html = renderFantasyProsSectionHtml(view);
    expect(html).toContain("Connected");
    expect(html).toContain("fp-mock-abc");
    expect(html).toContain("Picks emitted:");
    expect(html).toContain("FFR tabs 1");
    expect(html).toContain('id="fpStop"');
    expect(html).not.toContain('id="fpStart"');
  });

  it("build arm/disarm messages use existing bridge types", () => {
    const arm = buildFantasyProsArmMessage("457622");
    expect(arm.type).toBe(MSG_FP_MOCK_ARM);
    expect(arm.config.leagueId).toBe("457622");
    expect(arm.config.provider).toBe("fantasypros");
    const disarm = buildFantasyProsDisarmMessage();
    expect(disarm.type).toBe(MSG_FP_MOCK_DISARM);
  });

  it("does not include ESPN sync controls in FantasyPros section", () => {
    const view = deriveFantasyProsPopupView(
      { armed: false },
      { fantasyProsTabs: 0, reached: 0 },
      { selectedLeagueId: "", leagueOptions: [] },
    );
    const html = renderFantasyProsSectionHtml(view);
    expect(html).not.toContain("Sync Selected Leagues");
    expect(html).not.toContain("Refresh leagues");
    expect(html).not.toContain("espn_s2");
    expect(html).toContain("FantasyPros Mock");
  });
});
