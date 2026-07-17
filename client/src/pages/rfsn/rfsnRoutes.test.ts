import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllV2Destinations, getV2NavHref, V2_DESTINATIONS } from "@/lib/v2Navigation";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import { BOOTH_ANALYST_ORDER } from "@/lib/rfsnBoothPresentation";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("RFSN V2 — Commit 5 route ownership", () => {
  it("marks every RFSN destination live with canonical hrefs", () => {
    const items = getAllV2Destinations().filter((d) => d.navCategory === "rfsn");
    expect(items.length).toBeGreaterThanOrEqual(6);
    for (const d of items) {
      expect(d.kind).toBe("live");
      expect(d.legacyRoute).toBeUndefined();
      expect(getV2NavHref(d)).toBe(d.route);
    }
    expect(V2_DESTINATIONS.find((d) => d.id === "rfsn-hub")?.route).toBe("/rfsn");
  });

  it("implements canonical RFSN pages without placeholders", () => {
    const files = [
      "client/src/pages/rfsn/RfsnHome.tsx",
      "client/src/pages/rfsn/RfsnWire.tsx",
      "client/src/pages/rfsn/RfsnBreaking.tsx",
      "client/src/pages/rfsn/RfsnStories.tsx",
      "client/src/pages/rfsn/RfsnRecaps.tsx",
      "client/src/pages/rfsn/RfsnAnalysts.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src).not.toContain("V2PlaceholderRoute");
      expect(src).not.toContain("V2PlaceholderPage");
    }
  });

  it("reuses LeagueWireNewsroom for Wire and Stories; Recaps use postgame reports", () => {
    const wire = fs.readFileSync(path.join(repoRoot, "client/src/pages/rfsn/RfsnWire.tsx"), "utf-8");
    const stories = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/rfsn/RfsnStories.tsx"),
      "utf-8",
    );
    const recaps = fs.readFileSync(path.join(repoRoot, "client/src/pages/rfsn/RfsnRecaps.tsx"), "utf-8");
    const breaking = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/rfsn/RfsnBreaking.tsx"),
      "utf-8",
    );
    expect(wire).toContain("LeagueWireNewsroom");
    expect(wire).toContain("data-v2-rfsn-wire");
    expect(stories).toContain("LeagueWireNewsroom");
    expect(stories).toContain("data-v2-rfsn-stories");
    expect(recaps).toContain("getPostgameReports");
    expect(recaps).toContain("getAvailableWeeks");
    expect(recaps).toContain("data-v2-rfsn-recaps");
    expect(breaking).toContain("breakingNews");
    expect(breaking).toContain("selectFeaturedArticle");
    expect(breaking).toContain("data-v2-rfsn-breaking");
  });

  it("Analysts page uses COMMENTATOR_META / BOOTH_ANALYST_ORDER source of truth", () => {
    const analysts = fs.readFileSync(
      path.join(repoRoot, "client/src/pages/rfsn/RfsnAnalysts.tsx"),
      "utf-8",
    );
    expect(analysts).toContain("COMMENTATOR_META");
    expect(analysts).toContain("BOOTH_ANALYST_ORDER");
    expect(analysts).toContain("data-v2-rfsn-analysts");
    expect(analysts).not.toContain("voicePersonalities");
    expect(BOOTH_ANALYST_ORDER).toEqual(["sofia", "coach", "roxanne"]);
    for (const id of BOOTH_ANALYST_ORDER) {
      expect(COMMENTATOR_META[id].displayName).toBeTruthy();
      expect(COMMENTATOR_META[id].role).toBeTruthy();
    }
  });

  it("hub links into canonical RFSN destinations", () => {
    const home = fs.readFileSync(path.join(repoRoot, "client/src/pages/rfsn/RfsnHome.tsx"), "utf-8");
    expect(home).toContain("data-v2-rfsn-home");
    expect(home).toContain("RFSN_ROUTES.wire");
    expect(home).toContain("RFSN_ROUTES.stories");
    expect(home).toContain("RFSN_ROUTES.recaps");
    expect(home).toContain("RFSN_ROUTES.analysts");
    expect(home).toContain("RFSN_ROUTES.live");
  });

  it("preserves legacy news and live routes (news redirects to wire)", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    for (const route of ["/rfsn", "/rfsn/news", "/rfsn/live", "/draft-commentary", "/draft-war-room"]) {
      expect(main).toContain(`path: "${route}"`);
    }
    expect(main).toContain('path: "/rfsn/news/article/:articleId"');
    expect(main).toContain("LegacyRfsnNewsArticleRedirect");
    expect(main).toContain('path: "/rfsn/wire/article/:articleId"');
    expect(main).toContain('path: "/rfsn/stories/article/:articleId"');
    expect(main).toContain("element: <RfsnLive />");
    expect(main).toContain("DraftCommentary");
  });

  it("does not alter broadcast TTS / booth shell usage in Live page", () => {
    const live = fs.readFileSync(path.join(repoRoot, "client/src/pages/rfsn/RfsnLive.tsx"), "utf-8");
    expect(live).toContain("useRfsnAudioPlayback");
    expect(live).toContain("RfsnBroadcastShell");
    expect(live).toContain("RfsnAudioControls");
    // Canonical written pages must not reimplement booth audio
    const wire = fs.readFileSync(path.join(repoRoot, "client/src/pages/rfsn/RfsnWire.tsx"), "utf-8");
    expect(wire).not.toContain("useRfsnAudioPlayback");
    expect(wire).not.toContain("useRfsnBoothController");
  });

  it("exposes canonical route constants used by nav", () => {
    expect(RFSN_ROUTES.home).toBe("/rfsn");
    expect(RFSN_ROUTES.wire).toBe("/rfsn/wire");
    expect(RFSN_ROUTES.breaking).toBe("/rfsn/breaking");
    expect(RFSN_ROUTES.stories).toBe("/rfsn/stories");
    expect(RFSN_ROUTES.recaps).toBe("/rfsn/recaps");
    expect(RFSN_ROUTES.analysts).toBe("/rfsn/analysts");
    expect(RFSN_ROUTES.news).toBe("/rfsn/news");
    expect(RFSN_ROUTES.live).toBe("/rfsn/live");
    expect(RFSN_ROUTES.wireArticle(1)).toBe("/rfsn/wire/article/1");
    expect(RFSN_ROUTES.storiesArticle(1)).toBe("/rfsn/stories/article/1");
  });
});
