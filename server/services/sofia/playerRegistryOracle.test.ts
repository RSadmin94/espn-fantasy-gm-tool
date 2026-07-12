import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPlayerRegistryOracle,
  type PlayerRegistryOracle,
  type RegistryPlayer,
} from "./playerRegistryOracle";
import { checkEntityGuard, buildAuthorizedEntities } from "./voiceGrounding";

const TEST_REGISTRY: RegistryPlayer[] = [
  { playerId: "p1", fullName: "Andrew Luck", normalizedName: "andrew luck" },
  { playerId: "p2", fullName: "Christian McCaffrey", normalizedName: "christian mccaffrey" },
  { playerId: "p3", fullName: "Patrick Mahomes", normalizedName: "patrick mahomes" },
  { playerId: "p4", fullName: "Jaxon Smith-Njigba", normalizedName: "jaxon smith njigba" },
  { playerId: "p5", fullName: "A.J. Brown", normalizedName: "aj brown" },
  { playerId: "p6", fullName: "Antonio Brown", normalizedName: "antonio brown" },
  { playerId: "p7", fullName: "Lamar Jackson", normalizedName: "lamar jackson" },
  { playerId: "p8", fullName: "Jared Cook", normalizedName: "jared cook" },
  { playerId: "p9", fullName: "Jordan Love", normalizedName: "jordan love" },
  { playerId: "p10", fullName: "Justin Fields", normalizedName: "justin fields" },
  { playerId: "p11", fullName: "Ja'Marr Chase", normalizedName: "jamarr chase" },
  { playerId: "p12", fullName: "D'Andre Swift", normalizedName: "dandre swift" },
  { playerId: "p13", fullName: "James White", normalizedName: "james white" },
  { playerId: "p14", fullName: "Ray Rice", normalizedName: "ray rice" },
  { playerId: "p15", fullName: "Breece Hall", normalizedName: "breece hall" },
  { playerId: "p16", fullName: "Nick Chubb", normalizedName: "nick chubb" },
  { playerId: "p17", fullName: "Marlon Moore", normalizedName: "marlon moore" },
];

function oracle(players: RegistryPlayer[] = TEST_REGISTRY): PlayerRegistryOracle {
  return buildPlayerRegistryOracle(players, "seed");
}

describe("playerRegistryOracle", () => {
  let o: PlayerRegistryOracle;

  beforeEach(() => {
    o = oracle();
  });

  describe("exact player detection", () => {
    it("resolves full grounded player name", () => {
      const r = o.resolveMentions("Rod took Lamar Jackson at 18.");
      expect(r.resolved).toHaveLength(1);
      expect(r.resolved[0]).toMatchObject({ canonicalName: "Lamar Jackson", confidence: "exact" });
    });

    it("resolves full ungrounded historical player", () => {
      const r = o.resolveMentions("Best prospect since Andrew Luck.");
      expect(r.resolved[0]).toMatchObject({ canonicalName: "Andrew Luck", matchedText: "Andrew Luck" });
    });

    it("resolves possessive surname when globally unique", () => {
      const r = o.resolveMentions("Since Luck's rookie year, the bar was high.");
      expect(r.resolved[0]?.canonicalName).toBe("Andrew Luck");
    });

    it("resolves first initial + surname", () => {
      const r = o.resolveMentions("Since A. Luck changed the position.");
      expect(r.resolved[0]).toMatchObject({ canonicalName: "Andrew Luck", confidence: "initial_surname" });
    });

    it("resolves hyphenated full name", () => {
      const r = o.resolveMentions("Mark stole Jaxon Smith-Njigba at 105.");
      expect(r.resolved[0]?.canonicalName).toBe("Jaxon Smith-Njigba");
    });

    it("normalizes suffix on alias match", () => {
      const withJr = buildPlayerRegistryOracle([
        { playerId: "ob", fullName: "Odell Beckham Jr.", normalizedName: "odell beckham jr" },
      ]);
      const r = withJr.resolveMentions("Since Odell Beckham exploded.");
      expect(r.resolved[0]?.canonicalName).toBe("Odell Beckham Jr.");
      expect(["exact", "alias"]).toContain(r.resolved[0]?.confidence);
    });
  });

  describe("ambiguity", () => {
    it("marks common surname Brown as ambiguous with multiple registry matches", () => {
      const r = o.resolveMentions("I think Brown is going to regret this.");
      expect(r.resolved).toHaveLength(0);
      expect(r.ambiguous[0]).toMatchObject({ matchedText: "Brown", reason: "ambiguous_surname" });
    });

    it("does not resolve bare Brown when packet has only A.J. Brown", () => {
      const guard = checkEntityGuard("I think Brown is going to regret this.", ["A.J. Brown"], o);
      expect(guard.pass).toBe(true);
      expect(guard.ignoredAmbiguous).toHaveLength(1);
    });

    it("allows unique-surname McCaffrey when packet authorizes Christian McCaffrey", () => {
      const guard = checkEntityGuard("Since McCaffrey is going to eat.", ["Christian McCaffrey"], o);
      expect(guard.pass).toBe(true);
      expect(guard.resolvedAuthorized[0]?.canonicalName).toBe("Christian McCaffrey");
    });

    it("rejects two-token ungrounded comparison", () => {
      const guard = checkEntityGuard("Is this the next Patrick Mahomes?", ["Caleb Williams"], o);
      expect(guard.pass).toBe(false);
      expect(guard.violations[0]?.canonicalName).toBe("Patrick Mahomes");
    });

    it("rejects full ungrounded Christian McCaffrey", () => {
      const guard = checkEntityGuard(
        "Is Bruce trusting Christian McCaffrey to carry him?",
        ["Bruce Edwards", "Kenneth Walker III"],
        o,
      );
      expect(guard.violations[0]?.matchedText).toBe("Christian McCaffrey");
    });
  });

  describe("ordinary language", () => {
    it("ignores lowercase cook in let him cook", () => {
      expect(o.resolveMentions("Let him cook.").resolved).toHaveLength(0);
    });

    it("ignores lowercase love in I love the value", () => {
      expect(o.resolveMentions("I love the value here.").resolved).toHaveLength(0);
    });

    it("ignores clause-initial Young", () => {
      expect(o.resolveMentions("Young teams make mistakes.").resolved).toHaveLength(0);
    });

    it("ignores lowercase field and swift", () => {
      expect(o.resolveMentions("The field is wide open.").resolved).toHaveLength(0);
      expect(o.resolveMentions("That was a swift decision.").resolved).toHaveLength(0);
    });

    it("ignores months and teams", () => {
      const guard = checkEntityGuard("I need backs in November if the Jets struggle.", ["Bruce Edwards"], o);
      expect(guard.pass).toBe(true);
    });

    it("ignores emphasis words and contractions", () => {
      const guard = checkEntityGuard(
        "Here's what worries me. History says you're thin. Bold move. NEVER seen that.",
        ["Bruce Edwards"],
        o,
      );
      expect(guard.pass).toBe(true);
    });
  });

  describe("safety", () => {
    it("handles empty registry", () => {
      const empty = oracle([]);
      expect(empty.resolveMentions("Andrew Luck").resolved).toHaveLength(0);
      expect(empty.playerCount).toBe(0);
    });

    it("handles empty text", () => {
      expect(o.resolveMentions("").resolved).toHaveLength(0);
    });

    it("is deterministic across repeated calls", () => {
      const line = "Best since Andrew Luck.";
      expect(o.resolveMentions(line)).toEqual(o.resolveMentions(line));
    });

    it("does not mutate input text", () => {
      const line = "Andrew Luck was special.";
      const before = line;
      o.resolveMentions(line);
      expect(line).toBe(before);
    });

    it("skips malformed registry rows", () => {
      const sparse = buildPlayerRegistryOracle([
        { playerId: "", fullName: "", normalizedName: "" },
        { playerId: "ok", fullName: "Andrew Luck", normalizedName: "andrew luck" },
      ]);
      expect(sparse.playerCount).toBe(1);
    });
  });
});

describe("buildAuthorizedEntities", () => {
  it("authorizes packet player by canonical name", () => {
    const { players } = buildAuthorizedEntities(["Christian McCaffrey"], oracle());
    expect(players[0]?.playerId).toBe("p2");
  });

  it("collects owner tokens for non-registry names", () => {
    const { ownerTokens } = buildAuthorizedEntities(["Bruce Edwards"], oracle());
    expect(ownerTokens.has("bruce")).toBe(true);
    expect(ownerTokens.has("edwards")).toBe(true);
  });
});
