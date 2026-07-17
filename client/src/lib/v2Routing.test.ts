import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getV2CanonicalRoutes } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("v2Routing — locked FFR 2.0", () => {
  it("registers canonical V2 destinations via placeholder route expansion", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain("getV2CanonicalRoutes");
    expect(main).toContain("...v2PlaceholderRoutes");
    expect(main).toContain("V2PlaceholderRoute");
    expect(getV2CanonicalRoutes().length).toBeGreaterThan(20);
  });

  it("proves every canonical destination is resolvable in the route model", () => {
    const routes = getV2CanonicalRoutes();
    expect(routes).toContain("/home");
    expect(routes).toContain("/rivals/rivalries");
    expect(routes).toContain("/my-team/championship-path");
    expect(routes).toContain("/rfsn/wire");
    expect(routes).toContain("/draft/war-room");
    expect(routes).toContain("/league/history/hall-of-fame");
    expect(routes).toContain("/rivals/owners/:ownerId");
    // No ADR-001 Season / top-level History paths in the V2 model
    expect(routes.some((r) => r === "/season" || r.startsWith("/season/"))).toBe(false);
  });

  it("keeps legacy routes reachable during Phase 1", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    const legacyRoutes = [
      "/dashboard",
      "/roster",
      "/matchups",
      "/trades",
      "/draft-war-room",
      "/rivalry-center",
      "/league-dna",
      "/dynasty-power-rankings",
      "/owner-profiles",
      "/advisor",
      "/hall-of-fame",
      "/history",
      "/transactions",
      "/standings",
      "/rfsn",
      "/rfsn/news",
      "/rfsn/live",
    ];
    for (const route of legacyRoutes) {
      expect(main).toContain(`path: "${route}"`);
    }
  });

  it("mounts the curated Home page at /home instead of V2PlaceholderRoute", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/home"');
    expect(main).toContain("element: <Home />");
    expect(main).toMatch(/import \{ Home \} from "\.\/pages\/Home"/);
    const homePage = fs.readFileSync(path.join(repoRoot, "client", "src", "pages", "Home.tsx"), "utf-8");
    expect(homePage).toContain('variant="curated"');
    expect(homePage).not.toContain("V2PlaceholderRoute");
    expect(homePage).not.toContain("V2PlaceholderPage");
  });
  it("does not redirect /draft to dashboard (V2 Draft hub owns /draft)", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).not.toMatch(/path:\s*"\/draft"\s*,\s*element:\s*<Navigate to="\/dashboard"/);
  });

  it("uses V2 navigation in AppShell", () => {
    const shell = fs.readFileSync(path.join(repoRoot, "client", "src", "components", "AppShell.tsx"), "utf-8");
    expect(shell).toContain("buildV2NavGroups");
    expect(shell).not.toContain("buildNavGroups(");
  });

  it("records locked Product Architecture as authority", () => {
    const archPath = path.join(repoRoot, "docs", "architecture", "FFR_2.0_Product_Architecture.md");
    expect(fs.existsSync(archPath)).toBe(true);
    const arch = fs.readFileSync(archPath, "utf-8");
    expect(arch).toContain("exactly six sections");
    expect(arch).toContain("Rivals");
    expect(arch).toContain("NO** top-level Season");
    expect(arch).toContain("History belongs");
  });
});
