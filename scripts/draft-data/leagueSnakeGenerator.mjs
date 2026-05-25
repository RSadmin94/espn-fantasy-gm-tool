/**
 * 14-team snake draft generator (16 rounds = 224 picks).
 * Used to emit slim JSON seeds: season + leagueId + picks[].
 */

export const LEAGUE_TEAM_NAMES = [
  "SMASHVILLE TITANS",
  "ATOWN FINEST",
  "GRIDIRON KINGS",
  "SOUTHSIDE BOYZ",
  "MIDTOWN MAYHEM",
  "WEST END WARRIORS",
  "EASTSIDE ELITE",
  "CAMP CREEK CRUISERS",
  "DECATUR DAWGS",
  "BUCKHEAD BALLERS",
  "COLLEGE PARK CRASHERS",
  "RIVERDALE RAIDERS",
  "CLAYTON COUNTY CRUSH",
  "EAST POINT EMPIRE",
];

const POS_ROT = ["RB", "RB", "WR", "WR", "QB", "TE", "RB", "WR"];
const NFL_ROT = ["ATL", "DAL", "GB", "NE", "NO", "PIT", "MIN", "HOU", "DET", "CHI", "NYG", "PHI", "TB", "ARI"];

function teamIdForOverall(overall, nTeams) {
  const o0 = overall - 1;
  const r = Math.floor(o0 / nTeams) + 1;
  const pos = (o0 % nTeams) + 1;
  return r % 2 === 1 ? pos : nTeams - pos + 1;
}

/**
 * @param {number} season
 * @param {string} leagueId
 * @param {Array<[string, string, string]>} starTuples - [playerName, position, nflTeam][] in overall pick order (must cover at least pick 1..length)
 */
export function generateSlimSnakeDraft(season, leagueId, starTuples) {
  const nTeams = LEAGUE_TEAM_NAMES.length;
  const rounds = 16;
  const picks = [];
  for (let overall = 1; overall <= nTeams * rounds; overall++) {
    const teamId = teamIdForOverall(overall, nTeams);
    const teamName = LEAGUE_TEAM_NAMES[teamId - 1];
    const r = Math.floor((overall - 1) / nTeams) + 1;
    const roundPick = ((overall - 1) % nTeams) + 1;
    let playerName;
    let position;
    let nflTeam;
    if (overall <= starTuples.length) {
      [playerName, position, nflTeam] = starTuples[overall - 1];
    } else {
      const i = overall - starTuples.length - 1;
      position = POS_ROT[i % POS_ROT.length];
      nflTeam = NFL_ROT[i % NFL_ROT.length];
      playerName = `Bench ${season} #${overall}`;
    }
    picks.push({
      overallPick: overall,
      round: r,
      roundPick,
      teamName,
      playerName,
      position,
      nflTeam,
    });
  }
  return { season, leagueId, picks };
}
