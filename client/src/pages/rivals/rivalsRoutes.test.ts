import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getV2NavHref, getAllV2Destinations, V2_DESTINATIONS } from "@/lib/v2Navigation";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("Rivals V2 — Commit 3 route ownership", () => {
  it("marks every Rivals destination live with canonical hrefs", () => {
    const rivals = getAllV2Destinations().filter((d) => d.navCategory === "rivals");
    expect(rivals.length).toBeGreaterThanOrEqual(7);
    for (const d of rivals) {
      expect(d.kind).toBe("live");
      expect(d.legacyRoute).toBeUndefined();
      expect(getV2NavHref(d)).toBe(d.route);
    }
    expect(V2_DESTINATIONS.find((d) => d.id === "rivals-hub")?.route).toBe("/rivals");
  });

  it("implements hub, cast, owners, h2h, rivalries, maps without placeholders", () => {
    const files = [
      "client/src/pages/rivals/RivalsHub.tsx",
      "client/src/pages/rivals/RivalsCast.tsx",
      "client/src/pages/rivals/RivalsOwners.tsx",
      "client/src/pages/rivals/RivalsOwnerDossier.tsx",
      "client/src/pages/rivals/RivalsHeadToHead.tsx",
      "client/src/pages/rivals/RivalsRivalries.tsx",
      "client/src/pages/rivals/RivalsLeagueMap.tsx",
      "client/src/pages/rivals/RivalsRelationships.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src).not.toContain("V2PlaceholderRoute");
      expect(src).not.toContain("V2PlaceholderPage");
    }
  });

  it("reuses TheCast, OwnerProfiles, and RivalryCenter for canonical routes", () => {
    const cast = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsCast.tsx"), "utf-8");
    expect(cast).toContain("TheCast");

    const owners = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsOwners.tsx"), "utf-8");
    expect(owners).toContain("OwnerProfiles");
    expect(owners).toContain("syncSelectionToRoute");

    const dossier = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsOwnerDossier.tsx"), "utf-8");
    expect(dossier).toContain("routeOwnerId");
    expect(dossier).toContain("useParams");

    const rivalries = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsRivalries.tsx"), "utf-8");
    expect(rivalries).toContain('variant="full"');

    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    expect(main).toContain('path: "/rivals/head-to-head"');
    expect(main).toContain('to="/rivals/rivalries"');
  });

  it("OwnerProfiles supports route owner selection and missing-owner safety", () => {
    const src = fs.readFileSync(path.join(repoRoot, "client/src/pages/OwnerProfiles.tsx"), "utf-8");
    expect(src).toContain("routeOwnerId");
    expect(src).toContain("routeOwnerMissing");
    expect(src).toContain("Owner not found in this league");
    expect(src).toContain("syncSelectionToRoute");
    expect(src).toContain("resolveDirectoryOwnerKey");
    expect(src).toContain("rivalsOwnerDossierPath");
  });

  it("RivalryCenter variants still support narrative and H2H matrix focus", () => {
    const src = fs.readFileSync(path.join(repoRoot, "client/src/pages/RivalryCenter.tsx"), "utf-8");
    expect(src).toContain('variant = "full"');
    expect(src).toContain("showRivalryNarrative");
    expect(src).toContain("showMatrix");
    expect(src).toContain("Head-to-Head Ledger");
  });

  it("hub curates Cast, rivalry, DNA behavior, and map entry points", () => {
    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsHub.tsx"), "utf-8");
    expect(hub).toContain("data-v2-rivals-hub");
    expect(hub).toContain("OwnerBehaviorDnaInsight");
    expect(hub).toContain("RivalrySummaryCard");
    expect(hub).toContain("/rivals/cast");
    expect(hub).toContain("/rivals/rivalries");
    expect(hub).toContain("/rivals/league-map");
    expect(hub).toContain("/rivals/relationships");
    expect(hub).not.toContain("/rivals/head-to-head");
  });

  it("League Map and Relationship Map document existing data sources", () => {
    const map = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsLeagueMap.tsx"), "utf-8");
    expect(map).toContain("owners.ownerList");
    expect(map).toContain("rivalry.h2h");
    expect(map).toContain("No geographic");

    const rel = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsRelationships.tsx"), "utf-8");
    expect(rel).toContain("rivalry.getScores");
    expect(rel).toContain("rivalry.h2h");
    expect(rel).toContain("leagueTwin");
    expect(rel).toContain("No opaque relationship score");
  });

  it("moves owner-behavior DNA into Rivals without deleting legacy League DNA", () => {
    const insight = fs.readFileSync(
      path.join(repoRoot, "client/src/components/rivals/OwnerBehaviorDnaInsight.tsx"),
      "utf-8",
    );
    expect(insight).toContain("dna.myProfile");
    expect(insight).toContain("archetype");
    expect(insight).toContain("blindSpot");
    expect(insight).toContain("leagueTwin");

    const main = fs.readFileSync(path.join(repoRoot, "client/src/main.tsx"), "utf-8");
    expect(main).toContain('path: "/league-dna"');
    expect(main).toContain("element: <LeagueDna />");
  });

  it("Cast cards link to canonical owner dossiers", () => {
    const cast = fs.readFileSync(path.join(repoRoot, "client/src/pages/TheCast.tsx"), "utf-8");
    expect(cast).toContain("castMemberDossierOwnerKey");
    expect(cast).toContain("rivalsOwnerDossierPath");
    expect(cast).not.toContain("encodeURIComponent(m.memberId)");
  });
});
