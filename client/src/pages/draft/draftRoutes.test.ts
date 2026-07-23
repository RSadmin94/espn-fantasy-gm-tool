import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllV2Destinations, getV2NavHref, V2_DESTINATIONS } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("Draft V2 — Commit 6 route ownership", () => {
  it("marks every Draft destination live with canonical hrefs", () => {
    const items = getAllV2Destinations().filter((d) => d.navCategory === "draft");
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const d of items) {
      expect(d.kind).toBe("live");
      expect(d.legacyRoute).toBeUndefined();
      expect(getV2NavHref(d)).toBe(d.route);
    }
    expect(V2_DESTINATIONS.find((d) => d.id === "draft-hub")?.route).toBe("/draft");
  });

  it("implements hub and child routes without placeholders", () => {
    const files = [
      "client/src/pages/draft/DraftHub.tsx",
      "client/src/pages/draft/DraftWarRoomLayout.tsx",
      "client/src/pages/draft/DraftKeepers.tsx",
      "client/src/pages/draft/DraftHistoryPage.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src).not.toContain("V2PlaceholderRoute");
      expect(src).not.toContain("V2PlaceholderPage");
    }
  });

  it("hub curates existing War Room / keeper signals and links destinations", () => {
    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/draft/DraftHub.tsx"), "utf-8");
    expect(hub).toContain("data-v2-draft-hub");
    expect(hub).toContain("getDraftWarRoomData");
    expect(hub).toContain("/draft/live");
    expect(hub).toContain("/draft/mock");
    expect(hub).toContain("/draft/keepers");
    expect(hub).toContain("/draft/history");
    expect(hub).not.toContain("LiveDraftEngine");
    expect(hub).toContain("external simulated draft");
  });

  it("War Room + Live + Mock share one layout instance to preserve live state", () => {
    const layout = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/draft/DraftWarRoomLayout.tsx"),
      "utf-8",
    );
    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    expect(layout).toContain("DraftWarRoom");
    expect(layout).toContain("scrollToSection");
    expect(layout).toContain("Outlet");
    expect(layout).toContain("data-v2-draft-war-room");
    expect(layout).toContain("preferLiveDraft");
    expect(main).toContain("element: <DraftWarRoomLayout />");
    expect(main).toContain('path: "/draft/war-room"');
    expect(main).toContain('path: "/draft/live"');
    expect(main).toContain('path: "/draft/mock"');

    const warRoom = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoom.tsx"), "utf-8");
    expect(warRoom).toContain("scrollToSection");
    expect(warRoom).toContain("dwr-mock");
    expect(warRoom).toContain("LiveDraftControlPanel");
    // User-facing copy only — comments may reference ESPN Live ingest paths.
    expect(warRoom).not.toMatch(/["']ESPN Live["']/);
  });

  it("Mock Draft reuses War Room engine — not Draft Reality Simulator", () => {
    const layout = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/draft/DraftWarRoomLayout.tsx"),
      "utf-8",
    );
    expect(layout).toContain("DraftWarRoom");
    expect(layout).not.toContain("DraftRealitySimulator");
    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/draft/DraftHub.tsx"), "utf-8");
    expect(hub).not.toContain("DraftRealitySimulator");
  });

  it("Keeper Center owns Manage + Forecast + Advisor on one persistence path", () => {
    const keepers = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/draft/DraftKeepers.tsx"),
      "utf-8",
    );
    expect(keepers).toContain("data-v2-draft-keepers");
    expect(keepers).toContain("KeeperManagePanel");
    expect(keepers).toContain('id: "manage"');
    expect(keepers).toContain("LeagueKeeperForecast embedded");
    expect(keepers).toContain("KeeperAdvisor embedded");
    expect(keepers).not.toContain("keeperRecommendationEngine");
    expect(keepers).not.toContain("computeLeagueKeeperForecast");

    const warRoom = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoom.tsx"), "utf-8");
    expect(warRoom).toContain("Manage Keepers →");
    expect(warRoom).toContain("Temporary Draft Scenario");
    expect(warRoom).toContain('to="/draft/keepers"');
    expect(warRoom).toContain("Current Keepers");
  });

  it("Draft History mounts existing DraftHistory page", () => {
    const history = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/draft/DraftHistoryPage.tsx"),
      "utf-8",
    );
    expect(history).toContain("data-v2-draft-history");
    expect(history).toContain("DraftHistory");
  });

  it("preserves legacy draft routes", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    for (const route of [
      "/draft-war-room",
      "/draft-commentary",
      "/draft-history",
      "/keeper-advisor",
      "/keeper-forecast",
      "/draft-reality",
    ]) {
      expect(main).toContain(`path: "${route}"`);
    }
  });

  it("does not alter live draft seed / clock / grading modules in this commit", () => {
    // Route mount only — engine files remain the authority (smoke: still present & exported).
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/liveDraftSeed.ts"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/draftClock.ts"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/draftManualTeams.ts"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "client/src/lib/liveDraftSimulation.test.ts"))).toBe(true);
  });
});
