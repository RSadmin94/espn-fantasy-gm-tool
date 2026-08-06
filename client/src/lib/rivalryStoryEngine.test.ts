import { describe, expect, it } from "vitest";
import {
  explanationForCard,
  filterBulletsAgainstHeaderRecord,
  formatCardCoverageLabel,
  formatCardRecordLine,
  formatRivalStoryRecordLine,
  headerMatchesEvidence,
  selectExplanationBullets,
  truncateExplanationReason,
  THREAT_DEFINITION_DOSSIER,
  type DossierRivalryExplanationView,
} from "@/lib/rivalryStoryEngine";

const bruceEvidence = {
  source: "h2hAuthority" as const,
  scopeLabel: "Regular-season recorded meetings (H2H Authority)",
  startSeason: 2011,
  endSeason: 2025,
  includesRegularSeason: true,
  includesPlayoffs: false,
  wins: 7,
  losses: 10,
  ties: 0,
  meetings: 17,
  effectivePct: 41.2,
  recordLine: "7–10 · 17 meetings",
  coverageLabel: "2011–2025 · regular-season recorded meetings",
  playoffWins: 0,
  playoffLosses: 2,
  playoffTies: 0,
  playoffMeetings: 2,
  playoffRecordLine: "Playoffs: 0–2 · 2 meetings",
};

const bruceExplanation: DossierRivalryExplanationView = {
  cardKind: "currentRival",
  opponentOwnerKey: "id:bruce",
  opponentOwnerName: "Bruce Edwards",
  headline: "Playoff gatekeeper",
  reason: "Bruce Edwards is your current rivalry focus at 7–10.",
  bullets: [
    { text: "Career: 7–10." },
    { text: "Playoffs: 0–2 · 2 meetings" },
    { text: "Last five: 2–3." },
  ],
  provenance: ["h2hAuthority"],
  coverageQualifier: bruceEvidence.coverageLabel,
  matchedAdvisorThreat: false,
  evidence: bruceEvidence,
};

describe("RFSN-048B/C presentation-only rivalryStoryEngine", () => {
  it("formats fallback matchup-intel line without inventing narrative", () => {
    expect(
      formatRivalStoryRecordLine({
        opponentOwner: "Bruce Edwards",
        wins: 27,
        losses: 27,
        ties: 2,
        games: 56,
      }),
    ).toBe("27–27–2 · 56 meetings");
  });

  it("header uses authority evidence — not matchupIntel totals", () => {
    const line = formatCardRecordLine(bruceExplanation, {
      opponentOwner: "Bruce Edwards",
      wins: 27,
      losses: 27,
      ties: 2,
      games: 56,
    });
    expect(line).toBe("7–10 · 17 meetings");
    expect(line).not.toContain("27–27");
    expect(headerMatchesEvidence(line, bruceEvidence)).toBe(true);
  });

  it("coverage label reflects selected source", () => {
    expect(formatCardCoverageLabel(bruceExplanation)).toBe(
      "2011–2025 · regular-season recorded meetings",
    );
  });

  it("filters Career bullet that duplicates header record", () => {
    const filtered = filterBulletsAgainstHeaderRecord(
      selectExplanationBullets(bruceExplanation.bullets, 3),
      bruceEvidence,
    );
    expect(filtered.every((b) => !/^Career:/i.test(b.text))).toBe(true);
    expect(filtered.some((b) => /^Playoffs:/i.test(b.text))).toBe(true);
  });

  it("truncates reason text only", () => {
    const long = "A".repeat(250);
    const out = truncateExplanationReason(long, 50);
    expect(out?.endsWith("…")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(50);
  });

  it("does not invent bullets when explanation is empty", () => {
    expect(selectExplanationBullets([])).toEqual([]);
    expect(truncateExplanationReason(null)).toBeNull();
  });

  it("picks explanation by card kind", () => {
    const hit = explanationForCard(
      [
        {
          cardKind: "historical",
          opponentOwnerKey: "id:vince",
          opponentOwnerName: "Vince Sellers",
          headline: "Historical nemesis",
          reason: "Vince remains your strongest historical nemesis across the recorded series.",
          bullets: [{ text: "Playoffs: 1–0 · 1 meeting" }],
          provenance: ["rivalryStoryAuthority"],
          coverageQualifier: "2021–2023 · regular-season recorded meetings",
          matchedAdvisorThreat: false,
          evidence: {
            source: "h2hAuthority",
            scopeLabel: "Regular-season recorded meetings (H2H Authority)",
            startSeason: 2021,
            endSeason: 2023,
            includesRegularSeason: true,
            includesPlayoffs: false,
            wins: 0,
            losses: 4,
            ties: 0,
            meetings: 4,
            effectivePct: 0,
            recordLine: "0–4 · 4 meetings",
            coverageLabel: "2021–2023 · regular-season recorded meetings",
            playoffRecordLine: "Playoffs: 1–0 · 1 meeting",
          },
        },
      ],
      "historical",
      "id:vince",
    );
    expect(formatCardRecordLine(hit)).toBe("0–4 · 4 meetings");
    expect(hit?.matchedAdvisorThreat).toBe(false);
  });

  it("documents dossier threat label distinctly", () => {
    expect(THREAT_DEFINITION_DOSSIER).toBe("Active matchup threat");
  });
});
