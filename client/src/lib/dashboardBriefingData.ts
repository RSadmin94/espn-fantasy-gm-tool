/** Client-only helpers to shape existing dashboard query payloads for Welcome Back, Coach. */

type StandingLike = {
  wins?: number;
  losses?: number;
  ties?: number;
  pointsFor?: number;
};

type ScoreboardMatchupLike = {
  isCompleted?: boolean;
  homeScore?: number;
  awayScore?: number;
};

/** True when the selected season has at least one played game (not merely a scheduled week). */
export function seasonHasRealResults(input: {
  standings: StandingLike[];
  scoreboardMatchups?: ScoreboardMatchupLike[];
}): boolean {
  const { standings, scoreboardMatchups } = input;

  if (standings.some((t) => (t.wins ?? 0) > 0 || (t.losses ?? 0) > 0 || (t.ties ?? 0) > 0)) {
    return true;
  }
  if (standings.some((t) => (t.pointsFor ?? 0) > 0)) {
    return true;
  }

  if (
    scoreboardMatchups?.some((m) => {
      const hs = m.homeScore ?? 0;
      const as = m.awayScore ?? 0;
      return hs + as > 0;
    })
  ) {
    return true;
  }

  return false;
}

type DynastyTeam = {
  ownerName?: string;
  badge?: { key?: string };
};

function joinNames(arr: string[]): string {
  if (arr.length <= 1) return arr[0] ?? "";
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}

function isAre(n: number): string {
  return n === 1 ? "is" : "are";
}

function teamWord(n: number): string {
  return n === 1 ? "team" : "teams";
}

function franchiseWord(n: number): string {
  return n === 1 ? "franchise" : "franchises";
}

export function buildDynastyLine(data: { teams?: DynastyTeam[] } | null | undefined): string | null {
  const teams: DynastyTeam[] = Array.isArray(data?.teams) ? data!.teams! : [];
  if (teams.length === 0) return null;

  const groupOf = (key: string) =>
    teams.filter((t) => t?.badge?.key === key).map((t) => String(t.ownerName || "")).filter(Boolean);

  const builtToLast = groupOf("built_to_last");
  const winNow = groupOf("win_now_window");
  const risingEmpire = groupOf("rising_empire");
  const crossroads = groupOf("crossroads");
  const groundFloor = groupOf("ground_floor");

  const lines: string[] = [];
  if (builtToLast.length) {
    lines.push(
      `${builtToLast.length <= 2 ? "Only " : ""}${builtToLast.length} ${teamWord(builtToLast.length)} ${isAre(builtToLast.length)} Built to Last — ${joinNames(builtToLast)} ${isAre(builtToLast.length)} positioned for now and the future.`,
    );
  }
  if (winNow.length) {
    lines.push(`${joinNames(winNow)} ${isAre(winNow.length)} operating in a Win-Now Window.`);
  }
  if (risingEmpire.length) {
    lines.push(
      `${risingEmpire.length} Rising Empire ${franchiseWord(risingEmpire.length)} led by ${joinNames(risingEmpire)}.`,
    );
  }
  if (groundFloor.length) {
    lines.push(
      `${groundFloor.length} ${franchiseWord(groundFloor.length)} ${groundFloor.length === 1 ? "remains" : "remain"} in Ground Floor status — ${joinNames(groundFloor)}.`,
    );
  }
  if (crossroads.length && lines.length === 0) {
    lines.push(
      `${crossroads.length} ${teamWord(crossroads.length)} ${isAre(crossroads.length)} at a Crossroads between competing now and building later.`,
    );
  }
  return lines.length > 0 ? lines[0]! : null;
}

export function buildDraftMemo(draftData: Record<string, unknown> | null | undefined): string | null {
  if (!draftData?.ok) return null;
  const meters = (draftData.shockMeters as Array<Record<string, unknown>> | undefined) ?? [];
  const runs = (draftData.positionRunAlerts as Array<Record<string, unknown>> | undefined) ?? [];
  if (meters.length === 0) return null;

  const fn = (x: unknown) => String(x || "").trim().split(" ")[0] || "Owner";
  const bySurprise = [...meters].sort(
    (a, b) => Number(b.surpriseProbability ?? 0) - Number(a.surpriseProbability ?? 0),
  );
  const topRuns = [...runs].sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
  const topSurprise = bySurprise[0];
  const topRun = topRuns[0];

  const parts: string[] = ["Draft prep is live."];
  if (topSurprise) {
    parts.push(
      `${fn(topSurprise.ownerName)} is your least predictable rival (${String(topSurprise.mostLikelyPosition || "flex")} lean).`,
    );
  }
  if (topRun) {
    parts.push(`${String(topRun.position)} run risk is the strongest board signal.`);
  }
  parts.push("Protect leverage where value is thin.");
  return parts.join(" ");
}

export function countRecentTrades(
  events: Array<{ eventType?: string }> | null | undefined,
): number {
  if (!events?.length) return 0;
  return events.filter((e) => String(e.eventType ?? "").toLowerCase().includes("trade")).length;
}

export function buildAcquisitionHeadline(
  events: Array<{ eventType?: string }> | null | undefined,
): string | null {
  if (!events?.length) return null;
  const adds = events.filter((e) => {
    const t = String(e.eventType ?? "").toLowerCase();
    return t.includes("waiver") || t.includes("add") || t.includes("free agent");
  });
  if (adds.length === 0) return null;
  return `${adds.length} recent roster move${adds.length === 1 ? "" : "s"} reshaped league rosters.`;
}

export function buildPlayoffOutlook(input: {
  standingRank?: number;
  playoffProbability?: number;
  playoffSpots: number;
}): string | null {
  const { standingRank, playoffProbability, playoffSpots } = input;
  if (standingRank == null && playoffProbability == null) return null;
  const spots = playoffSpots > 0 ? playoffSpots : 6;
  if (typeof playoffProbability === "number" && Number.isFinite(playoffProbability)) {
    if (playoffProbability >= 75) {
      return `Playoff probability at ${Math.round(playoffProbability)}% — you're in the driver's seat.`;
    }
    if (playoffProbability < 40) {
      return `Playoff probability at ${Math.round(playoffProbability)}% — every week counts from here.`;
    }
  }
  if (standingRank != null && standingRank > spots) {
    return `Ranked #${standingRank} — outside the ${spots}-team playoff picture right now.`;
  }
  if (standingRank != null && standingRank <= spots + 1) {
    return `Ranked #${standingRank} — on the playoff bubble with ${spots} spots available.`;
  }
  return null;
}

export function buildHofHeadline(
  leader: { displayName?: string; titles?: number } | null | undefined,
): string | null {
  if (!leader?.displayName) return null;
  const titles = leader.titles ?? 0;
  if (titles <= 0) return `${leader.displayName} leads the league legacy board.`;
  return `${leader.displayName} leads with ${titles} championship${titles === 1 ? "" : "s"}.`;
}
