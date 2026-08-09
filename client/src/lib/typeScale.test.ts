import { describe, expect, it } from "vitest";
import { TYPE_BADGE, TYPE_CAPTION, TYPE_KICKER, TYPE_META } from "./typeScale";

describe("RFSN-051C type scale floors", () => {
  it("keeps badges/kickers on the 11px token, not arbitrary px", () => {
    expect(TYPE_BADGE).toContain("text-2xs");
    expect(TYPE_KICKER).toContain("text-2xs");
    expect(TYPE_BADGE).not.toMatch(/text-\[\d+px\]/);
    expect(TYPE_KICKER).not.toMatch(/text-\[\d+px\]/);
  });

  it("keeps metadata and captions at or above 12px tokens", () => {
    expect(TYPE_META).toContain("text-label");
    expect(TYPE_CAPTION).toContain("text-caption");
    expect(TYPE_META).not.toMatch(/text-\[\d+px\]/);
    expect(TYPE_CAPTION).not.toMatch(/text-\[\d+px\]/);
  });

  it("uses weight and tracking instead of tiny uppercase chrome", () => {
    expect(TYPE_BADGE).toContain("font-semibold");
    expect(TYPE_KICKER).toContain("uppercase");
    expect(TYPE_KICKER).toContain("tracking-wide");
    expect(TYPE_META).toContain("font-medium");
  });
});
