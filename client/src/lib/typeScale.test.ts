import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TYPE_BADGE, TYPE_CAPTION, TYPE_KICKER, TYPE_META, TYPE_SECTION } from "./typeScale";

describe("RFSN-054B/054C type scale floors", () => {
  it("keeps badge/kicker size at 12px and raises kicker contrast only", () => {
    expect(TYPE_BADGE).toContain("text-2xs");
    expect(TYPE_KICKER).toContain("text-2xs");
    expect(TYPE_KICKER).toContain("text-ink-secondary");
    expect(TYPE_KICKER).not.toContain("text-ink-tertiary");
    expect(TYPE_BADGE).not.toMatch(/text-\[\d+px\]/);
    expect(TYPE_KICKER).not.toMatch(/text-\[\d+px\]/);
  });

  it("keeps metadata and captions on named tokens at or above label/body mins", () => {
    expect(TYPE_META).toContain("text-label");
    expect(TYPE_CAPTION).toContain("text-caption");
    expect(TYPE_META).not.toMatch(/text-\[\d+px\]/);
    expect(TYPE_CAPTION).not.toMatch(/text-\[\d+px\]/);
  });

  it("keeps section titles at 15px without touching page-title utilities", () => {
    expect(TYPE_SECTION).toContain("text-[15px]");
    expect(TYPE_SECTION).not.toMatch(/text-(?:xl|2xl|3xl|4xl)/);
  });

  it("uses weight and tracking instead of tiny uppercase chrome", () => {
    expect(TYPE_BADGE).toContain("font-semibold");
    expect(TYPE_KICKER).toContain("uppercase");
    expect(TYPE_KICKER).toContain("tracking-wide");
    expect(TYPE_META).toContain("font-medium");
  });

  it("locks desktop accessibility rem floors in index.css", () => {
    const css = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toMatch(/--text-2xs:\s*0\.75rem/);
    expect(css).toMatch(/--text-label:\s*0\.8125rem/);
    expect(css).toMatch(/--text-caption:\s*0\.875rem/);
  });
});
