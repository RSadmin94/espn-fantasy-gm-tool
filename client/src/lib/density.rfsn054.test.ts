/**
 * RFSN-054 — density tokens are wired into the scoped surfaces.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const SURFACES = [
  "client/src/pages/DraftWarRoom.tsx",
  "client/src/components/draft/LiveDraftControlPanel.tsx",
  "client/src/components/draft/LiveDraftRecentPicks.tsx",
  "client/src/components/leagueWire/LeagueWireNewsroom.tsx",
  "client/src/pages/CommissionerCommandCenter.tsx",
  "client/src/components/ui/table.tsx",
  "client/src/components/PlayoffPositionTruthPanel.tsx",
  "client/src/components/rfsn/RfsnPickClock.tsx",
];

describe("RFSN-054 density surface wiring", () => {
  it("every scoped surface imports the density rhythm", () => {
    for (const rel of SURFACES) {
      expect(read(rel), rel).toMatch(/from ["']@\/lib\/density["']/);
    }
  });

  it("draft pool / filters / board use chip + row + card tokens", () => {
    const warRoom = read("client/src/pages/DraftWarRoom.tsx");
    expect(warRoom).toContain("SPACE_CHIP");
    expect(warRoom).toContain("SPACE_ROW");
    expect(warRoom).toContain("SPACE_CARD");
    expect(warRoom).toContain("SPACE_CARD_GAP");
    expect(warRoom).not.toContain("gap-px");
  });

  it("live control and recent picks use chip + card tokens", () => {
    const control = read("client/src/components/draft/LiveDraftControlPanel.tsx");
    const recent = read("client/src/components/draft/LiveDraftRecentPicks.tsx");
    expect(control).toContain("SPACE_CHIP");
    expect(control).toContain("SPACE_CARD");
    expect(recent).toContain("SPACE_CARD");
    expect(recent).toContain("SPACE_ROW");
    expect(control).not.toContain("space-y-3");
  });

  it("stories Live Wire and commissioner tiles use card + section tokens", () => {
    const wire = read("client/src/components/leagueWire/LeagueWireNewsroom.tsx");
    const commish = read("client/src/pages/CommissionerCommandCenter.tsx");
    expect(wire).toContain("SPACE_CARD");
    expect(wire).toContain("SPACE_CARD_GAP");
    expect(wire).toContain("SPACE_META");
    expect(commish).toContain("SPACE_SECTION");
    expect(commish).toContain("SPACE_SECTION_INSET");
    expect(commish).toContain("SPACE_CHIP");
    expect(commish).toContain("SPACE_ROW_STACK");
  });

  it("tables and championship HeroStat follow row / card rhythm", () => {
    const table = read("client/src/components/ui/table.tsx");
    const hero = read("client/src/components/PlayoffPositionTruthPanel.tsx");
    expect(table).toContain("SPACE_ROW_Y");
    expect(hero).toContain("SPACE_CARD");
    expect(hero).toContain("SPACE_META");
  });
});
