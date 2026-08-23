import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV } from "./adminNav";

const catalog = readFileSync(new URL("../../../../server/adminConsole/productFeatures.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../../lib/featureRegistry.ts", import.meta.url), "utf8");

describe("Admin console navigation contract", () => {
  const layout = readFileSync(new URL("./AdminConsoleLayout.tsx", import.meta.url), "utf8");
  const main = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");

  it("uses a dedicated admin shell and back-to-app link", () => {
    expect(layout).toContain("Admin Console");
    expect(layout).toContain("Back to app");
    expect(layout).toContain('to="/dashboard"');
  });

  it("does not mix product league nav into the admin sidebar", () => {
    expect(layout).not.toContain("The Briefing");
    expect(layout).not.toContain("Draft War Room");
  });

  it("registers the owner console under /admin", () => {
    expect(main).toContain('path: "/admin"');
    expect(main).toContain('path: "/admin/overview"');
    expect(main).toContain('path: "/admin/usage"');
    expect(main).toContain("AdminConsoleLayout");
  });

  it("lists only implemented admin sections", () => {
    const hrefs = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.to));
    expect(hrefs).toContain("/admin/overview");
    expect(hrefs).toContain("/admin/users");
    expect(hrefs).toContain("/admin/usage");
    expect(hrefs).toContain("/admin/audit");
  });
});

describe("feature catalog matches the product registry", () => {
  it("does not invent unregistered feature ids", () => {
    const ids = [...catalog.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      expect(registry).toContain(`id: "${id}"`);
    }
  });
});
