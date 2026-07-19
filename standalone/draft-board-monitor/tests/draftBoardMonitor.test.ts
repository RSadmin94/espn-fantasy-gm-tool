/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { observeFantasyProsFromStore } from "../src/draft-monitor/adapters/fantasyProsAdapter";
import {
  annotateTradesFromSnakeMismatch,
  extractEspnPickRecords,
  findEspnPickHistoryRoot,
  observeEspnFromDocument,
  parseEspnPickLeafText,
  scorePickHistoryColumn,
} from "../src/draft-monitor/adapters/espnAdapter";
import { buildEventKey } from "../src/draft-monitor/normalize/eventKey";
import { applySnapshotUpdate, mergePicks } from "../src/draft-monitor/normalize/mergeSnapshot";
import { groupPicksByRoundAndTeam } from "../src/draft-monitor/normalize/pickOwnership";
import type { NormalizedDraftPick, NormalizedDraftSnapshot } from "../src/draft-monitor/normalize/draftTypes";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — jsdom ships without types in this workspace
import { JSDOM } from "jsdom";

function basePick(partial: Partial<NormalizedDraftPick> & Pick<NormalizedDraftPick, "eventKey" | "round" | "playerName" | "currentTeamId" | "currentTeamName">): NormalizedDraftPick {
  return {
    source: "fantasypros",
    isKeeper: false,
    isTradedPick: false,
    isLiveSelection: true,
    keeperStatusKnown: true,
    ...partial,
  };
}

describe("A. standard snake draft", () => {
  it("places one pick per team per round with correct ownership", () => {
    const result = observeFantasyProsFromStore({
      vueDraftTarget: "local",
      draftState: {
        teamCount: 4,
        teams: [
          { id: "1", name: "Alpha" },
          { id: "2", name: "Bravo" },
          { id: "3", name: "Charlie" },
          { id: "4", name: "Delta" },
        ],
        draftedPlayers: [
          { id: "p1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "Alpha", isKeeper: false },
          { id: "p2", pick: 2, round: 1, posInRound: 2, ownerPos: 1, owner: "Bravo", isKeeper: false },
          { id: "p3", pick: 3, round: 1, posInRound: 3, ownerPos: 2, owner: "Charlie", isKeeper: false },
          { id: "p4", pick: 4, round: 1, posInRound: 4, ownerPos: 3, owner: "Delta", isKeeper: false },
        ],
        overallPick: 5,
        mockDraftKey: "snake-1",
      },
      playerMap: {
        p1: { name: "Player One", position: "RB", team: "KC" },
        p2: { name: "Player Two", position: "WR", team: "BUF" },
        p3: { name: "Player Three", position: "QB", team: "PHI" },
        p4: { name: "Player Four", position: "TE", team: "SF" },
      },
    });
    expect(result.ok).toBe(true);
    const snap = result.snapshot!;
    expect(snap.teamCount).toBe(4);
    expect(snap.picks).toHaveLength(4);
    const grouped = groupPicksByRoundAndTeam(snap.picks);
    expect(grouped.get(1)!.get(snap.teams[0]!.teamId)).toHaveLength(1);
    expect(grouped.get(1)!.get(snap.teams[1]!.teamId)).toHaveLength(1);
  });
});

describe("B. multiple picks same round", () => {
  it("stacks two cards for Team A and leaves Team B empty", () => {
    const teams = [
      { teamId: "a", teamName: "Team A", draftSlot: 1 },
      { teamId: "b", teamName: "Team B", draftSlot: 2 },
    ];
    const picks = [
      basePick({
        eventKey: "1",
        round: 4,
        overallPick: 43,
        pickInRound: 1,
        currentTeamId: "a",
        currentTeamName: "Team A",
        playerName: "Malik Brooks",
      }),
      basePick({
        eventKey: "2",
        round: 4,
        overallPick: 48,
        pickInRound: 6,
        currentTeamId: "a",
        currentTeamName: "Team A",
        playerName: "Jordan Carter",
        isTradedPick: true,
      }),
    ];
    const grouped = groupPicksByRoundAndTeam(picks);
    expect(grouped.get(4)!.get("a")).toHaveLength(2);
    expect(grouped.get(4)!.get("b")).toBeUndefined();
    expect(teams.find((t) => t.teamId === "b")).toBeTruthy();
  });
});

describe("C. traded pick", () => {
  it("places under current owner and marks trade from snake mismatch", () => {
    const teams = [
      { teamId: "a", teamName: "Team A", draftSlot: 1 },
      { teamId: "b", teamName: "Team B", draftSlot: 2 },
      { teamId: "c", teamName: "Team C", draftSlot: 3 },
      { teamId: "d", teamName: "Team D", draftSlot: 4 },
    ];
    const picks: NormalizedDraftPick[] = [
      basePick({
        eventKey: "t1",
        source: "espn",
        round: 1,
        pickInRound: 2,
        overallPick: 2,
        currentTeamId: "a",
        currentTeamName: "Team A",
        playerName: "Trade Haul",
      }),
    ];
    annotateTradesFromSnakeMismatch(picks, teams);
    expect(picks[0]!.isTradedPick).toBe(true);
    expect(picks[0]!.originalTeamId).toBe("b");
    expect(picks[0]!.currentTeamId).toBe("a");
  });
});

describe("D. keeper", () => {
  it("marks keeper and includes in backfill without treating as live", () => {
    const result = observeFantasyProsFromStore({
      vueDraftTarget: "local",
      draftState: {
        teamCount: 2,
        teams: [
          { id: "1", name: "Gridiron Kings" },
          { id: "2", name: "Other" },
        ],
        draftedPlayers: [
          {
            id: "saq",
            pick: 14,
            round: 2,
            posInRound: 2,
            ownerPos: 0,
            owner: "Gridiron Kings",
            isKeeper: true,
          },
        ],
        mockDraftKey: "keep-1",
        overallPick: 1,
      },
      playerMap: {
        saq: { name: "Saquon Barkley", position: "RB", team: "PHI" },
      },
    });
    const k = result.snapshot!.picks[0]!;
    expect(k.isKeeper).toBe(true);
    expect(k.isLiveSelection).toBe(false);
    expect(k.keeperStatusKnown).toBe(true);
    expect(k.round).toBe(2);
  });
});

describe("E/F mid-draft and complete", () => {
  it("backfills prior picks and marks COMPLETE", () => {
    const mid = observeFantasyProsFromStore({
      vueDraftTarget: "local",
      draftState: {
        teamCount: 2,
        teams: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
        draftedPlayers: [
          { id: "1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "A", isKeeper: false },
          { id: "2", pick: 2, round: 1, posInRound: 2, ownerPos: 1, owner: "B", isKeeper: false },
        ],
        overallPick: 3,
        mockDraftKey: "mid",
      },
      playerMap: {
        "1": { name: "One", position: "RB", team: "KC" },
        "2": { name: "Two", position: "WR", team: "BUF" },
      },
    });
    expect(mid.snapshot!.picks).toHaveLength(2);
    expect(mid.snapshot!.status).toBe("ACTIVE");

    const done = observeFantasyProsFromStore({
      vueDraftTarget: "local",
      draftState: {
        teamCount: 2,
        teams: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
        draftedPlayers: [
          { id: "1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "A", isKeeper: false },
          { id: "2", pick: 2, round: 1, posInRound: 2, ownerPos: 1, owner: "B", isKeeper: false },
        ],
        draftComplete: true,
        overallPick: 3,
        mockDraftKey: "mid",
      },
      playerMap: {
        "1": { name: "One", position: "RB", team: "KC" },
        "2": { name: "Two", position: "WR", team: "BUF" },
      },
    });
    expect(done.snapshot!.status).toBe("COMPLETE");
    expect(done.snapshot!.currentOverallPick).toBeUndefined();
  });
});

describe("G/H duplicate + enrichment", () => {
  it("collapses duplicates and enriches team id", () => {
    const a = basePick({
      eventKey: "k1",
      round: 4,
      pickInRound: 3,
      overallPick: 40,
      currentTeamId: "missing",
      currentTeamName: "Team",
      playerName: "Malik Brooks",
    });
    const b = basePick({
      eventKey: "k1",
      round: 4,
      pickInRound: 3,
      overallPick: 40,
      currentTeamId: "team-7",
      currentTeamName: "Team",
      playerName: "Malik Brooks",
      playerId: "77",
    });
    const { picks, duplicatesSuppressed } = mergePicks([a], [a, b]);
    expect(picks).toHaveLength(1);
    expect(picks[0]!.currentTeamId).toBe("team-7");
    expect(picks[0]!.playerId).toBe("77");
    expect(duplicatesSuppressed).toBeGreaterThan(0);
  });
});

describe("I. draft reset", () => {
  it("clears prior picks only when fingerprint changes", () => {
    const prev: NormalizedDraftSnapshot = {
      source: "fantasypros",
      status: "ACTIVE",
      teamCount: 2,
      teams: [],
      picks: [
        basePick({
          eventKey: "old",
          round: 1,
          currentTeamId: "1",
          currentTeamName: "A",
          playerName: "Old",
        }),
      ],
      lastUpdatedAt: "t1",
      draftFingerprint: "fantasypros:mdk:old",
      draftId: "fp-mock-old",
    };
    const next: NormalizedDraftSnapshot = {
      ...prev,
      draftFingerprint: "fantasypros:mdk:new",
      draftId: "fp-mock-new",
      picks: [
        basePick({
          eventKey: "new",
          round: 1,
          currentTeamId: "1",
          currentTeamName: "A",
          playerName: "New",
        }),
      ],
      lastUpdatedAt: "t2",
    };
    const applied = applySnapshotUpdate(prev, next);
    expect(applied.reset).toBe(true);
    expect(applied.snapshot.picks).toHaveLength(1);
    expect(applied.snapshot.picks[0]!.playerName).toBe("New");
  });

  it("does not reset on temporary zero-pick read", () => {
    const prev: NormalizedDraftSnapshot = {
      source: "espn",
      status: "ACTIVE",
      teamCount: 2,
      teams: [{ teamId: "1", teamName: "A" }],
      picks: [
        basePick({
          eventKey: "e1",
          source: "espn",
          round: 1,
          currentTeamId: "1",
          currentTeamName: "A",
          playerName: "Keep",
        }),
      ],
      lastUpdatedAt: "t1",
      draftFingerprint: "espn:league:1:2026",
    };
    const next: NormalizedDraftSnapshot = {
      ...prev,
      picks: [],
      status: "ACTIVE",
      lastUpdatedAt: "t2",
    };
    const applied = applySnapshotUpdate(prev, next);
    expect(applied.reset).toBe(false);
    expect(applied.snapshot.picks).toHaveLength(1);
  });
});

describe("J. missing source", () => {
  it("returns diagnostic error without fabricating picks", () => {
    const result = observeFantasyProsFromStore({ draftState: null });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

describe("event keys", () => {
  it("prefers overall pick over timestamp", () => {
    const k = buildEventKey({
      source: "espn",
      draftId: "d1",
      overallPick: 12,
    });
    expect(k).toContain("overall:12");
  });
});

describe("ESPN DOM pick history selection", () => {
  it("does not assume first draft-columns child is Pick History", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div class="draft-columns">
        <div class="pool">Available players QB RB WR search filter</div>
        <div class="history">
          <div>Pick History</div>
          <div>Bijan Robinson ATL, RB R1 P1 Atlanta Legends</div>
          <div>CeeDee Lamb DAL, WR R1 P2 Gridiron Kings</div>
        </div>
      </div>
    </body></html>`);
    const root = findEspnPickHistoryRoot(dom.window.document)!;
    expect(scorePickHistoryColumn(root)).toBeGreaterThan(
      scorePickHistoryColumn(dom.window.document.querySelector(".pool")!),
    );
    const records = extractEspnPickRecords(root);
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]!.playerName).toMatch(/Bijan/i);
    expect(records[0]!.fantasyTeamName).toMatch(/Atlanta/i);
  });

  it("parses keeper label when present", () => {
    const rec = parseEspnPickLeafText(
      "Saquon Barkley PHI, RB R2 P1 KEEPER Gridiron Kings",
      0,
    );
    expect(rec?.isKeeper).toBe(true);
    expect(rec?.keeperStatusKnown).toBe(true);
  });

  it("reconstructs board from document", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div class="draft-columns">
        <div class="history">
          <div>Pick History</div>
          <div>Bijan Robinson ATL, RB R1 P1 Atlanta Legends</div>
          <div>Your draft is complete!</div>
        </div>
      </div>
    </body></html>`, { url: "https://fantasy.espn.com/football/draft?leagueId=99&seasonId=2026" });
    const result = observeEspnFromDocument(dom.window.document, {
      href: "https://fantasy.espn.com/football/draft?leagueId=99&seasonId=2026",
    });
    expect(result.ok).toBe(true);
    expect(result.snapshot!.picks.length).toBeGreaterThanOrEqual(1);
    expect(result.snapshot!.status).toBe("COMPLETE");
    expect(result.snapshot!.teamCount).toBeGreaterThanOrEqual(1);
  });
});

function espnGridDoc(rosterOptions?: { label: string; selected?: boolean }[]): Document {
  const roster = rosterOptions
    ? `<select class="roster-team">${rosterOptions
        .map((o) => `<option${o.selected ? " selected" : ""}>${o.label}</option>`)
        .join("")}</select>`
    : "";
  const row = (pick: string, name: string, team: string, pos: string, fantasy: string) =>
    `<div role="row">
       <div role="gridcell"><div class="public_fixedDataTableCell_cellContent">${pick}</div></div>
       <div role="gridcell"><div class="public_fixedDataTableCell_cellContent"><div class="player-column">
         <span class="playerinfo__playername">${name}</span>
         <span class="playerinfo__playerteam">${team}</span>
         <span class="positionPill">${pos}</span></div></div></div>
       <div role="gridcell"><div class="public_fixedDataTableCell_cellContent">${fantasy}</div></div>
     </div>`;
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${roster}
      <div class="pick-history"><div class="pick-history-tables">
        <div class="pick-history-table"><div class="caption">Round 1</div>
          ${row("1", "Bijan Robinson", "ATL", "RB", "Atlanta Legends")}
          ${row("2", "CeeDee Lamb", "DAL", "WR", "Gridiron Kings")}
        </div>
      </div></div></body></html>`,
    { url: "https://fantasy.espn.com/football/draft?leagueId=1&seasonId=2026" },
  );
  return dom.window.document;
}

describe("user-team detection (isolated, exact-match only)", () => {
  it("tints the team on exactly one exact normalized match", () => {
    const r = observeEspnFromDocument(espnGridDoc([{ label: "Atlanta Legends", selected: true }, { label: "Gridiron Kings" }]));
    const user = r.snapshot!.teams.filter((t) => t.isUserTeam);
    expect(user.length).toBe(1);
    expect(user[0]!.teamName).toBe("Atlanta Legends");
    expect(r.snapshot!.userTeamNote).toMatch(/auto/i);
  });

  it("does NOT fuzzy-match a substring (Atlanta ≠ Atlanta Legends)", () => {
    const r = observeEspnFromDocument(espnGridDoc([{ label: "Atlanta", selected: true }, { label: "Gridiron Kings" }]));
    expect(r.snapshot!.teams.some((t) => t.isUserTeam)).toBe(false);
    expect(r.snapshot!.userTeamNote).toMatch(/no highlight/i);
  });

  it("no highlight when the selected name matches nothing", () => {
    const r = observeEspnFromDocument(espnGridDoc([{ label: "Nonexistent FC", selected: true }, { label: "Gridiron Kings" }]));
    expect(r.snapshot!.teams.some((t) => t.isUserTeam)).toBe(false);
    expect(r.snapshot!.userTeamNote).toMatch(/0 matches/);
  });

  it("no team selector present → no highlight, discovery intact", () => {
    const r = observeEspnFromDocument(espnGridDoc());
    expect(r.snapshot!.teams.some((t) => t.isUserTeam)).toBe(false);
    expect(r.snapshot!.teamCount).toBe(2);
    expect(r.snapshot!.picks.length).toBe(2);
  });
});

describe("active-pick highlight (never illuminate the wrong team)", () => {
  it("renders NO on-clock team cell; surfaces pick position in header only", async () => {
    const { renderBoard } = await import("../src/draft-monitor/board/renderBoard");
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="m"></div></body></html>`);
    const doc = dom.window.document;
    const mount = doc.getElementById("m")!;
    const snapshot: NormalizedDraftSnapshot = {
      source: "espn",
      status: "ACTIVE",
      teamCount: 3,
      teams: [
        { teamId: "a", teamName: "A", draftSlot: 1 },
        { teamId: "b", teamName: "B", draftSlot: 2 },
        { teamId: "c", teamName: "C", draftSlot: 3 },
      ],
      picks: [
        { eventKey: "espn:o:1", source: "espn", round: 1, pickInRound: 1, overallPick: 1,
          currentTeamId: "a", currentTeamName: "A", playerName: "P1",
          isKeeper: false, isTradedPick: false, isLiveSelection: true, keeperStatusKnown: false },
      ],
      currentOverallPick: 2,
      lastUpdatedAt: new Date().toISOString(),
      draftFingerprint: "fp:test",
    };
    const diags = {
      version: "test", source: "espn" as const, draftIdOrFingerprint: "fp:test",
      teamCount: 3, sourcePickCount: 1, normalizedPickCount: 1, duplicatesSuppressed: 0,
      keeperCount: 0, tradedPickCount: 0, userTeam: "—", lastSuccessfulReadAt: null,
      parseError: null, status: "ACTIVE" as const,
    };
    renderBoard({ document: doc, mount }, snapshot, diags);
    // No cell is illuminated as on-the-clock (ownership of upcoming pick unknown).
    expect(mount.querySelector(".on-clock")).toBeNull();
    // Position is surfaced without naming a team.
    const chip = mount.querySelector(".dbm-onclock");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toMatch(/Pick #2/);
    expect(chip!.textContent).not.toMatch(/\bA\b|\bB\b|\bC\b/);
  });

  it("completed draft surfaces no on-clock position", async () => {
    const { renderBoard } = await import("../src/draft-monitor/board/renderBoard");
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="m"></div></body></html>`);
    const doc = dom.window.document;
    const mount = doc.getElementById("m")!;
    const snapshot: NormalizedDraftSnapshot = {
      source: "espn", status: "COMPLETE", teamCount: 1,
      teams: [{ teamId: "a", teamName: "A", draftSlot: 1 }],
      picks: [{ eventKey: "e", source: "espn", round: 1, pickInRound: 1, overallPick: 1,
        currentTeamId: "a", currentTeamName: "A", playerName: "P1",
        isKeeper: false, isTradedPick: false, isLiveSelection: true, keeperStatusKnown: false }],
      currentOverallPick: undefined,
      lastUpdatedAt: new Date().toISOString(), draftFingerprint: "fp:done",
    };
    const diags = {
      version: "test", source: "espn" as const, draftIdOrFingerprint: "fp:done",
      teamCount: 1, sourcePickCount: 1, normalizedPickCount: 1, duplicatesSuppressed: 0,
      keeperCount: 0, tradedPickCount: 0, userTeam: "—", lastSuccessfulReadAt: null,
      parseError: null, status: "COMPLETE" as const,
    };
    renderBoard({ document: doc, mount }, snapshot, diags);
    expect(mount.querySelector(".dbm-onclock")).toBeNull();
    expect(mount.querySelector(".on-clock")).toBeNull();
  });
});
