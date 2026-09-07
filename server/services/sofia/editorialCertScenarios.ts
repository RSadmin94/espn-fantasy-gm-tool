/**
 * Curated editorial certification scenarios — deliberately exercises the broadcast spectrum.
 * Used only by shadow certification harnesses; not production data.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import type { BroadcastContext } from "./broadcastFrameContract";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import { draftMomentToBroadcastMoment, leagueEventToBroadcastMoment } from "./broadcastMomentBridge";
import type { EditorialPlanId } from "./editorialPlans";

export type EditorialCertScenario = {
  id: string;
  label: string;
  tags: string[];
  expectedPlan: EditorialPlanId;
  voiceExpectation: "silence" | "single" | "two_voice" | "full_booth";
  moments: Array<{
    draftMoment?: DraftMoment;
    leagueEvent?: Parameters<typeof leagueEventToBroadcastMoment>[0];
    bridgeOpts?: Parameters<typeof draftMomentToBroadcastMoment>[1];
  }>;
};

function baseMoment(over: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: `CERT:draft:${over.overallPick ?? 1}`,
    leagueId: "CERT",
    draftId: "cert-editorial-2026",
    overallPick: 1,
    round: 1,
    roundPick: 1,
    owner: {
      teamId: "1",
      ownerId: "u1",
      ownerName: "Tony Dorsey",
      identityScope: "person",
      identitySource: "gmTeams",
    },
    player: {
      playerId: "lamb",
      playerName: "CeeDee Lamb",
      position: "WR",
      nflTeam: "DAL",
      adp: 4,
    },
    rosterBeforePick: { WR: 0, QB: 0, RB: 0, TE: 0 },
    receipts: [],
    signals: [],
    level: "routine",
    permittedClaims: [],
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
    ...over,
  };
}

function claim(m: DraftMoment): string {
  return `${m.owner.ownerName} selected ${m.player.playerName} (${m.player.position}) at pick ${m.overallPick}, round ${m.round}.`;
}

function withClaim(m: DraftMoment): DraftMoment {
  const c = claim(m);
  return { ...m, permittedClaims: [c, ...m.permittedClaims.filter((x) => x !== c)] };
}

function pick(
  id: string,
  label: string,
  tags: string[],
  expectedPlan: EditorialPlanId,
  voiceExpectation: EditorialCertScenario["voiceExpectation"],
  over: Partial<DraftMoment>,
  bridgeOpts?: Parameters<typeof draftMomentToBroadcastMoment>[1],
): EditorialCertScenario {
  const dm = withClaim(baseMoment(over));
  return { id, label, tags, expectedPlan, voiceExpectation, moments: [{ draftMoment: dm, bridgeOpts }] };
}

/** ~27 curated beats across the editorial spectrum. */
export function buildEditorialCertScenarios(): EditorialCertScenario[] {
  const scenarios: EditorialCertScenario[] = [
    pick("routine_silence", "Routine pick — editorial silence", ["silence", "routine"], "routine_pick", "silence", {
      overallPick: 1, level: "routine", eventId: "CERT:draft:1",
      player: { playerId: "r1", playerName: "Routine WR 1", position: "WR", nflTeam: "KC", adp: 1 },
      owner: { teamId: "1", ownerId: "u1", ownerName: "Alice", identityScope: "person", identitySource: "x" },
    }),

    pick("slight_reach", "Slight reach — Coach lead, Sofia optional", ["reach", "two_voice"], "slight_reach", "two_voice", {
      overallPick: 18, round: 2, level: "notable", signals: ["REACH"],
      player: { playerId: "lamar", playerName: "Lamar Jackson", position: "QB", nflTeam: "BAL", adp: 18 },
      owner: { teamId: "2", ownerId: "u2", ownerName: "Rod Sellers", identityScope: "person", identitySource: "x" },
      permittedClaims: ["Rod Sellers selected Lamar Jackson (QB) at pick 18, round 2.", "Lamar Jackson went 6 picks ahead of ADP."],
    }),

    pick("major_reach", "Major reach — Sofia + Coach", ["reach", "two_voice"], "major_reach", "two_voice", {
      overallPick: 9, round: 1, level: "major", signals: ["REACH:strong"],
      player: { playerId: "allen", playerName: "Josh Allen", position: "QB", nflTeam: "BUF", adp: 24 },
      owner: { teamId: "3", ownerId: "u3", ownerName: "Demetri Clark", identityScope: "person", identitySource: "x" },
      permittedClaims: ["Demetri Clark selected Josh Allen (QB) at pick 9, round 1.", "Josh Allen went 15 picks ahead of ADP — a major reach."],
    }),

    pick("historic_reach", "Historic reach — full booth", ["reach", "full_booth"], "historic_reach", "full_booth", {
      overallPick: 3, round: 1, level: "historic", signals: ["REACH:strong"],
      player: { playerId: "lamar", playerName: "Lamar Jackson", position: "QB", nflTeam: "BAL", adp: 18 },
      permittedClaims: ["Tony Dorsey selected Lamar Jackson (QB) at pick 3, round 1.", "This is the earliest a quarterback has ever been drafted in league history."],
    }),

    pick("huge_value", "Huge value steal — Coach lead", ["value"], "value_pick", "single", {
      overallPick: 105, round: 8, level: "notable", signals: ["STEAL"],
      player: { playerId: "jsn", playerName: "Jaxon Smith-Njigba", position: "WR", nflTeam: "SEA", adp: 105 },
      owner: { teamId: "4", ownerId: "u4", ownerName: "Mark Deroux", identityScope: "person", identitySource: "x" },
      permittedClaims: ["Mark Deroux selected Jaxon Smith-Njigba (WR) at pick 105, round 8.", "Jaxon Smith-Njigba fell 98 picks past ADP."],
    }),

    pick("qb_run", "QB position run", ["position_run", "two_voice"], "position_run", "two_voice", {
      overallPick: 22, round: 2, level: "notable",
      player: { playerId: "allen", playerName: "Josh Allen", position: "QB", nflTeam: "BUF", adp: 24 },
      primaryStoryline: "POSITION_RUN",
      rosterBeforePick: { QB: 2, WR: 1, RB: 1, TE: 0 },
    }, { context: { kind: "position_run", count: 4, position: "QB" } }),

    pick("te_run", "TE position run", ["position_run", "two_voice"], "position_run", "two_voice", {
      overallPick: 41, round: 3, level: "notable",
      player: { playerId: "laporta", playerName: "Sam LaPorta", position: "TE", nflTeam: "DET", adp: 80 },
      primaryStoryline: "POSITION_RUN",
    }, { context: { kind: "position_run", count: 3, position: "TE" } }),

    pick("dst_k_run", "K/DST late run", ["position_run"], "position_run", "two_voice", {
      overallPick: 160, round: 12, level: "notable",
      player: { playerId: "k1", playerName: "Justin Tucker", position: "K", nflTeam: "BAL", adp: 160 },
      owner: { teamId: "5", ownerId: "u5", ownerName: "Nate West", identityScope: "person", identitySource: "x" },
    }, { context: { kind: "position_run", count: 5, position: "K" } }),

    pick("rivalry_receipt", "Heated rivalry receipt", ["rivalry", "full_booth"], "rivalry_receipt", "full_booth", {
      overallPick: 55, round: 4, level: "major",
      player: { playerId: "kw3", playerName: "Kenneth Walker III", position: "RB", nflTeam: "SEA", adp: 54 },
      owner: { teamId: "2", ownerId: "u2", ownerName: "Bruce Edwards", identityScope: "person", identitySource: "x" },
      receipts: [{ id: "rivalry", type: "rivalry", status: "available", source: "x", authority: "x", confidence: 1 }],
      permittedClaims: ["Bruce Edwards selected Kenneth Walker III (RB) at pick 55, round 4.", "Bruce and Rod Sellers have a heated rivalry."],
    }),

    pick("breaking_news", "Breaking news alert", ["breaking", "full_booth"], "breaking_news", "full_booth", {
      overallPick: 12, round: 1, level: "major",
      player: { playerId: "lamb", playerName: "CeeDee Lamb", position: "WR", nflTeam: "DAL", adp: 4 },
    }, { context: { kind: "breaking_news", headline: "BLOCKBUSTER TRADE", body: "Star WR swapped minutes before this pick" } }),

    pick("league_milestone", "League milestone record", ["record", "two_voice"], "league_record", "two_voice", {
      overallPick: 41, round: 3, level: "historic",
      player: { playerId: "laporta", playerName: "Sam LaPorta", position: "TE", nflTeam: "DET", adp: 80 },
      owner: { teamId: "6", ownerId: "u6", ownerName: "Nate West", identityScope: "person", identitySource: "x" },
      receipts: [{ id: "league_record", type: "record", status: "available", source: "x", authority: "x", confidence: 1 }],
      primaryStoryline: "LEAGUE_RECORD",
      permittedClaims: ["Nate West selected Sam LaPorta (TE) at pick 41, round 3.", "This is the earliest a tight end has ever been drafted in this league."],
    }),

    {
      id: "commissioner_announcement",
      label: "Commissioner announcement",
      tags: ["commissioner", "two_voice"],
      expectedPlan: "commissioner_news",
      voiceExpectation: "two_voice",
      moments: [{
        leagueEvent: {
          leagueId: "CERT",
          eventId: "CERT:comm:1",
          occurredAt: new Date().toISOString(),
          momentType: "commissioner_announcement",
          significance: "major",
          headline: "COMMISSIONER ALERT",
          editorialPlanId: "commissioner_news",
          factPacket: {
            subject: { ownerName: "Commissioner", playerName: "League", position: "N/A", overallPick: 0, round: 0 },
            verifiedFacts: ["The commissioner announced a mid-draft trade review window of 60 seconds."],
            entities: ["Commissioner"],
          },
        },
      }],
    },

    {
      id: "trade_blockbuster",
      label: "Blockbuster rivalry trade",
      tags: ["trade", "full_booth"],
      expectedPlan: "rivalry_trade",
      voiceExpectation: "full_booth",
      moments: [{
        leagueEvent: {
          leagueId: "CERT",
          eventId: "CERT:trade:1",
          occurredAt: new Date().toISOString(),
          momentType: "trade",
          significance: "major",
          headline: "BLOCKBUSTER TRADE",
          editorialPlanId: "rivalry_trade",
          context: { kind: "league_storyline", title: "Blockbuster trade", body: "WR for RB swap" },
          factPacket: {
            subject: { ownerName: "Bruce Edwards", playerName: "CeeDee Lamb", position: "WR", overallPick: 0, round: 0 },
            verifiedFacts: ["Bruce Edwards traded CeeDee Lamb to Rod Sellers for Kenneth Walker III."],
            entities: ["Bruce Edwards", "Rod Sellers", "CeeDee Lamb", "Kenneth Walker III"],
          },
          receipts: [{ id: "rivalry", type: "rivalry" }],
        },
      }],
    },

    pick("waiver_pickup", "Waiver wire pickup story", ["waiver", "season_story"], "season_story", "two_voice", {
      overallPick: 130, round: 10, level: "notable",
      player: { playerId: "puka", playerName: "Puka Nacua", position: "WR", nflTeam: "LAR", adp: 130 },
      owner: { teamId: "7", ownerId: "u7", ownerName: "Jan Graham", identityScope: "person", identitySource: "x" },
    }, { context: { kind: "league_storyline", title: "Waiver pickup", body: "Jan Graham claimed Puka Nacua off waivers before the draft" } }),

    pick("championship", "Championship coronation", ["championship", "full_booth"], "championship", "full_booth", {
      overallPick: 168, round: 12, level: "historic",
      player: { playerId: "mahomes", playerName: "Patrick Mahomes", position: "QB", nflTeam: "KC", adp: 168 },
      owner: { teamId: "1", ownerId: "u1", ownerName: "Tony Dorsey", identityScope: "person", identitySource: "x" },
      permittedClaims: ["Tony Dorsey selected Patrick Mahomes (QB) at pick 168, round 12.", "Tony Dorsey clinches his third league championship."],
    }, { momentType: "championship", editorialPlanId: "championship" }),

    pick("hall_of_fame", "Hall of Fame moment", ["historic", "full_booth"], "hall_of_fame", "full_booth", {
      overallPick: 2, round: 1, level: "historic",
      player: { playerId: "jefferson", playerName: "Justin Jefferson", position: "WR", nflTeam: "MIN", adp: 2 },
      permittedClaims: ["Tony Dorsey selected Justin Jefferson (WR) at pick 2, round 1.", "Justin Jefferson enters the league Hall of Fame watch list."],
    }),

    pick("record_broken", "Single-season record broken", ["record", "two_voice"], "league_record", "two_voice", {
      overallPick: 67, round: 5, level: "historic",
      player: { playerId: "hall", playerName: "Breece Hall", position: "RB", nflTeam: "NYJ", adp: 67 },
      owner: { teamId: "8", ownerId: "u8", ownerName: "Marlon Moore", identityScope: "person", identitySource: "x" },
      receipts: [{ id: "league_record", type: "record", status: "available", source: "x", authority: "x", confidence: 1 }],
      primaryStoryline: "LEAGUE_RECORD",
      permittedClaims: ["Marlon Moore selected Breece Hall (RB) at pick 67, round 5.", "Marlon Moore breaks the league record for most RBs drafted in five rounds."],
    }),

    pick("playoff_upset", "Playoff upset callback", ["playoff", "full_booth"], "playoff_upset", "full_booth", {
      overallPick: 48, round: 4, level: "major",
      player: { playerId: "kelce", playerName: "Travis Kelce", position: "TE", nflTeam: "KC", adp: 48 },
      receipts: [{ id: "playoff_upset", type: "upset", status: "available", source: "x", authority: "x", confidence: 1 }],
      primaryStoryline: "PLAYOFF_UPSET",
      permittedClaims: ["Tony Dorsey selected Travis Kelce (TE) at pick 48, round 4.", "Last season Tony Dorsey upset the one-seed in the playoffs."],
    }),

    pick("dynasty_moment", "Dynasty shift", ["dynasty", "two_voice"], "dynasty_moment", "two_voice", {
      overallPick: 15, round: 2, level: "historic",
      player: { playerId: "chase", playerName: "Ja'Marr Chase", position: "WR", nflTeam: "CIN", adp: 15 },
      primaryStoryline: "DYNASTY",
      secondaryStoryline: "Dynasty window closing",
      permittedClaims: ["Tony Dorsey selected Ja'Marr Chase (WR) at pick 15, round 2.", "This pick signals a dynasty shift for Tony Dorsey."],
    }),

    pick("keeper_surprise", "Keeper surprise", ["keeper", "full_booth"], "keeper_surprise", "full_booth", {
      overallPick: 7, round: 1, level: "major",
      player: { playerId: "lamar", playerName: "Lamar Jackson", position: "QB", nflTeam: "BAL", adp: 18 },
      receipts: [{ id: "keeper", type: "keeper", status: "available", source: "x", authority: "x", confidence: 1 }],
      primaryStoryline: "KEEPER_SURPRISE",
      permittedClaims: ["Tony Dorsey selected Lamar Jackson (QB) at pick 7, round 1.", "Lamar Jackson was kept in the third round — a surprise early spend."],
    }),

    pick("draft_run", "Consequential draft run", ["draft_run", "two_voice"], "draft_run", "two_voice", {
      overallPick: 33, round: 3, level: "major", signals: ["CONSEQUENTIAL_RUN"],
      player: { playerId: "walker", playerName: "Kenneth Walker III", position: "RB", nflTeam: "SEA", adp: 54 },
      permittedClaims: ["Bruce Edwards selected Kenneth Walker III (RB) at pick 33, round 3.", "Five running backs have come off the board in six picks."],
    }),

    pick("documentary", "Documentary feature beat", ["documentary", "two_voice"], "documentary", "two_voice", {
      overallPick: 90, round: 7, level: "major",
      player: { playerId: "brooks", playerName: "Jonathon Brooks", position: "RB", nflTeam: "CAR", adp: 90 },
      owner: { teamId: "9", ownerId: "u9", ownerName: "Randy Broner Jr", identityScope: "person", identitySource: "x" },
      permittedClaims: ["Randy Broner Jr selected Jonathon Brooks (RB) at pick 90, round 7.", "Jonathon Brooks is a rookie returning from a torn ACL."],
    }, { momentType: "documentary", editorialPlanId: "documentary" }),

    pick("value_trade_context", "Value trade without rivalry heat", ["trade", "two_voice"], "value_trade", "two_voice", {
      overallPick: 60, round: 5, level: "notable",
      player: { playerId: "evans", playerName: "Mike Evans", position: "WR", nflTeam: "TB", adp: 60 },
    }, { context: { kind: "league_storyline", title: "Trade fallout", body: "Owner pivoted after a value trade" } }),

    pick("end_of_draft", "Final pick of the draft", ["end_of_draft"], "routine_pick", "silence", {
      overallPick: 168, round: 12, roundPick: 12, level: "routine",
      player: { playerId: "r168", playerName: "Routine WR 168", position: "WR", nflTeam: "KC", adp: 168 },
      owner: { teamId: "14", ownerId: "u14", ownerName: "Carol", identityScope: "person", identitySource: "x" },
      commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
    }),

    {
      id: "quiet_draft_stretch",
      label: "Quiet draft stretch — six routine picks",
      tags: ["silence", "stretch"],
      expectedPlan: "routine_pick",
      voiceExpectation: "silence",
      moments: Array.from({ length: 6 }, (_, i) => {
        const pickNum = 100 + i;
        const dm = withClaim(baseMoment({
          eventId: `CERT:draft:${pickNum}`,
          overallPick: pickNum,
          round: Math.ceil(pickNum / 14),
          roundPick: ((pickNum - 1) % 14) + 1,
          level: "routine",
          player: { playerId: `r${pickNum}`, playerName: `Routine WR ${pickNum}`, position: "WR", nflTeam: "KC", adp: pickNum },
          owner: { teamId: String((i % 3) + 1), ownerId: `u${i}`, ownerName: ["Alice", "Bob", "Carol"][i % 3]!, identityScope: "person", identitySource: "x" },
        }));
        return { draftMoment: dm };
      }),
    },
  ];

  return scenarios;
}

export function scenarioToBroadcastMoment(
  entry: EditorialCertScenario["moments"][number],
): BroadcastMoment {
  if (entry.leagueEvent) return leagueEventToBroadcastMoment(entry.leagueEvent);
  if (!entry.draftMoment) throw new Error("scenario moment missing draft or league event");
  return draftMomentToBroadcastMoment(entry.draftMoment, entry.bridgeOpts);
}
