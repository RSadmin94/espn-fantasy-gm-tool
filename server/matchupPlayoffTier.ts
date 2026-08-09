/**
 * ESPN schedule: regular season uses `playoffTierType: "NONE"` (or the field omitted).
 * Playoff and consolation brackets use non-NONE tier strings.
 * Same boolean rule as `buildUniversalLeague` in `server/providers/espnAdapter.ts`.
 *
 * RFSN-052I: WINNERS_BRACKET = championship contention (may still include 3rd-place
 * in the final period). LOSERS_BRACKET / consolation ≠ elimination from the title.
 */
export function matchupIsPlayoffFromEspnTier(playoffTierType: unknown): boolean {
  return (playoffTierType as string) !== "NONE" && Boolean(playoffTierType);
}

export type EspnPlayoffTierKind = "winners" | "consolation" | "none" | "unknown";

export function parsePlayoffTierFromRawMatchup(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const t = parsed?.playoffTierType;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function classifyEspnPlayoffTier(
  playoffTierType: unknown,
  isPlayoffFlag?: boolean,
): EspnPlayoffTierKind {
  const t = typeof playoffTierType === "string" ? playoffTierType.trim().toUpperCase() : "";
  if (!t || t === "NONE") {
    return isPlayoffFlag ? "unknown" : "none";
  }
  if (t === "WINNERS_BRACKET" || t === "WINNERS") return "winners";
  return "consolation";
}

export type WinnersBracketMeeting = {
  season: number;
  matchupPeriodId: number;
  homePerson: string;
  awayPerson: string;
  winnerPerson: string | null;
  kind: EspnPlayoffTierKind;
};

export function meetingKey(m: {
  season: number;
  matchupPeriodId: number;
  homePerson: string;
  awayPerson: string;
}): string {
  return `${m.season}:${m.matchupPeriodId}:${m.homePerson}:${m.awayPerson}`;
}

/**
 * Final-period WINNERS_BRACKET games that are placement (3rd place), not the title game.
 * Same semi-final-winner tracing already used for championship matchup identification.
 * If semis cannot be identified, nothing is excluded (cannot prove placement).
 */
export function placementWinnersBracketKeys(games: WinnersBracketMeeting[]): Set<string> {
  const placement = new Set<string>();
  const bySeason = new Map<number, WinnersBracketMeeting[]>();
  for (const g of games) {
    if (g.kind !== "winners") continue;
    if (!bySeason.has(g.season)) bySeason.set(g.season, []);
    bySeason.get(g.season)!.push(g);
  }
  for (const [, seasonGames] of bySeason) {
    const maxP = Math.max(...seasonGames.map((g) => g.matchupPeriodId));
    const finalRound = seasonGames.filter((g) => g.matchupPeriodId === maxP);
    if (finalRound.length <= 1) continue;
    const semis = seasonGames.filter((g) => g.matchupPeriodId === maxP - 1);
    if (!semis.length) continue;
    const semiWinners = new Set(
      semis.map((g) => g.winnerPerson).filter((id): id is string => !!id),
    );
    if (semiWinners.size < 2) continue;
    for (const g of finalRound) {
      const titleGame = semiWinners.has(g.homePerson) && semiWinners.has(g.awayPerson);
      if (!titleGame) placement.add(meetingKey(g));
    }
  }
  return placement;
}
