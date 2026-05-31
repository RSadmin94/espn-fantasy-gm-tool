/**
 * Shared builder for 2010 draft JSON (used by emit script and seed fallback).
 * @returns {{ leagueId: string, teams: object[], picks: object[] }}
 */
export function build2010DraftDocument() {
  const TEAM_NAMES = [
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

  const STAR_BOARD = [
    ["Chris Johnson", "RB", "TEN"],
    ["Adrian Peterson", "RB", "MIN"],
    ["Maurice Jones-Drew", "RB", "JAX"],
    ["Ray Rice", "RB", "BAL"],
    ["Aaron Rodgers", "QB", "GB"],
    ["Frank Gore", "RB", "SF"],
    ["Michael Turner", "RB", "ATL"],
    ["Drew Brees", "QB", "NO"],
    ["Randy Moss", "WR", "NE"],
    ["Andre Johnson", "WR", "HOU"],
    ["Cedric Benson", "RB", "CIN"],
    ["Miles Austin", "WR", "DAL"],
    ["DeAngelo Williams", "RB", "CAR"],
    ["Steven Jackson", "RB", "STL"],
    ["Roddy White", "WR", "ATL"],
    ["Brandon Marshall", "WR", "MIA"],
    ["Larry Fitzgerald", "WR", "ARI"],
    ["Wes Welker", "WR", "NE"],
    ["DeSean Jackson", "WR", "PHI"],
    ["Tony Romo", "QB", "DAL"],
    ["Philip Rivers", "QB", "LAC"],
    ["Matt Schaub", "QB", "HOU"],
    ["Peyton Manning", "QB", "IND"],
    ["Tom Brady", "QB", "NE"],
    ["Aaron Hernandez", "TE", "NE"],
    ["Jason Witten", "TE", "DAL"],
    ["Antonio Gates", "TE", "LAC"],
    ["Vernon Davis", "TE", "SF"],
    ["Jermichael Finley", "TE", "GB"],
    ["Dallas Clark", "TE", "IND"],
    ["Joseph Addai", "RB", "IND"],
    ["Ryan Mathews", "RB", "LAC"],
    ["Jahvid Best", "RB", "DET"],
    ["LeSean McCoy", "RB", "PHI"],
    ["Rashard Mendenhall", "RB", "PIT"],
    ["Matt Forte", "RB", "CHI"],
    ["Jonathan Stewart", "RB", "CAR"],
    ["Knowshon Moreno", "RB", "DEN"],
    ["Pierre Thomas", "RB", "NO"],
    ["Ronnie Brown", "RB", "MIA"],
    ["Beanie Wells", "RB", "ARI"],
    ["Fred Jackson", "RB", "BUF"],
    ["C.J. Spiller", "RB", "BUF"],
    ["Felix Jones", "RB", "DAL"],
    ["Tim Hightower", "RB", "ARI"],
    ["Jerome Harrison", "RB", "CLE"],
    ["Mike Wallace", "WR", "PIT"],
    ["Marques Colston", "WR", "NO"],
    ["Greg Jennings", "WR", "GB"],
    ["Calvin Johnson", "WR", "DET"],
    ["Reggie Wayne", "WR", "IND"],
    ["Vincent Jackson", "WR", "LAC"],
    ["Mike Sims-Walker", "WR", "JAX"],
    ["Steve Smith", "WR", "CAR"],
    ["Hines Ward", "WR", "PIT"],
    ["Chad Ochocinco", "WR", "CIN"],
    ["Terrell Owens", "WR", "CIN"],
    ["Brett Favre", "QB", "MIN"],
    ["Matt Ryan", "QB", "ATL"],
    ["Joe Flacco", "QB", "BAL"],
    ["Jay Cutler", "QB", "CHI"],
    ["Ben Roethlisberger", "QB", "PIT"],
    ["David Akers", "K", "PHI"],
    ["Nate Kaeding", "K", "LAC"],
    ["Rob Bironas", "K", "TEN"],
    ["Stephen Gostkowski", "K", "NE"],
    ["Ryan Longwell", "K", "MIN"],
    ["Pittsburgh Steelers", "DST", "PIT"],
    ["Green Bay Packers", "DST", "GB"],
    ["Baltimore Ravens", "DST", "BAL"],
    ["New York Jets", "DST", "NYJ"],
  ];

  const POS_ROT = ["RB", "RB", "WR", "WR", "QB", "TE", "RB", "WR"];
  const NFL_ROT = ["ATL", "DAL", "GB", "NE", "NO", "PIT", "MIN", "HOU", "DET", "CHI", "NYG", "PHI", "TB", "ARI"];

  function teamIdForOverall(overall, nTeams) {
    const o0 = overall - 1;
    const r = Math.floor(o0 / nTeams) + 1;
    const pos = (o0 % nTeams) + 1;
    return r % 2 === 1 ? pos : nTeams - pos + 1;
  }

  function pickPlayer(overall) {
    if (overall <= STAR_BOARD.length) return STAR_BOARD[overall - 1];
    const i = overall - STAR_BOARD.length - 1;
    const pos = POS_ROT[i % POS_ROT.length];
    const nfl = NFL_ROT[i % NFL_ROT.length];
    return [`Bench/Depth ${overall}`, pos, nfl];
  }

  const season = 2010;
  const nTeams = TEAM_NAMES.length;
  const rounds = 16;
  const picks = [];
  for (let overall = 1; overall <= nTeams * rounds; overall++) {
    const teamId = teamIdForOverall(overall, nTeams);
    const teamName = TEAM_NAMES[teamId - 1];
    const r = Math.floor((overall - 1) / nTeams) + 1;
    const roundPick = ((overall - 1) % nTeams) + 1;
    const [playerName, position, nflTeam] = pickPlayer(overall);
    picks.push({
      season,
      overallPick: overall,
      round: r,
      roundPick,
      teamId,
      teamName,
      playerName,
      position,
      nflTeam,
      isKeeper: false,
    });
  }

  return {
    leagueId: "457622",
    teams: TEAM_NAMES.map((teamName, idx) => ({
      teamId: idx + 1,
      teamName,
      ownerName: "",
    })),
    picks,
  };
}
