/**
 * RFSN-052I — Advisor-only career leaderboard qualification.
 *
 * Does not alter Hall of Fame ownerRecords. Leaderboard-style Advisor questions
 * (best/worst win%, most efficient, most career wins/losses) filter to owners
 * who meet a league-relative sample bar. Named-owner questions still use the
 * raw HoF row even when below the bar.
 */

export type AdvisorCareerRecordRow = {
  ownerKey: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  winPct: number;
  seasonsActive: number;
};

export type CareerQualificationCandidate = {
  ownerKey: string;
  ownerName: string;
  games: number;
  seasonsActive: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  qualified: boolean;
};

export type AdvisorCareerQualification = {
  medianGames: number;
  medianSeasons: number;
  minGames: number;
  minSeasons: number;
  rule: string;
  qualified: AdvisorCareerRecordRow[];
  unqualified: AdvisorCareerRecordRow[];
  candidates: CareerQualificationCandidate[];
};

export function medianNumber(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * League-relative bar:
 * - minGames = round(median RS games among owners with ≥1 game)
 * - minSeasons = 2 when the league’s median tenure is ≥2 seasons, else 1
 *
 * Defensible: scales with league age (1-year league median ≈ a full season;
 * 16-year league median drops one-season flukes) without a hardcoded 50-game
 * constant. Two-season floor only applies when the league itself has multi-season
 * careers.
 */
export function qualifyAdvisorCareerRecords(
  rows: AdvisorCareerRecordRow[],
): AdvisorCareerQualification {
  const active = rows.filter((r) => r.games > 0);
  const medianGames = medianNumber(active.map((r) => r.games));
  const medianSeasons = medianNumber(active.map((r) => r.seasonsActive));
  const minGames = Math.max(1, Math.round(medianGames));
  const minSeasons = medianSeasons >= 2 ? 2 : 1;
  const rule =
    `Career leaderboard: ≥${minGames} recorded regular-season games ` +
    `(league median) and ≥${minSeasons} season${minSeasons === 1 ? "" : "s"}. ` +
    `Does not change Hall of Fame records.`;

  const qualified: AdvisorCareerRecordRow[] = [];
  const unqualified: AdvisorCareerRecordRow[] = [];
  for (const r of active) {
    if (r.games >= minGames && r.seasonsActive >= minSeasons) qualified.push(r);
    else unqualified.push(r);
  }

  const pool = qualified.length > 0 ? qualified : active;
  const candidates: CareerQualificationCandidate[] = active
    .map((r) => ({
      ownerKey: r.ownerKey,
      ownerName: r.ownerName,
      games: r.games,
      seasonsActive: r.seasonsActive,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      winPct: r.winPct,
      qualified: r.games >= minGames && r.seasonsActive >= minSeasons,
    }))
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.games - a.games ||
        a.ownerName.localeCompare(b.ownerName),
    );

  return {
    medianGames,
    medianSeasons,
    minGames,
    minSeasons,
    rule,
    qualified: pool,
    unqualified,
    candidates,
  };
}

export function findNamedCareerRecord(
  rows: AdvisorCareerRecordRow[],
  owner: { displayName: string; canonicalPersonId?: string | null; memberId?: string },
): AdvisorCareerRecordRow | null {
  const want = owner.displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = owner.canonicalPersonId || owner.memberId || "";
  return (
    rows.find(
      (r) =>
        (key && (r.ownerKey === key || r.ownerKey === `id:${key}` || r.ownerKey.endsWith(key))) ||
        r.ownerName
          .toLowerCase()
          .replace(/[^a-z0-9\s]+/g, " ")
          .replace(/\s+/g, " ")
          .trim() === want ||
        r.ownerName.toLowerCase().includes(want) ||
        want.includes(r.ownerName.toLowerCase()),
    ) ?? null
  );
}
