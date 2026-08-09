import { describe, expect, it } from "vitest";
import {
  resolveAdvisorQuestionScope,
  type AdvisorQuestionScope,
} from "./advisorScopeResolver";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

const NOW = 2026;

const OWNERS: AdvisorOwnerAlias[] = [
  {
    memberId: "rod-id",
    displayName: "Rod Sellers",
    aliases: ["rod sellers", "rod"],
  },
  {
    memberId: "bruce-id",
    displayName: "Bruce Edwards",
    aliases: ["bruce edwards", "bruce"],
  },
  {
    memberId: "vince-id",
    displayName: "Vince Sellers",
    aliases: ["vince sellers", "vince"],
  },
];

function scope(message: string, aliases = OWNERS): AdvisorQuestionScope {
  return resolveAdvisorQuestionScope(message, {
    currentSeason: NOW,
    ownerAliases: aliases,
  });
}

describe("resolveAdvisorQuestionScope", () => {
  it("defaults to league history when no season is mentioned", () => {
    const s = scope("Who has the most one-point losses?");
    expect(s.scopeType).toBe("league_history");
    expect(s.phase).toBe("regular");
    expect(s.startSeason).toBeNull();
    expect(s.endSeason).toBeNull();
    expect(s.explicitSeasonRequested).toBe(false);
    expect(s.ownerNames).toEqual([]);
  });

  it("treats “this year” as current_season", () => {
    const s = scope("Who is strongest this year?");
    expect(s.scopeType).toBe("current_season");
    expect(s.startSeason).toBe(NOW);
    expect(s.endSeason).toBe(NOW);
    expect(s.explicitSeasonRequested).toBe(true);
    expect(s.confidence).toBe("high");
  });

  it("treats “this season” / “this week” / “right now” as current_season", () => {
    expect(scope("Who is leading this season?").scopeType).toBe("current_season");
    expect(scope("Who do I play this week?").scopeType).toBe("current_season");
    expect(scope("Who is the biggest threat right now?").scopeType).toBe(
      "current_season",
    );
  });

  it("resolves “last season” to the prior year", () => {
    const s = scope("Who won last season?");
    expect(s.scopeType).toBe("single_season");
    expect(s.startSeason).toBe(NOW - 1);
    expect(s.endSeason).toBe(NOW - 1);
    expect(s.explicitSeasonRequested).toBe(true);
    expect(s.confidence).toBe("high");
  });

  it("resolves an exact year to single_season", () => {
    const s = scope("Who had the most one-point losses in 2023?");
    expect(s.scopeType).toBe("single_season");
    expect(s.startSeason).toBe(2023);
    expect(s.endSeason).toBe(2023);
    expect(s.phase).toBe("regular");
    expect(s.explicitSeasonRequested).toBe(true);
  });

  it("resolves a year range including “from … through …”", () => {
    const dash = scope("Closest games 2018-2024");
    expect(dash.scopeType).toBe("season_range");
    expect(dash.startSeason).toBe(2018);
    expect(dash.endSeason).toBe(2024);
    expect(dash.explicitSeasonRequested).toBe(true);

    const through = scope("Rod from 2018 through 2024");
    expect(through.scopeType).toBe("season_range");
    expect(through.startSeason).toBe(2018);
    expect(through.endSeason).toBe(2024);
    expect(through.ownerNames).toEqual(["Rod Sellers"]);
  });

  it("resolves “since YYYY” as a range through current season", () => {
    const s = scope("Playoff record since 2019");
    expect(s.scopeType).toBe("season_range");
    expect(s.startSeason).toBe(2019);
    expect(s.endSeason).toBe(NOW);
    expect(s.phase).toBe("playoffs");
    expect(s.explicitSeasonRequested).toBe(true);
  });

  it("scopes playoffs without forcing current season", () => {
    const s = scope("Who owns the playoffs?");
    expect(s.scopeType).toBe("league_history");
    expect(s.phase).toBe("playoffs");
    expect(s.explicitSeasonRequested).toBe(false);
    expect(s.startSeason).toBeNull();
    expect(s.endSeason).toBeNull();
  });

  it("scopes explicit regular season", () => {
    const s = scope("Regular season win percentage all time");
    expect(s.scopeType).toBe("league_history");
    expect(s.phase).toBe("regular");
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("scopes owner career when one owner is named and no season", () => {
    const s = scope("How many titles does Rod have?");
    expect(s.scopeType).toBe("owner_career");
    expect(s.ownerNames).toEqual(["Rod Sellers"]);
    expect(s.explicitSeasonRequested).toBe(false);
    expect(s.startSeason).toBeNull();
    expect(s.phase).toBe("all");
  });

  it("scopes “my career” as owner_career without requiring a name", () => {
    const s = scope("Tell me about my career");
    expect(s.scopeType).toBe("owner_career");
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("scopes H2H pairs as rivalry_history", () => {
    const s = scope("Rod vs Bruce");
    expect(s.scopeType).toBe("rivalry_history");
    expect(s.ownerNames).toEqual(["Rod Sellers", "Bruce Edwards"]);
    expect(s.explicitSeasonRequested).toBe(false);
    expect(s.confidence).toBe("high");
  });

  it("scopes rivalry language + one named opponent", () => {
    const s = scope("What's my record against Vince?");
    expect(s.scopeType).toBe("rivalry_history");
    expect(s.ownerNames).toEqual(["Vince Sellers"]);
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("parses vs pairs even without alias list", () => {
    const s = resolveAdvisorQuestionScope("Rod vs Bruce", { currentSeason: NOW });
    expect(s.scopeType).toBe("rivalry_history");
    expect(s.ownerNames).toEqual(["Rod", "Bruce"]);
  });

  it("scopes draft history across all seasons when no year is given", () => {
    const s = scope("Who always reaches in the draft?");
    expect(s.scopeType).toBe("draft_history");
    expect(s.explicitSeasonRequested).toBe(false);
    expect(s.startSeason).toBeNull();
    expect(s.endSeason).toBeNull();
  });

  it("keeps an explicit draft year as single_season", () => {
    const s = scope("Who reached the most in the 2019 draft?");
    expect(s.scopeType).toBe("single_season");
    expect(s.startSeason).toBe(2019);
    expect(s.endSeason).toBe(2019);
    expect(s.explicitSeasonRequested).toBe(true);
  });

  it("scopes transaction / trade history when no season is given", () => {
    const s = scope("Who got robbed in trades?");
    expect(s.scopeType).toBe("transaction_history");
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("does not default improvement questions to current season", () => {
    const s = scope("How can I improve my team?");
    expect(s.scopeType).toBe("league_history");
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("marks ambiguous wording as league_history with low confidence", () => {
    const s = scope("What do you think?");
    expect(s.scopeType).toBe("league_history");
    expect(s.confidence).toBe("low");
    expect(s.explicitSeasonRequested).toBe(false);
  });

  it("does not treat empty input as current season", () => {
    const s = resolveAdvisorQuestionScope("   ", { currentSeason: NOW });
    expect(s.scopeType).toBe("league_history");
    expect(s.confidence).toBe("low");
    expect(s.explicitSeasonRequested).toBe(false);
  });
});
