import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TYPE_BADGE,
  TYPE_CAPTION,
  TYPE_KICKER,
  TYPE_META,
  TYPE_READABLE_BODY,
  TYPE_READABLE_LABEL,
  TYPE_READABLE_META,
  TYPE_READABLE_SECTION,
  TYPE_SECTION,
} from "./typeScale";

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

describe("RFSN-054D scoped readable floors", () => {
  it("does not change global 054B/054C tokens", () => {
    expect(TYPE_BADGE).toContain("text-2xs");
    expect(TYPE_KICKER).toContain("text-2xs");
    expect(TYPE_META).toContain("text-label");
    expect(TYPE_CAPTION).toContain("text-caption");
    expect(TYPE_SECTION).toContain("text-[15px]");
  });

  it("scopes 13/14/15/16 floors to readable tokens only", () => {
    expect(TYPE_READABLE_META).toContain("text-label");
    expect(TYPE_READABLE_LABEL).toContain("text-caption");
    expect(TYPE_READABLE_BODY).toContain("text-[15px]");
    expect(TYPE_READABLE_SECTION).toContain("text-base");
  });

  it("applies scoped CSS only under [data-rfsn-054d]", () => {
    const css = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain("[data-rfsn-054d]");
    expect(css).toContain("--rfsn-054d-meta: 0.8125rem");
    expect(css).toContain("--rfsn-054d-label: 0.875rem");
    expect(css).toContain("--rfsn-054d-body: 0.9375rem");
    expect(css).toMatch(/--text-2xs:\s*0\.75rem/);
  });

  it("marks only the four targeted surfaces", () => {
    const trades = readFileSync(join(process.cwd(), "client/src/pages/Trades.tsx"), "utf8");
    const advisor = readFileSync(join(process.cwd(), "client/src/pages/Advisor.tsx"), "utf8");
    const path = readFileSync(join(process.cwd(), "client/src/pages/ChampionshipDiagnosis.tsx"), "utf8");
    const draft = readFileSync(join(process.cwd(), "client/src/pages/DraftHistory.tsx"), "utf8");
    const home = readFileSync(join(process.cwd(), "client/src/components/home/CuratedHome.tsx"), "utf8");
    expect(trades).toContain("data-rfsn-054d");
    expect(advisor).toContain("data-rfsn-054d");
    expect(path).toContain("data-rfsn-054d");
    expect(draft).toContain("data-rfsn-054d");
    expect(home).not.toContain("data-rfsn-054d");
  });
});
