import { describe, expect, it } from "vitest";
import { buildTeamsBySeason } from "../../resolveDraftPickOwner";
import { buildDraftEngineOwnerKeyRemap, STEVEN_HIBBARD_CANONICAL_KEY } from "./personMerge";
import type { GmTeamRow } from "../../ownerProfileService";

describe("buildDraftEngineOwnerKeyRemap", () => {
  it("merges steve hibbard into steven hibbard id key", () => {
    const rows = [
      { season: 2010, teamId: 11, name: "Team hibbard", ownerName: "steve hibbard", ownerId: "" },
      {
        season: 2018,
        teamId: 9,
        name: "Team hibbard",
        ownerName: "steven hibbard",
        ownerId: "{82E515D1-73FF-466C-A7A8-099B050278B5}",
      },
    ] as unknown as GmTeamRow[];
    const remap = buildDraftEngineOwnerKeyRemap(rows);
    const steveRaw = [...remap.entries()].find(([, v]) => v === STEVEN_HIBBARD_CANONICAL_KEY || v === "name:steve hibbard");
    expect([...remap.values()].filter((v) => v === STEVEN_HIBBARD_CANONICAL_KEY).length).toBeGreaterThan(0);
    expect(remap.get("name:steve hibbard")).toBe(STEVEN_HIBBARD_CANONICAL_KEY);
  });
});
