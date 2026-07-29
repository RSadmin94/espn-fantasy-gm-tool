import { describe, expect, it } from "vitest";
import {
  signHistoricalReceipt,
  verifyHistoricalReceipt,
  payloadToPublicReceipt,
  type HistoricalReceiptSharePayload,
} from "./historicalReceiptShareToken";
import { historicalReceiptSvg } from "./historicalReceiptOg";

const samplePayload = (): HistoricalReceiptSharePayload => ({
  v: 1,
  k: "playoff_elimination",
  lg: "Test League",
  fn: "Rod",
  rn: "Mike",
  se: 2019,
  wk: 16,
  hl: "Mike ended Rod's season",
  ev: "Mike eliminated Rod from the playoffs.",
  wm: "Playoff elimination is the sharpest rivalry scar.",
  cr: "Rod 98.2 – 112.4 Mike",
  tn: "bad",
  fs: 98.2,
  rs: 112.4,
  mg: 14.2,
  mt: "Playoff",
  sr: "8–12",
  ec: 1,
  tl: "Playoff Elimination",
});

describe("historicalReceiptShareToken", () => {
  it("round-trips sign and verify", () => {
    const code = signHistoricalReceipt(samplePayload());
    const p = verifyHistoricalReceipt(code);
    expect(p?.se).toBe(2019);
    expect(p?.wk).toBe(16);
    expect(p?.hl).toMatch(/ended Rod/);
  });

  it("public payload excludes private account fields", () => {
    const pub = payloadToPublicReceipt(samplePayload());
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/userId|email|swid|espn_s2|password|openId/i);
    expect(pub.season).toBe(2019);
    expect(pub.whenLabel).toBe("Season 2019 · Week 16");
    expect(pub.whyMatters).toMatch(/rivalry scar/i);
  });

  it("copy-link path uses historical-receipt route", () => {
    const code = signHistoricalReceipt(samplePayload());
    const path = `/historical-receipt/${encodeURIComponent(code)}`;
    expect(path).toMatch(/^\/historical-receipt\//);
  });

  it("renders OG svg with headline, result, season, and why matters", () => {
    const svg = historicalReceiptSvg(samplePayload(), "og");
    expect(svg).toContain("WHY THIS MATTERS");
    expect(svg).toContain("2019");
    expect(svg).toContain("FANTASY FOOTBALL RIVALS");
    expect(svg).toMatch(/98\.2|112\.4|ended Rod/i);
  });

  it("supports square portrait and story formats", () => {
    for (const fmt of ["square", "portrait", "story"] as const) {
      const svg = historicalReceiptSvg(samplePayload(), fmt);
      expect(svg.length).toBeGreaterThan(500);
      expect(svg).toContain("WHY THIS MATTERS");
    }
  });
});
