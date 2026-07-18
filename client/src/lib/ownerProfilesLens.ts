/**
 * RFSN-023 — GM Identity Lens
 * Same Owner Intelligence engine; self vs scout presentation only.
 */

export type OwnerProfilesMode = "self" | "scout";

export function isSelfMode(mode: OwnerProfilesMode): boolean {
  return mode === "self";
}

export function isScoutMode(mode: OwnerProfilesMode): boolean {
  return mode === "scout";
}

/** Section / nav copy keyed by lens. */
export function ownerProfilesLensCopy(mode: OwnerProfilesMode) {
  if (mode === "self") {
    return {
      navGm: "GM Identity",
      navBuilding: "Draft DNA",
      navTrading: "Trading",
      navMatchups: "Rivalry History",
      navRivalries: "Your Rivalries",
      navHighlights: "Your Legacy",
      sectionGm: "GM Identity",
      sectionBuilding: "Your Draft Pattern",
      sectionTrading: "Trading Profile",
      sectionMatchups: "Rivalry History",
      sectionRivalries: "Your Rivalries",
      sectionHighlights: "Your Legacy",
      dnaEyebrow: "Your GM Style",
      draftDnaEyebrow: "Draft DNA",
      topRivalLabel: "Top rivalry",
      toughestLabel: "Toughest H2H",
      openRivalriesCta: "Open rivalry",
      compareLabel: "Compare with another owner",
      defaultSubtitle:
        "Who you are as a fantasy GM — identity, draft DNA, legacy, and rivalries.",
    } as const;
  }
  return {
    navGm: "GM Profile",
    navBuilding: "Team Building",
    navTrading: "Trading",
    navMatchups: "Matchups",
    navRivalries: "Rivalries",
    navHighlights: "Highlights",
    sectionGm: "GM Profile",
    sectionBuilding: "Team Building Philosophy",
    sectionTrading: "Trading Profile",
    sectionMatchups: "Matchup Intelligence",
    sectionRivalries: "Rivalries",
    sectionHighlights: "Career Highlights",
    dnaEyebrow: "Owner DNA",
    draftDnaEyebrow: "Draft DNA",
    topRivalLabel: "Top rival",
    toughestLabel: "Biggest threat",
    openRivalriesCta: "Open Rivalries",
    compareLabel: "Compare with another owner",
    defaultSubtitle: "Canonical manager dossier — scout career, tendencies, and rivalry history.",
  } as const;
}

/** Remap exploit/opponent tags for self view; scout keeps server tags. */
export function matchupTagLabel(tag: string, mode: OwnerProfilesMode): string {
  if (mode !== "self") return tag;
  if (tag === "Nemesis") return "Primary Rival";
  if (tag === "Prey") return "Favorable Matchup";
  if (tag === "Bully") return "Difficult Matchup";
  return tag;
}

export type IdentityTendency = { text: string };

/**
 * Evidence-backed self-improvement bullets only.
 * Hide when evidence is missing — never invent coaching.
 */
export function buildSelfIdentityTendencies(input: {
  draftStyle?: string;
  mostDraftedPos?: string[];
  earliestAvgPos?: { pos: string; r: number } | null;
  earlyLead?: [string, number] | null;
}): IdentityTendency[] {
  const out: IdentityTendency[] = [];
  const early = input.earliestAvgPos;
  if (early?.pos) {
    out.push({
      text: `Prioritize ${early.pos} early (avg open-draft round ${early.r.toFixed(1)})`,
    });
  }
  const lead = input.earlyLead?.[0];
  const lateCandidates = (input.mostDraftedPos ?? []).filter((p) => p && p !== early?.pos && p !== lead);
  // If QB (or another pos) is common overall but not earliest, frame as wait pattern when evidence supports.
  const waitPos = lateCandidates.find((p) => {
    const u = p.toUpperCase();
    return u === "QB" || u === "TE" || u === "K" || u === "DEF" || u === "DST";
  });
  if (waitPos) {
    out.push({ text: `Often wait on ${waitPos} relative to early capital` });
  }
  const valuePos = lateCandidates.find((p) => {
    const u = p.toUpperCase();
    return u === "WR" || u === "RB" || u === "FLEX";
  });
  if (valuePos && out.length < 3) {
    out.push({ text: `Lean on ${valuePos} volume across open-draft history` });
  }
  if (input.draftStyle && out.length === 0) {
    // Style badge alone is still evidence from draftDNA — allow single bullet.
    out.push({ text: `Draft style: ${input.draftStyle}` });
  }
  return out.slice(0, 3);
}
