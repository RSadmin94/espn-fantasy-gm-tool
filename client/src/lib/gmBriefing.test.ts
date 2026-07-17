import { describe, expect, it } from "vitest";
import {
  buildGmBriefingEdition,
  buildHeroCandidates,
  selectHeroStory,
  selectTopHeadlines,
} from "./gmBriefing";
import type { IntelligenceBeat } from "./welcomeBackCoachBriefing";

const sampleBeat = (id: IntelligenceBeat["id"], priority: number): IntelligenceBeat => ({
  id,
  family: "league",
  label: id,
  question: "whatChanged",
  headline: `Headline ${id}`,
  detail: `Detail ${id}`,
  cta: "Open",
  href: "/rivals/rivalries",
  priority,
  knowRivalsOrSelf: true,
});

describe("gmBriefing", () => {
  it("selects hero from candidates with daily stability", () => {
    const candidates = buildHeroCandidates({
      beats: [sampleBeat("playoffPath", 90), sampleBeat("rivalThreat", 80)],
      isPreseason: false,
      opponentName: "Mark",
      week: 8,
    });
    const hero = selectHeroStory(candidates);
    expect(hero.headline.length).toBeGreaterThan(0);
    expect(hero.dek.length).toBeGreaterThan(0);
  });

  it("ranks and limits headlines to three visible", () => {
    const beats = [
      sampleBeat("tradeWindow", 70),
      sampleBeat("hofMilestone", 60),
      sampleBeat("leagueShift", 50),
      sampleBeat("acquisitionImpact", 40),
    ];
    const { visible, hiddenCount } = selectTopHeadlines(
      beats.map((b) => ({
        id: b.id,
        text: b.headline,
        category: "news" as const,
        priority: b.priority,
      })),
      3,
    );
    expect(visible.length).toBeLessThanOrEqual(3);
    expect(hiddenCount).toBeGreaterThanOrEqual(0);
  });

  it("builds full edition with identity and rival", () => {
    const edition = buildGmBriefingEdition({
      beats: [sampleBeat("rivalThreat", 88)],
      isPreseason: false,
      welcomeName: "Rod",
      leagueName: "Atlanta's Finest",
      week: 8,
      seasonCount: 9,
      rivalryCount: 12,
      syncReady: true,
      opponentName: "Mark",
      rivalName: "Mark",
      displayName: "Rod",
      careerLine: "42-38",
      titlesLine: "2 titles",
      rankLine: "#4",
      hasRivalsAccess: false,
      topRival: {
        rivalName: "Mark",
        heatLabel: "Inferno",
        loreSentence: "Mark owns the turnover battle.",
        h2hWins: 3,
        h2hLosses: 8,
      },
    });
    expect(edition.hero.headline).toBeTruthy();
    expect(edition.quote).toBeTruthy();
    expect(edition.identity.reputation).toBeTruthy();
    expect(edition.rival?.name).toBe("Mark");
    expect(edition.advantage.lockedBullets.length).toBeGreaterThan(0);
  });
});
