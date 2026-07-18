import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const owners = fs.readFileSync(path.join(repoRoot, "client/src/pages/OwnerProfiles.tsx"), "utf-8");
const myGm = fs.readFileSync(path.join(repoRoot, "client/src/pages/my-team/MyTeamProfile.tsx"), "utf-8");
const dossier = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsOwnerDossier.tsx"), "utf-8");
const directory = fs.readFileSync(path.join(repoRoot, "client/src/pages/rivals/RivalsOwners.tsx"), "utf-8");

describe("RFSN-023 — GM Identity Lens Separation", () => {
  it("routes wire distinct lenses without duplicating OwnerProfiles", () => {
    expect(myGm).toContain('mode="self"');
    expect(myGm).toContain("OwnerProfiles");
    expect(dossier).toContain('mode="scout"');
    expect(directory).toContain('mode="scout"');
    expect(fs.existsSync(path.join(repoRoot, "client/src/pages/MyGMProfile.tsx"))).toBe(false);
  });

  it("mode is source of truth for auth-bound self behavior", () => {
    expect(owners).toContain('mode === "self"');
    expect(owners).toContain("authenticatedOwnerOnly = mode === \"self\"");
    expect(owners).not.toContain("authenticatedOwnerOnly?: boolean");
  });

  it("self lens disables ScoutingLock / list paywall; scout keeps ScoutingLock", () => {
    expect(owners).toContain("selfLens ? false : Boolean(p?.gated)");
    expect(owners).toContain("selfLens ? false : Boolean(p?.locked)");
    expect(owners).toContain('mode === "scout" && Boolean(listQ.data?.gated)');
    expect(owners).toContain("function ScoutingLock");
    expect(owners).toContain("Unlock the Scouting Report");
  });

  it("self copy drops opponent/exploit framing; scout keeps scout language", () => {
    const lens = fs.readFileSync(path.join(repoRoot, "client/src/lib/ownerProfilesLens.ts"), "utf-8");
    expect(lens).toContain("GM Identity");
    expect(lens).toContain("Your Rivalries");
    expect(lens).toContain("Your Legacy");
    expect(lens).toContain("Your Draft Pattern");
    expect(lens).toContain("Matchup Intelligence");
    expect(owners).toContain("Opponent Scout Report");
    expect(owners).toContain("lens.sectionRivalries");
    expect(owners).toContain("matchupTagLabel");
  });

  it("keeps rivalry H2H and does not invent a second profile component", () => {
    expect(owners).toContain("dossier-rivalries");
    expect(owners).toContain("pickRivalryHighlights");
    expect(owners).toContain("ownerProfilesLens");
  });
});
