import { describe, expect, it } from "vitest";
import {
  SPACE_CARD,
  SPACE_CARD_GAP,
  SPACE_CHIP,
  SPACE_CHIP_GAP,
  SPACE_CLUSTER,
  SPACE_META,
  SPACE_ROW,
  SPACE_ROW_GAP,
  SPACE_ROW_STACK,
  SPACE_ROW_Y,
  SPACE_SECTION,
  SPACE_SECTION_INSET,
  SPACE_SECTION_Y,
  SPACE_STRIP,
} from "./density";

describe("RFSN-054 density rhythm", () => {
  it("keeps chips on 6px vertical padding", () => {
    expect(SPACE_CHIP).toBe("px-2.5 py-1.5");
    expect(SPACE_CHIP_GAP).toBe("gap-1.5");
  });

  it("keeps the compact chrome strip at 8/12px", () => {
    expect(SPACE_STRIP).toBe("px-3 py-2");
  });

  it("keeps clusters at 8px and label-under-value at 12px", () => {
    expect(SPACE_CLUSTER).toBe("gap-2");
    expect(SPACE_META).toBe("mt-2");
    expect(SPACE_ROW).toBe("px-3.5 py-3");
    expect(SPACE_ROW_Y).toBe("py-3");
    expect(SPACE_ROW_GAP).toBe("gap-3");
    expect(SPACE_ROW_STACK).toBe("space-y-3");
  });

  it("keeps cards at 16px and section blocks at 16–20px", () => {
    expect(SPACE_CARD).toBe("p-4");
    expect(SPACE_CARD_GAP).toBe("gap-3");
    expect(SPACE_SECTION).toBe("gap-4");
    expect(SPACE_SECTION_Y).toBe("space-y-4");
    expect(SPACE_SECTION_INSET).toBe("p-5");
  });

  it("does not encode font sizes", () => {
    const all = [
      SPACE_CHIP,
      SPACE_CARD,
      SPACE_ROW,
      SPACE_SECTION,
      SPACE_SECTION_INSET,
    ].join(" ");
    expect(all).not.toMatch(/text-/);
  });
});
