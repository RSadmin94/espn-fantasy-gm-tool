import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { orderCastHeadliners } from "@/lib/castHeadlinerOrder";

const GUID = {
  styles: "{AE295BDF-FC02-479E-969E-0E712690503C}",
  bruce: "{34381793-095A-4099-B91E-04FB92B016A7}",
  randy: "{B7DED29D-BF48-441C-91B8-34CCFBB09271}",
  rod: "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}",
  nate: "{F468B611-D262-466C-992F-23D7360C5CC0}",
} as const;

function champ(
  memberId: string,
  ownerName: string,
  championships: number,
  opts?: { identityRank?: number },
) {
  const badges =
    championships >= 3
      ? [{ tier: "dynasty" }, { tier: "champion" }]
      : championships >= 1
        ? [{ tier: "champion" }]
        : [];
  return {
    memberId,
    ownerName,
    championships,
    badges,
    identityRank: opts?.identityRank != null ? { rank: opts.identityRank, of: 12 } : null,
  };
}

describe("castHeadlinerOrder — titles descending (HoF counts)", () => {
  it("orders Rod/Styles/Bruce/Randy/Nate by titles; single-title champion last", () => {
    const cast = [
      champ(GUID.nate, "Nate West", 1, { identityRank: 1 }),
      champ(GUID.rod, "Rod Sellers", 2, { identityRank: 5 }),
      champ(GUID.styles, "LOZELL STYLES", 3, { identityRank: 4 }),
      champ(GUID.bruce, "Bruce Edwards", 2, { identityRank: 3 }),
      champ(GUID.randy, "Randy Broner Jr", 2, { identityRank: 2 }),
      { ownerName: "No Rings", championships: 0, badges: [], identityRank: null, memberId: "x" },
    ];

    const headliners = orderCastHeadliners(cast);
    expect(headliners.map((m) => m.championships)).toEqual([3, 2, 2, 2, 1]);
    expect(headliners[0]?.ownerName).toBe("LOZELL STYLES");
    expect(headliners.slice(1, 4).map((m) => m.ownerName)).toEqual([
      "Randy Broner Jr",
      "Bruce Edwards",
      "Rod Sellers",
    ]);
    expect(headliners.at(-1)?.championships).toBe(1);
    expect(headliners.at(-1)?.memberId).toBe(GUID.nate);
  });

  it("ordering module has no name-based special-casing", () => {
    const src = fs.readFileSync(
      path.join(import.meta.dirname, "castHeadlinerOrder.ts"),
      "utf-8",
    );
    expect(src.toLowerCase()).not.toContain("nate");
    expect(src).not.toContain("isNate");
  });
});
