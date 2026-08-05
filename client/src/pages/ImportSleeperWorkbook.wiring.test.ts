import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf-8");
}

describe("Sleeper workbook team selection wiring", () => {
  it("exposes selectSleeperWorkbookTeam and does not route workbook to ESPN select-team", () => {
    const router = read("server/providerRouter.ts");
    expect(router).toContain("selectSleeperWorkbookTeam");
    expect(router).toContain("runSelectSleeperWorkbookTeam");

    const importFile = read("server/sleeperWorkbookImport.ts");
    expect(importFile).toContain("export async function runSelectSleeperWorkbookTeam");
    expect(importFile).toContain('provider: "sleeper_workbook"');

    const page = read("client/src/pages/ImportSleeperWorkbook.tsx");
    expect(page).toContain("selectSleeperWorkbookTeam");
    expect(page).toContain("data-workbook-team-select");

    const connected = read("client/src/pages/ConnectedLeagues.tsx");
    expect(connected).toContain('league.provider === "sleeper_workbook"');
    expect(connected).toContain('/import/sleeper-workbook');
    expect(connected).toMatch(
      /provider === "sleeper_workbook"[\s\S]*?\/import\/sleeper-workbook/,
    );
  });
});
