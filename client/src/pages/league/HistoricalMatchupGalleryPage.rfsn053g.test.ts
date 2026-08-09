/**
 * RFSN-053G — PNG export uses ShareCardRenderer only (source).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const html = read("server/shareCardHtml.tsx");
const png = read("server/shareCardPng.ts");
const modal = read("client/src/components/share-cards/HistoricalShareCardModal.tsx");
const renderer = read("client/src/components/share-cards/HistoricalShareCard.tsx");
const index = read("server/_core/index.ts");

describe("RFSN-053G PNG export wiring", () => {
  it("rasterizes ShareCardRenderer HTML and does not invent a second card template", () => {
    expect(html).toContain("ShareCardRenderer");
    expect(html).toContain("renderToStaticMarkup");
    expect(html).not.toMatch(/<svg xmlns/);
    expect(png).toContain("buildShareCardExportHtml");
    expect(png).toContain("playwright");
    expect(png).toContain("resolveChromiumExecutable");
    expect(png).toContain("shareCardCacheKey");
    expect(read("nixpacks.toml")).toContain("chromium");
    expect(png).toContain("SHARE_CARD_EXPORT_ERROR");
    expect(png).toContain('app.get("/api/share-card/png"');
    expect(png).not.toMatch(/resvg|satori/i);
    expect(renderer).toContain("data-share-card-root");
    expect(modal).toContain("/api/share-card/png");
    expect(modal).not.toMatch(/disabled\s*\n\s*title="PNG export comes in 053G"/);
    expect(index).toContain("registerShareCardPng");
  });
});
