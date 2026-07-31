"use strict";
(() => {
  // ../standalone/draft-board-monitor/src/draft-monitor/normalize/draftTypes.ts
  var MONITOR_VERSION = "1.3.1-standalone";

  // ../standalone/draft-board-monitor/src/draft-monitor/normalize/eventKey.ts
  function normName(s) {
    return String(s ?? "").toLowerCase().replace(/[.'’`]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/\s+/g, " ").trim();
  }
  function buildEventKey(args) {
    const src = args.source;
    const sid = String(args.sourceEventId ?? "").trim();
    if (sid) return `${src}:id:${sid}`;
    const draft = String(args.draftId ?? "").trim() || "unknown";
    const overall = Number(args.overallPick);
    if (Number.isFinite(overall) && overall >= 1) {
      return `${src}:${draft}:overall:${Math.floor(overall)}`;
    }
    const round = Number(args.round);
    const pir = Number(args.pickInRound);
    if (Number.isFinite(round) && round >= 1 && Number.isFinite(pir) && pir >= 1) {
      return `${src}:${draft}:r${Math.floor(round)}p${Math.floor(pir)}`;
    }
    const teamId = String(args.teamId ?? "").trim();
    const playerId = String(args.playerId ?? "").trim();
    if (Number.isFinite(round) && round >= 1 && Number.isFinite(pir) && pir >= 1 && teamId && playerId) {
      return `${src}:r${Math.floor(round)}p${Math.floor(pir)}:t${teamId}:pl${playerId}`;
    }
    const tName = normName(String(args.teamName ?? ""));
    const pName = normName(String(args.playerName ?? ""));
    if (Number.isFinite(round) && round >= 1 && Number.isFinite(pir) && pir >= 1 && tName && pName) {
      return `${src}:r${Math.floor(round)}p${Math.floor(pir)}:${tName}:${pName}`;
    }
    return `${src}:fallback:${draft}:${Math.floor(round || 0)}:${Math.floor(pir || 0)}:${tName}:${pName}`;
  }
  function softPickIdentity(pick) {
    if (pick.overallPick != null && pick.overallPick >= 1) {
      return `o:${pick.overallPick}`;
    }
    if (pick.round >= 1 && pick.pickInRound != null && pick.pickInRound >= 1) {
      const pn = pick.playerId || normName(pick.playerName);
      return `r${pick.round}p${pick.pickInRound}:${pn}`;
    }
    return `n:${normName(pick.playerName)}:r${pick.round}`;
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/normalize/pickOwnership.ts
  function resolveCurrentOwner(args) {
    const byId = new Map(args.teams.map((t) => [t.teamId, t]));
    const byName = new Map(
      args.teams.map((t) => [norm(t.teamName), t])
    );
    let currentTeamId = String(args.currentTeamId ?? "").trim();
    let currentTeamName = String(args.currentTeamName ?? "").trim();
    if (currentTeamId && byId.has(currentTeamId)) {
      currentTeamName = byId.get(currentTeamId).teamName;
    } else if (currentTeamName && byName.has(norm(currentTeamName))) {
      const t = byName.get(norm(currentTeamName));
      currentTeamId = t.teamId;
      currentTeamName = t.teamName;
    } else if (!currentTeamId && currentTeamName) {
      currentTeamId = `name:${norm(currentTeamName)}`;
    } else if (currentTeamId && !currentTeamName) {
      currentTeamName = `Team ${currentTeamId}`;
    }
    const originalTeamId = String(args.originalTeamId ?? "").trim() || void 0;
    let originalTeamName = String(args.originalTeamName ?? "").trim() || void 0;
    if (originalTeamId && byId.has(originalTeamId)) {
      originalTeamName = byId.get(originalTeamId).teamName;
    }
    const slot = args.originalDraftSlot;
    if (!originalTeamId && slot != null && Number.isFinite(slot) && slot >= 1) {
      const bySlot = args.teams.find((t) => t.draftSlot === Math.floor(slot));
      if (bySlot) {
        return {
          currentTeamId: currentTeamId || bySlot.teamId,
          currentTeamName: currentTeamName || bySlot.teamName,
          isTradedPick: Boolean(currentTeamId) && currentTeamId !== bySlot.teamId,
          originalTeamId: bySlot.teamId,
          originalTeamName: bySlot.teamName
        };
      }
    }
    const isTradedPick = Boolean(
      originalTeamId && currentTeamId && originalTeamId !== currentTeamId
    );
    return {
      currentTeamId: currentTeamId || "unknown",
      currentTeamName: currentTeamName || "Unknown Team",
      isTradedPick,
      originalTeamId,
      originalTeamName
    };
  }
  function norm(s) {
    return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function groupPicksByRoundAndTeam(picks) {
    const byRound = /* @__PURE__ */ new Map();
    const sorted = [...picks].sort((a, b) => {
      const oa = a.overallPick ?? Number.MAX_SAFE_INTEGER;
      const ob = b.overallPick ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      const pa = a.pickInRound ?? 0;
      const pb = b.pickInRound ?? 0;
      return pa - pb;
    });
    for (const p of sorted) {
      if (!byRound.has(p.round)) byRound.set(p.round, /* @__PURE__ */ new Map());
      const byTeam = byRound.get(p.round);
      if (!byTeam.has(p.currentTeamId)) byTeam.set(p.currentTeamId, []);
      byTeam.get(p.currentTeamId).push(p);
    }
    return byRound;
  }

  // ../shared/playerHeadshot.ts
  function sleeperPlayerHeadshotUrl(sleeperPlayerId, opts) {
    const id = String(sleeperPlayerId ?? "").trim();
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    if (opts?.size === "full") {
      return `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
    }
    return `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
  }
  function espnPlayerHeadshotUrl(espnPlayerId, opts) {
    const id = String(espnPlayerId ?? "").trim();
    if (!id || !/^\d+$/.test(id)) return null;
    const w = opts?.w ?? 80;
    const h = opts?.h ?? 58;
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=${w}&h=${h}&cb=1`;
  }
  function resolvePlayerHeadshotUrl(args) {
    return espnPlayerHeadshotUrl(args.espnPlayerId) || sleeperPlayerHeadshotUrl(args.sleeperPlayerId) || null;
  }

  // ../shared/playerIdentity.ts
  var PLAYER_IDENTITY_ARTIFACT_VERSION = 1;
  function normalizePlayerName(raw) {
    return String(raw ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\bjr\.?\b|\bsr\.?\b|\bii+\b/g, "").replace(/\s+/g, " ").trim();
  }
  function normalizeNflTeam(raw) {
    const t = String(raw ?? "").trim().toUpperCase();
    if (!t || t === "FA" || t === "NONE") return null;
    return t;
  }
  function normalizePosition(raw) {
    const p = String(raw ?? "").trim().toUpperCase();
    if (!p) return null;
    if (p === "D/ST" || p === "DST" || p === "DEF") return "DEF";
    return p;
  }
  function key2(a, b) {
    return `${a}|${b}`;
  }
  function key3(a, b, c) {
    return `${a}|${b}|${c}`;
  }
  function pushMap(map, key, player) {
    const list = map.get(key);
    if (list) list.push(player);
    else map.set(key, [player]);
  }
  function uniqueOrNull(list) {
    if (!list || list.length !== 1) return null;
    return list[0];
  }
  function ambiguous(list) {
    return Boolean(list && list.length > 1);
  }
  function toResult(player, matchSource, confidence, queryEspnId) {
    const espnPlayerId = player.espnPlayerId || (queryEspnId && /^\d+$/.test(queryEspnId) ? queryEspnId : null);
    return {
      sleeperPlayerId: player.sleeperPlayerId,
      espnPlayerId,
      canonicalName: player.canonicalName,
      matchSource,
      confidence,
      headshotUrl: resolvePlayerHeadshotUrl({
        espnPlayerId,
        sleeperPlayerId: player.sleeperPlayerId
      }),
      unresolvedReason: null
    };
  }
  function unresolved(reason, partial) {
    return {
      sleeperPlayerId: partial?.sleeperPlayerId ?? null,
      espnPlayerId: partial?.espnPlayerId ?? null,
      canonicalName: partial?.canonicalName ?? null,
      matchSource: "unresolved",
      confidence: "none",
      headshotUrl: partial?.headshotUrl ?? resolvePlayerHeadshotUrl({
        espnPlayerId: partial?.espnPlayerId,
        sleeperPlayerId: partial?.sleeperPlayerId
      }),
      unresolvedReason: reason
    };
  }
  function createPlayerIdentityIndex(artifact2) {
    if (!artifact2 || artifact2.v !== PLAYER_IDENTITY_ARTIFACT_VERSION) {
      throw new Error(`unsupported_player_identity_artifact_v:${artifact2?.v}`);
    }
    const bySleeperId = /* @__PURE__ */ new Map();
    const byEspnId = /* @__PURE__ */ new Map();
    const byNameTeamPos = /* @__PURE__ */ new Map();
    const byNameTeam = /* @__PURE__ */ new Map();
    const byNamePos = /* @__PURE__ */ new Map();
    const byName = /* @__PURE__ */ new Map();
    for (const row of artifact2.players) {
      const sleeperPlayerId = String(row[0] ?? "").trim();
      if (!sleeperPlayerId) continue;
      const espnRaw = String(row[1] ?? "").trim();
      const espnPlayerId = /^\d+$/.test(espnRaw) ? espnRaw : null;
      const canonicalName = String(row[2] ?? "").trim();
      if (!canonicalName) continue;
      const nflTeam = normalizeNflTeam(row[3]);
      const position = normalizePosition(row[4]);
      const normalizedName = normalizePlayerName(canonicalName);
      if (!normalizedName) continue;
      const player = {
        sleeperPlayerId,
        espnPlayerId,
        canonicalName,
        normalizedName,
        nflTeam,
        position
      };
      if (!bySleeperId.has(sleeperPlayerId)) bySleeperId.set(sleeperPlayerId, player);
      if (espnPlayerId && !byEspnId.has(espnPlayerId)) byEspnId.set(espnPlayerId, player);
      pushMap(byName, normalizedName, player);
      if (nflTeam) pushMap(byNameTeam, key2(normalizedName, nflTeam), player);
      if (position) pushMap(byNamePos, key2(normalizedName, position), player);
      if (nflTeam && position) {
        pushMap(byNameTeamPos, key3(normalizedName, nflTeam, position), player);
      }
    }
    return {
      artifactVersion: artifact2.v,
      playerCount: bySleeperId.size,
      bySleeperId,
      byEspnId,
      byNameTeamPos,
      byNameTeam,
      byNamePos,
      byName
    };
  }
  function resolvePlayerIdentity(query, index) {
    const sleeperId = String(query.sleeperPlayerId ?? "").trim();
    const espnId = String(query.espnPlayerId ?? "").trim();
    const name = normalizePlayerName(String(query.playerName ?? ""));
    const team = normalizeNflTeam(query.nflTeam);
    const pos = normalizePosition(query.position);
    if (!sleeperId && !espnId && !name) {
      return unresolved("missing_input");
    }
    if (sleeperId) {
      const hit = index.bySleeperId.get(sleeperId);
      if (hit) return toResult(hit, "sleeper_id", "exact", espnId);
    }
    if (espnId && /^\d+$/.test(espnId)) {
      const hit = index.byEspnId.get(espnId);
      if (hit) return toResult(hit, "espn_id", "exact", espnId);
      const espnOnlyUrl = espnPlayerHeadshotUrl(espnId);
      if (espnOnlyUrl && !name) {
        return unresolved("no_match", {
          espnPlayerId: espnId,
          headshotUrl: espnOnlyUrl
        });
      }
    }
    if (!name) {
      return unresolved("no_match", {
        sleeperPlayerId: sleeperId || null,
        espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
        headshotUrl: resolvePlayerHeadshotUrl({
          espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
          sleeperPlayerId: sleeperId || null
        })
      });
    }
    const espnFallback = /^\d+$/.test(espnId) ? espnId : null;
    const espnFallbackUrl = espnPlayerHeadshotUrl(espnFallback);
    if (team && pos) {
      const list = index.byNameTeamPos.get(key3(name, team, pos));
      const hit = uniqueOrNull(list);
      if (hit) return toResult(hit, "name_team_pos", "high", espnFallback);
      if (ambiguous(list)) {
        return unresolved("ambiguous_name_team_pos", {
          espnPlayerId: espnFallback,
          headshotUrl: espnFallbackUrl
        });
      }
    }
    if (team) {
      const list = index.byNameTeam.get(key2(name, team));
      const hit = uniqueOrNull(list);
      if (hit) return toResult(hit, "name_team", "high", espnFallback);
      if (ambiguous(list)) {
        return unresolved("ambiguous_name_team", {
          espnPlayerId: espnFallback,
          headshotUrl: espnFallbackUrl
        });
      }
    }
    if (pos) {
      const list = index.byNamePos.get(key2(name, pos));
      const hit = uniqueOrNull(list);
      if (hit) return toResult(hit, "name_pos", "medium", espnFallback);
      if (ambiguous(list)) {
        return unresolved("ambiguous_name_pos", {
          espnPlayerId: espnFallback,
          headshotUrl: espnFallbackUrl
        });
      }
    }
    {
      const list = index.byName.get(name);
      const hit = uniqueOrNull(list);
      if (hit) return toResult(hit, "name_unique", "low", espnFallback);
      if (ambiguous(list)) {
        return unresolved("ambiguous_name", {
          espnPlayerId: espnFallback,
          headshotUrl: espnFallbackUrl
        });
      }
    }
    return unresolved("no_match", {
      sleeperPlayerId: sleeperId || null,
      espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
      headshotUrl: resolvePlayerHeadshotUrl({
        espnPlayerId: /^\d+$/.test(espnId) ? espnId : null,
        sleeperPlayerId: sleeperId || null
      })
    });
  }

  // ../shared/data/sleeperPlayerLookup.compact.json
  var sleeperPlayerLookup_compact_default = { v: 1, source: "sleeper:v1/players/nfl", sourcePlayerCount: 12200, includedPlayerCount: 2585, contentHash: "fnv1a-f5acd0e0", players: [["10210", "", "Cameron Latu", "PHI", "TE"], ["10212", "", "Josh Whyle", "GB", "TE"], ["10213", "", "Tre Tucker", "LV", "WR"], ["10214", "", "Davis Allen", "LAR", "TE"], ["10216", "", "Kenny McIntosh", "SEA", "RB"], ["10218", "", "Xavier Hutchinson", "HOU", "WR"], ["10219", "", "Chris Rodriguez", "JAX", "RB"], ["10220", "", "Will Mallory", "IND", "TE"], ["10221", "", "Ronnie Bell", "NO", "WR"], ["10222", "", "Jayden Reed", "GB", "WR"], ["10223", "", "Eric Gray", "NYG", "RB"], ["10224", "", "Brayden Willis", "SF", "TE"], ["10225", "", "Jonathan Mingo", "DAL", "WR"], ["10226", "", "Andrei Iosivas", "CIN", "WR"], ["10227", "", "Payne Durham", "TB", "TE"], ["10228", "", "Charlie Jones", "CIN", "WR"], ["10229", "", "Rashee Rice", "KC", "WR"], ["10231", "", "Elijah Higgins", "ARI", "TE"], ["10232", "", "Michael Wilson", "ARI", "WR"], ["10234", "", "Derius Davis", "LAC", "WR"], ["10235", "", "Roschon Johnson", "CHI", "RB"], ["10236", "", "Dalton Kincaid", "BUF", "TE"], ["1029", "14877", "Nick Foles", "", "QB"], ["1034", "15478", "Brandon Bolden", "", "RB"], ["10444", "", "Cedric Tillman", "CLE", "WR"], ["1048", "14886", "Lamar Miller", "", "RB"], ["1049", "14876", "Ryan Tannehill", "", "QB"], ["1052", "14958", "Demario Davis", "NYJ", "LB"], ["1067", "15072", "Marvin Jones", "", "WR"], ["1071", "14922", "Mohamed Sanu", "", "WR"], ["1077", "15062", "Travis Benjamin", "", "WR"], ["10857", "", "Stetson Bennett", "LAR", "QB"], ["10859", "", "Sam LaPorta", "DET", "TE"], ["10860", "", "Malik Cunningham", "DET", "WR"], ["10863", "", "A.T. Perry", "PIT", "WR"], ["10866", "", "Aidan O'Connell", "LV", "QB"], ["10867", "", "Jake Bobo", "SEA", "WR"], ["10871", "", "Luke Schoonmaker", "DAL", "TE"], ["10873", "", "Nolan Smith", "PHI", "LB"], ["10879", "", "Calijah Kancey", "TB", "DL"], ["10880", "", "Jack Campbell", "DET", "LB"], ["10883", "", "Will McDonald", "NYJ", "DL"], ["10888", "", "Jalen Carter", "PHI", "DL"], ["10891", "", "Devon Witherspoon", "SEA", "DB"], ["10892", "", "Will Anderson", "HOU", "DL"], ["10898", "", "Tuli Tuipulotu", "LAC", "DL"], ["10905", "", "Brian Branch", "DET", "DB"], ["10914", "", "Daiyan Henley", "LAC", "LB"], ["10916", "", "Kobie Turner", "LAR", "DL"], ["10917", "", "Byron Young", "LAR", "LB"], ["10921", "", "Yaya Diaby", "TB", "DL"], ["10937", "", "Jake Moody", "WAS", "K"], ["10955", "", "Chad Ryland", "ARI", "K"], ["10970", "", "Henry To'oTo'o", "HOU", "LB"], ["10980", "", "SirVocea Dennis", "TB", "LB"], ["10983", "", "Sean Clifford", "CIN", "QB"], ["1099", "15091", "Randy Bullock", "", "K"], ["11017", "", "Dee Winters", "DAL", "LB"], ["1103", "14936", "Whitney Mercilus", "GB", "LB"], ["11034", "", "Jalen Brooks", "ARI", "WR"], ["11046", "", "Colton Dowell", "SF", "WR"], ["11056", "", "Jared Wayne", "HOU", "WR"], ["11058", "", "Blake Grupe", "IND", "K"], ["11065", "", "Adrian Martinez", "SF", "QB"], ["11068", "", "Mitch Tinsley", "CIN", "WR"], ["11082", "", "Ben Sims", "MIA", "TE"], ["11086", "", "Ivan Pace", "MIN", "LB"], ["11092", "", "B.T. Potter", "TB", "K"], ["111", "9614", "Marcedes Lewis", "", "TE"], ["1110", "14924", "T.Y. Hilton", "", "WR"], ["11113", "", "Joel Wilson", "TEN", "TE"], ["11145", "", "Tanner Brown", "NO", "K"], ["11157", "", "Brycen Tremayne", "CAR", "WR"], ["11168", "", "Xavier Smith", "LAR", "WR"], ["11186", "", "Carlos Washington", "MIA", "RB"], ["11199", "", "Emari Demercado", "KC", "RB"], ["11201", "", "Blake Whiteheart", "CLE", "TE"], ["11210", "", "Malik Heath", "ATL", "WR"], ["11237", "", "Jacob Saylors", "DET", "RB"], ["1124", "15047", "Malik Jackson", "CLE", "DL"], ["11256", "", "Tyson Bagent", "CHI", "QB"], ["11257", "", "Shedrick Jackson", "LV", "WR"], ["11260", "", "Robert Burns", "CHI", "RB"], ["11261", "", "Andre Szmyt", "CLE", "K"], ["1127", "15074", "Danny Trevathan", "CHI", "LB"], ["11280", "", "Brady Russell", "SEA", "TE"], ["11292", "", "Tommy DeVito", "NE", "QB"], ["11299", "", "Zavier Scott", "MIN", "RB"], ["11304", "", "E.J. Jenkins", "PHI", "TE"], ["11306", "", "Xavier Gipson", "NYG", "WR"], ["11311", "", "Jason Brownlee", "KC", "WR"], ["11320", "", "Nikko Remigio", "KC", "WR"], ["11370", "", "Chris Brooks", "GB", "RB"], ["11377", "", "Tyrell Shavers", "BUF", "WR"], ["11381", "", "Travis Vokolek", "ARI", "TE"], ["11421", "", "Ryan Miller", "NYG", "WR"], ["11433", "", "Nate Adkins", "DEN", "TE"], ["11435", "", "Emanuel Wilson", "SEA", "RB"], ["11439", "", "Jaleel McLaughlin", "DEN", "RB"], ["11474", "", "Dylan Drummond", "ATL", "WR"], ["1149", "14912", "Alshon Jeffery", "", "WR"], ["11506", "", "Jalen Moreno-Cropper", "NO", "WR"], ["11508", "", "Princeton Fant", "DAL", "TE"], ["11510", "", "Hunter Luepke", "DAL", "RB"], ["11520", "", "Lucky Jackson", "DET", "WR"], ["11533", "", "Brandon Aubrey", "DAL", "K"], ["11539", "", "Jake Bates", "DET", "K"], ["11557", "", "Joe Milton", "DAL", "QB"], ["11558", "", "Sam Hartman", "WAS", "QB"], ["11559", "", "Michael Penix", "ATL", "QB"], ["11560", "", "Caleb Williams", "CHI", "QB"], ["11562", "", "Spencer Rattler", "NO", "QB"], ["11563", "", "Bo Nix", "DEN", "QB"], ["11564", "", "Drake Maye", "NE", "QB"], ["11565", "", "J.J. McCarthy", "MIN", "QB"], ["11566", "", "Jayden Daniels", "WAS", "QB"], ["11569", "", "Jarquez Hunter", "LAR", "RB"], ["11570", "", "Rasheen Ali", "BAL", "RB"], ["11571", "", "Isaiah Davis", "NYJ", "RB"], ["11573", "", "Frank Gore", "BUF", "RB"], ["11574", "", "Dylan Laube", "LV", "RB"], ["11575", "", "Ray Davis", "BUF", "RB"], ["11576", "", "Braelon Allen", "NYJ", "RB"], ["11577", "", "Will Shipley", "PHI", "RB"], ["11579", "", "Audric Estime", "NO", "RB"], ["11581", "", "MarShawn Lloyd", "GB", "RB"], ["11582", "", "Carson Steele", "PHI", "RB"], ["11583", "", "Jonathon Brooks", "CAR", "RB"], ["11584", "", "Bucky Irving", "TB", "RB"], ["11586", "", "Blake Corum", "LAR", "RB"], ["11588", "", "Jawhar Jordan", "HOU", "RB"], ["11589", "", "Trey Benson", "ARI", "RB"], ["11592", "", "Erick All", "CIN", "TE"], ["11593", "", "Brevyn Spann-Ford", "DAL", "TE"], ["11595", "", "Jared Wiley", "KC", "TE"], ["11596", "", "Ben Sinnott", "WAS", "TE"], ["11597", "", "Theo Johnson", "NYG", "TE"], ["11599", "", "Cade Stover", "HOU", "TE"], ["11600", "", "Ja'Tavion Sanders", "CAR", "TE"], ["11603", "", "AJ Barner", "SEA", "TE"], ["11604", "", "Brock Bowers", "LV", "TE"], ["11605", "", "Jaheim Bell", "PIT", "TE"], ["11608", "", "Isaiah Williams", "NYJ", "WR"], ["11610", "", "Malik Washington", "MIA", "WR"], ["11615", "", "Ainias Smith", "CAR", "WR"], ["11616", "", "Jacob Cowing", "SF", "WR"], ["11617", "", "Malachi Corley", "CLE", "WR"], ["11618", "", "Jalen McMillan", "TB", "WR"], ["11619", "", "Ja'Lynn Polk", "NO", "WR"], ["11620", "", "Rome Odunze", "CHI", "WR"], ["11621", "", "Brenden Rice", "GB", "WR"], ["11623", "", "Jordan Whittington", "LAR", "WR"], ["11624", "", "Xavier Worthy", "KC", "WR"], ["11625", "", "Adonai Mitchell", "NYJ", "WR"], ["11626", "", "Xavier Legette", "CAR", "WR"], ["11627", "", "Troy Franklin", "DEN", "WR"], ["11628", "", "Marvin Harrison", "ARI", "WR"], ["11629", "", "Devontez Walker", "BAL", "WR"], ["11630", "", "Roman Wilson", "PIT", "WR"], ["11631", "", "Brian Thomas", "JAX", "WR"], ["11632", "", "Malik Nabers", "NYG", "WR"], ["11633", "", "Jamari Thrash", "CLE", "WR"], ["11635", "", "Ladd McConkey", "LAC", "WR"], ["11636", "", "Johnny Wilson", "PHI", "WR"], ["11637", "", "Keon Coleman", "BUF", "WR"], ["11638", "", "Ricky Pearsall", "SF", "WR"], ["11643", "", "Jaylen Wright", "MIA", "RB"], ["11644", "", "Cody Schrader", "DEN", "RB"], ["11646", "", "Jalen Coker", "CAR", "WR"], ["11647", "", "Kimani Vidal", "LAC", "RB"], ["11648", "", "Kedon Slovis", "ARI", "QB"], ["11649", "", "Kendall Milton", "CIN", "RB"], ["11650", "", "Luke McCaffrey", "WAS", "WR"], ["11651", "", "Isaac Guerendo", "SF", "RB"], ["11653", "", "Charlie Smyth", "NO", "K"], ["11654", "", "Dante Miller", "NYG", "RB"], ["11655", "", "Tyrone Tracy", "NYG", "RB"], ["1166", "14880", "Kirk Cousins", "LV", "QB"], ["11663", "", "Chop Robinson", "MIA", "DL"], ["11665", "", "Jared Verse", "CLE", "DL"], ["11667", "", "Dallas Turner", "MIN", "LB"], ["11669", "", "Laiatu Latu", "IND", "DL"], ["11674", "", "Tyler Nubin", "NYG", "DB"], ["11687", "", "Edgerrin Cooper", "GB", "LB"], ["1170", "15009", "Alfred Morris", "", "RB"], ["11705", "", "Tykee Smith", "TB", "DB"], ["11716", "", "Tip Reiman", "ARI", "TE"], ["11727", "", "Payton Wilson", "PIT", "LB"], ["11729", "", "Sione Vaki", "DET", "RB"], ["11734", "", "Tyrice Knight", "SEA", "LB"], ["1174", "14994", "Mike Daniels", "CIN", "DL"], ["11742", "", "Cedric Gray", "TEN", "LB"], ["11748", "", "Bub Means", "NO", "WR"], ["11762", "", "Anthony Gould", "IND", "WR"], ["11783", "", "Ryan Flournoy", "DAL", "WR"], ["11786", "", "Cam Little", "JAX", "K"], ["11792", "", "Will Reichard", "MIN", "K"], ["11802", "", "Tejhaun Palmer", "ARI", "WR"], ["11808", "", "Jha'Quan Jackson", "HOU", "WR"], ["11815", "", "Cornelius Johnson", "BAL", "WR"], ["11820", "", "Devin Culp", "TB", "TE"], ["11821", "", "Tahj Washington", "MIA", "WR"], ["11834", "", "Devaughn Vele", "NO", "WR"], ["11851", "", "Carter Bradley", "JAX", "QB"], ["11895", "", "Mason Tipton", "NO", "WR"], ["11911", "", "Jeshaun Jones", "MIN", "WR"], ["11921", "", "Xavier Weaver", "ARI", "WR"], ["11940", "", "JaQuae Jackson", "LAC", "WR"], ["11942", "", "Colson Yankoff", "WAS", "TE"], ["11959", "", "Bryce Oliver", "TEN", "WR"], ["11963", "", "Chris Collier", "LV", "RB"], ["11964", "", "Dayton Wade", "BAL", "WR"], ["11969", "", "Xavier Johnson", "CIN", "WR"], ["11994", "", "Kameron Johnson", "TB", "WR"], ["120", "1097", "Adam Vinatieri", "", "K"], ["12001", "", "Lawrence Keys", "DET", "WR"], ["12015", "", "Harrison Mevis", "LAR", "K"], ["12036", "", "Ian Wheeler", "BUF", "RB"], ["12045", "", "Jack Westover", "NE", "TE"], ["12048", "", "George Holani", "SEA", "RB"], ["12062", "", "Cam Grandy", "CIN", "TE"], ["12068", "", "Mason Pline", "KC", "TE"], ["12079", "", "Treyton Welch", "NO", "TE"], ["1211", "15003", "Rhett Ellison", "", "TE"], ["1215", "14918", "Jarius Wright", "", "WR"], ["12154", "", "Messiah Swinson", "GB", "TE"], ["12171", "", "British Brooks", "HOU", "RB"], ["12185", "", "Spencer Shrader", "IND", "K"], ["12210", "", "Cole Burgess", "PIT", "WR"], ["1223", "15204", "Garrett Celek", "", "TE"], ["12267", "", "Qadir Ismail", "CHI", "WR"], ["1232", "14894", "Robert Turbin", "", "RB"], ["1234", "14881", "Russell Wilson", "", "QB"], ["12356", "", "Jabari Small", "DET", "RB"], ["12357", "", "David Martin-Robinson", "TEN", "TE"], ["12374", "", "Brenden Bates", "CLE", "TE"], ["12389", "", "Hayden Rucci", "SF", "TE"], ["12412", "", "Terrell Jennings", "NE", "RB"], ["1244", "15705", "Josh Gordon", "", "WR"], ["12455", "", "Brashard Smith", "KC", "RB"], ["12457", "", "Jaydon Blue", "DAL", "RB"], ["12460", "", "Antwane Wells", "ATL", "WR"], ["12462", "", "Damien Martinez", "GB", "RB"], ["12467", "", "Jordan James", "SF", "RB"], ["12469", "", "Dylan Sampson", "CLE", "RB"], ["12470", "", "Riley Leonard", "IND", "QB"], ["12471", "", "DJ Giddens", "IND", "RB"], ["12472", "", "Raheim Sanders", "CLE", "RB"], ["12473", "", "Mitchell Evans", "CAR", "TE"], ["12474", "", "Woody Marks", "HOU", "RB"], ["12475", "", "Ricky White", "SEA", "WR"], ["12476", "", "Devin Neal", "NO", "RB"], ["12477", "", "Kurtis Rourke", "SF", "QB"], ["12478", "", "Nick Nash", "WAS", "WR"], ["12480", "", "Moliki Matavao", "NO", "TE"], ["12481", "", "Cam Skattebo", "NYG", "RB"], ["12482", "", "Savion Williams", "GB", "WR"], ["12483", "", "Jack Bech", "LV", "WR"], ["12484", "", "Jayden Higgins", "HOU", "WR"], ["12485", "", "Tez Johnson", "TB", "WR"], ["12486", "", "Dillon Gabriel", "CLE", "QB"], ["12487", "", "Terrance Ferguson", "LAR", "TE"], ["12489", "", "RJ Harvey", "DEN", "RB"], ["12490", "", "Bhayshul Tuten", "JAX", "RB"], ["12491", "", "Corey Kiner", "ARI", "RB"], ["12492", "", "Pat Bryant", "DEN", "WR"], ["12493", "", "Oronde Gadsden", "LAC", "TE"], ["12494", "", "Kyle McCord", "GB", "QB"], ["12495", "", "Ollie Gordon", "MIA", "RB"], ["12496", "", "Tai Felton", "MIN", "WR"], ["12497", "", "Tory Horton", "SEA", "WR"], ["12498", "", "Mason Taylor", "NYJ", "TE"], ["12499", "", "Elic Ayomanor", "TEN", "WR"], ["125", "11284", "Calais Campbell", "BAL", "DL"], ["12500", "", "Quinn Ewers", "MIA", "QB"], ["12501", "", "Matthew Golden", "GB", "WR"], ["12502", "", "Gunnar Helm", "TEN", "TE"], ["12503", "", "Isaiah Bond", "CLE", "WR"], ["12504", "", "Kaleb Johnson", "PIT", "RB"], ["12505", "", "Jalen Royals", "KC", "WR"], ["12506", "", "Harold Fannin", "CLE", "TE"], ["12507", "", "Omarion Hampton", "LAC", "RB"], ["12508", "", "Jaxson Dart", "NYG", "QB"], ["12509", "", "Tre' Harris", "LAC", "WR"], ["12510", "", "Jalen Milroe", "SEA", "QB"], ["12511", "", "Will Howard", "PIT", "QB"], ["12512", "", "Quinshon Judkins", "CLE", "RB"], ["12514", "", "Emeka Egbuka", "TB", "WR"], ["12515", "", "Donovan Edwards", "MIA", "RB"], ["12516", "", "Kalel Mullings", "TEN", "RB"], ["12517", "", "Colston Loveland", "CHI", "TE"], ["12518", "", "Tyler Warren", "IND", "TE"], ["12519", "", "Luther Burden", "CHI", "WR"], ["12520", "", "Xavier Restrepo", "TEN", "WR"], ["12521", "", "Elijah Arroyo", "SEA", "TE"], ["12522", "", "Cam Ward", "TEN", "QB"], ["12523", "", "Jimmy Horn", "CAR", "WR"], ["12524", "", "Shedeur Sanders", "CLE", "QB"], ["12526", "", "Tetairoa McMillan", "CAR", "WR"], ["12527", "", "Ashton Jeanty", "LV", "RB"], ["12529", "", "TreVeyon Henderson", "NE", "RB"], ["12530", "", "Travis Hunter", "JAX", "WR"], ["12531", "", "Trevor Etienne", "CAR", "RB"], ["12533", "", "Jacory Croskey-Merritt", "WAS", "RB"], ["12534", "", "Kyle Monangai", "CHI", "RB"], ["12535", "", "Isaac TeSlaa", "DET", "WR"], ["12536", "", "Jaylin Noel", "HOU", "WR"], ["12538", "", "Brady Cook", "NYJ", "QB"], ["12539", "", "Arian Smith", "NYJ", "WR"], ["12540", "", "Chimere Dike", "TEN", "WR"], ["12541", "", "Dont'e Thornton", "LV", "WR"], ["12542", "", "Efton Chism", "NE", "WR"], ["12543", "", "Tahj Brooks", "CIN", "RB"], ["12544", "", "LeQuint Allen", "JAX", "RB"], ["12545", "", "Tyler Shough", "NO", "QB"], ["12547", "", "Kyle Williams", "NE", "WR"], ["12566", "", "Jihaad Campbell", "PHI", "LB"], ["12574", "", "Abdul Carter", "NYG", "DL"], ["12578", "", "Carson Schwesinger", "CLE", "LB"], ["12597", "", "Nick Emmanwori", "SEA", "DB"], ["12602", "", "Mykel Williams", "SF", "DL"], ["12617", "", "Demetrius Knight", "CIN", "LB"], ["1262", "15693", "Alex Tanney", "", "QB"], ["12634", "", "Jordan Watkins", "SF", "WR"], ["1264", "15683", "Justin Tucker", "", "K"], ["12640", "", "Teddye Buchanan", "BAL", "LB"], ["12641", "", "Jaylin Lane", "WAS", "WR"], ["12656", "", "Robbie Ouzts", "SEA", "RB"], ["12658", "", "Jackson Hawes", "BUF", "TE"], ["1266", "14993", "Greg Zuerlein", "", "K"], ["12670", "", "KeAndre Lambert-Smith", "LAC", "WR"], ["12688", "", "Cam Miller", "MIA", "QB"], ["1269", "15284", "Bradley Sowell", "", "TE"], ["12699", "", "LaJohntay Wester", "BAL", "WR"], ["127", "4333", "Matt Bryant", "", "K"], ["12700", "", "Gavin Bartholomew", "MIN", "TE"], ["12705", "", "Graham Mertz", "HOU", "QB"], ["12711", "", "Tyler Loop", "BAL", "K"], ["12713", "", "Andy Borregales", "NE", "K"], ["12715", "", "Thomas Fidone", "NYG", "TE"], ["12718", "", "Konata Mumpfield", "LAR", "WR"], ["12725", "", "Luke Lachey", "GB", "TE"], ["1273", "3043278", "Francis Owusu", "", "WR"], ["12732", "", "Dominic Lovett", "DET", "WR"], ["12735", "", "Caleb Lohner", "DEN", "TE"], ["12738", "", "Phil Mafah", "DAL", "RB"], ["12743", "", "Junior Bergen", "SF", "WR"], ["12746", "", "JP Richardson", "CHI", "WR"], ["12756", "", "Stephen Gosnell", "BUF", "WR"], ["12761", "", "Jordan Moore", "CIN", "WR"], ["12765", "", "Keleki Latu", "BUF", "TE"], ["12772", "", "Courtney Jackson", "TEN", "WR"], ["12773", "", "DJ Uiagalelei", "LAC", "QB"], ["12775", "", "Max Brosmer", "MIN", "QB"], ["12776", "", "Connor Bazelak", "TB", "QB"], ["12777", "", "Joaquin Davis", "PIT", "WR"], ["12787", "", "Josh Williams", "TB", "RB"], ["12788", "", "Will Sheppard", "GB", "WR"], ["12792", "", "Garrett Greene", "TB", "QB"], ["12797", "", "Ahmani Marshall", "CLE", "RB"], ["12799", "", "Bryson Green", "ARI", "WR"], ["12803", "", "Luke Grimm", "LAC", "WR"], ["12809", "", "Mac Dalena", "BUF", "WR"], ["12817", "", "Jake Briningstool", "KC", "TE"], ["12826", "", "Ulysses Bentley", "IND", "RB"], ["12829", "", "Coleman Owen", "IND", "WR"], ["12848", "", "Josh Kelly", "HOU", "WR"], ["12849", "", "Traeshon Holden", "DAL", "WR"], ["12851", "", "Rivaldo Fairweather", "ARI", "TE"], ["12860", "", "Theo Wease", "MIA", "WR"], ["12863", "", "Andrew Armstrong", "KC", "WR"], ["12865", "", "AJ Henning", "MIA", "WR"], ["12883", "", "Joshua Simon", "ATL", "TE"], ["12888", "", "Dalen Cambre", "NYG", "WR"], ["12889", "", "Beaux Collins", "NYG", "WR"], ["12892", "", "Da'Quan Felton", "NYJ", "WR"], ["12897", "", "Nathan Carter", "ATL", "RB"], ["1290", "15428", "Jermaine Kearse", "", "WR"], ["12901", "", "Patrick Herbert", "JAX", "TE"], ["12907", "", "Quentin Skinner", "BUF", "WR"], ["12908", "", "Chandler Brayboy", "JAX", "WR"], ["12909", "", "Eli Pancol", "IND", "WR"], ["12925", "", "Jamaal Pritchett", "NYJ", "WR"], ["12928", "", "Amar Johnson", "LAC", "RB"], ["12938", "", "Jackson Meeks", "DET", "WR"], ["12939", "", "Anthony Tyus", "CAR", "RB"], ["12941", "", "Bryson Nesbit", "MIN", "TE"], ["12946", "", "Dontae Fleming", "MIN", "WR"], ["12954", "", "Kye Robichaux", "DET", "RB"], ["12961", "", "Ryan Fitzgerald", "CAR", "K"], ["12969", "", "Lan Larison", "NE", "RB"], ["12971", "", "Ke'Shawn Williams", "CIN", "WR"], ["12975", "", "JJ Galbreath", "PIT", "TE"], ["1298", "13845", "Anthony Levine", "BAL", "DB"], ["12981", "", "Gee Scott", "NYJ", "TE"], ["12983", "", "Brock Lampe", "NE", "RB"], ["12984", "", "CJ Dippre", "NE", "TE"], ["13001", "", "Mario Williams", "LAR", "WR"], ["13003", "", "Tru Edwards", "LAR", "WR"], ["13010", "", "Jordan Waters", "LAR", "RB"], ["13011", "", "Brennan Presley", "LAR", "WR"], ["13013", "", "Mark Redman", "LAR", "TE"], ["1303", "13940", "James Develin", "", "RB"], ["13032", "", "Marshall Lang", "MIN", "TE"], ["13034", "", "Tyrone Broden", "SEA", "WR"], ["13042", "", "Xavier Guillory", "BAL", "WR"], ["13047", "", "Jacardia Wright", "SEA", "RB"], ["1305", "14332", "Patrick DiMarco", "", "RB"], ["13066", "", "Ben Sauls", "NYG", "K"], ["13074", "", "Isaiah Neyor", "GB", "WR"], ["13075", "", "Myles Price", "MIN", "WR"], ["13079", "", "Jahdae Walker", "CHI", "WR"], ["13101", "", "Gage Larvadain", "CLE", "WR"], ["13110", "", "Zach Horton", "DET", "TE"], ["13116", "", "Tre Watson", "KC", "TE"], ["1312", "15555", "Josh Bellamy", "", "WR"], ["13120", "", "Jacoby Jones", "WAS", "WR"], ["13121", "", "Ben Yurosek", "MIN", "TE"], ["13122", "", "Carter Runyon", "LV", "TE"], ["13124", "", "Jeremiah Webb", "NE", "WR"], ["13150", "", "Darius Cooper", "PHI", "WR"], ["13151", "", "Nick Kallerup", "SEA", "TE"], ["13173", "", "Jimmy Holiday", "KC", "WR"], ["13179", "", "Ja'seem Reed", "CAR", "WR"], ["13189", "", "Luke Floriea", "CLE", "WR"], ["13199", "", "Montorie Foster", "SEA", "WR"], ["13202", "", "Dalevon Campbell", "LAC", "WR"], ["13210", "", "Drake Dabney", "GB", "TE"], ["13213", "", "Lucas Scott", "BAL", "RB"], ["13217", "", "Hunter Dekkers", "NO", "QB"], ["13246", "", "Jaden Smith", "DAL", "WR"], ["13249", "", "Thomas Gordon", "DET", "TE"], ["13261", "", "Layne Pryor", "HOU", "TE"], ["13264", "", "Dohnte Meyers", "CIN", "WR"], ["13268", "", "Elijah Sarratt", "BAL", "WR"], ["13269", "", "Fernando Mendoza", "LV", "QB"], ["13270", "", "CJ Daniels", "LAR", "WR"], ["13272", "", "Carson Beck", "ARI", "QB"], ["13273", "", "Josh Cuevas", "BAL", "TE"], ["13274", "", "Germie Bernard", "PIT", "WR"], ["13275", "", "Ty Simpson", "LAR", "QB"], ["13276", "", "Omar Cooper", "NYJ", "WR"], ["13277", "", "CJ Donaldson", "NO", "RB"], ["13278", "", "Max Klare", "LAR", "TE"], ["13279", "", "Carnell Tate", "TEN", "WR"], ["13281", "", "Jordyn Tyson", "NO", "WR"], ["13282", "", "Jack Endries", "CIN", "TE"], ["13285", "", "Malachi Fields", "NYG", "WR"], ["13286", "", "Jadarian Price", "SEA", "RB"], ["13287", "", "Jeremiyah Love", "ARI", "RB"], ["13288", "", "Nicholas Singleton", "TEN", "RB"], ["13289", "", "Drew Allar", "PIT", "QB"], ["1329", "14402", "Chris Hogan", "", "WR"], ["13291", "", "Kejon Owens", "MIN", "RB"], ["13292", "", "Lake McRee", "PIT", "TE"], ["13293", "", "Ja'Kobi Lane", "BAL", "WR"], ["13294", "", "Makai Lemon", "PHI", "WR"], ["13295", "", "Behren Morton", "NE", "QB"], ["13296", "", "Caleb Douglas", "MIA", "WR"], ["13297", "", "Reggie Virgil", "ARI", "WR"], ["13298", "", "KC Concepcion", "CLE", "WR"], ["13299", "", "Nate Boerkircher", "JAX", "TE"], ["13301", "", "Antonio Williams", "WAS", "WR"], ["13302", "", "Adam Randall", "BAL", "RB"], ["13303", "", "Cade Klubnik", "NYJ", "QB"], ["13305", "", "Mike Washington", "LV", "RB"], ["13306", "", "Taylen Green", "CLE", "QB"], ["13307", "", "Marlin Klein", "HOU", "TE"], ["13308", "", "Bauer Sharp", "TB", "TE"], ["13309", "", "Aaron Anderson", "CLE", "WR"], ["13310", "", "Miller Moss", "CHI", "QB"], ["13311", "", "Chris Bell", "MIA", "WR"], ["13312", "", "Josh Kattus", "CIN", "TE"], ["13313", "", "Emmanuel Henderson", "SEA", "WR"], ["13314", "", "Luke Altmyer", "DET", "QB"], ["13315", "", "Dean Connors", "LAR", "RB"], ["13316", "", "Eric Rivers", "TB", "WR"], ["13317", "", "Ted Hurst", "TB", "WR"], ["13318", "", "Noah Thomas", "CIN", "WR"], ["13319", "", "Oscar Delp", "NO", "TE"], ["13320", "", "Zachariah Branch", "ATL", "WR"], ["13321", "", "Dan Villari", "LAR", "TE"], ["13322", "", "Sam Roush", "CHI", "TE"], ["13324", "", "Matt Hibner", "BAL", "TE"], ["13325", "", "Jordan Hudson", "DAL", "WR"], ["13326", "", "DT Sheffield", "NYJ", "WR"], ["13328", "", "Anthony Hankerson", "MIA", "RB"], ["13329", "", "Malik Benson", "LV", "WR"], ["1333", "16227", "Russell Shepard", "", "WR"], ["13330", "", "Kenyon Sadiq", "NYJ", "TE"], ["13331", "", "Dae'Quan Wright", "PHI", "TE"], ["13333", "", "Deion Burks", "IND", "WR"], ["13335", "", "Cole Payton", "PHI", "QB"], ["13336", "", "Dane Key", "DEN", "WR"], ["13337", "", "Emmett Johnson", "KC", "RB"], ["13338", "", "Kevin Coleman", "MIA", "WR"], ["13339", "", "Davon Booth", "CLE", "RB"], ["1334", "16231", "Damion Square", "CIN", "DL"], ["13340", "", "Rueben Bain", "TB", "DL"], ["13341", "", "Akheem Mesidor", "LAC", "DL"], ["13342", "", "John Michael Gyllenborg", "KC", "TE"], ["13343", "", "Vinny Anthony", "ATL", "WR"], ["13345", "", "Jonah Coleman", "DEN", "RB"], ["13346", "", "Denzel Boston", "CLE", "WR"], ["13347", "", "Demond Claiborne", "MIN", "RB"], ["13348", "", "J'Mari Taylor", "JAX", "RB"], ["13349", "", "Eli Stowers", "PHI", "TE"], ["13350", "", "Joe Fagnano", "BAL", "QB"], ["13352", "", "Lincoln Pare", "IND", "RB"], ["13353", "", "Chris Brazzell", "CAR", "WR"], ["13355", "", "DJ Rogers", "DAL", "TE"], ["13356", "", "Trebor Pena", "JAX", "WR"], ["13357", "", "Lance Mason", "SEA", "TE"], ["13358", "", "Anthony Lucas", "DET", "DL"], ["13359", "", "Malachi Lawrence", "DAL", "DL"], ["13360", "", "Emmanuel McNeil-Warren", "CLE", "DB"], ["13361", "", "Romello Height", "SF", "LB"], ["13362", "", "Lee Hunter", "CAR", "DL"], ["13363", "", "David Bailey", "NYJ", "LB"], ["13364", "", "Cashius Howell", "CIN", "DL"], ["13365", "", "Anthony Hill", "TEN", "LB"], ["13367", "", "Colton Hood", "NYG", "DB"], ["13368", "", "Jermod McCoy", "LV", "DB"], ["13369", "", "Brandon Cisse", "GB", "DB"], ["13371", "", "Dillon Thieneman", "CHI", "DB"], ["13372", "", "R Mason Thomas", "KC", "DL"], ["13373", "", "Caden Curry", "IND", "DL"], ["13374", "", "Kayden McDonald", "HOU", "DL"], ["13375", "", "Sonny Styles", "WAS", "LB"], ["13376", "", "Caleb Downs", "DAL", "DB"], ["13377", "", "Arvell Reese", "NYG", "LB"], ["13379", "", "Josiah Trotter", "TB", "LB"], ["1338", "15948", "Matt Barkley", "", "QB"], ["13380", "", "Brenen Thompson", "LAC", "WR"], ["13382", "", "Keionte Scott", "TB", "DB"], ["13384", "", "AJ Haulcy", "IND", "DB"], ["13385", "", "Mansoor Delane", "KC", "DB"], ["13387", "", "Christen Miller", "NO", "DL"], ["13388", "", "CJ Allen", "IND", "LB"], ["13389", "", "Avieon Terrell", "ATL", "DB"], ["1339", "15835", "Zach Ertz", "", "TE"], ["13390", "", "Peter Woods", "KC", "DL"], ["13391", "", "Jake Golday", "MIN", "LB"], ["13392", "", "Jeff Caldwell", "KC", "WR"], ["13393", "", "Brent Austin", "DEN", "DB"], ["13394", "", "Josh Cameron", "JAX", "WR"], ["13395", "", "Keldric Faulk", "TEN", "DL"], ["13397", "", "Keith Abney", "DET", "DB"], ["13398", "", "Treydan Stukes", "LV", "DB"], ["13399", "", "Genesis Smith", "LAC", "DB"], ["13400", "", "Justin Joly", "DEN", "TE"], ["13401", "", "Michael Trigg", "DAL", "TE"], ["13402", "", "Skyler Bell", "BUF", "WR"], ["13403", "", "Jam Miller", "NE", "RB"], ["13404", "", "Garrett Nussmeier", "KC", "QB"], ["13405", "", "Kaytron Allen", "WAS", "RB"], ["13406", "", "Kamari Ramsey", "HOU", "DB"], ["13407", "", "Carson Towt", "IND", "TE"], ["13408", "", "Tanner Koziol", "JAX", "TE"], ["13409", "", "Donaven McCulley", "MIA", "WR"], ["13410", "", "Chase Roberts", "LV", "WR"], ["13411", "", "Zavion Thomas", "CHI", "WR"], ["13413", "", "Cyrus Allen", "KC", "WR"], ["13414", "", "Kaelon Black", "SF", "RB"], ["13415", "", "Haynes King", "CAR", "QB"], ["13416", "", "Roman Hemby", "LV", "RB"], ["13417", "", "De'Zhaun Stribling", "SF", "WR"], ["13418", "", "Robert Henry", "WAS", "RB"], ["13419", "", "Jaydn Ott", "KC", "RB"], ["13420", "", "Bryce Lance", "NO", "WR"], ["13421", "", "Eli Raridon", "NE", "TE"], ["13422", "", "Jaren Kanak", "TEN", "TE"], ["13423", "", "Eli Heidenreich", "PIT", "RB"], ["13424", "", "Seth McGowan", "IND", "RB"], ["13425", "", "Jalon Daniels", "TB", "QB"], ["13427", "", "Diego Pavia", "BAL", "QB"], ["13428", "", "Joey Aguilar", "JAX", "QB"], ["13429", "", "Seydou Traore", "MIA", "TE"], ["13430", "", "RJ Maryland", "GB", "TE"], ["13431", "", "Miles Kitselman", "DET", "TE"], ["13432", "", "Khalil Dinkins", "SF", "TE"], ["13433", "", "Riley Nowakowski", "PIT", "TE"], ["13434", "", "Will Kacmarek", "MIA", "TE"], ["13435", "", "Joe Royer", "CLE", "TE"], ["13436", "", "Kentrel Bullock", "CIN", "RB"], ["13437", "", "Noah Whittington", "HOU", "RB"], ["13438", "", "DeaMonte Trayanum", "NYJ", "RB"], ["1346", "15839", "Marquise Goodwin", "", "WR"], ["13477", "", "Colbie Young", "CIN", "WR"], ["1348", "15965", "Dustin Hopkins", "", "K"], ["13491", "", "Kaden Wetjen", "PIT", "WR"], ["13516", "", "Max Bredeson", "MIN", "TE"], ["1352", "15880", "Robert Woods", "", "WR"], ["13533", "", "Barion Brown", "NO", "WR"], ["13541", "", "Lewis Bond", "HOU", "WR"], ["13545", "", "Trey Smack", "GB", "K"], ["13554", "", "CJ Williams", "JAX", "WR"], ["13557", "", "Athan Kaliakmanis", "WAS", "QB"], ["13577", "", "Dallen Bentley", "DEN", "TE"], ["13580", "", "Carsen Ryan", "CLE", "TE"], ["13582", "", "Anthony Smith", "DAL", "WR"], ["13595", "", "Cash Jones", "ATL", "RB"], ["13597", "", "Matthew Caldwell", "LAR", "QB"], ["13599", "", "Kyron Drones", "GB", "QB"], ["13600", "", "Tyren Montgomery", "TEN", "WR"], ["13602", "", "Jack Strand", "ATL", "QB"], ["13603", "", "Gregory Desrosiers", "LAC", "RB"], ["13604", "", "Sincere Brown", "LAC", "WR"], ["13608", "", "Jerand Bradley", "LAC", "WR"], ["13617", "", "Luke Wysong", "MIN", "WR"], ["13619", "", "Marcus Sanders", "MIN", "WR"], ["13621", "", "Dillon Bell", "MIN", "WR"], ["13630", "", "Evan Svoboda", "LAC", "TE"], ["13632", "", "Devonte Ross", "LAC", "WR"], ["13645", "", "Michael Wortham", "JAX", "WR"], ["13647", "", "Ben Patterson", "JAX", "WR"], ["13658", "", "Brady Boyd", "JAX", "WR"], ["13661", "", "Ethan Conner", "JAX", "TE"], ["13662", "", "Will Pauling", "SF", "WR"], ["13663", "", "Wesley Grimes", "SF", "WR"], ["13670", "", "Harrison Wallace", "ARI", "WR"], ["13674", "", "Chris Hilton", "WAS", "WR"], ["13696", "", "Ja'Mori Maclin", "BUF", "WR"], ["13698", "", "Max Tomczak", "BUF", "WR"], ["13705", "", "Ty Pezza", "BAL", "TE"], ["13708", "", "Kobe Prentice", "CAR", "WR"], ["13712", "", "Hayden Large", "CHI", "TE"], ["13725", "", "Dominic Richardson", "DAL", "RB"], ["13726", "", "Camden Brown", "DAL", "WR"], ["1373", "15864", "Geno Smith", "NYJ", "QB"], ["13743", "", "Joseph Manjack", "DEN", "WR"], ["13744", "", "Cameron Ross", "DEN", "WR"], ["13749", "", "Kole Wilson", "CLE", "WR"], ["13750", "", "TJ Harden", "CLE", "RB"], ["13760", "", "Jaden Bradley", "WAS", "WR"], ["13770", "", "J. Michael Sturdivant", "GB", "WR"], ["13776", "", "Hank Beatty", "TEN", "WR"], ["13778", "", "EJ Smith", "KC", "RB"], ["13780", "", "Terion Stewart", "KC", "RB"], ["13783", "", "Raylen Sharpe", "IND", "WR"], ["1379", "16002", "Kyle Juszczyk", "SF", "RB"], ["138", "5536", "Ben Roethlisberger", "PIT", "QB"], ["13802", "", "Jacob Clark", "LV", "QB"], ["13804", "", "Kansei Matsuzawa", "LV", "K"], ["13805", "", "E.J. Williams", "LV", "WR"], ["13810", "", "Rohan Jones", "LAR", "TE"], ["13813", "", "Laith Marjan", "PIT", "K"], ["13816", "", "Mark Gronowski", "MIA", "QB"], ["13825", "", "Malik McClain", "NYJ", "WR"], ["13826", "", "Caullin Lacy", "NYJ", "WR"], ["13827", "", "Tanner Arkin", "NE", "TE"], ["13830", "", "Kyle Dixon", "NE", "WR"], ["13833", "", "Dominic Zvada", "NYG", "K"], ["13834", "", "Cody Hardy", "NO", "TE"], ["13839", "", "Chase Curtis", "NYJ", "TE"], ["13844", "", "Coleman Bennett", "CHI", "RB"], ["13846", "", "Jack Velling", "ATL", "TE"], ["13849", "", "Cortez Braham", "BAL", "WR"], ["13850", "", "Octavian Smith", "BAL", "WR"], ["13852", "", "Dontae McMillan", "BAL", "RB"], ["13859", "", "Jalen Walthall", "NYJ", "WR"], ["1386", "15826", "Giovani Bernard", "", "RB"], ["13861", "", "Daniel Sobkowicz", "HOU", "WR"], ["13862", "", "Treyvhon Saunders", "HOU", "WR"], ["1387", "15971", "Rex Burkhead", "", "RB"], ["13870", "", "Quentin Moore", "WAS", "TE"], ["13873", "", "Sam Scott", "NYJ", "RB"], ["13879", "", "Jameson Geers", "ARI", "TE"], ["13889", "", "Levi Wentz", "PIT", "WR"], ["13890", "", "Michael Briscoe", "MIN", "WR"], ["13904", "", "Jacob De Jesus", "KC", "WR"], ["13905", "", "Omari Evans", "KC", "WR"], ["13906", "", "Jaden Nixon", "GB", "RB"], ["13909", "", "Elijah Tau-Tolliver", "BAL", "RB"], ["13913", "", "Patrick Gurd", "LV", "TE"], ["13916", "", "Xavier Loyd", "KC", "WR"], ["13920", "", "Jonathan Brady", "LV", "WR"], ["13923", "", "Joshua Pitsenberger", "HOU", "RB"], ["13929", "", "Sahmir Hagans", "IND", "WR"], ["13931", "", "E.J. Horton", "IND", "WR"], ["13937", "", "Jackson Acker", "BUF", "RB"], ["13941", "", "Omari Kelly", "CHI", "WR"], ["13946", "", "Jamal Haynes", "CIN", "RB"], ["13949", "", "Damon Bankston", "NYG", "RB"], ["13957", "", "Kenny Fletcher", "TB", "TE"], ["13962", "", "Cameron Dorner", "NE", "WR"], ["13963", "", "Nick DeGennaro", "NE", "WR"], ["13964", "", "Myles Montgomery", "NE", "RB"], ["13967", "", "Jimmy Kibble", "NE", "WR"], ["13968", "", "Drew Stevens", "WAS", "K"], ["13973", "", "Keelan Marion", "ATL", "WR"], ["13975", "", "Le'Meke Brockington", "ATL", "WR"], ["13981", "", "Kolbe Katsis", "DEN", "WR"], ["14008", "", "Rodney Hammond", "DEN", "RB"], ["14020", "", "Dean Patterson", "TB", "WR"], ["14021", "", "Kadarius Calloway", "TB", "RB"], ["14029", "", "Johnny Pascuzzi", "LAC", "TE"], ["14031", "", "Kyron Hudson", "CHI", "WR"], ["14034", "", "Brock Rechsteiner", "NO", "WR"], ["14037", "", "Rashad Rochelle", "SEA", "WR"], ["14038", "", "Trayvon Rudolph", "MIN", "WR"], ["14039", "", "Mante Morrow", "LAC", "WR"], ["14040", "", "Terrill Davis", "MIN", "WR"], ["14041", "", "Anderson Castle", "IND", "RB"], ["14044", "", "Miles Davis", "CAR", "RB"], ["14055", "", "Louis Hansen", "HOU", "TE"], ["14058", "", "Malick Meiga", "CAR", "WR"], ["1408", "15825", "Le'Veon Bell", "TB", "RB"], ["1423", "15881", "Blidi Wreh-Wilson", "TB", "DB"], ["1425", "15887", "Ryan Griffin", "", "TE"], ["1426", "15795", "DeAndre Hopkins", "", "WR"], ["1429", "15865", "D.J. Swearinger", "IND", "DB"], ["1433", "16339", "Brandon McManus", "", "K"], ["1443", "15831", "Johnathan Cyprien", "JAX", "DB"], ["1451", "16040", "C.J. Anderson", "", "RB"], ["1466", "15847", "Travis Kelce", "KC", "TE"], ["147", "11283", "DeSean Jackson", "", "WR"], ["1472", "15794", "D.J. Hayden", "WAS", "DB"], ["1476", "15920", "Latavius Murray", "", "RB"], ["1479", "15818", "Keenan Allen", "", "WR"], ["1494", "15858", "Damontre Moore", "CAR", "DL"], ["1500", "15860", "Jordan Reed", "", "TE"], ["1502", "15966", "Chris Thompson", "", "RB"], ["1517", "15994", "Theo Riddick", "", "RB"], ["1535", "15807", "Cordarrelle Patterson", "", "RB"], ["1548", "15802", "Star Lotulelei", "BUF", "DL"], ["1550", "16140", "Ryan Griffin", "", "QB"], ["1553", "15846", "John Jenkins", "BAL", "DL"], ["1555", "16016", "Kenny Stills", "", "WR"], ["1559", "15837", "Mike Glennon", "", "QB"], ["1567", "15786", "Tavon Austin", "", "WR"], ["1587", "15853", "Vance McDonald", "", "TE"], ["1592", "15773", "Darren Fells", "TB", "TE"], ["1603", "16121", "Luke Willson", "", "TE"], ["1604", "16345", "Nick Williams", "DEN", "WR"], ["1617", "16269", "Bradley McDougald", "JAX", "DB"], ["1619", "16318", "Demetrius Harris", "", "TE"], ["1652", "16414", "Terrell Sinkfield", "", "WR"], ["1666", "16449", "LaRoy Reynolds", "NE", "LB"], ["167", "2330", "Tom Brady", "", "QB"], ["1674", "16562", "A.J. Bouye", "CAR", "DB"], ["1678", "16502", "Uzoma Nwachukwu", "", "WR"], ["1684", "16172", "Jaron Brown", "", "WR"], ["1686", "16195", "Tony Jefferson", "LAC", "DB"], ["1689", "16460", "Adam Thielen", "", "WR"], ["1693", "16366", "Zach Line", "", "RB"], ["1696", "16313", "Brandon Williams", "", "TE"], ["17", "11122", "Matt Prater", "", "K"], ["1706", "16504", "Jack Doyle", "IND", "TE"], ["1718", "15403", "Derek Carrier", "", "TE"], ["1737", "15168", "Case Keenum", "CHI", "QB"], ["1764", "16528", "Benson Mayowa", "SEA", "DL"], ["1777", "16143", "Josh Hill", "", "TE"], ["178", "5615", "Matt Schaub", "", "QB"], ["1794", "16994", "David Fluellen", "", "RB"], ["1800", "16763", "Jordan Matthews", "", "TE"], ["181", "10487", "Drew Stanton", "", "QB"], ["1817", "16725", "Sammy Watkins", "", "WR"], ["1837", "16760", "Jimmy Garoppolo", "", "QB"], ["184", "10452", "Adrian Peterson", "", "RB"], ["1841", "17174", "Stephen Houston", "", "RB"], ["1842", "17374", "Derrick Johnson", "", "WR"], ["1848", "16913", "James White", "", "RB"], ["1854", "16899", "Quincy Enunwa", "", "WR"], ["1855", "16811", "Shaquelle Evans", "", "WR"], ["1895", "16810", "AJ McCarron", "", "QB"], ["19", "11252", "Joe Flacco", "CIN", "QB"], ["1903", "17437", "Taylor Gabriel", "", "WR"], ["1916", "16886", "Martavis Bryant", "", "WR"], ["1920", "17017", "Josh Mauro", "ARI", "DL"], ["1939", "17275", "Derel Walker", "", "WR"], ["1945", "17372", "Chris Boswell", "PIT", "K"], ["1971", "16791", "Donte Moncrief", "", "WR"], ["1974", "17082", "Cody Parkey", "", "K"], ["1979", "16724", "Blake Bortles", "NO", "QB"], ["1984", "17177", "Allen Hurns", "MIA", "WR"], ["1992", "16799", "Allen Robinson", "", "WR"], ["200", "9592", "Vernon Davis", "", "TE"], ["2003", "16995", "Bennie Fowler", "", "WR"], ["2020", "17427", "Cairo Santos", "CHI", "K"], ["2025", "17051", "Albert Wilson", "", "WR"], ["2028", "16757", "Derek Carr", "", "QB"], ["2033", "16837", "Shelby Harris", "NYG", "DL"], ["2036", "16710", "Khalil Mack", "LAC", "LB"], ["2040", "17391", "Scott Simonson", "", "TE"], ["2062", "16883", "Anthony Hitchens", "KC", "LB"], ["2064", "16802", "DeMarcus Lawrence", "SEA", "DL"], ["2073", "17315", "Keith Smith", "", "RB"], ["2078", "16733", "Odell Beckham", "NYG", "WR"], ["208", "3609", "Josh McCown", "", "QB"], ["2082", "17348", "Xavier Grimble", "", "TE"], ["2091", "16890", "Bashaud Breeland", "ARI", "DB"], ["2093", "16845", "Ryan Grant", "", "WR"], ["2106", "16821", "David Fales", "", "QB"], ["2121", "16880", "T.J. Jones", "", "WR"], ["2126", "16853", "Caraun Reid", "LAC", "DL"], ["2133", "16800", "Davante Adams", "LAR", "WR"], ["2135", "16735", "Ha Ha Clinton-Dix", "DEN", "DB"], ["2142", "17221", "Rajion Neal", "", "RB"], ["2152", "16728", "Teddy Bridgewater", "DET", "QB"], ["2161", "16782", "Jerick McKinnon", "", "RB"], ["2167", "16882", "Ricardo Allen", "CIN", "DB"], ["2168", "16944", "Devonta Freeman", "", "RB"], ["2174", "17223", "Roosevelt Nix", "", "RB"], ["2191", "17382", "Marcus Lucas", "", "WR"], ["2197", "16731", "Brandin Cooks", "", "WR"], ["2200", "17149", "Timothy Flanders", "", "RB"], ["2214", "17453", "Cameron Brate", "", "TE"], ["2216", "16737", "Mike Evans", "SF", "WR"], ["2229", "16809", "Garrett Gilbert", "", "QB"], ["2237", "17285", "Ethan Westbrooks", "NO", "DL"], ["2238", "16804", "John Brown", "", "WR"], ["2251", "16813", "Logan Thomas", "", "TE"], ["2257", "16777", "Carlos Hyde", "", "RB"], ["2262", "16901", "Trey Millard", "", "RB"], ["2279", "16781", "Paul Richardson", "", "WR"], ["2291", "14269", "Dontrelle Inman", "", "WR"], ["23", "4527", "Jason Witten", "", "TE"], ["2304", "2476373", "Jerome Cunningham", "", "TE"], ["2306", "2969939", "Jameis Winston", "NYG", "QB"], ["2307", "2576980", "Marcus Mariota", "WAS", "QB"], ["2308", "2980100", "Dante Fowler", "SEA", "LB"], ["2309", "2976499", "Amari Cooper", "", "WR"], ["2311", "2971622", "Leonard Williams", "SEA", "DL"], ["2312", "3042435", "Kevin White", "", "WR"], ["2315", "2977644", "Todd Gurley", "", "RB"], ["2316", "2576283", "Trae Waynes", "CIN", "DB"], ["2319", "2576623", "DeVante Parker", "", "WR"], ["232", "8479", "Frank Gore", "", "RB"], ["2320", "2576434", "Melvin Gordon", "", "RB"], ["2322", "2971275", "Arik Armstead", "JAX", "DL"], ["2325", "2971618", "Nelson Agholor", "", "WR"], ["2327", "2576702", "Bud Dupree", "LAC", "LB"], ["2331", "2972460", "Breshad Perriman", "", "WR"], ["2334", "2579604", "Phillip Dorsett", "LV", "WR"], ["2342", "2576395", "Devin Smith", "", "WR"], ["2346", "2977609", "Devin Funchess", "", "TE"], ["2353", "2579621", "Denzel Perryman", "LAC", "LB"], ["2359", "2576336", "Ameer Abdullah", "JAX", "RB"], ["2360", "2970726", "Maxx Williams", "", "TE"], ["2369", "2577139", "Jordan Richards", "BAL", "DB"], ["2373", "2512593", "Clive Walford", "", "TE"], ["2374", "2577327", "Tyler Lockett", "", "WR"], ["2378", "2979477", "Tevin Coleman", "", "RB"], ["2381", "2578533", "Chris Conley", "", "WR"], ["2382", "2969962", "Duke Johnson", "", "RB"], ["2390", "2582410", "Tyler Kroft", "", "TE"], ["2391", "2508176", "David Johnson", "", "RB"], ["2393", "2976560", "Danielle Hunter", "HOU", "DL"], ["2394", "2517017", "Sean Mannion", "", "QB"], ["2397", "2576389", "Jeff Heuerman", "", "TE"], ["2399", "2577134", "Ty Montgomery", "", "RB"], ["24", "11237", "Matt Ryan", "", "QB"], ["2410", "2576716", "Jamison Crowder", "", "WR"], ["2412", "2518678", "Justin Hardy", "", "WR"], ["2418", "2574579", "Gabe Wright", "WAS", "DL"], ["2422", "2514206", "Blake Bell", "", "TE"], ["2430", "2577253", "Javorius Allen", "", "RB"], ["2431", "3025433", "Mike Davis", "", "RB"], ["2446", "2508256", "MyCole Pruitt", "", "TE"], ["2449", "2976212", "Stefon Diggs", "", "WR"], ["2450", "2577189", "Brett Hundley", "", "QB"], ["2452", "2573300", "Jay Ajayi", "", "RB"], ["246", "8544", "Darren Sproles", "", "RB"], ["2460", "2574576", "C.J. Uzomah", "", "TE"], ["2462", "2515759", "J.J. Nelson", "", "WR"], ["2463", "2979590", "Jesse James", "", "TE"], ["2471", "2515270", "Michael Burton", "CLE", "RB"], ["2474", "2574591", "Nick Boyle", "", "TE"], ["2476", "2508079", "James O'Shaughnessy", "", "TE"], ["2487", "2513030", "Geremy Davis", "", "WR"], ["2495", "2576804", "Nick O'Leary", "", "TE"], ["2496", "2516316", "Malcolm Johnson", "", "RB"], ["2502", "2514129", "Bud Sasser", "", "WR"], ["2505", "2576925", "Darren Waller", "", "TE"], ["2517", "2580666", "Christian Covington", "LAC", "DL"], ["2528", "2579846", "Ben Koyack", "", "TE"], ["2531", "3137087", "Edmond Robinson", "SEA", "LB"], ["2532", "2513351", "Da'Ron Brown", "", "WR"], ["2545", "3046704", "Geoff Swaim", "", "TE"], ["2549", "2511109", "Trevor Siemian", "ATL", "QB"], ["2553", "2577661", "Rory Anderson", "", "TE"], ["2557", "2527708", "Jerry Lovelocke", "", "QB"], ["2560", "2521161", "Zach Zenner", "", "RB"], ["2567", "2516976", "Bryan Bennett", "", "QB"], ["2570", "3165703", "Donatella Luckett", "", "WR"], ["2573", "2579839", "DaVaris Daniels", "", "WR"], ["2576", "2512115", "Cody Fajardo", "", "QB"], ["2577", "2575955", "Devante Davis", "", "WR"], ["2578", "2514269", "John Harris", "", "WR"], ["2580", "2574420", "Titus Davis", "", "WR"], ["2581", "2577845", "Jahwan Edwards", "", "RB"], ["2583", "2587819", "Tyrell Williams", "", "WR"], ["2587", "2514542", "Dres Anderson", "", "WR"], ["2588", "2570986", "Malcolm Brown", "", "RB"], ["2592", "2576492", "Grady Jarrett", "CHI", "DL"], ["2595", "2574931", "Tim Semisch", "", "TE"], ["2597", "2516006", "Michael Dyer", "", "RB"], ["260", "11394", "Josh Johnson", "CIN", "QB"], ["2600", "2517786", "Ricky Seale", "", "RB"], ["2602", "2577808", "Darius Jennings", "", "WR"], ["2617", "2612151", "Alex Singleton", "DEN", "LB"], ["2620", "2512235", "Jake Heaps", "", "QB"], ["2632", "2613133", "Desmond Martin", "", "RB"], ["2635", "3078581", "Vernon Johnson", "", "WR"], ["2636", "2512506", "Jarred Haggins", "", "WR"], ["2639", "2511102", "Tony Jones", "", "WR"], ["2643", "2578692", "Deshazor Everett", "WAS", "DB"], ["2650", "2582324", "Ty Long", "", "K"], ["2651", "2088468", "Phillip Sims", "", "QB"], ["2658", "2517946", "Ryan Mueller", "", "RB"], ["2671", "2998120", "Josh Lambo", "", "K"], ["2672", "2507242", "Damarr Aultman", "", "WR"], ["2673", "2577667", "Damiere Byrd", "", "WR"], ["2674", "3059606", "Paul Browning", "", "WR"], ["268", "8416", "Alex Smith", "", "QB"], ["2684", "15753", "Corbin Louks", "", "WR"], ["2703", "2514461", "Ezell Ruffin", "", "WR"], ["2711", "2565969", "Taylor Heinicke", "", "QB"], ["2713", "2517237", "Josh Harper", "", "WR"], ["2730", "2574812", "Kenneth Harper", "", "RB"], ["2733", "2967895", "Kasey Closs", "", "WR"], ["2747", "2473037", "Jason Myers", "SEA", "K"], ["2749", "2576414", "Raheem Mostert", "", "RB"], ["2750", "2580216", "DeAndre Carter", "", "WR"], ["2752", "2469123", "Trent Steelman", "", "WR"], ["2753", "3892271", "Rasheed Bailey", "", "WR"], ["2754", "2574603", "Michael Johnson", "", "WR"], ["2755", "2511973", "Eric Tomlinson", "", "TE"], ["2756", "2515408", "Andrew Gleichert", "", "TE"], ["2767", "3922022", "Jawon Chisholm", "", "RB"], ["2768", "2514166", "Braylon Heard", "", "RB"], ["2770", "2507292", "Harold Spears", "", "TE"], ["2771", "2514119", "Jimmie Hunt", "", "WR"], ["2783", "2576430", "Kenzel Doe", "", "WR"], ["2785", "2568174", "Gus Johnson", "", "RB"], ["2787", "2575916", "David Porter", "", "WR"], ["2790", "2577080", "Nigel King", "", "WR"], ["2800", "2515652", "Mario Hull", "", "WR"], ["2802", "2515713", "Corey Acosta", "", "K"], ["2817", "2983134", "Daniel Rodriguez", "", "WR"], ["2818", "17475", "Michael Palardy", "", "K"], ["2819", "2522211", "Mike Meyer", "", "K"], ["2820", "2511055", "Dominique Brown", "", "RB"], ["2822", "2576491", "Adam Humphries", "", "WR"], ["2836", "2987210", "Kenny Cook", "", "WR"], ["2838", "3892580", "Trevor Harman", "", "WR"], ["284", "9761", "Delanie Walker", "", "TE"], ["2846", "3893001", "Marquez Clark", "", "WR"], ["2870", "2582456", "Ray Hamilton", "", "TE"], ["2875", "2577743", "Tony Creecy", "", "RB"], ["2879", "2984816", "Isiah Ferguson", "", "WR"], ["2880", "2576901", "Zach Laskey", "", "RB"], ["2883", "2512702", "Chase Williams", "CLE", "LB"], ["2886", "2511683", "Justin Sinz", "", "TE"], ["289", "2580", "Drew Brees", "", "QB"], ["2892", "2512197", "Rodney Smith", "", "RB"], ["2898", "3044687", "Cameron Clear", "", "TE"], ["2911", "2574044", "Justin Manton", "", "K"], ["2916", "2506632", "Ify Umodu", "", "WR"], ["2931", "2576608", "Deshon Foxx", "", "WR"], ["2940", "3039722", "Des Lawrence", "", "WR"], ["2944", "2576179", "Matt LaCosse", "NE", "TE"], ["2948", "2576403", "Brandon Cottom", "", "RB"], ["2962", "2574271", "Zach D'Orazio", "", "WR"], ["2993", "2575453", "Rakeem Nunez-Roches", "TB", "DL"], ["3008", "2576240", "Matt Wile", "", "K"], ["3036", "2470916", "Matt Lengel", "", "TE"], ["3041", "3936647", "Ross Travis", "", "TE"], ["3045", "3048976", "Gannon Sinclair", "", "TE"], ["3048", "2531358", "Chris Manhertz", "NYG", "TE"], ["3078", "3153437", "Jamel Johnson", "", "WR"], ["312", "11387", "Matthew Slater", "", "WR"], ["3148", "3966261", "Anthony Dable", "", "WR"], ["3150", "2575416", "Xavier Rush", "", "WR"], ["3155", "3051889", "Laquon Treadwell", "IND", "WR"], ["3157", "3052876", "William Fuller", "", "WR"], ["3160", "3045373", "Jalen Ramsey", "PIT", "DB"], ["3161", "2573079", "Carson Wentz", "MIN", "QB"], ["3163", "3046779", "Jared Goff", "DET", "QB"], ["3164", "3051392", "Ezekiel Elliott", "", "RB"], ["3172", "2971282", "DeForest Buckner", "IND", "DL"], ["3177", "2978929", "Corey Coleman", "", "WR"], ["3178", "2576019", "Josh Doctson", "", "WR"], ["3186", "3122752", "Kenny Clark", "DAL", "DL"], ["3188", "2970204", "Sheldon Rankins", "HOU", "DL"], ["3189", "3040506", "Eli Apple", "SF", "DB"], ["3198", "3043078", "Derrick Henry", "BAL", "RB"], ["3199", "2976316", "Michael Thomas", "", "WR"], ["3200", "2976592", "Sterling Shepard", "", "WR"], ["3202", "3043275", "Austin Hooper", "ATL", "TE"], ["3204", "2980148", "C.J. Prosise", "", "RB"], ["3205", "2577243", "Cody Kessler", "", "QB"], ["3207", "3051775", "Andrew Billings", "ARI", "DL"], ["3208", "2971888", "Kenneth Dixon", "", "RB"], ["3209", "3122866", "Devontae Booker", "", "RB"], ["3211", "2971589", "Paul Perkins", "", "RB"], ["3214", "3046439", "Hunter Henry", "NE", "TE"], ["3218", "3054857", "A'Shawn Robinson", "TB", "DL"], ["3220", "3115312", "Jarran Reed", "SEA", "DL"], ["3225", "3045144", "Tyler Boyd", "", "WR"], ["3227", "3045128", "T.J. Green", "HOU", "DB"], ["3228", "2976210", "Sean Davis", "NE", "DB"], ["3233", "2574056", "Kevin Byard", "NE", "DB"], ["3236", "3040471", "Maliek Collins", "CLE", "DL"], ["3239", "2980444", "Bronson Kaufusi", "GB", "TE"], ["3240", "2573317", "Darian Thompson", "DAL", "DB"], ["3241", "2980097", "Jonathan Bullard", "DAL", "DL"], ["3242", "2979843", "Kenyan Drake", "", "RB"], ["3256", "2983055", "Javon Hargrave", "GB", "DL"], ["3257", "2578570", "Jacoby Brissett", "ARI", "QB"], ["3258", "2576399", "Nick Vannett", "", "TE"], ["3268", "2970716", "Eric Murray", "JAX", "DB"], ["3269", "2576581", "Chris Moore", "", "WR"], ["3271", "2573401", "Tyler Higbee", "LAR", "TE"], ["3272", "2575164", "Miles Killebrew", "TB", "DB"], ["3278", "3048897", "Pharoh Cooper", "", "WR"], ["3281", "4002046", "David Onyemata", "NYJ", "DL"], ["3286", "3043116", "Demarcus Robinson", "SF", "WR"], ["3294", "2577417", "Dak Prescott", "DAL", "QB"], ["3295", "2974348", "Dean Lowry", "PIT", "DL"], ["3299", "2567711", "Ronald Blair", "NYJ", "DL"], ["3306", "3060022", "Jordan Howard", "", "RB"], ["3309", "3042429", "Wendell Smallwood", "WAS", "RB"], ["331", "5529", "Philip Rivers", "", "QB"], ["3312", "2980077", "Jonathan Williams", "", "RB"], ["3318", "2577128", "Kevin Hogan", "", "QB"], ["3319", "2573343", "Trevor Davis", "", "WR"], ["3321", "3116406", "Tyreek Hill", "", "WR"], ["3322", "2977670", "DJ Reader", "NYG", "DL"], ["3328", "3042910", "Rashard Higgins", "", "WR"], ["333", "8664", "Ryan Fitzpatrick", "", "QB"], ["3332", "2974317", "Andy Janovich", "", "RB"], ["3333", "2580330", "Temarrick Hemingway", "WAS", "TE"], ["3336", "4002672", "Moritz Bohringer", "", "TE"], ["3340", "2978727", "Jerell Adams", "", "TE"], ["3342", "2577641", "Jakeem Grant", "", "WR"], ["3343", "2979501", "Nate Sudfeld", "", "QB"], ["3347", "2582424", "Jake Rudock", "", "QB"], ["3353", "2974365", "Dan Vitale", "", "RB"], ["3354", "2576450", "Derek Watt", "", "RB"], ["3355", "2980378", "Cody Core", "", "WR"], ["3357", "2574511", "Brandon Allen", "NYG", "QB"], ["3362", "2574630", "Jeff Driskel", "", "QB"], ["3367", "2972505", "Kavon Frazier", "LV", "DB"], ["3371", "2980197", "Darius Jackson", "", "RB"], ["3380", "2577190", "Devin Lucien", "", "WR"], ["3391", "3002265", "Dwayne Washington", "", "RB"], ["3393", "2971574", "Devin Fuller", "", "WR"], ["3397", "2971062", "Keith Marshall", "", "RB"], ["3398", "2978201", "Kenny Lawler", "", "WR"], ["3402", "2977667", "Zac Brooks", "", "RB"], ["3407", "3039705", "Beau Sandland", "", "TE"], ["3410", "2576773", "Jake Coker", "", "QB"], ["3415", "2971027", "Jonathan Jones", "PHI", "DB"], ["3418", "2980068", "Mekale McKay", "", "WR"], ["3423", "2574808", "Robbie Chosen", "", "WR"], ["3433", "2977800", "Alex Erickson", "", "WR"], ["344", "12649", "Julian Edelman", "", "WR"], ["3440", "2575214", "Josh Woodrum", "", "QB"], ["3443", "2970472", "Chris Swain", "", "RB"], ["3445", "2971718", "Marcus Johnson", "", "WR"], ["3447", "2971719", "Cayleb Jones", "", "WR"], ["345", "12477", "Brian Hoyer", "", "QB"], ["3451", "2971573", "Ka'imi Fairbairn", "HOU", "K"], ["3453", "2576165", "Josh Ferguson", "", "RB"], ["3454", "2977751", "Danny Anthrop", "", "WR"], ["3456", "2576446", "Joel Stave", "", "QB"], ["3460", "2969886", "Ross Martin", "", "K"], ["3462", "3124788", "Jared Dangerfield", "", "WR"], ["3464", "3044716", "Marquez North", "", "WR"], ["3465", "2969241", "Ben Braunecker", "", "TE"], ["3474", "2970694", "Briean Boddy-Calhoun", "TEN", "DB"], ["3475", "2575381", "Keyarris Garrett", "", "WR"], ["3476", "3056906", "Johnny Holton", "", "WR"], ["3486", "2980137", "Chris Brown", "", "WR"], ["3495", "2576822", "Mike Bercovici", "", "QB"], ["3496", "2576854", "Stephen Anderson", "", "TE"], ["3497", "2572850", "Darion Griswold", "", "TE"], ["3500", "2577123", "Devon Cajuste", "", "WR"], ["3503", "3115913", "Geronimo Allison", "", "WR"], ["3504", "2577793", "Steven Scheu", "", "TE"], ["3505", "2578446", "Dom Williams", "", "WR"], ["3514", "2512657", "Jake McGee", "", "TE"], ["3515", "2970712", "K.J. Maye", "", "WR"], ["3516", "2474890", "Mitch Mathews", "", "WR"], ["3520", "2577051", "Jay Lee", "", "WR"], ["3524", "2577118", "Marquise Williams", "", "QB"], ["3526", "2574891", "Roy Robertson-Harris", "NYG", "DL"], ["3527", "2977742", "Kevin Peterson", "ARI", "DB"], ["3531", "2975527", "Marshaun Coprich", "", "RB"], ["3540", "3045565", "Jamaal Jones", "", "WR"], ["3542", "2979200", "DeAndre Reaves", "", "WR"], ["3548", "2574024", "Jamal Robinson", "", "WR"], ["3551", "2577244", "Max Wittek", "", "QB"], ["3555", "2979681", "Canaan Severin", "", "WR"], ["3558", "3044859", "Chris Jones", "KC", "DL"], ["3561", "2981998", "Bryce Williams", "", "TE"], ["3568", "2591718", "Marken Michel", "", "WR"], ["3570", "2577089", "Brandon Ross", "", "RB"], ["3572", "2573098", "Andrew Bonnet", "", "RB"], ["3574", "2968266", "John Lunsford", "", "K"], ["3582", "2983209", "Chester Rogers", "", "WR"], ["3584", "2577081", "Marcus Leak", "", "WR"], ["3588", "4010885", "Michael Miller", "", "TE"], ["3589", "2576895", "Chris Milton", "MIA", "DB"], ["3594", "3051902", "Peyton Barber", "", "RB"], ["3596", "2514375", "Kivon Cartwright", "", "TE"], ["3598", "2566045", "Luke Rhodes", "IND", "LB"], ["3606", "2577257", "Amir Carlisle", "", "WR"], ["3614", "2574918", "Tommylee Lewis", "", "WR"], ["3615", "2977614", "Sione Houma", "", "RB"], ["3621", "2972065", "Jordan Williams-Lambert", "", "WR"], ["3630", "2976594", "Durron Neal", "", "WR"], ["3634", "2973405", "Kalif Raymond", "CHI", "WR"], ["3637", "2576040", "Eddie Yarbrough", "MIN", "DL"], ["3640", "2510605", "Soma Vainuku", "", "RB"], ["3643", "2567725", "Doug Middleton", "SF", "DB"], ["3646", "2977646", "Quayvon Hicks", "", "RB"], ["3648", "2574404", "Matt Weiser", "", "TE"], ["3652", "3123986", "Mike Thomas", "", "WR"], ["3660", "2578583", "Valdez Showers", "", "WR"], ["3668", "2578377", "Joshua Perkins", "NYJ", "TE"], ["3669", "2980115", "Brian Poole", "IND", "DB"], ["367", "12537", "Jared Cook", "", "TE"], ["3670", "2570204", "Will Ratelle", "", "RB"], ["3678", "2985659", "Wil Lutz", "DEN", "K"], ["3688", "2972283", "Tra Carson", "", "RB"], ["3695", "2970262", "J.P. Holtz", "", "TE"], ["3730", "2586703", "Tevin Jones", "", "WR"], ["3732", "2577014", "Richard Mullaney", "", "WR"], ["3762", "2976250", "Brandon Shippen", "", "WR"], ["3763", "2577392", "Woodrow Hamilton", "NYG", "DL"], ["3770", "2577153", "Quenton Bundrage", "", "WR"], ["3780", "3016887", "Cedric O'Neal", "", "RB"], ["3803", "2575965", "Elijhaa Penny", "", "RB"], ["3805", "3135726", "Jon Brown", "", "K"], ["3808", "3916678", "Rolan Milligan", "IND", "DB"], ["3811", "3137094", "Alstevis Squirewell", "", "RB"], ["3816", "4012719", "Brandon Brown-Dukes", "", "RB"], ["3824", "2577731", "Alex Ellis", "", "TE"], ["3827", "3068939", "Aldrick Rosas", "", "K"], ["3832", "4012556", "C.J. Ham", "", "RB"], ["3838", "3056354", "Antonio Hamilton", "WAS", "DB"], ["3846", "3115315", "Duke Williams", "", "WR"], ["3849", "2977884", "Wynton McManis", "MIA", "LB"], ["3852", "2978308", "Jaydon Mickens", "", "WR"], ["3859", "2580343", "Jalen Simmons", "", "RB"], ["3868", "2972091", "Jalen Richard", "LV", "RB"], ["3880", "2577567", "M.J. McFarland", "", "TE"], ["3882", "2575788", "Zach Wood", "NO", "DL"], ["3883", "2577106", "Romar Morris", "", "RB"], ["3890", "2971374", "Devon Bell", "", "K"], ["3891", "2572846", "Kyle Coleman", "", "RB"], ["3893", "2989641", "Reece Horn", "", "WR"], ["3894", "2987440", "Garrett Griffin", "", "TE"], ["3895", "2578369", "Marvin Hall", "", "WR"], ["3908", "2326150", "Eric Wallace", "", "TE"], ["3909", "2582139", "Sam Ficken", "", "K"], ["391", "12731", "Ryan Succop", "", "K"], ["3916", "2577807", "David Watford", "", "WR"], ["3921", "2309428", "Nick Truesdell", "", "TE"], ["3934", "2983319", "Troymaine Pope", "", "RB"], ["3957", "2515957", "Blake Sims", "", "QB"], ["3969", "3115364", "Leonard Fournette", "", "RB"], ["3973", "3122132", "Myles Garrett", "LAR", "DL"], ["3976", "3039707", "Mitchell Trubisky", "TEN", "QB"], ["3978", "2567767", "Jacob Huesman", "", "QB"], ["4017", "3122840", "Deshaun Watson", "CLE", "QB"], ["4018", "3116385", "Joe Mixon", "", "RB"], ["4026", "3129302", "DeShone Kizer", "", "QB"], ["4029", "3116593", "Dalvin Cook", "", "RB"], ["4031", "2971668", "Travis Wilson", "", "TE"], ["4032", "3054840", "Jonathan Allen", "CIN", "DL"], ["4033", "3123076", "David Njoku", "LAC", "TE"], ["4034", "3117251", "Christian McCaffrey", "SF", "RB"], ["4035", "3054850", "Alvin Kamara", "NO", "RB"], ["4036", "3042778", "Corey Davis", "", "WR"], ["4037", "3116165", "Chris Godwin", "TB", "WR"], ["4038", "3052177", "John Ross", "", "WR"], ["4039", "2977187", "Cooper Kupp", "SEA", "WR"], ["4040", "3120348", "JuJu Smith-Schuster", "NYG", "WR"], ["4042", "3912576", "Joe Williams", "", "RB"], ["4046", "3139477", "Patrick Mahomes", "KC", "QB"], ["4050", "4217370", "Cyril Grayson", "", "WR"], ["4051", "2977665", "Chad Kelly", "", "QB"], ["4054", "2998565", "Mo Alie-Cox", "IND", "TE"], ["4055", "3043080", "O.J. Howard", "", "TE"], ["4058", "3117258", "Solomon Thomas", "TEN", "DL"], ["4061", "3052600", "Davis Webb", "", "QB"], ["4066", "3051876", "Evan Engram", "DEN", "TE"], ["4068", "3045138", "Mike Williams", "", "WR"], ["4070", "3045282", "T.J. Watt", "PIT", "LB"], ["4071", "3126356", "Marlon Humphrey", "BAL", "DB"], ["4074", "3121415", "Malik Hooker", "DAL", "DB"], ["4080", "3059722", "Zay Jones", "", "WR"], ["4081", "3127287", "Budda Baker", "ARI", "DB"], ["4082", "3121427", "Curtis Samuel", "", "WR"], ["4089", "3918639", "Gerald Everett", "", "TE"], ["4092", "2979860", "Dalvin Tomlinson", "LAC", "DL"], ["4098", "3059915", "Kareem Hunt", "", "RB"], ["4107", "3052101", "Chidobe Awuzie", "BAL", "DB"], ["4108", "3040561", "Carlos Henderson", "", "WR"], ["4111", "3125116", "D'Onta Foreman", "", "RB"], ["4118", "3043107", "Alex Anzalone", "TB", "LB"], ["4121", "3047570", "Eddie Vanderdoes", "SF", "DL"], ["4124", "3122630", "Ahkello Witherspoon", "WAS", "DB"], ["4125", "3059760", "Taywan Taylor", "", "WR"], ["4127", "2979520", "C.J. Beathard", "", "QB"], ["4128", "3066052", "Chad Williams", "", "WR"], ["4129", "3045207", "Jourdan Lewis", "JAX", "DB"], ["4131", "2974858", "Kenny Golladay", "", "WR"], ["4135", "3052743", "Trey Hendrickson", "BAL", "DL"], ["4136", "3943270", "Rasul Douglas", "WAS", "DB"], ["4137", "3045147", "James Conner", "ARI", "RB"], ["4139", "2977629", "Amara Darboh", "", "WR"], ["4144", "3054212", "Jonnu Smith", "", "TE"], ["4146", "3892889", "Dede Westbrook", "", "WR"], ["4147", "3116389", "Samaje Perine", "CIN", "RB"], ["4149", "2980453", "Jamaal Williams", "", "RB"], ["4150", "3045127", "Wayne Gallman", "", "RB"], ["4151", "3045225", "Jake Butt", "", "TE"], ["4152", "3139605", "Marlon Mack", "", "RB"], ["4157", "3066158", "Tarik Cohen", "", "RB"], ["4160", "3115330", "Josh Malone", "", "WR"], ["4162", "3039725", "Ryan Switzer", "", "WR"], ["4168", "4058825", "Grover Stewart", "IND", "DL"], ["4170", "3045527", "Samson Ebukam", "ATL", "DL"], ["4171", "3115306", "Josh Reynolds", "", "WR"], ["4174", "2980080", "Deatrich Wise", "WAS", "DL"], ["4175", "3066074", "Chad Hansen", "", "WR"], ["4177", "2991662", "Mack Hollins", "NE", "WR"], ["4179", "3044720", "Joshua Dobbs", "", "QB"], ["4181", "3052125", "Tedric Thompson", "CLE", "DB"], ["4183", "2972236", "Nathan Peterman", "", "QB"], ["4184", "3045466", "Bucky Hodges", "", "TE"], ["4186", "3039723", "T.J. Logan", "", "RB"], ["4187", "3125403", "Brian Hill", "", "RB"], ["4189", "2975863", "Eric Saubert", "SEA", "TE"], ["4195", "3050478", "Jake Elliott", "PHI", "K"], ["4197", "3128724", "Isaiah McKenzie", "", "WR"], ["4198", "3061612", "Jamal Agnew", "", "WR"], ["4199", "3042519", "Aaron Jones", "MIN", "RB"], ["4200", "3052470", "DeAngelo Yancey", "", "WR"], ["4207", "3115383", "Davon Godchaux", "NO", "DL"], ["4208", "3059918", "Rodney Adams", "", "WR"], ["421", "12483", "Matthew Stafford", "LAR", "QB"], ["4214", "3042417", "Shelton Gibson", "", "WR"], ["4217", "3040151", "George Kittle", "SF", "TE"], ["4218", "3040569", "Trent Taylor", "", "WR"], ["4219", "3127586", "Jeremy McNichols", "WAS", "RB"], ["4224", "3045463", "Chuck Clark", "DET", "DB"], ["4226", "4212884", "Alex Armah", "", "RB"], ["4227", "3055899", "Harrison Butker", "KC", "K"], ["4229", "2972331", "Mason Schreck", "", "TE"], ["4233", "3043234", "Zane Gonzalez", "MIA", "K"], ["4234", "3121409", "Noah Brown", "", "WR"], ["4250", "3045472", "Sam Rogers", "", "RB"], ["4259", "3051942", "Al-Quadin Muhammad", "TB", "DL"], ["4263", "3042494", "Elijah McGuire", "KC", "RB"], ["4273", "3919596", "Chris Carson", "", "RB"], ["4274", "4212909", "David Moore", "CAR", "WR"], ["4278", "3894915", "D.J. Jones", "DEN", "DL"], ["4283", "3052143", "Khalfani Muhammad", "", "RB"], ["4285", "3042373", "Robert Davis", "", "WR"], ["4289", "3128362", "Ishmael Zamora", "", "WR"], ["4305", "3049733", "Tyler Renew", "", "RB"], ["4309", "3045163", "Scott Orndoff", "", "TE"], ["4314", "3052096", "Johnny Mundt", "PHI", "TE"], ["4319", "2978109", "Zach Pascal", "", "WR"], ["4320", "3040052", "James Quick", "", "WR"], ["4323", "3052166", "Darrell Daniels", "", "TE"], ["4324", "2971233", "Trey Griffey", "", "WR"], ["4328", "3052561", "Jerome Lane", "", "WR"], ["4330", "2971830", "JoJo Natson", "", "WR"], ["4335", "3051308", "P.J. Walker", "", "QB"], ["4344", "2973626", "C.J. Board", "", "WR"], ["4350", "2978244", "Ricky Ortiz", "", "RB"], ["4351", "3134353", "Tim Patrick", "NYJ", "WR"], ["4353", "2975417", "Patrick Ricard", "NYG", "RB"], ["4358", "3050138", "Austin Duke", "", "WR"], ["4364", "3060377", "Karel Hamilton", "", "WR"], ["4365", "3042520", "Darrin Laufasa", "", "RB"], ["4367", "2979548", "Monty Madaris", "", "WR"], ["4371", "2979632", "Josh Tupou", "NYG", "DL"], ["4373", "3126338", "Stanley Williams", "", "RB"], ["4381", "2468609", "Taysom Hill", "", "TE"], ["4384", "2974029", "Aaron Peck", "", "TE"], ["4385", "3059488", "Kalif Phillips", "", "RB"], ["4392", "2969967", "Malcolm Lewis", "", "WR"], ["4396", "3046438", "Drew Morgan", "", "WR"], ["4401", "3052182", "Damore'ea Stringfellow", "", "WR"], ["4406", "2977737", "Wes Lunt", "", "QB"], ["4408", "3040496", "Terrell Newby", "", "RB"], ["4409", "2979554", "Josiah Price", "", "TE"], ["4413", "3056916", "Eric Wilson", "MIN", "LB"], ["4415", "2972342", "Adam Butler", "LV", "DL"], ["4420", "3115443", "Cody Hollister", "", "WR"], ["4421", "3125404", "Jacob Hollister", "", "TE"], ["4434", "3039738", "Brisly Estime", "", "WR"], ["4435", "3049698", "Anthony Firkser", "WAS", "TE"], ["4437", "4081808", "Connor Harris", "", "RB"], ["444", "12426", "Malcolm Jenkins", "NO", "DB"], ["4443", "2971281", "Pharaoh Brown", "", "TE"], ["4445", "2980061", "Keon Hatcher", "", "WR"], ["4453", "3056476", "Victor Bolden", "", "WR"], ["4454", "3045523", "Kendrick Bourne", "ARI", "WR"], ["4455", "3049916", "Matt Breida", "", "RB"], ["4456", "3128348", "K.D. Cannon", "", "WR"], ["4463", "3040036", "Tyler McCloskey", "", "RB"], ["4464", "3059989", "Nick Mullens", "JAX", "QB"], ["4468", "4081127", "Antony Auclair", "", "TE"], ["4479", "3042890", "Thomas Sperbeck", "", "WR"], ["4480", "3045380", "Bobo Wilson", "", "WR"], ["4485", "3054030", "William Stanback", "", "RB"], ["4489", "2980460", "Gehrig Dieter", "", "WR"], ["4490", "3053039", "Wyatt Houston", "CAR", "TE"], ["4491", "3046399", "Marcus Kemp", "", "WR"], ["4497", "3051897", "Tony Stevens", "", "WR"], ["4504", "2982839", "John Robinson-Woodgett", "", "RB"], ["4508", "2978344", "Gabe Marks", "", "WR"], ["4515", "2567879", "B.J. Johnson", "", "WR"], ["4519", "3128267", "Devine Redding", "", "RB"], ["4520", "2976557", "Travin Dural", "", "WR"], ["4526", "4198679", "Krishawn Hogan", "", "WR"], ["4528", "2976593", "Trevor Knight", "", "QB"], ["4533", "2970017", "James Summers", "", "RB"], ["4535", "3910617", "Steven Wroblewski", "", "TE"], ["4536", "2972240", "Jason Croom", "", "TE"], ["4537", "2972311", "Jordan Johnson", "", "RB"], ["4544", "3042428", "Daikiel Shorts", "", "WR"], ["4545", "3040071", "Keith Towbridge", "", "TE"], ["4548", "3047969", "Joel Bouagnon", "", "RB"], ["455", "12563", "Michael Crabtree", "", "WR"], ["4551", "3043841", "Tanner Gentry", "", "WR"], ["4555", "2971658", "Andy Phillips", "", "K"], ["4557", "3045375", "Freddie Stevenson", "", "RB"], ["4563", "2976620", "Taylor McNamara", "", "TE"], ["4569", "3049891", "Brian Brown", "", "WR"], ["4571", "2991767", "Blake Jarwin", "", "TE"], ["4574", "2972515", "Cooper Rush", "", "QB"], ["4585", "2969894", "Anthony Nash", "", "WR"], ["4588", "2972092", "Kyle Sloter", "", "QB"], ["4593", "3059165", "Brandon Barnes", "", "TE"], ["4595", "2970410", "Dontez Ford", "", "WR"], ["4599", "2978279", "Michael Rector", "", "WR"], ["4600", "3045194", "Noel Thomas", "", "WR"], ["4602", "2975674", "Robert Tonyan", "PIT", "TE"], ["4605", "2971280", "Evan Baylis", "", "TE"], ["4607", "2979985", "Zach Conque", "", "QB"], ["4610", "2971543", "Deante' Gray", "", "WR"], ["4613", "2565330", "Shaq Hill", "", "WR"], ["4621", "2971695", "Caleb Bluiett", "", "TE"], ["4622", "3071572", "Keelan Cole", "", "WR"], ["4623", "3930272", "Tim Cook", "", "RB"], ["4626", "2976215", "Amba Etta-Tawo", "", "WR"], ["4630", "2980384", "I'Tavius Mathers", "", "RB"], ["4636", "2974712", "Lenard Tillery", "", "RB"], ["4641", "3048701", "Keeon Johnson", "", "WR"], ["4647", "2980120", "Colin Thompson", "", "TE"], ["4650", "3957543", "Billy Brown", "", "TE"], ["4651", "3045260", "Corey Clement", "", "RB"], ["4663", "3068267", "Austin Ekeler", "", "RB"], ["4665", "2983314", "Eli Jenkins", "", "QB"], ["4666", "3049899", "Younghoe Koo", "", "K"], ["4669", "3047504", "Andre Patton", "", "WR"], ["4670", "3122839", "Artavis Scott", "", "WR"], ["4673", "2513199", "Algernon Brown", "", "RB"], ["4676", "2971617", "Darreus Rogers", "", "WR"], ["4678", "3046705", "Tyrone Swoopes", "", "TE"], ["4680", "2581999", "Larry Clark", "", "WR"], ["4683", "3042451", "Aaron Bailey", "BAL", "QB"], ["4696", "2970090", "Trey Edmunds", "", "RB"], ["4697", "3049325", "Khalid Abdullah", "", "RB"], ["4699", "3949031", "Kevin Snead", "", "WR"], ["4704", "3040520", "Tyler Ferguson", "", "QB"], ["4708", "2972052", "KeVonn Mabon", "", "WR"], ["4710", "3116662", "Gio Pascascio", "", "WR"], ["4718", "2983509", "Dare Ogunbowale", "", "RB"], ["4721", "3050670", "Shakeir Ryan", "", "WR"], ["4725", "2973301", "Phazahn Odom", "", "TE"], ["4727", "2979495", "Mitchell Paige", "", "WR"], ["4728", "2977804", "Bart Houston", "", "QB"], ["4730", "2974307", "Sam Cotton", "", "TE"], ["4731", "2972498", "Joe Bacci", "", "RB"], ["4738", "3053805", "Colby Pearson", "", "WR"], ["4741", "4212989", "Dan Arnold", "", "TE"], ["4744", "", "Barrett Burns", "BAL", "TE"], ["4747", "2970133", "Stevie Donatell", "", "TE"], ["4749", "2977776", "Cameron Posey", "", "WR"], ["4750", "3049249", "Lance Lenoir", "", "WR"], ["4752", "2971397", "Fred Brown", "", "WR"], ["4774", "3050667", "De'Mard Llorens", "", "RB"], ["4779", "3051708", "Bra'Lon Cherry", "", "WR"], ["4786", "2977745", "Jhajuan Seales", "", "WR"], ["4787", "2974334", "Jordan Westerkamp", "", "WR"], ["4790", "3045283", "Robert Wheelwright", "", "WR"], ["4791", "3049987", "Darius Victor", "", "RB"], ["4797", "2972140", "Josh Rounds", "", "RB"], ["4798", "3939055", "C.J. Germany", "", "WR"], ["4803", "2971581", "Nate Iese", "", "TE"], ["4805", "3122122", "Pig Howard", "", "WR"], ["4806", "2970183", "Brandon Radcliff", "", "RB"], ["4807", "2987239", "Mike Estes", "", "TE"], ["4813", "2969915", "Marvin Bracy", "", "WR"], ["4814", "3912558", "De'Quan Hampton", "", "WR"], ["4815", "3061572", "Brian Riley", "", "WR"], ["4821", "3060040", "Jamari Staples", "", "WR"], ["4823", "3052797", "Keevan Lucas", "", "WR"], ["4827", "2977663", "Germone Hopper", "", "WR"], ["4828", "3049329", "Rashard Davis", "", "WR"], ["4829", "3060347", "Daniel Williams", "", "WR"], ["4831", "3050824", "Justice Liggins", "", "WR"], ["4832", "2976147", "Andrew Price", "", "TE"], ["4835", "3051759", "Darrius Sims", "", "RB"], ["4839", "2970710", "Mitch Leidner", "", "QB"], ["4848", "2978524", "Christian Kuntz", "PIT", "LB"], ["4854", "3052056", "River Cracraft", "", "WR"], ["4861", "2980119", "Kent Taylor", "", "TE"], ["4863", "3886377", "Josh Rosen", "", "QB"], ["4866", "3929630", "Saquon Barkley", "PHI", "RB"], ["4874", "3123306", "Chris Bazile", "", "TE"], ["4878", "4294520", "Brandon Zylstra", "", "WR"], ["4881", "3916387", "Lamar Jackson", "BAL", "QB"], ["4892", "3052587", "Baker Mayfield", "TB", "QB"], ["4895", "2970192", "Lamar Atkins", "", "WR"], ["49", "9354", "Robbie Gould", "", "K"], ["490", "12471", "Chase Daniel", "", "QB"], ["491", "11674", "Danny Amendola", "", "WR"], ["4913", "2516897", "Aiulua Fanene", "GB", "DL"], ["4922", "", "Garrett Scantling", "ATL", "WR"], ["4923", "2970270", "Rushel Shell", "", "RB"], ["4924", "", "Zach Terrell", "BAL", "QB"], ["4926", "", "Nick Schuessler", "PIT", "QB"], ["4930", "", "Franko House", "CHI", "TE"], ["4936", "", "Skyler Howard", "SEA", "QB"], ["4937", "2980808", "Al Riles", "IND", "WR"], ["4942", "3046320", "Marcell Ateman", "", "WR"], ["4943", "3912547", "Sam Darnold", "SEA", "QB"], ["4949", "3843750", "Derrius Guice", "", "RB"], ["4950", "3895856", "Christian Kirk", "SF", "WR"], ["4951", "3115394", "DJ Chark", "", "WR"], ["4958", "16486", "Brett Maher", "", "K"], ["4960", "3915189", "Roquan Smith", "BAL", "LB"], ["4962", "3128721", "Sony Michel", "", "RB"], ["4963", "3925345", "Minkah Fitzpatrick", "NYJ", "DB"], ["4964", "3915535", "Denzel Ward", "CLE", "DB"], ["4967", "3116733", "Bradley Chubb", "BUF", "LB"], ["4968", "3929950", "Tremaine Edmunds", "NYG", "LB"], ["4969", "3134362", "Vita Vea", "TB", "DL"], ["4971", "3691739", "Derwin James", "LAC", "DB"], ["4972", "3116407", "Mason Rudolph", "PIT", "QB"], ["4973", "3924365", "Hayden Hurst", "", "TE"], ["4976", "3925354", "Daron Payne", "WAS", "DL"], ["4981", "3925357", "Calvin Ridley", "TEN", "WR"], ["4982", "3895841", "Mike Hughes", "ATL", "DB"], ["4983", "3915416", "DJ Moore", "BUF", "WR"], ["4984", "3918298", "Josh Allen", "BUF", "QB"], ["4985", "3139925", "Rashaad Penny", "", "RB"], ["4988", "3128720", "Nick Chubb", "", "RB"], ["4992", "3127306", "Dante Pettis", "", "WR"], ["4993", "3116164", "Mike Gesicki", "CIN", "TE"], ["4994", "3128774", "Kalen Ballage", "", "RB"], ["4995", "4045305", "Ian Thomas", "LV", "TE"], ["4996", "3049872", "Kyle Lauletta", "", "QB"], ["4997", "3917846", "Mark Walton", "", "RB"], ["4998", "3057987", "DaeSean Hamilton", "", "WR"], ["4999", "3693166", "Josh Sweat", "ARI", "DL"], ["5000", "3119195", "Chase Edmonds", "", "RB"], ["5001", "3117256", "Dalton Schultz", "HOU", "TE"], ["5004", "3123969", "Ito Smith", "DAL", "RB"], ["5007", "3915823", "Keke Coutee", "", "WR"], ["5008", "3052897", "Durham Smythe", "BAL", "TE"], ["5009", "3123050", "Chris Herndon", "", "TE"], ["5010", "3127292", "Will Dissly", "", "TE"], ["5012", "3116365", "Mark Andrews", "BAL", "TE"], ["5013", "3050487", "Anthony Miller", "", "WR"], ["5017", "3919512", "Jessie Bates", "ATL", "DB"], ["5020", "3116748", "B.J. Hill", "CIN", "DL"], ["5022", "3121023", "Dallas Goedert", "PHI", "TE"], ["5024", "3122449", "James Washington", "", "WR"], ["5025", "3859006", "Ronnie Harrison", "MIA", "DB"], ["503", "12460", "Graham Gano", "", "K"], ["5030", "3122793", "Harold Landry", "NE", "LB"], ["5031", "3051746", "Oren Burks", "CIN", "LB"], ["5032", "3128452", "Jordan Akins", "", "TE"], ["5035", "3122930", "Derrick Nnadi", "IND", "DL"], ["5036", "3931399", "Justin Reid", "NO", "DB"], ["5038", "4036348", "Michael Gallup", "", "WR"], ["5041", "3138826", "Fred Warner", "SF", "LB"], ["5043", "4076951", "Nathan Shepherd", "NO", "DL"], ["5044", "3915437", "Isaiah Oliver", "ARI", "DB"], ["5045", "3128429", "Courtland Sutton", "DEN", "WR"], ["5046", "3122672", "Royce Freeman", "", "RB"], ["5048", "3122797", "Isaac Yiadom", "NO", "DB"], ["5049", "3117255", "Harrison Phillips", "NYJ", "DL"], ["5051", "3843769", "Donte Jackson", "LAC", "DB"], ["5052", "3912550", "Ronald Jones", "", "RB"], ["5054", "3916923", "Carlton Davis", "NE", "DB"], ["5055", "3116679", "M.J. Stewart", "HOU", "DB"], ["5061", "3120358", "Uchenna Nwosu", "SEA", "LB"], ["5067", "3843843", "Arden Key", "IND", "DL"], ["5068", "3916925", "Kerryon Johnson", "", "RB"], ["5071", "3929846", "DeShon Elliott", "PIT", "DB"], ["5073", "3047495", "Sebastian Joseph-Day", "PIT", "DL"], ["5076", "3915381", "John Kelly", "", "RB"], ["5080", "3895857", "Damion Ratley", "", "WR"], ["5084", "3121552", "Natrell Jamerson", "LV", "DB"], ["5086", "3051738", "Marquez Valdes-Scantling", "DAL", "WR"], ["5088", "3039783", "Duke Ejiofor", "ATL", "LB"], ["5089", "3051381", "Mike White", "", "QB"], ["5092", "3045264", "Troy Fumagalli", "", "TE"], ["5094", "3915486", "Ryan Izzo", "", "TE"], ["5095", "3051909", "Daniel Carlson", "", "K"], ["5096", "3728262", "Ray-Ray McCloud", "", "WR"], ["5098", "3057524", "Siran Neal", "SF", "DB"], ["5100", "3051891", "Jordan Wilkins", "", "RB"], ["5101", "3728254", "Deon Cain", "", "WR"], ["5102", "3120659", "Daurice Fountain", "", "WR"], ["5103", "3052576", "Dylan Cantrell", "", "TE"], ["5107", "3116721", "Jaylen Samuels", "", "RB"], ["5108", "3052061", "Luke Falk", "", "QB"], ["5110", "3115378", "Russell Gage", "", "WR"], ["5111", "4035019", "Javon Wims", "", "WR"], ["5112", "3126367", "Bo Scarbrough", "", "RB"], ["5113", "4036335", "Cedrick Wilson", "DET", "WR"], ["5116", "3125232", "Nick Bawden", "", "RB"], ["5117", "4035379", "Jordan Thomas", "", "TE"], ["5119", "3124679", "Jason Sanders", "NYJ", "K"], ["5120", "3052450", "Danny Etling", "", "QB"], ["5121", "3123075", "Braxton Berrios", "NYG", "WR"], ["5122", "3051439", "Boston Scott", "", "RB"], ["5124", "3128843", "Alex McGough", "", "QB"], ["5125", "3125383", "Damoun Patterson", "", "WR"], ["5126", "3116680", "Austin Proehl", "", "WR"], ["5127", "3115293", "Kyle Allen", "BUF", "QB"], ["5128", "3042749", "Logan Woodside", "", "QB"], ["5129", "3123935", "Adonis Jennings", "", "WR"], ["5130", "3921564", "Auden Tate", "", "WR"], ["5131", "3116136", "Justin Jackson", "", "RB"], ["5133", "3122920", "Tyler Conklin", "DET", "TE"], ["5134", "3046401", "Keith Kirkwood", "", "WR"], ["5136", "3932420", "Josh Adams", "", "RB"], ["5137", "3122899", "Richie James", "", "WR"], ["5138", "3140525", "Martez Carter", "", "RB"], ["5139", "3115365", "Trey Quinn", "", "WR"], ["5140", "3121616", "Jaelon Acklin", "", "WR"], ["5142", "3040535", "Kurt Benkert", "", "QB"], ["5143", "3128800", "Demario Richard", "", "RB"], ["5144", "4047769", "Malik Williams", "", "RB"], ["5145", "3075100", "Luke McNitt", "", "RB"], ["515", "13229", "Rob Gronkowski", "", "TE"], ["5154", "3122168", "Trent Sherfield", "BUF", "WR"], ["5155", "3044711", "Corey Willis", "", "WR"], ["5156", "4032479", "Andrew Vollert", "", "TE"], ["5158", "4334300", "Dennis Gardeck", "JAX", "LB"], ["5162", "3116642", "Reggie Bonnafon", "", "RB"], ["5167", "3124037", "Dalton Sturm", "", "QB"], ["5169", "3139223", "Malik Earl", "", "WR"], ["5170", "3052117", "Phillip Lindsay", "", "RB"], ["5176", "3059719", "Davon Grayson", "", "WR"], ["5185", "3128390", "Allen Lazard", "", "WR"], ["5189", "4034949", "Eddy Pineiro", "SF", "K"], ["5195", "3040146", "Akrum Wadley", "", "RB"], ["5196", "3115360", "Ethan Wolf", "", "TE"], ["5197", "4048717", "Rico Gafford", "", "WR"], ["5199", "4036416", "Byron Pringle", "", "WR"], ["5201", "3126113", "Terry Swanson", "", "RB"], ["5207", "3042452", "Marchie Murdock", "", "WR"], ["5209", "3139033", "Mike Boone", "", "RB"], ["5210", "3123968", "Korey Robertson", "", "WR"], ["5211", "3049054", "Jake Wieneke", "", "WR"], ["5217", "3051861", "Jason Reese", "", "TE"], ["5220", "3045238", "Godwin Igwebuike", "", "RB"], ["5222", "3125356", "Jalen Davis", "CIN", "DB"], ["5223", "3122167", "Caleb Scott", "TEN", "WR"], ["5224", "4038530", "Taj Williams", "", "WR"], ["5226", "3125114", "Poona Ford", "LAR", "DL"], ["5228", "3040507", "J.T. Barrett", "", "QB"], ["5230", "3123052", "Michael Badgley", "", "K"], ["5231", "3047912", "Cole Hunt", "", "TE"], ["5233", "3051387", "Marcus Baugh", "", "TE"], ["5235", "3047536", "David Wells", "", "TE"], ["5236", "3119232", "Kyle Lewis", "", "WR"], ["5238", "3053124", "Austin Ramesh", "", "RB"], ["5239", "3053315", "Lamar Jordan", "", "QB"], ["5240", "3117250", "Daniel Marx", "", "RB"], ["5241", "3126002", "Christian Blake", "", "WR"], ["5242", "3056691", "Dontez Byrd", "", "WR"], ["5243", "4036341", "Detrich Clark", "", "WR"], ["5244", "4037481", "Devin Gray", "", "WR"], ["5245", "3052991", "Troy Mangen", "", "TE"], ["5246", "3042888", "Jake Roh", "", "TE"], ["5247", "3059104", "David Marvin", "", "K"], ["5248", "3051926", "Gus Edwards", "", "RB"], ["5249", "3048682", "Andre Levrone", "", "WR"], ["5250", "3054845", "Robert Foster", "", "WR"], ["5251", "3791111", "Tyler Davis", "", "K"], ["5252", "3123212", "Ray Lawry", "", "RB"], ["5254", "3059733", "Jimmy Williams", "", "WR"], ["5255", "3045763", "Teo Redding", "", "WR"], ["5257", "3045169", "Tim Boyle", "", "QB"], ["5260", "3155188", "Vyncint Smith", "", "WR"], ["5261", "3045164", "Jester Weah", "", "WR"], ["5263", "3931782", "Chase Litton", "", "QB"], ["5264", "3123714", "Blake Mack", "", "TE"], ["5265", "3040134", "Nic Shimonek", "", "QB"], ["5268", "3039970", "Ben Johnson", "", "TE"], ["5269", "3951441", "Codey McElroy", "", "TE"], ["5271", "3122716", "Buddy Howell", "", "RB"], ["5272", "3975763", "Greg Joseph", "", "K"], ["5273", "3121597", "Kamryn Pettway", "", "RB"], ["5275", "3053760", "Jeff Badet", "", "WR"], ["5276", "3121396", "Tyler Hoppes", "", "TE"], ["5277", "3059766", "Deon Yelder", "", "TE"], ["5278", "3129453", "Jarvion Franklin", "", "RB"], ["5283", "3916085", "Ka'Raun White", "", "WR"], ["5284", "3122976", "Jeff Wilson", "", "RB"], ["5285", "3120303", "Ross Dwelley", "", "TE"], ["5286", "3046412", "Austin Allen", "", "QB"], ["5289", "3139456", "Cameron Batson", "", "WR"], ["5290", "3932935", "Deontay Burnett", "", "WR"], ["5292", "3052122", "Devin Ross", "", "WR"], ["5293", "4035853", "Jordan Veasy", "", "WR"], ["5294", "3139946", "Mikah Holder", "", "WR"], ["5295", "3121398", "De'Mornay Pierson-El", "", "WR"], ["5296", "3042434", "Elijah Wellman", "", "TE"], ["5297", "3057956", "Zach Sieler", "MIA", "DL"], ["5310", "3915097", "Antonio Callaway", "", "WR"], ["5322", "3039794", "James Looney", "", "TE"], ["5325", "3043276", "Peter Kalambayi", "GB", "LB"], ["5328", "3134448", "Tremon Smith", "HOU", "DB"], ["533", "13199", "Colt McCoy", "", "QB"], ["5330", "3928979", "Dorance Armstrong", "WAS", "DL"], ["5332", "3050073", "Foyesade Oluokun", "JAX", "LB"], ["5333", "3121414", "Jalyn Holmes", "TEN", "DL"], ["5341", "3121003", "Taron Johnson", "LV", "DB"], ["5346", "3124005", "Zaire Franklin", "GB", "LB"], ["5347", "3916430", "Nyheim Miller-Hines", "", "RB"], ["5351", "3126352", "Da'Shawn Hand", "ATL", "DL"], ["5355", "3064131", "Nick Sharga", "", "RB"], ["5358", "3935107", "Anthony Manzo-Lewis", "", "TE"], ["5359", "4260053", "Dorren Miller", "", "WR"], ["536", "13934", "Antonio Brown", "", "WR"], ["5361", "3123938", "Avonte Maddox", "DET", "DB"], ["5366", "3929956", "Tim Settle", "WAS", "DL"], ["5371", "3116726", "Kentavius Street", "CHI", "DL"], ["5372", "3139387", "D.J. Reed", "DET", "DB"], ["5374", "3118892", "Justin Watson", "HOU", "WR"], ["5378", "3138764", "Jacob Martin", "TEN", "DL"], ["538", "13295", "Emmanuel Sanders", "", "WR"], ["5385", "3125891", "Alec Bloom", "", "TE"], ["5386", "3052413", "Matt McCrane", "", "K"], ["5392", "3118374", "Jack Heneghan", "", "QB"], ["5395", "3116563", "Shaun Wilson", "", "RB"], ["5397", "3122979", "Trevor Moore", "", "K"], ["5398", "4039226", "Justin Crawford", "", "RB"], ["5401", "3125115", "Armanti Foreman", "", "WR"], ["5403", "3048030", "Peter Pujals", "", "QB"], ["5409", "3050481", "Tanner Hudson", "CIN", "TE"], ["5425", "3042741", "John Diarse", "", "WR"], ["5427", "3051813", "LaQuvionte Gonzalez", "", "WR"], ["5428", "3055908", "Ricky Jeune", "", "WR"], ["5431", "3122607", "Shay Fields", "", "WR"], ["5432", "3115314", "Cam Sims", "", "WR"], ["5452", "3115481", "J.T. Gray", "PHI", "DB"], ["5460", "3068715", "Kaare Vedvik", "", "K"], ["5462", "4339834", "Christopher Ezeala", "", "RB"], ["5463", "4057659", "Mark Thompson", "", "RB"], ["5464", "3928461", "De'Lance Turner", "", "RB"], ["5465", "4329472", "Nick Keizer", "", "TE"], ["5466", "3120464", "John Franklin-Myers", "TEN", "DL"], ["5468", "4338875", "Christian Scotland-Williamson", "", "TE"], ["5493", "4037361", "Charvarius Ward", "IND", "DB"], ["5519", "4334405", "Tavierre Thomas", "MIN", "DB"], ["5520", "4331768", "Jonathan Owens", "IND", "DB"], ["5530", "3115343", "Evan Berry", "", "WR"], ["5534", "3932901", "Elijah Campbell", "NYG", "DB"], ["5547", "3125991", "Ryan Smith", "", "TE"], ["5548", "3119490", "Elijah Marks", "", "WR"], ["5549", "3115375", "Darrel Williams", "", "RB"], ["5550", "3042728", "John David Moore", "", "RB"], ["5558", "4294229", "Marcus Martin", "", "RB"], ["5565", "3116158", "Jason Cabinda", "", "RB"], ["5569", "3040499", "Johnny Stanton", "", "RB"], ["5570", "3047968", "Chad Beebe", "", "WR"], ["5580", "3127273", "Frankie Luvu", "WAS", "LB"], ["5586", "3045201", "Henry Poggi", "", "RB"], ["5587", "3929855", "Chris Warren", "", "RB"], ["5590", "3052671", "Jordan Smallwood", "", "WR"], ["5597", "3059773", "Brogan Roback", "", "QB"], ["5608", "3125315", "Devonte Boyd", "", "WR"], ["5609", "3126158", "Stephen Baggett", "", "TE"], ["5612", "3892746", "Anthony Mahoungou", "", "WR"], ["5615", "3134316", "Matt Dickerson", "JAX", "DL"], ["5619", "3052449", "Dalyn Dawkins", "", "RB"], ["5637", "3126329", "Garrett Johnson", "", "WR"], ["5638", "2978744", "Shaq Roland", "CHI", "WR"], ["5661", "3122430", "Chris Lacy", "", "WR"], ["5691", "3050916", "Mike Ford", "ATL", "DB"], ["5692", "3040204", "Ryan Santoso", "", "K"], ["5695", "3115255", "Brandon Powell", "", "WR"], ["5699", "4327535", "Matt Fleming", "", "WR"], ["5700", "3127374", "Robert Martin", "", "RB"], ["5703", "4055563", "Deontez Alexander", "", "WR"], ["5709", "4290778", "Luis Perez", "", "QB"], ["5710", "3052549", "Nick Holley", "", "WR"], ["5714", "4339828", "Tim Wilson", "", "WR"], ["5718", "3139447", "Ryan Yurachek", "", "TE"], ["5722", "3051650", "Darvin Kidsy", "", "WR"], ["5726", "3129446", "Robert Spillane", "NE", "LB"], ["5733", "3957316", "Clayton Wilson", "", "TE"], ["5734", "3051751", "C.J. Duncan", "", "WR"], ["5744", "3047578", "Eldridge Massington", "NO", "WR"], ["5747", "4035069", "Kayaune Ross", "", "WR"], ["5750", "3074230", "Garrett Hudson", "", "TE"], ["5751", "3134314", "Austin Roberts", "", "TE"], ["5752", "3041102", "Sherman Badie", "", "RB"], ["5756", "3116132", "Garrett Dickerson", "", "TE"], ["5760", "4350798", "Josh Crockett", "", "WR"], ["5773", "3047876", "KhaDarel Hodge", "", "WR"], ["5774", "3039793", "Cam Serigne", "", "TE"], ["5775", "3052494", "Jared Murphy", "", "WR"], ["5776", "3044693", "Mark Chapman", "", "WR"], ["5777", "2973663", "Malachi Jones", "", "WR"], ["5781", "3115928", "Malik Turner", "SF", "WR"], ["5785", "3124608", "James Butler", "", "RB"], ["5786", "4370294", "Marcus Peterson", "", "WR"], ["5787", "3052102", "Bryce Bobo", "", "WR"], ["5791", "3052624", "Gerald Holmes", "", "RB"], ["5792", "3125248", "Jeremy Reaves", "WAS", "DB"], ["5799", "4378381", "Darius Prince", "", "WR"], ["5800", "3139485", "Justin Stockton", "", "RB"], ["5801", "4034782", "Kobe McCrary", "", "RB"], ["5804", "3921645", "Julian Williams", "", "WR"], ["5806", "3124092", "John Wolford", "", "QB"], ["5808", "2979695", "Connor Jessop", "", "QB"], ["5809", "4328969", "Ja'Quan Gardner", "", "RB"], ["5816", "4040605", "Nick Bosa", "SF", "DL"], ["5823", "3127313", "Tristan Vizcaino", "", "K"], ["5837", "3060823", "Redford Jones", "", "K"], ["5839", "4046523", "Rashan Gary", "DAL", "LB"], ["5840", "3915239", "Josh Hines-Allen", "JAX", "DL"], ["5841", "4039303", "Ed Oliver", "BUF", "DL"], ["5843", "4036261", "Devin Bush", "CHI", "LB"], ["5844", "4036133", "T.J. Hockenson", "MIN", "TE"], ["5846", "4047650", "DK Metcalf", "PIT", "WR"], ["5847", "4035483", "Dexter Lawrence", "CIN", "DL"], ["5848", "4241372", "Marquise Brown", "PHI", "WR"], ["5849", "3917315", "Kyler Murray", "MIN", "QB"], ["5850", "4047365", "Josh Jacobs", "GB", "RB"], ["5854", "3924327", "Drew Lock", "SEA", "QB"], ["5857", "4036131", "Noah Fant", "NO", "TE"], ["5859", "4047646", "A.J. Brown", "NE", "WR"], ["5861", "3116449", "L.J. Collier", "ARI", "DL"], ["5862", "4035631", "Brian Burns", "NYG", "DL"], ["5863", "3931397", "J.J. Arcega-Whiteside", "", "WR"], ["5864", "4038999", "Byron Murphy", "MIN", "DB"], ["5865", "3915525", "Dre'Mont Jones", "NE", "DL"], ["587", "13726", "Logan Paulsen", "", "TE"], ["5870", "3917792", "Daniel Jones", "IND", "QB"], ["5871", "3915282", "Zach Allen", "DEN", "DL"], ["5872", "3126486", "Deebo Samuel", "", "WR"], ["5873", "4035015", "Riley Ridley", "", "WR"], ["5876", "4046675", "Julian Love", "SEA", "DB"], ["5878", "4047839", "N'Keal Harry", "", "TE"], ["5880", "3121410", "Parris Campbell", "", "WR"], ["5883", "4240780", "Lonnie Johnson", "MIA", "DB"], ["5884", "4036163", "Kelvin Harmon", "", "WR"], ["5886", "3917940", "Hakeem Butler", "DEN", "TE"], ["5888", "3116175", "Amani Oruwariye", "BAL", "DB"], ["5890", "3925347", "Damien Harris", "", "RB"], ["5892", "4035538", "David Montgomery", "HOU", "RB"], ["5893", "4034953", "C.J. Gardner-Johnson", "BUF", "DB"], ["59", "10636", "Mason Crosby", "", "K"], ["5901", "3131498", "Tytus Howard", "CLE", "DL"], ["5903", "3115252", "Will Grier", "", "QB"], ["5906", "3930086", "Dawson Knox", "BUF", "TE"], ["5908", "4036134", "Amani Hooker", "TEN", "DB"], ["5911", "3115328", "Jalen Hurd", "", "WR"], ["5912", "3918310", "Carl Granderson", "NO", "DL"], ["5915", "3914328", "Andy Isabella", "", "WR"], ["5916", "4039359", "Darrell Henderson", "", "RB"], ["5917", "4035004", "Mecole Hardman", "BUF", "WR"], ["5919", "4035006", "Elijah Holyfield", "", "RB"], ["5920", "3915297", "Will Harris", "WAS", "DB"], ["5927", "3121422", "Terry McLaurin", "WAS", "WR"], ["5929", "4049301", "Anthony Johnson", "", "WR"], ["5934", "3929865", "Charles Omenihu", "WAS", "DL"], ["5937", "3932905", "Diontae Johnson", "", "WR"], ["5938", "4039057", "Lil'Jordan Humphrey", "DEN", "WR"], ["5941", "3929817", "Felton Davis", "", "WR"], ["5946", "3873935", "Jamel Dean", "PIT", "DB"], ["5947", "3916433", "Jakobi Meyers", "JAX", "WR"], ["5950", "3921571", "Nyqwan Murray", "", "WR"], ["5955", "3135321", "Hunter Renfrow", "", "WR"], ["5960", "3121544", "T.J. Edwards", "CHI", "LB"], ["5962", "3124537", "KeeSean Johnson", "", "WR"], ["5965", "3932423", "Miles Boykin", "", "WR"], ["5967", "3916148", "Tony Pollard", "TEN", "RB"], ["5968", "3728261", "Mark Fields", "SF", "DB"], ["5970", "4037235", "Greg Dortch", "DET", "WR"], ["5973", "3921690", "Josh Oliver", "MIN", "TE"], ["5974", "3116172", "Trace McSorley", "", "QB"], ["5975", "3932433", "Alize Mack", "", "TE"], ["5977", "3915174", "Terry Godwin", "", "WR"], ["5980", "3886818", "Myles Gaskin", "", "RB"], ["5984", "3895828", "Anthony Ratliff-Williams", "", "WR"], ["5985", "3843945", "Foster Moreau", "HOU", "TE"], ["5987", "4048244", "Alexander Mattison", "", "RB"], ["5991", "3916655", "Maxx Crosby", "LV", "DL"], ["5995", "4038441", "Justice Hill", "BAL", "RB"], ["5997", "3843603", "Jazz Ferguson", "", "WR"], ["6001", "3127310", "Drew Sample", "CIN", "TE"], ["6002", "3123944", "Qadree Ollison", "", "RB"], ["6003", "3894856", "Anthony Nelson", "TB", "LB"], ["6007", "3923397", "Ryquell Armstead", "", "RB"], ["6011", "4038524", "Gardner Minshew", "ARI", "QB"], ["6012", "4037457", "Travis Homer", "PIT", "RB"], ["6016", "3932963", "Dax Raymond", "PIT", "TE"], ["6017", "3930064", "DaMarkus Lodge", "", "WR"], ["6018", "3929924", "Zach Gentry", "", "TE"], ["6019", "3121413", "Johnnie Dixon", "", "WR"], ["6021", "3843406", "Nick Brossette", "", "RB"], ["6025", "3917853", "Mike Jackson", "CAR", "DB"], ["6031", "3886636", "Alex Barnes", "", "RB"], ["6032", "3120980", "Keelan Doss", "", "WR"], ["6036", "3916946", "Ryan Davis", "", "WR"], ["6037", "3722362", "Brett Rypien", "", "QB"], ["6039", "3915411", "Ty Johnson", "BUF", "RB"], ["6040", "3916564", "Tyree Jackson", "", "TE"], ["6045", "3916071", "Gary Jennings", "", "WR"], ["6049", "3123074", "Tyre Brady", "", "WR"], ["6056", "3916903", "Dre Greenlaw", "SF", "LB"], ["6059", "3139522", "Travis Fulgham", "", "WR"], ["606", "13484", "Joe Webb", "", "QB"], ["6060", "3932886", "Sean Murphy-Bunting", "ARI", "DB"], ["6063", "3894912", "Tyron Billy-Johnson", "", "WR"], ["6065", "3926229", "Cody Barton", "TEN", "LB"], ["6068", "3699935", "Devine Ozigbo", "", "RB"], ["6069", "3699902", "Stanley Morgan", "", "WR"], ["6074", "3912092", "Donald Parham", "", "TE"], ["6075", "3940587", "Jesper Horsted", "", "TE"], ["6081", "3122103", "Kendall Blanton", "", "TE"], ["6083", "4249087", "Matt Gay", "LV", "K"], ["6089", "3115359", "Daniel Helm", "", "TE"], ["6105", "3917797", "Joe Giles-Harris", "CIN", "LB"], ["6108", "3693033", "Jacques Patrick", "", "RB"], ["6109", "3917668", "Alec Ingold", "LAC", "RB"], ["6111", "3886812", "Jake Browning", "TB", "QB"], ["6118", "4040982", "Quinnen Williams", "DAL", "DL"], ["6124", "3134690", "Montez Sweat", "CHI", "DL"], ["6125", "4035369", "Jeffery Simmons", "TEN", "DL"], ["6128", "3910229", "Rock Ya-Sin", "DET", "DB"], ["6129", "3863182", "Jerry Tillery", "IND", "DL"], ["6130", "4040761", "Devin Singletary", "NYG", "RB"], ["6131", "4040983", "Mack Wilson", "ARI", "LB"], ["6136", "3892775", "Jarrett Stidham", "DEN", "QB"], ["6137", "3122818", "Tommy Sweeney", "", "TE"], ["6139", "3917962", "Jace Sternberger", "", "TE"], ["6141", "3129310", "Drue Tranquill", "KC", "LB"], ["6142", "3932936", "Caleb Wilson", "", "TE"], ["6144", "4035222", "Trayveon Williams", "", "RB"], ["6147", "3116144", "Clayton Thorson", "NYG", "QB"], ["6148", "3915399", "Preston Williams", "", "WR"], ["6149", "3916945", "Darius Slayton", "NYG", "WR"], ["6151", "4045163", "Miles Sanders", "", "RB"], ["6153", "3932449", "Dexter Williams", "", "RB"], ["6154", "3871102", "David Sills", "TB", "WR"], ["6155", "3916418", "Jaylen Smith", "", "WR"], ["6156", "4035072", "Benny Snell", "", "RB"], ["616", "13232", "Jimmy Graham", "", "TE"], ["6161", "3929828", "L.J. Scott", "", "RB"], ["6164", "3933327", "Kahale Warring", "", "TE"], ["6165", "4043161", "Antoine Wesley", "", "WR"], ["6171", "3126115", "Cody Thompson", "", "WR"], ["6175", "3919104", "Kerrith Whyte", "GB", "RB"], ["6178", "4361606", "Darwin Thompson", "", "RB"], ["6181", "4039253", "Trevon Wesco", "", "TE"], ["6183", "3133487", "Andrew Van Ginkel", "MIN", "LB"], ["6185", "3120590", "Easton Stick", "IND", "QB"], ["6187", "3912551", "Aca'Cedric Ware", "", "RB"], ["6188", "3921970", "Sutton Smith", "", "RB"], ["6192", "3045141", "Chris Blewitt", "", "K"], ["6195", "4420843", "Damon Sheehy-Guiseppi", "", "WR"], ["6197", "4421391", "Durval Queiroz Neto", "MIA", "DL"], ["6202", "3115349", "Jakob Johnson", "", "RB"], ["6203", "4421390", "Valentine Holmes", "", "RB"], ["6205", "3042565", "Brandon Silvers", "", "QB"], ["6208", "3048898", "Elliott Fry", "", "K"], ["6210", "3915419", "Darnell Savage", "PIT", "DB"], ["6214", "3110565", "Quincy Williams", "CLE", "LB"], ["6217", "3728281", "Blake Cashman", "MIN", "LB"], ["6218", "3071353", "E.J. Speed", "HOU", "LB"], ["6219", "3821683", "Austin Seibert", "", "K"], ["6220", "3116689", "Cole Holcomb", "PIT", "LB"], ["6227", "4240591", "Nick Easley", "", "WR"], ["6231", "3118906", "John Lovett", "", "QB"], ["6233", "3121378", "Matt Sokol", "", "TE"], ["6234", "4411193", "Deonte Harty", "", "WR"], ["6236", "3124074", "Travon McMillian", "", "RB"], ["6237", "3115966", "Wilton Speight", "", "QB"], ["6238", "3125414", "Tyree Mayfield", "", "TE"], ["6239", "4408988", "Malik Taylor", "", "WR"], ["6247", "4069806", "Jason Moore", "", "WR"], ["6248", "3122838", "Trevion Thompson", "", "WR"], ["6254", "4243831", "Kemon Hall", "TB", "DB"], ["6259", "3911993", "Darnell Holland", "", "RB"], ["6260", "3117919", "Jake Powell", "", "TE"], ["6261", "3121225", "Reggie White", "", "WR"], ["6263", "3134013", "Trevor Wood", "", "TE"], ["6268", "3128444", "Matthew Wright", "", "K"], ["6269", "3915776", "Kyle Shurmur", "", "QB"], ["627", "13226", "Andre Roberts", "", "WR"], ["6271", "3917914", "Olamide Zaccheaus", "ATL", "WR"], ["6273", "3910660", "P.J. Johnson", "LV", "DL"], ["6284", "3139368", "Marcus Epps", "PHI", "DB"], ["6288", "3124964", "Marcus Green", "", "WR"], ["6290", "3914397", "Scotty Miller", "CHI", "WR"], ["6301", "3116179", "Nick Scott", "CAR", "DB"], ["6302", "3124890", "Kaden Elliss", "NO", "LB"], ["6306", "3863820", "Patrick Mekari", "JAX", "LB"], ["6308", "3115981", "Ian Bunting", "", "TE"], ["6311", "3127211", "Patrick Laird", "", "RB"], ["6314", "3916577", "Cam Lewis", "CHI", "DB"], ["6315", "4035232", "Tyrel Dodson", "MIA", "LB"], ["6317", "3921586", "Jacob Dolegala", "", "QB"], ["6318", "3124022", "Jordan Ellis", "", "RB"], ["6320", "3123226", "Jonathan Duhart", "", "WR"], ["6323", "3125107", "Andrew Beck", "NYJ", "RB"], ["6333", "4259493", "Keisean Nixon", "GB", "DB"], ["6334", "4035102", "Damarea Crockett", "", "RB"], ["6342", "3116745", "Stephen Louis", "", "WR"], ["6343", "3128814", "Manny Wilkins", "", "QB"], ["6348", "4240528", "Del'Shawn Phillips", "LAC", "LB"], ["6352", "3919544", "Matt Colburn", "", "RB"], ["6357", "3957156", "Shawn Bane", "", "WR"], ["6358", "3914158", "Kahlil Lewis", "", "WR"], ["6359", "4361074", "C.J. Worton", "", "WR"], ["6361", "4250570", "Raphael Leonard", "", "WR"], ["6363", "3915296", "Michael Walker", "", "WR"], ["6364", "3126080", "Papi White", "", "WR"], ["6365", "3116384", "Carson Meier", "", "TE"], ["6370", "3929698", "Damion Jeanpiere", "", "WR"], ["6371", "4040826", "Drew Anderson", "", "QB"], ["6372", "3119996", "Xavier Turner", "", "RB"], ["6373", "3124369", "A.J. Richardson", "", "WR"], ["6374", "3120540", "Drew Belcher", "", "TE"], ["6375", "3672867", "Jerome Washington", "", "TE"], ["6379", "3122154", "Khari Blasingame", "", "RB"], ["6380", "3933568", "Davion Davis", "", "WR"], ["6381", "4249496", "Alexander Hollins", "", "WR"], ["6384", "3911927", "Justin Sumpter", "", "WR"], ["6385", "3919544", "Matt Colburn", "", "RB"], ["6386", "3919510", "Alex Bachman", "", "WR"], ["6387", "3119317", "Nsimba Webster", "", "WR"], ["6388", "3126196", "Romello Brooker", "", "TE"], ["6389", "3122421", "Keenen Brown", "", "TE"], ["6392", "3116559", "Johnathan Lloyd", "", "WR"], ["6395", "4422214", "Trinity Benson", "", "WR"], ["6396", "3125402", "Austin Fort", "", "TE"], ["6400", "3139448", "Ryan Bee", "ARI", "DL"], ["6401", "3917787", "T.J. Rahming", "", "WR"], ["6402", "3917960", "Steven Sims", "", "WR"], ["6416", "3918331", "Andrew Wingard", "ARI", "DB"], ["6419", "3929850", "P.J. Locke", "DAL", "DB"], ["642", "13217", "Golden Tate", "", "WR"], ["6420", "3126095", "Jon'Vea Johnson", "", "WR"], ["6421", "3932430", "Jalen Guyton", "", "WR"], ["6427", "4061956", "Ashton Dulin", "IND", "WR"], ["6435", "3136308", "George Aston", "", "RB"], ["6438", "3915575", "Kelvin McKnight", "", "WR"], ["6439", "3925348", "Hale Hentges", "", "TE"], ["6443", "3916447", "Eric Dungey", "", "QB"], ["6446", "3122799", "Jon Hilliman", "", "RB"], ["6448", "3895788", "Darrin Hall", "", "RB"], ["6449", "3126325", "Dorian Baker", "", "WR"], ["6450", "3116188", "David Blough", "", "QB"], ["6451", "3948283", "Stephen Carlson", "CHI", "TE"], ["6453", "4249030", "D.J. Montgomery", "", "WR"], ["6459", "3127588", "Sean Modster", "", "WR"], ["6460", "3116195", "Cole Herdman", "", "TE"], ["6462", "3926590", "Ellis Richardson", "", "TE"], ["6468", "3138759", "Matthew Eaton", "", "WR"], ["6469", "3116573", "Davis Koppenhaver", "", "TE"], ["6476", "3139389", "D'Angelo Ross", "CLE", "DB"], ["6485", "3919117", "Azeez Al-Shaair", "HOU", "LB"], ["6489", "3909004", "Taryn Christion", "", "QB"], ["6490", "4246674", "Mik'Quan Deane", "", "TE"], ["6491", "3122842", "Adam Choice", "", "RB"], ["6492", "4260393", "Terry Wright", "", "WR"], ["6493", "3917292", "Justin Johnson", "", "TE"], ["6496", "3128692", "Cole Hedlund", "", "K"], ["650", "10621", "Nick Folk", "ATL", "K"], ["6501", "3915230", "C.J. Conrad", "", "TE"], ["6506", "3135736", "Trayone Gray", "", "RB"], ["6519", "3120588", "Darrius Shepherd", "", "WR"], ["6522", "3118131", "T.J. Linta", "", "QB"], ["6524", "3124538", "Jamire Jordan", "", "WR"], ["6528", "3124084", "Joey Slye", "TEN", "K"], ["6529", "3138744", "Chris Myarick", "", "TE"], ["6539", "4422215", "Devontae Jackson", "", "RB"], ["6549", "4241723", "Damion Willis", "", "WR"], ["6552", "3917200", "Malik Henry", "", "WR"], ["6553", "3123857", "Austin Walter", "", "RB"], ["6557", "3929118", "Jeff Smith", "", "WR"], ["6585", "3886841", "Tony Brooks-James", "", "RB"], ["6586", "3121659", "Moral Stephens", "", "TE"], ["6588", "3126997", "Tom Kennedy", "DET", "WR"], ["6592", "3916451", "Dontae Strickland", "", "RB"], ["6595", "3127051", "Devlin Hodges", "", "QB"], ["6596", "3116715", "Jalan McClendon", "", "QB"], ["6598", "3931391", "Trenton Irwin", "", "WR"], ["6606", "3087801", "Nick Fitzgerald", "", "QB"], ["6610", "3931424", "Demetrius Flannigan-Fowles", "BUF", "LB"], ["6612", "3116097", "Luke Gifford", "SF", "LB"], ["6617", "4028212", "Andre Lindsey", "", "WR"], ["6618", "3909346", "Isaiah Searight", "", "TE"], ["6626", "4260392", "Isaac Zico", "", "WR"], ["6627", "3886601", "Shy Tuttle", "WAS", "DL"], ["6628", "3138760", "Ventell Bryant", "", "WR"], ["6629", "4246250", "Brian Burt", "", "WR"], ["663", "5557", "Benjamin Watson", "", "TE"], ["6650", "3150744", "Chase McLaughlin", "TB", "K"], ["6656", "3122794", "Connor Strachan", "HOU", "LB"], ["6657", "3116082", "Freedom Akinmoladun", "NYJ", "DL"], ["6659", "4421446", "Craig Reynolds", "", "RB"], ["6661", "3918323", "Joseph Parker", "", "WR"], ["6662", "3144991", "Parker Hesse", "", "TE"], ["6663", "3120558", "Micah Wright", "", "WR"], ["6664", "3126072", "A.J. Ouellette", "", "RB"], ["6665", "4408854", "Jody Fortson", "", "TE"], ["6682", "3675805", "Kareem Orr", "LAR", "DB"], ["6685", "3120349", "Jalen Greene", "", "WR"], ["6692", "4423402", "Joe Horn", "", "WR"], ["6694", "3139602", "D'Ernest Johnson", "", "RB"], ["6697", "3920560", "Floyd Allen", "", "WR"], ["6700", "4241403", "Marcelias Sutton", "", "RB"], ["6705", "3914267", "Taj McGowan", "", "RB"], ["6710", "4426310", "Josh Caldwell", "", "RB"], ["6711", "4043089", "Jalen Thompson", "DAL", "DB"], ["6713", "4261077", "Jamarius Way", "", "WR"], ["6714", "3139613", "Mazzi Wilkins", "BAL", "DB"], ["6723", "3139487", "Vincent Testaverde", "", "QB"], ["6727", "3912052", "Joe Walker", "", "WR"], ["6728", "3728307", "Jackson Harris", "", "TE"], ["6730", "4242418", "Jordan Ta'amu", "", "QB"], ["6737", "3116661", "Micky Crum", "", "TE"], ["6742", "3914324", "Marquis Young", "", "RB"], ["6744", "3040035", "Greg Ward", "", "WR"], ["6753", "3925346", "Derrick Gore", "", "RB"], ["676", "12514", "LeSean McCoy", "", "RB"], ["6763", "2974503", "Reggie Begelton", "", "WR"], ["6768", "4241479", "Tua Tagovailoa", "ATL", "QB"], ["6770", "3915511", "Joe Burrow", "CIN", "QB"], ["6781", "4035462", "Isaiah Simmons", "CAR", "DB"], ["6782", "4241986", "Chase Young", "NO", "DL"], ["6783", "4241463", "Jerry Jeudy", "CLE", "WR"], ["6784", "4035495", "Derrick Brown", "CAR", "DL"], ["6786", "4241389", "CeeDee Lamb", "DAL", "WR"], ["6788", "4241470", "Xavier McKinney", "GB", "DB"], ["6789", "4241475", "Henry Ruggs", "", "WR"], ["6790", "4259545", "D'Andre Swift", "CHI", "RB"], ["6791", "4240596", "C.J. Henderson", "ATL", "DB"], ["6792", "4259491", "Javon Kinlaw", "WAS", "DL"], ["6794", "4262921", "Justin Jefferson", "MIN", "WR"], ["6795", "4038557", "Ross Blacklock", "ATL", "DL"], ["6797", "4038941", "Justin Herbert", "LAC", "QB"], ["6798", "4241802", "Jalen Reagor", "MIA", "WR"], ["6799", "4242208", "Grant Delpit", "CLE", "DB"], ["6800", "4242205", "K'Lavon Chaisson", "WAS", "LB"], ["6801", "4239993", "Tee Higgins", "CIN", "WR"], ["6802", "4240585", "A.J. Epenesa", "PHI", "DL"], ["6803", "4360438", "Brandon Aiyuk", "SF", "WR"], ["6804", "4036378", "Jordan Love", "GB", "QB"], ["6805", "4240380", "KJ Hamler", "", "WR"], ["6806", "4241985", "J.K. Dobbins", "DEN", "RB"], ["6807", "4242207", "Patrick Queen", "PIT", "LB"], ["6813", "4242335", "Jonathan Taylor", "IND", "RB"], ["6814", "4243160", "Laviska Shenault", "", "WR"], ["6815", "3917657", "Zack Baun", "PHI", "LB"], ["6817", "4242516", "Noah Igbinoghene", "SEA", "DB"], ["6818", "4035245", "Nnamdi Madubuike", "BAL", "DL"], ["6819", "4035687", "Michael Pittman", "PIT", "WR"], ["6820", "4242214", "Clyde Edwards-Helaire", "", "RB"], ["6822", "4240689", "Jake Fromm", "", "QB"], ["6823", "4035003", "Jacob Eason", "", "QB"], ["6824", "4258195", "Donovan Peoples-Jones", "", "WR"], ["6825", "3892883", "Neville Gallimore", "CHI", "DL"], ["6826", "4258595", "Cole Kmet", "CHI", "TE"], ["6828", "4239934", "AJ Dillon", "CAR", "RB"], ["6829", "4035433", "Kristian Fulton", "KC", "DB"], ["6832", "4035277", "Kalija Lipscomb", "", "WR"], ["6836", "4239995", "A.J. Terrell", "ATL", "DB"], ["6839", "4243253", "Jaylon Johnson", "CHI", "DB"], ["6841", "4039052", "Jordan Elliott", "TEN", "DL"], ["6843", "4035115", "Albert Okwuegbunam", "LV", "TE"], ["6845", "4035676", "Zack Moss", "", "RB"], ["6846", "4243318", "Hunter Bryant", "", "TE"], ["6847", "4039050", "Devin Duvernay", "ARI", "WR"], ["6848", "3925350", "Anfernee Jennings", "NO", "LB"], ["6849", "4035403", "Denzel Mims", "DAL", "WR"], ["6850", "4040774", "Harrison Bryant", "SEA", "TE"], ["6851", "4046690", "Julian Okwara", "CLE", "LB"], ["6853", "3930066", "Van Jefferson", "WAS", "WR"], ["6855", "3858271", "Ashtyn Davis", "SF", "DB"], ["6857", "4039043", "Collin Johnson", "", "WR"], ["6858", "4259181", "James Lynch", "CHI", "DL"], ["6860", "3917142", "Akeem Davis-Gaither", "IND", "LB"], ["6864", "4039029", "Khalid Kareem", "NYG", "DL"], ["6865", "4242557", "Colby Parkinson", "LAR", "TE"], ["6866", "3915522", "KJ Hill", "LAC", "WR"], ["6867", "4040615", "Malik Harrison", "PIT", "LB"], ["6868", "4038849", "DJ Wonnum", "DET", "DL"], ["6869", "3911853", "Adam Trautman", "DEN", "TE"], ["6870", "4038818", "Bryan Edwards", "", "WR"], ["6872", "4401811", "Kyle Dugger", "CIN", "DB"], ["6873", "4040623", "Austin Mack", "", "WR"], ["6876", "4038437", "A.J. Green", "MIA", "DB"], ["6878", "4241941", "Anthony McFarland", "", "RB"], ["6879", "4035221", "Quartney Davis", "", "WR"], ["6882", "4242973", "Darnay Holmes", "ATL", "DB"], ["6885", "3917612", "Ke'Shawn Vaughn", "", "RB"], ["6887", "4240123", "Larrell Murchison", "LAR", "DL"], ["6888", "4034790", "Antoine Winfield", "TB", "DB"], ["6892", "4036149", "Nate Stanley", "", "QB"], ["6893", "3929658", "Robert Windsor", "IND", "DL"], ["6894", "3923392", "Mitchell Wilcox", "", "TE"], ["6895", "4035793", "Quintez Cephus", "", "WR"], ["6896", "4239694", "Amik Robertson", "WAS", "DB"], ["6898", "4055171", "Anthony Gordon", "", "QB"], ["6900", "3916409", "Jonathan Greenard", "PHI", "DL"], ["6901", "4046537", "Joshua Metellus", "MIN", "DB"], ["6904", "4040715", "Jalen Hurts", "PHI", "QB"], ["6906", "4029893", "Antonio Gandy-Golden", "", "TE"], ["6908", "4034952", "La'Mical Perine", "", "RB"], ["6909", "4259979", "Lynn Bowden", "", "WR"], ["6911", "4039059", "Brandon Jones", "DEN", "DB"], ["6913", "4037591", "Joe Reed", "", "WR"], ["6918", "4243315", "Salvon Ahmed", "CHI", "RB"], ["6919", "4036189", "Thaddeus Moss", "", "TE"], ["6920", "4242540", "Isaiah Hodgins", "NYG", "WR"], ["6921", "4046528", "Josh Uche", "MIA", "LB"], ["6923", "4240575", "Geno Stone", "BUF", "DB"], ["6926", "3918003", "Brycen Hopkins", "", "TE"], ["6927", "4050373", "Quez Watkins", "PHI", "WR"], ["6928", "4036651", "Kindle Vildor", "NE", "DB"], ["6931", "4240631", "DeeJay Dallas", "JAX", "RB"], ["6932", "3910630", "Charlie Taumoepeau", "", "TE"], ["6938", "4240021", "Cam Akers", "", "RB"], ["6939", "4040628", "Binjimen Victor", "", "WR"], ["6941", "4038946", "Troy Dye", "LAC", "LB"], ["6943", "4243537", "Gabe Davis", "", "WR"], ["6945", "4360294", "Antonio Gibson", "", "RB"], ["6946", "4039010", "Myles Bryant", "CLE", "DB"], ["6947", "4035463", "K'Von Wallace", "BAL", "DB"], ["6948", "4035666", "Leki Fotu", "NYG", "DL"], ["6949", "4043130", "Jordyn Brooks", "MIA", "LB"], ["695", "10453", "Ted Ginn", "", "WR"], ["6951", "4242873", "Eno Benjamin", "", "RB"], ["6955", "4052042", "James Robinson", "", "RB"], ["6956", "4046522", "Devin Asiasi", "", "TE"], ["6957", "3916204", "James Proche", "", "WR"], ["6958", "3915487", "Mike Danna", "BUF", "DL"], ["6959", "3916721", "LeVante Bellamy", "", "RB"], ["6960", "2310331", "Tyler Johnson", "DAL", "WR"], ["6963", "4039358", "Patrick Taylor", "SF", "RB"], ["6964", "4036275", "Sean McKeon", "IND", "TE"], ["6965", "4240655", "Jonathan Garvin", "CHI", "LB"], ["6966", "4241940", "Javon Leake", "", "RB"], ["6967", "4039000", "Aaron Fuller", "", "WR"], ["6969", "3895791", "Dane Jackson", "JAX", "DB"], ["6970", "4035426", "Stephen Sullivan", "", "TE"], ["6972", "3915520", "DaVon Hamilton", "JAX", "DL"], ["6973", "4039607", "J.J. Taylor", "", "RB"], ["6977", "3919548", "Justin Strnad", "DEN", "LB"], ["6984", "4046676", "Tony Jones", "", "RB"], ["6985", "4054085", "Dezmon Patmon", "", "WR"], ["6989", "4035170", "Marquez Callaway", "", "WR"], ["6996", "3928925", "JaMycal Hasty", "", "RB"], ["6999", "4035299", "Benito Jones", "LV", "DL"], ["7002", "3929645", "Juwan Johnson", "NO", "TE"], ["7005", "4362878", "Scottie Phillips", "", "RB"], ["7008", "3929824", "Brian Lewerke", "", "QB"], ["7012", "4243009", "Mykal Walker", "NYJ", "LB"], ["7013", "3915436", "Steven Montez", "", "QB"], ["7014", "4036507", "Joe Bachie", "DET", "LB"], ["7015", "3915136", "Jacob Breeland", "", "TE"], ["7016", "4043169", "Jeremy Chinn", "LV", "DB"], ["7018", "4039064", "Malcolm Roach", "DEN", "DL"], ["7021", "4038815", "Rico Dowdle", "PIT", "RB"], ["7023", "4259804", "Willie Gay", "MIA", "LB"], ["7032", "4034964", "Tyrie Cleveland", "", "WR"], ["7036", "4035663", "Terrell Burgess", "NO", "DB"], ["7039", "4241983", "Cody White", "SEA", "WR"], ["7042", "3917232", "Tyler Bass", "BUF", "K"], ["7044", "4035661", "Julian Blackmon", "NO", "DB"], ["7045", "3910544", "Joshua Kelley", "", "RB"], ["7048", "4045702", "Benny LeMay", "CLE", "RB"], ["7049", "3886598", "Jauan Jennings", "MIN", "WR"], ["7050", "3914151", "Josiah Deguara", "", "TE"], ["7053", "4035505", "Daniel Thomas", "CLE", "DB"], ["7055", "4038539", "Sewo Olonilua", "", "RB"], ["7058", "3858276", "Jaylinn Hawkins", "BAL", "DB"], ["7062", "3915165", "Rodrigo Blankenship", "", "K"], ["7066", "3916566", "K.J. Osborn", "TEN", "WR"], ["7069", "4039413", "Alohi Gilman", "KC", "DB"], ["7075", "4035020", "Charlie Woerner", "ATL", "TE"], ["7078", "3915821", "Tony Brown", "", "WR"], ["7079", "4262315", "Pete Guerriero", "", "RB"], ["7080", "3917166", "Omar Bayless", "", "WR"], ["7081", "3914395", "James Morgan", "", "QB"], ["7082", "4240861", "Dalton Keene", "", "TE"], ["7083", "4035671", "Tyler Huntley", "BAL", "QB"], ["7084", "3124900", "Jake Luton", "", "QB"], ["7085", "4248504", "Isaiah Coulter", "", "WR"], ["7086", "4373673", "John Hightower", "", "WR"], ["7087", "4039274", "Jonathan Ward", "", "RB"], ["7088", "3916209", "Xavier Jones", "", "RB"], ["7090", "4040655", "Darnell Mooney", "NYG", "WR"], ["7091", "4032749", "Aaron Parker", "", "WR"], ["7094", "4682912", "Lirim Hajrullahu", "", "K"], ["7095", "3053774", "Austin MacGinnis", "", "K"], ["7100", "3843469", "Derrick Dillon", "", "WR"], ["7103", "4035470", "Tavien Feaster", "ARI", "RB"], ["7106", "3917849", "Lawrence Cager", "WAS", "TE"], ["7107", "4040790", "Jason Huntley", "", "RB"], ["7109", "4039436", "Malcolm Perry", "", "WR"], ["7113", "4037333", "Alex Highsmith", "PIT", "LB"], ["7117", "4040432", "L'Jarius Sneed", "KC", "DB"], ["7120", "3917016", "Trevis Gipson", "CAR", "LB"], ["7122", "3915837", "Broderick Washington", "BAL", "DL"], ["7131", "3914240", "Tyler Davis", "", "TE"], ["7133", "4044540", "Isaiah Rodgers", "MIN", "DB"], ["7136", "4242154", "Kam Curl", "LAR", "DB"], ["7143", "3895785", "Ben DiNucci", "", "QB"], ["7149", "3791110", "Tommy Stevens", "NYG", "TE"], ["7152", "4038994", "Sam Sloman", "", "K"], ["7157", "3921685", "Josh Love", "", "QB"], ["7159", "3926936", "Reid Sinnett", "", "QB"], ["7162", "4039553", "Ryan Becker", "", "TE"], ["7172", "4031003", "Mikey Daniel", "", "RB"], ["7173", "3919609", "Jalen McCleskey", "", "WR"], ["7174", "4366710", "Juwan Green", "", "WR"], ["7175", "4052137", "Chris Rowland", "", "WR"], ["7197", "4036153", "Kristian Welch", "GB", "LB"], ["7200", "4027919", "Khalil Dorsey", "DET", "DB"], ["7204", "4039505", "Reggie Gilliam", "NE", "RB"], ["7210", "3700815", "Kendall Hinton", "", "WR"], ["7212", "4035523", "Spencer Nigh", "", "RB"], ["7216", "3916749", "Giovanni Ricci", "", "TE"], ["7218", "4373904", "Cam Sutton", "", "TE"], ["7222", "4039164", "Myles Adams", "DET", "DL"], ["7224", "4044133", "Sam Franklin", "BUF", "DB"], ["7227", "4042808", "Artavis Pierce", "", "RB"], ["7231", "4376288", "LaCale London", "ATL", "DL"], ["7233", "3886809", "Andre Baccellia", "", "WR"], ["7234", "4036055", "Maurice Ffrench", "", "WR"], ["7235", "4046668", "Aleva Hifo", "", "WR"], ["7237", "3919557", "Scotty Washington", "", "WR"], ["7262", "", "Jalen Morton", "IND", "QB"], ["7274", "4035018", "Tyler Simmons", "", "WR"], ["7279", "4374496", "DeMichael Harris", "", "WR"], ["7283", "4034530", "Chris Williams", "ATL", "DL"], ["7285", "3928847", "Donald Rutledge", "ARI", "LB"], ["7287", "4034944", "Josh Hammond", "", "WR"], ["7288", "3930900", "Ben Ellefson", "", "TE"], ["7294", "3919541", "Amari Henderson", "MIN", "DB"], ["7301", "4058925", "Tershawn Wharton", "CAR", "DL"], ["7308", "3929633", "Nick Bowers", "", "TE"], ["7314", "3932960", "Dominik Eberle", "", "K"], ["7315", "4040419", "Bobby Holly", "", "RB"], ["7316", "4040640", "Darius Bradwell", "", "RB"], ["7318", "4035611", "Gabe Nabers", "", "RB"], ["7320", "3916124", "Dalton Schoen", "", "WR"], ["7329", "4036959", "Cole Christiansen", "KC", "LB"], ["7335", "3675812", "Bryce Perkins", "", "QB"], ["7337", "4245174", "Easop Winston", "", "WR"], ["7339", "3910287", "J.J. Koski", "", "WR"], ["7340", "3929652", "Brandon Polk", "", "WR"], ["7344", "4032481", "Jonah Williams", "ARI", "DL"], ["7346", "3909013", "Christian Rozeboom", "TB", "LB"], ["7348", "3932348", "Dayan Lake", "LAR", "DB"], ["7351", "3915145", "Kirk Merritt", "", "WR"], ["7352", "4041703", "Matt Cole", "", "WR"], ["7357", "3929637", "Dan Chisena", "CAR", "WR"], ["7358", "3895835", "Jake Bargas", "", "RB"], ["7359", "3930035", "Nakia Griffin-Stewart", "", "TE"], ["7370", "4373937", "JoJo Ward", "", "WR"], ["7378", "3924367", "Kyle Markway", "", "TE"], ["7379", "4045062", "Rysen John", "", "TE"], ["7400", "4030747", "Manasseh Bailey", "", "WR"], ["7404", "3930298", "Noah Togiai", "", "TE"], ["7407", "4044121", "Isaiah Wright", "", "WR"], ["7412", "4683485", "Sandro Platzgummer", "", "RB"], ["7414", "3924325", "Johnathon Johnson", "", "WR"], ["7419", "4259252", "James Pierre", "MIN", "DB"], ["7420", "4049391", "Josh Hokit", "", "RB"], ["7425", "3915427", "Patrick Carr", "", "RB"], ["7435", "3931401", "Cameron Scarlett", "", "RB"], ["7436", "4057082", "Mason Kinsey", "TEN", "WR"], ["7438", "3910176", "Kristian Wilkerson", "", "WR"], ["7443", "4374269", "Teair Tart", "LAC", "DL"], ["7446", "4035098", "Tucker McCann", "", "K"], ["745", "10456", "Marshawn Lynch", "", "RB"], ["7452", "4368796", "Josh Pearson", "", "WR"], ["7457", "4043814", "Michael Dereus", "", "WR"], ["7460", "3915308", "Jake Burt", "", "TE"], ["7464", "4036949", "Connor Slomka", "", "RB"], ["7466", "3917812", "Nathan Cottrell", "", "RB"], ["7481", "3880416", "Chase Harrell", "", "TE"], ["7483", "3930097", "Farrod Green", "", "TE"], ["7496", "3929785", "Nick Westbrook-Ikhine", "IND", "WR"], ["7499", "2575891", "Paul Quessenberry", "", "TE"], ["7502", "4036129", "Dominique Dafney", "", "TE"], ["7521", "", "Chris Blair", "ATL", "WR"], ["7523", "", "Trevor Lawrence", "JAX", "QB"], ["7525", "", "DeVonta Smith", "PHI", "WR"], ["7526", "", "Jaylen Waddle", "DEN", "WR"], ["7527", "", "Mac Jones", "SF", "QB"], ["7529", "", "Gary Brightwell", "CIN", "RB"], ["7531", "", "Feleipe Franks", "CAR", "TE"], ["7535", "", "Hunter Long", "JAX", "TE"], ["7536", "", "Quintin Morris", "JAX", "TE"], ["7537", "", "Jaret Patterson", "LAC", "RB"], ["7538", "", "Zach Wilson", "NO", "QB"], ["7543", "", "Travis Etienne", "NO", "RB"], ["7547", "", "Amon-Ra St. Brown", "DET", "WR"], ["7553", "", "Kyle Pitts", "ATL", "TE"], ["7559", "", "Ihmir Smith-Marsette", "ARI", "WR"], ["7561", "", "Elijah Mitchell", "PHI", "RB"], ["7562", "", "Tutu Atwell", "MIA", "WR"], ["7564", "", "Ja'Marr Chase", "CIN", "WR"], ["7565", "", "Terrace Marshall", "MIA", "WR"], ["7567", "", "Kenny Gainwell", "TB", "RB"], ["7568", "", "Brevin Jordan", "HOU", "TE"], ["7569", "", "Nico Collins", "HOU", "WR"], ["7571", "", "Rashod Bateman", "BAL", "WR"], ["7583", "", "Sam Ehlinger", "DEN", "QB"], ["7585", "", "Davis Mills", "HOU", "QB"], ["7587", "", "Dyami Brown", "WAS", "WR"], ["7588", "", "Javonte Williams", "DAL", "RB"], ["7591", "", "Justin Fields", "KC", "QB"], ["7594", "", "Chuba Hubbard", "CAR", "RB"], ["7595", "", "Tylan Wallace", "CLE", "WR"], ["7596", "", "Elijah Moore", "PHI", "WR"], ["7597", "", "Kenny Yeboah", "ARI", "TE"], ["7600", "", "Pat Freiermuth", "PIT", "TE"], ["7602", "", "Kylen Granson", "TEN", "TE"], ["7607", "", "Michael Carter", "TEN", "RB"], ["7610", "", "Trey Lance", "LAC", "QB"], ["7611", "", "Rhamondre Stevenson", "NE", "RB"], ["7618", "", "Micah Simon", "CAR", "WR"], ["7627", "", "Greg Rousseau", "BUF", "DL"], ["7635", "", "Jaelan Phillips", "CAR", "LB"], ["7640", "", "Micah Parsons", "GB", "LB"], ["7648", "", "Nick Bolton", "KC", "LB"], ["7659", "", "Tre'von Moehrig", "CAR", "DB"], ["7666", "", "Jevon Holland", "NYG", "DB"], ["7670", "", "Joshua Palmer", "BUF", "WR"], ["7672", "", "Ernest Jones", "SEA", "LB"], ["7694", "", "Tommy Tremble", "CAR", "TE"], ["7716", "", "John Bates", "WAS", "TE"], ["7720", "", "Kene Nwangwu", "NYJ", "RB"], ["7746", "", "Austin Trammell", "JAX", "WR"], ["775", "11923", "Stephen Hauschka", "", "K"], ["7757", "", "Ben Skowronek", "PIT", "WR"], ["7811", "", "Talanoa Hufanga", "DEN", "DB"], ["7812", "", "Simi Fehoko", "ARI", "WR"], ["7828", "", "Noah Gray", "KC", "TE"], ["7839", "", "Evan McPherson", "CIN", "K"], ["7841", "", "Jamien Sherwood", "NYJ", "LB"], ["7842", "", "Luke Farrell", "SF", "TE"], ["7865", "", "Brandon Smith", "PIT", "WR"], ["7868", "", "Mason Stokke", "CAR", "RB"], ["788", "14198", "Dion Lewis", "", "RB"], ["7891", "", "Brock Wright", "DET", "TE"], ["7922", "", "Riley Patterson", "MIA", "K"], ["7933", "", "Alex Kessman", "CAR", "K"], ["7946", "", "Jack Stoll", "CLE", "TE"], ["8002", "", "Shane Buechele", "BUF", "QB"], ["8005", "", "Tarik Black", "DET", "WR"], ["801", "14145", "Charles Clay", "", "TE"], ["8013", "", "Tim Jones", "JAX", "WR"], ["8025", "", "Adam Prentice", "DEN", "RB"], ["8041", "", "Shane Zylstra", "BUF", "TE"], ["8076", "", "Michael Bandy", "DEN", "WR"], ["8088", "", "Kalif Jackson", "MIA", "TE"], ["8107", "", "Nikola Kalinic", "CHI", "TE"], ["8110", "", "Jake Ferguson", "DAL", "TE"], ["8111", "", "Cade Otton", "TB", "TE"], ["8112", "", "Drake London", "ATL", "WR"], ["8114", "", "Erik Ezukanma", "PHI", "WR"], ["8116", "", "Pierre Strong", "GB", "RB"], ["8117", "", "Jalen Tolbert", "MIA", "WR"], ["8119", "", "Jahan Dotson", "ATL", "WR"], ["812", "14215", "Lee Smith", "ATL", "TE"], ["8121", "", "Romeo Doubs", "NE", "WR"], ["8122", "", "Zonovan Knight", "ARI", "RB"], ["8125", "", "Calvin Austin", "NYG", "WR"], ["8126", "", "Wan'Dale Robinson", "TEN", "WR"], ["8127", "", "Charlie Kolar", "LAC", "TE"], ["8129", "", "Dameon Pierce", "PHI", "RB"], ["8130", "", "Trey McBride", "ARI", "TE"], ["8131", "", "Isaiah Likely", "NYG", "TE"], ["8132", "", "Tyler Allgeier", "ARI", "RB"], ["8134", "", "Khalil Shakir", "BUF", "WR"], ["8135", "", "Treylon Burks", "WAS", "WR"], ["8136", "", "Rachaad White", "WAS", "RB"], ["8137", "", "George Pickens", "DAL", "WR"], ["8138", "", "James Cook", "BUF", "RB"], ["8142", "", "Alec Pierce", "IND", "WR"], ["8143", "", "Jerome Ford", "WAS", "RB"], ["8144", "", "Chris Olave", "NO", "WR"], ["8145", "", "Jeremy Ruckert", "NYJ", "TE"], ["8146", "", "Garrett Wilson", "NYJ", "WR"], ["8147", "", "John Metchie", "CAR", "WR"], ["8148", "", "Jameson Williams", "DET", "WR"], ["815", "14471", "Nick Bellore", "WAS", "LB"], ["8150", "", "Kyren Williams", "LAR", "RB"], ["8151", "", "Kenneth Walker", "KC", "RB"], ["8154", "", "Brian Robinson", "ATL", "RB"], ["8155", "", "Breece Hall", "NYJ", "RB"], ["8157", "", "Bailey Zappe", "NYJ", "QB"], ["8160", "", "Kenny Pickett", "CAR", "QB"], ["8161", "", "Malik Willis", "MIA", "QB"], ["8162", "", "Sam Howell", "DAL", "QB"], ["8167", "", "Christian Watson", "GB", "WR"], ["8168", "", "Skyy Moore", "GB", "WR"], ["8170", "", "James Mitchell", "CAR", "TE"], ["8172", "", "Greg Dulcich", "MIA", "TE"], ["8176", "", "Danny Gray", "PHI", "WR"], ["8177", "", "Grant Calcaterra", "PHI", "TE"], ["818", "14129", "Bilal Powell", "", "RB"], ["8180", "", "Jalen Nailor", "LV", "WR"], ["8181", "", "Connor Heyward", "LV", "TE"], ["8183", "", "Brock Purdy", "SF", "QB"], ["8188", "", "Tyquan Thornton", "KC", "WR"], ["8195", "", "Ronnie Rivers", "LAR", "RB"], ["8200", "", "Kevin Austin", "NO", "WR"], ["8204", "", "Bo Melton", "GB", "WR"], ["8205", "", "Isiah Pacheco", "DET", "RB"], ["8206", "", "Skylar Thompson", "BAL", "QB"], ["8207", "", "Tyler Goodson", "ATL", "RB"], ["8208", "", "Tyler Badie", "DEN", "RB"], ["8210", "", "Chig Okonkwo", "WAS", "TE"], ["8214", "", "Cole Turner", "MIA", "TE"], ["8219", "", "Jelani Woods", "NYJ", "TE"], ["8220", "", "Sincere McCormick", "SF", "RB"], ["8223", "", "Velus Jones", "SEA", "WR"], ["8225", "", "Daniel Bellinger", "TEN", "TE"], ["8227", "", "Teagan Quitoriano", "ARI", "TE"], ["8228", "", "Jaylen Warren", "PIT", "RB"], ["8230", "", "Ty Chandler", "NO", "RB"], ["8235", "", "Samori Toure", "PHI", "WR"], ["8249", "", "Lucas Krull", "DEN", "TE"], ["8250", "", "Tay Martin", "DET", "WR"], ["8254", "", "Julius Chestnut", "TEN", "RB"], ["8258", "", "Cade York", "NYJ", "K"], ["8259", "", "Cameron Dicker", "LAC", "K"], ["8265", "", "Travon Walker", "JAX", "LB"], ["8266", "", "Quay Walker", "LV", "LB"], ["827", "14163", "Tyrod Taylor", "GB", "QB"], ["8280", "", "Nik Bonitto", "DEN", "LB"], ["8289", "", "Aidan Hutchinson", "DET", "DL"], ["829", "14012", "Andy Dalton", "PHI", "QB"], ["830", "13983", "A.J. Green", "", "WR"], ["8311", "", "Terrel Bernard", "BUF", "LB"], ["8314", "", "Jalen Pitre", "HOU", "DB"], ["8323", "", "Jaquan Brisker", "PIT", "DB"], ["8329", "", "Devin Lloyd", "CAR", "LB"], ["8330", "", "Quentin Lake", "LAR", "DB"], ["8339", "", "Kyle Hamilton", "BAL", "DB"], ["8348", "", "Kerby Joseph", "DET", "DB"], ["8355", "", "Kayvon Thibodeaux", "NYG", "DL"], ["8363", "", "Jack Sanborn", "CHI", "LB"], ["8392", "", "Nick Cross", "WAS", "DB"], ["8408", "", "Jordan Mason", "MIN", "RB"], ["8413", "", "Chris Oladokun", "KC", "QB"], ["8414", "", "Britain Covey", "PHI", "WR"], ["8416", "", "Jalen Virgil", "BUF", "WR"], ["8423", "", "Brittain Brown", "CHI", "RB"], ["843", "13977", "Cameron Heyward", "PIT", "DL"], ["8484", "", "Ko Kieft", "TB", "TE"], ["8489", "", "Drew Ogletree", "IND", "TE"], ["8527", "", "Dareke Young", "LV", "WR"], ["8583", "", "Stone Smartt", "PHI", "TE"], ["862", "13987", "Blaine Gabbert", "", "QB"], ["8676", "", "Rashid Shaheed", "SEA", "WR"], ["8698", "", "Jake Tonges", "SF", "TE"], ["8745", "", "Lance McCutcheon", "TEN", "WR"], ["8755", "", "Kaden Davis", "CHI", "WR"], ["8756", "", "Brandon Johnson", "LV", "WR"], ["8783", "", "Kendric Pryor", "CIN", "WR"], ["8799", "", "Zaire Mitchell-Paden", "NO", "TE"], ["8800", "", "Malik Davis", "DAL", "RB"], ["8801", "", "Dennis Houston", "TB", "WR"], ["8849", "", "Tanner Conner", "NYG", "TE"], ["886", "14167", "Taiwan Jones", "", "RB"], ["8861", "", "Irv Charles", "SEA", "WR"], ["89", "11291", "Chad Henne", "", "QB"], ["8917", "", "KaVontae Turpin", "DAL", "WR"], ["8921", "", "Maurice Alexander", "CHI", "WR"], ["8932", "", "Lucas Havrisik", "GB", "K"], ["899", "14322", "Dan Bailey", "", "K"], ["9220", "", "Evan Hull", "HOU", "RB"], ["9221", "", "Jahmyr Gibbs", "DET", "RB"], ["9224", "", "Chase Brown", "CIN", "RB"], ["9225", "", "Tank Bigsby", "PHI", "RB"], ["9226", "", "De'Von Achane", "MIA", "RB"], ["9227", "", "Israel Abanikanda", "DAL", "RB"], ["9228", "", "Bryce Young", "CAR", "QB"], ["9229", "", "Anthony Richardson", "IND", "QB"], ["9230", "", "Tanner McKee", "PHI", "QB"], ["928", "14053", "Randall Cobb", "", "WR"], ["943", "14054", "Kyle Rudolph", "", "TE"], ["947", "13982", "Julio Jones", "", "WR"], ["9479", "", "Darnell Washington", "PIT", "TE"], ["9480", "", "Brenton Strange", "JAX", "TE"], ["9481", "", "Luke Musgrave", "GB", "TE"], ["9482", "", "Michael Mayer", "LV", "TE"], ["9484", "", "Tucker Kraft", "GB", "TE"], ["9486", "", "Dontayvion Wicks", "PHI", "WR"], ["9487", "", "Parker Washington", "JAX", "WR"], ["9488", "", "Jaxon Smith-Njigba", "SEA", "WR"], ["9490", "", "Tyler Scott", "LAR", "WR"], ["9492", "", "Trey Palmer", "NO", "WR"], ["9493", "", "Puka Nacua", "LAR", "WR"], ["9494", "", "Marvin Mims", "DEN", "WR"], ["9497", "", "Jalin Hyatt", "NYG", "WR"], ["9500", "", "Josh Downs", "IND", "WR"], ["9501", "", "DeMario Douglas", "NE", "WR"], ["9502", "", "Tank Dell", "HOU", "WR"], ["9504", "", "Kayshon Boutte", "NE", "WR"], ["9506", "", "Sean Tucker", "TB", "RB"], ["9508", "", "Tyjae Spears", "TEN", "RB"], ["9509", "", "Bijan Robinson", "ATL", "RB"], ["9510", "", "Lew Nichols", "PIT", "RB"], ["9511", "", "Keaton Mitchell", "LAC", "RB"], ["954", "13994", "Cam Newton", "", "QB"], ["957", "13971", "Cameron Jordan", "NO", "DL"], ["96", "8439", "Aaron Rodgers", "PIT", "QB"], ["963", "14099", "Luke Stocker", "", "TE"], ["964", "14007", "Lance Kendricks", "", "TE"], ["973", "14135", "Anthony Sherman", "", "RB"], ["9753", "", "Zach Charbonnet", "SEA", "RB"], ["9754", "", "Quentin Johnston", "LAC", "WR"], ["9756", "", "Jordan Addison", "MIN", "WR"], ["9757", "", "Kendre Miller", "NO", "RB"], ["9758", "", "C.J. Stroud", "HOU", "QB"], ["9997", "", "Zay Flowers", "BAL", "WR"], ["9998", "", "Hendon Hooker", "TEN", "QB"], ["9999", "", "Will Levis", "TEN", "QB"], ["ARI", "", "Arizona Cardinals", "ARI", "DEF"], ["ATL", "", "Atlanta Falcons", "ATL", "DEF"], ["BAL", "", "Baltimore Ravens", "BAL", "DEF"], ["BUF", "", "Buffalo Bills", "BUF", "DEF"], ["CAR", "", "Carolina Panthers", "CAR", "DEF"], ["CHI", "", "Chicago Bears", "CHI", "DEF"], ["CIN", "", "Cincinnati Bengals", "CIN", "DEF"], ["CLE", "", "Cleveland Browns", "CLE", "DEF"], ["DAL", "", "Dallas Cowboys", "DAL", "DEF"], ["DEN", "", "Denver Broncos", "DEN", "DEF"], ["DET", "", "Detroit Lions", "DET", "DEF"], ["GB", "", "Green Bay Packers", "GB", "DEF"], ["HOU", "", "Houston Texans", "HOU", "DEF"], ["IND", "", "Indianapolis Colts", "IND", "DEF"], ["JAX", "", "Jacksonville Jaguars", "JAX", "DEF"], ["KC", "", "Kansas City Chiefs", "KC", "DEF"], ["LAC", "", "Los Angeles Chargers", "LAC", "DEF"], ["LAR", "", "Los Angeles Rams", "LAR", "DEF"], ["LV", "", "Las Vegas Raiders", "LV", "DEF"], ["MIA", "", "Miami Dolphins", "MIA", "DEF"], ["MIN", "", "Minnesota Vikings", "MIN", "DEF"], ["NE", "", "New England Patriots", "NE", "DEF"], ["NO", "", "New Orleans Saints", "NO", "DEF"], ["NYG", "", "New York Giants", "NYG", "DEF"], ["NYJ", "", "New York Jets", "NYJ", "DEF"], ["PHI", "", "Philadelphia Eagles", "PHI", "DEF"], ["PIT", "", "Pittsburgh Steelers", "PIT", "DEF"], ["SEA", "", "Seattle Seahawks", "SEA", "DEF"], ["SF", "", "San Francisco 49ers", "SF", "DEF"], ["TB", "", "Tampa Bay Buccaneers", "TB", "DEF"], ["TEN", "", "Tennessee Titans", "TEN", "DEF"], ["WAS", "", "Washington Commanders", "WAS", "DEF"]] };

  // ../shared/playerIdentityLookup.ts
  var artifact = sleeperPlayerLookup_compact_default;
  var cachedIndex = null;
  function getDefaultPlayerIdentityIndex() {
    if (!cachedIndex) {
      cachedIndex = createPlayerIdentityIndex(artifact);
    }
    return cachedIndex;
  }
  function resolvePlayerIdentityDefault(query) {
    return resolvePlayerIdentity(query, getDefaultPlayerIdentityIndex());
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/adapters/espnAdapter.ts
  function enrichEspnPickIdentity(args) {
    const resolved = resolvePlayerIdentityDefault({
      espnPlayerId: args.playerId,
      playerName: args.playerName,
      nflTeam: args.nflTeam,
      position: args.position
    });
    const sleeperUrl = sleeperPlayerHeadshotUrl(resolved.sleeperPlayerId);
    return {
      playerId: args.playerId || resolved.espnPlayerId || void 0,
      headshotUrl: sleeperUrl || args.headshotUrl || resolved.headshotUrl || void 0
    };
  }
  var POS_RE = /\b(QB|RB|WR|TE|K|PK|DST|DEF|D\/ST|DL|LB|DB|DP)\b/i;
  var ROUND_PICK_RE = /(?:R(?:ound)?\s*)?(\d+)\D{1,6}(?:P(?:ick)?\s*)?(\d+)/i;
  var OVERALL_RE = /(?:overall|#)\s*(\d+)/i;
  function scorePickHistoryColumn(el2) {
    const text = (el2.textContent || "").slice(0, 8e3);
    let score = 0;
    if (/pick\s*history|draft\s*history/i.test(text.slice(0, 400))) score += 50;
    if (/available|player pool|search players/i.test(text.slice(0, 400))) score -= 40;
    const roundHits = (text.match(/\bR(?:ound)?\s*\d+/gi) || []).length;
    score += Math.min(40, roundHits * 2);
    const posHits = (text.match(POS_RE) || []).length;
    score += Math.min(30, posHits);
    const children = el2.querySelectorAll("*");
    let leafish = 0;
    for (let i = 0; i < Math.min(children.length, 400); i++) {
      const c = children[i];
      const t = (c.textContent || "").trim();
      if (t.length > 8 && t.length < 120 && POS_RE.test(t) && /[A-Za-z]/.test(t)) {
        leafish += 1;
      }
    }
    score += Math.min(40, leafish);
    return score;
  }
  function findEspnPickHistoryRoot(doc) {
    const direct = doc.querySelector(".pick-history") || doc.querySelector("[class*='pick-history']");
    if (direct) return direct;
    const columnsRoot = doc.querySelector(".draft-columns") || doc.querySelector("[class*='draft-columns']") || doc.querySelector("[class*='draftColumns']");
    if (columnsRoot) {
      const children = [...columnsRoot.children];
      if (children.length === 0) {
        if (scorePickHistoryColumn(columnsRoot) >= 20) return columnsRoot;
      } else {
        let best2 = null;
        let bestScore2 = -Infinity;
        for (const child of children) {
          const s = scorePickHistoryColumn(child);
          if (s > bestScore2) {
            bestScore2 = s;
            best2 = child;
          }
        }
        if (best2 && bestScore2 >= 15) return best2;
      }
    }
    const candidates = [
      ...doc.querySelectorAll(
        "[aria-label*='Pick History' i], [aria-label*='Draft History' i], [class*='pickHistory' i], [class*='PickHistory' i], [class*='draftHistory' i]"
      )
    ];
    let best = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const s = scorePickHistoryColumn(c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && bestScore >= 10) return best;
    return null;
  }
  function parseEspnPickLeafText(text, sourceSequence) {
    const raw = text.replace(/\s+/g, " ").trim();
    if (raw.length < 5 || raw.length > 200) return null;
    if (/^round\s*\d+$/i.test(raw)) return null;
    if (/available|search|filter/i.test(raw)) return null;
    const keeperStatusKnown = /keeper/i.test(raw);
    const isKeeper = keeperStatusKnown && /\bkeeper\b/i.test(raw);
    const rp = raw.match(ROUND_PICK_RE);
    const overallM = raw.match(OVERALL_RE);
    const posM = raw.match(POS_RE);
    if (!posM && !rp) return null;
    let working = raw;
    if (isKeeper) working = working.replace(/\bkeeper\b/gi, " ").replace(/\s+/g, " ").trim();
    const position = posM ? normalizeEspnPos(posM[1]) : void 0;
    let fantasyTeamName = "";
    let playerPart = working;
    const nameTeamPos = working.match(
      /^(.+?)\s+([A-Z]{2,4})(?:,\s*|\s+)(QB|RB|WR|TE|K|PK|DST|DEF|D\/ST|DL|LB|DB|DP)\b(.*)$/i
    );
    let playerName = "";
    let nflTeam;
    if (nameTeamPos) {
      playerName = nameTeamPos[1].trim();
      nflTeam = nameTeamPos[2].toUpperCase();
      const rest = nameTeamPos[4].trim();
      fantasyTeamName = stripRoundTokens(rest);
    } else {
      const idx = posM ? working.search(POS_RE) : -1;
      if (idx > 0) {
        const left = working.slice(0, idx).trim();
        const right = working.slice(idx).replace(POS_RE, "").trim();
        const leftParts = left.split(/\s+/);
        if (leftParts.length >= 2 && /^[A-Z]{2,4}$/.test(leftParts[leftParts.length - 1])) {
          nflTeam = leftParts.pop().toUpperCase();
        }
        playerName = leftParts.join(" ");
        fantasyTeamName = stripRoundTokens(right);
      } else {
        return null;
      }
    }
    playerName = playerName.replace(/,$/, "").trim();
    if (!playerName || playerName.length < 2) return null;
    const round = rp ? Math.max(1, Math.floor(Number(rp[1]))) : 1;
    const pickInRound = rp ? Math.max(1, Math.floor(Number(rp[2]))) : void 0;
    const overallPick = overallM ? Math.max(1, Math.floor(Number(overallM[1]))) : void 0;
    fantasyTeamName = fantasyTeamName.replace(OVERALL_RE, "").replace(/\bP#?\s*\d+\b/gi, "").replace(/\s+/g, " ").trim();
    if (!fantasyTeamName) fantasyTeamName = "Unknown Team";
    return {
      playerName,
      nflTeam,
      position: position || (posM ? normalizeEspnPos(posM[1]) : void 0),
      round,
      pickInRound,
      overallPick,
      fantasyTeamName,
      isKeeper,
      keeperStatusKnown,
      rawText: raw,
      sourceSequence
    };
  }
  function stripRoundTokens(s) {
    return s.replace(ROUND_PICK_RE, " ").replace(/\bR(?:ound)?\s*\d+\b/gi, " ").replace(/\bP(?:ick)?\s*\d+\b/gi, " ").replace(/\s+/g, " ").trim();
  }
  function normalizeEspnPos(pos) {
    const p = pos.toUpperCase();
    if (p === "DST" || p === "DEF") return "D/ST";
    if (p === "PK") return "K";
    return p;
  }
  function extractEspnPickRecords(root) {
    const records = [];
    const seen = /* @__PURE__ */ new Set();
    const nodes = root.querySelectorAll("li, tr, [class*='pick'], [class*='Pick'], div, span");
    let seq = 0;
    for (let i = 0; i < nodes.length; i++) {
      const el2 = nodes[i];
      if (el2.children.length > 3) continue;
      const text = (el2.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 8 || text.length > 160) continue;
      let childHasSame = false;
      for (const ch of Array.from(el2.children)) {
        if ((ch.textContent || "").replace(/\s+/g, " ").trim() === text) {
          childHasSame = true;
          break;
        }
      }
      if (childHasSame) continue;
      const parsed = parseEspnPickLeafText(text, seq);
      if (!parsed) continue;
      const dedupe = `${parsed.round}|${parsed.pickInRound ?? ""}|${parsed.playerName}|${parsed.fantasyTeamName}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      records.push({ ...parsed, sourceSequence: seq++ });
    }
    if (records.length === 0) {
      const lines = (root.textContent || "").split(/\n+/);
      for (const line of lines) {
        const parsed = parseEspnPickLeafText(line, seq);
        if (!parsed) continue;
        const dedupe = `${parsed.round}|${parsed.pickInRound ?? ""}|${parsed.playerName}|${parsed.fantasyTeamName}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        records.push({ ...parsed, sourceSequence: seq++ });
      }
    }
    return records;
  }
  function extractEspnGridRecords(root) {
    const matched = [
      ...root.querySelectorAll(".pick-history-table, [class*='pick-history-table']")
    ];
    const tables = matched.filter((t) => !matched.some((o) => o !== t && t.contains(o)));
    if (tables.length === 0) return [];
    const records = [];
    const seen = /* @__PURE__ */ new Set();
    let seq = 0;
    for (const table of Array.from(tables)) {
      const captionText = (table.querySelector(".caption, [class*='caption']")?.textContent || "").trim();
      const roundM = captionText.match(/round\s*(\d+)/i);
      if (!roundM) continue;
      const round = Math.max(1, Math.floor(Number(roundM[1])));
      const rows = table.querySelectorAll("[role='row']");
      for (const row of Array.from(rows)) {
        const playerCol = row.querySelector(".player-column, [class*='player-column']");
        if (!playerCol) continue;
        const playerName = (playerCol.querySelector(".playerinfo__playername")?.textContent || "").replace(/\s+/g, " ").trim();
        if (!playerName) continue;
        const nflTeamRaw = (playerCol.querySelector(".playerinfo__playerteam")?.textContent || "").trim().toUpperCase();
        const posRaw = (playerCol.querySelector(".positionPill, [class*='positionPill'], .playerinfo__playerpos")?.textContent || "").trim();
        let headshotUrl;
        let espnPlayerId;
        for (const img of Array.from(playerCol.querySelectorAll("img"))) {
          const src = img.getAttribute("src") || "";
          const m = src.match(/headshots\/nfl\/players\/full\/(\d+)\.png/i);
          if (m) {
            espnPlayerId = m[1];
            headshotUrl = src;
            break;
          }
        }
        let overallPick;
        let fantasyTeamName = "";
        const cells = row.querySelectorAll(".public_fixedDataTableCell_cellContent");
        for (const cell2 of Array.from(cells)) {
          if (playerCol.contains(cell2) || cell2.contains(playerCol)) continue;
          const t = (cell2.textContent || "").replace(/\s+/g, " ").trim();
          if (!t) continue;
          if (/^\d{1,3}$/.test(t)) {
            if (overallPick == null) overallPick = Math.floor(Number(t));
            continue;
          }
          if (/^[\d.,-]+$/.test(t)) continue;
          if (!fantasyTeamName) fantasyTeamName = t;
        }
        if (!fantasyTeamName) fantasyTeamName = "Unknown Team";
        const rowText = (row.textContent || "").replace(/\s+/g, " ").trim();
        const keeperStatusKnown = /keeper/i.test(rowText);
        const isKeeper = keeperStatusKnown && /\bkeeper\b/i.test(rowText);
        const dedupe = `${round}|${overallPick ?? ""}|${playerName}|${fantasyTeamName}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        records.push({
          playerName,
          playerId: espnPlayerId,
          headshotUrl,
          nflTeam: /^[A-Z]{2,4}$/.test(nflTeamRaw) ? nflTeamRaw : void 0,
          position: posRaw ? normalizeEspnPos(posRaw) : void 0,
          round,
          pickInRound: void 0,
          // derived later from overall + team count
          overallPick,
          fantasyTeamName,
          isKeeper,
          keeperStatusKnown,
          rawText: rowText.slice(0, 160),
          sourceSequence: seq++
        });
      }
    }
    return records;
  }
  function buildEspnFingerprint(args) {
    if (args.leagueId) {
      return `espn:league:${args.leagueId}:${args.seasonId ?? ""}`;
    }
    const teams = args.teamNames.slice().sort().join("|");
    const urlBit = String(args.href ?? "").replace(/https?:\/\/[^/]+/i, "").slice(0, 80);
    return `espn:fp:${args.draftName ?? "draft"}:${args.teamNames.length}:${hashStr(teams + urlBit)}`;
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (h >>> 0).toString(36);
  }
  function observeEspnFromDocument(doc, opts) {
    const href = opts?.href ?? "";
    const url = safeUrl(href);
    const leagueId = url?.searchParams.get("leagueId") || textMatch(doc.body?.innerText || "", /leagueId[=:](\d+)/i)?.[1] || null;
    const seasonId = url?.searchParams.get("seasonId") || textMatch(doc.body?.innerText || "", /seasonId[=:](\d+)/i)?.[1] || null;
    const pickRoot = findEspnPickHistoryRoot(doc);
    if (!pickRoot) {
      const teamsOnly = detectEspnTeamsFromPage(doc);
      if (teamsOnly.length > 0) {
        const fingerprint2 = buildEspnFingerprint({
          leagueId,
          seasonId,
          teamNames: teamsOnly.map((t) => t.teamName),
          href
        });
        const bodyText2 = pageText(doc);
        let status2 = "NOT_STARTED";
        if (/draft is complete|your draft is complete|draft complete/i.test(bodyText2)) status2 = "COMPLETE";
        else if (/on the clock|your turn/i.test(bodyText2)) status2 = "ACTIVE";
        return {
          ok: true,
          pickHistoryFound: false,
          sourcePickCount: 0,
          snapshot: {
            source: "espn",
            draftId: leagueId ? `espn-live-${leagueId}-${seasonId || "na"}` : void 0,
            draftName: detectDraftName(doc),
            status: status2,
            teamCount: teamsOnly.length,
            teams: teamsOnly,
            picks: [],
            lastUpdatedAt: opts?.nowIso ?? (/* @__PURE__ */ new Date()).toISOString(),
            draftFingerprint: fingerprint2
          }
        };
      }
      return { ok: false, error: "ESPN Pick History not found", pickHistoryFound: false };
    }
    const gridRecords = extractEspnGridRecords(pickRoot);
    const usingGrid = gridRecords.length > 0;
    const records = usingGrid ? gridRecords : extractEspnPickRecords(pickRoot);
    let teams;
    if (usingGrid) {
      const r1 = records.filter((r) => r.round === 1 && r.fantasyTeamName !== "Unknown Team").sort((a, b) => (a.overallPick ?? 999) - (b.overallPick ?? 999));
      const ordered = unique(r1.map((r) => r.fantasyTeamName));
      for (const n2 of unique(records.map((r) => r.fantasyTeamName))) {
        if (n2 !== "Unknown Team" && !ordered.some((o) => norm2(o) === norm2(n2))) ordered.push(n2);
      }
      teams = ordered.map((name, i) => ({
        teamId: `espn-team:${slug(name)}`,
        teamName: name,
        draftSlot: i + 1
      }));
      const n = teams.length;
      if (n > 0) {
        for (const rec of records) {
          if (rec.pickInRound == null && rec.overallPick != null) {
            rec.pickInRound = rec.overallPick - (rec.round - 1) * n;
            if (rec.pickInRound < 1 || rec.pickInRound > n) rec.pickInRound = void 0;
          }
        }
      }
    } else {
      const teamNames = unique(
        records.map((r) => r.fantasyTeamName).filter((n) => n && n !== "Unknown Team")
      );
      teams = teamNames.map((name, i) => ({
        teamId: `espn-team:${slug(name)}`,
        teamName: name,
        draftSlot: i + 1
      }));
    }
    const pageTeams = usingGrid ? [] : detectEspnTeamsFromPage(doc);
    if (pageTeams.length >= teams.length && pageTeams.length > 0) {
      teams = pageTeams;
    } else if (pageTeams.length > 0) {
      const byNorm = new Map(pageTeams.map((t) => [norm2(t.teamName), t]));
      teams = teams.map(({ teamName: name }, i) => {
        const hit = byNorm.get(norm2(name));
        return hit || {
          teamId: `espn-team:${slug(name)}`,
          teamName: name,
          draftSlot: i + 1
        };
      });
    }
    let userTeamNote = "off (auto): no team selector found";
    try {
      const userName = detectEspnUserTeamName(doc);
      if (userName) {
        const un = norm2(userName);
        const matches = teams.filter((t) => norm2(t.teamName) === un);
        if (matches.length === 1) {
          matches[0].isUserTeam = true;
          userTeamNote = `auto: "${matches[0].teamName}" (roster selector)`;
        } else {
          userTeamNote = `auto: no highlight (${matches.length} matches for "${userName}")`;
        }
      }
    } catch (e) {
      userTeamNote = `auto: detection error (ignored)`;
    }
    const fingerprint = buildEspnFingerprint({
      leagueId,
      seasonId,
      draftName: detectDraftName(doc),
      teamNames: teams.map((t) => t.teamName),
      href
    });
    const draftId = leagueId ? `espn-live-${leagueId}-${seasonId || "na"}` : void 0;
    const nowIso = opts?.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
    const picks = [];
    for (const rec of records) {
      const owner = resolveCurrentOwner({
        currentTeamName: rec.fantasyTeamName,
        teams
      });
      let overall = rec.overallPick;
      if (overall == null && rec.pickInRound != null && teams.length > 0) {
        overall = (rec.round - 1) * teams.length + rec.pickInRound;
      }
      const eventKey = buildEventKey({
        source: "espn",
        draftId: draftId || fingerprint,
        overallPick: overall,
        round: rec.round,
        pickInRound: rec.pickInRound,
        teamId: owner.currentTeamId,
        teamName: owner.currentTeamName,
        playerName: rec.playerName
      });
      const identity = enrichEspnPickIdentity({
        playerName: rec.playerName,
        playerId: rec.playerId,
        headshotUrl: rec.headshotUrl,
        nflTeam: rec.nflTeam,
        position: rec.position
      });
      picks.push({
        eventKey,
        source: "espn",
        draftId,
        overallPick: overall,
        round: rec.round,
        pickInRound: rec.pickInRound,
        currentTeamId: owner.currentTeamId,
        currentTeamName: owner.currentTeamName,
        playerName: rec.playerName,
        playerId: identity.playerId,
        headshotUrl: identity.headshotUrl,
        nflTeam: rec.nflTeam,
        position: rec.position,
        isKeeper: rec.isKeeper,
        isTradedPick: false,
        // set below if slot evidence appears
        isLiveSelection: !rec.isKeeper,
        keeperStatusKnown: rec.keeperStatusKnown,
        sourceSequence: rec.sourceSequence,
        sourceTimestamp: nowIso
      });
    }
    if (!usingGrid) {
      annotateTradesFromSnakeMismatch(picks, teams);
    }
    const bodyText = pageText(doc);
    let status = "UNKNOWN";
    if (/draft is complete|your draft is complete|draft complete/i.test(bodyText) || /draft is complete|your draft is complete|draft complete/i.test(pickRoot.textContent || "")) {
      status = "COMPLETE";
    } else if (picks.length === 0) {
      status = "NOT_STARTED";
    } else if (/paused|draft paused/i.test(bodyText)) {
      status = "PAUSED";
    } else {
      status = "ACTIVE";
    }
    const roundCount = picks.length ? Math.max(...picks.map((p) => p.round)) : void 0;
    const userTeam = teams.find((t) => t.isUserTeam);
    return {
      ok: true,
      pickHistoryFound: true,
      sourcePickCount: records.length,
      snapshot: {
        source: "espn",
        draftId,
        draftName: detectDraftName(doc),
        status,
        teamCount: teams.length,
        roundCount,
        teams,
        picks,
        currentOverallPick: status === "COMPLETE" ? void 0 : picks.length ? Math.max(...picks.map((p) => p.overallPick ?? 0)) + 1 : 1,
        userTeamId: userTeam?.teamId,
        userTeamNote,
        lastUpdatedAt: nowIso,
        draftFingerprint: fingerprint
      }
    };
  }
  function annotateTradesFromSnakeMismatch(picks, teams) {
    if (teams.length < 2) return;
    const bySlot = new Map(
      teams.filter((t) => t.draftSlot != null).map((t) => [t.draftSlot, t])
    );
    if (bySlot.size !== teams.length) return;
    for (const p of picks) {
      if (p.pickInRound == null) continue;
      const n = teams.length;
      const round = p.round;
      const pir = p.pickInRound;
      const slot = round % 2 === 1 ? pir : n - pir + 1;
      const original = bySlot.get(slot);
      if (!original) continue;
      if (original.teamId !== p.currentTeamId && norm2(original.teamName) !== norm2(p.currentTeamName)) {
        p.isTradedPick = true;
        p.originalTeamId = original.teamId;
        p.originalTeamName = original.teamName;
        p.originalDraftSlot = slot;
      }
    }
  }
  function detectEspnUserTeamName(doc) {
    for (const sel of Array.from(doc.querySelectorAll("select"))) {
      const s = sel;
      const opts = Array.from(s.options || []);
      if (opts.length < 2) continue;
      if (opts.some((o) => /^round\s*\d+$|all rounds/i.test((o.textContent || "").trim()))) continue;
      const selected = s.selectedOptions && s.selectedOptions[0] || opts.find((o) => o.selected) || opts[s.selectedIndex] || null;
      const name = (selected?.textContent || "").replace(/\s+/g, " ").trim();
      if (name && name.length > 2 && !/^(select|choose|view)/i.test(name)) return name;
    }
    return null;
  }
  function detectEspnTeamsFromPage(doc) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const nodes = doc.querySelectorAll(
      "[class*='teamName'], [class*='TeamName'], [class*='roster'], [data-team-id]"
    );
    let slot = 1;
    for (const el2 of Array.from(nodes).slice(0, 40)) {
      const name = (el2.textContent || "").replace(/\s+/g, " ").trim();
      if (name.length < 2 || name.length > 40) continue;
      if (/round|pick|overall|available|qb|rb|wr/i.test(name)) continue;
      const key = norm2(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const teamId = el2.getAttribute("data-team-id") || `espn-team:${slug(name)}`;
      const isUser = /your team|you$/i.test(name) || el2.className.toString().toLowerCase().includes("user");
      out.push({
        teamId,
        teamName: name,
        draftSlot: slot++,
        isUserTeam: isUser
      });
    }
    return out;
  }
  function detectDraftName(doc) {
    const title = doc.title?.trim();
    if (title && !/^espn/i.test(title)) return title.slice(0, 80);
    const h = doc.querySelector("h1, h2, .league-name, [class*='leagueName']");
    const t = h?.textContent?.replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 80) : void 0;
  }
  function observeEspn(win) {
    return observeEspnFromDocument(win.document, {
      href: win.location?.href
    });
  }
  function pageText(doc) {
    return doc.body?.innerText || doc.body?.textContent || doc.documentElement?.textContent || "";
  }
  function safeUrl(href) {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  }
  function textMatch(text, re) {
    return text.match(re);
  }
  function unique(arr) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const a of arr) {
      const k = norm2(a);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
    }
    return out;
  }
  function norm2(s) {
    return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function slug(s) {
    return norm2(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "team";
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/adapters/fantasyProsAdapter.ts
  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function str(v, fallback = "") {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return fallback;
  }
  function readFantasyProsDebugStore(win) {
    try {
      const store = win.__debugStore;
      if (!store || !store.draftState) return null;
      return store;
    } catch {
      return null;
    }
  }
  function buildFantasyProsFingerprint(args) {
    if (args.mockDraftKey) return `fantasypros:mdk:${args.mockDraftKey}`;
    if (args.dcId) return `fantasypros:dc:${args.dcId}`;
    const teams = args.teamIds.slice().sort().join(",");
    return `fantasypros:fp:${args.draftName ?? "unnamed"}:${args.teamCount}:${teams}`;
  }
  function observeFantasyProsFromStore(store, opts) {
    const ds = store.draftState;
    if (!ds || typeof ds !== "object") {
      return { ok: false, error: "FantasyPros draft state not found" };
    }
    const drafted = Array.isArray(ds.draftedPlayers) ? ds.draftedPlayers : null;
    if (!drafted) {
      return { ok: false, error: "FantasyPros draftedPlayers unavailable" };
    }
    const vueTarget = str(store.vueDraftTarget ?? ds.vueDraftTarget, "local");
    if (vueTarget && vueTarget !== "local") {
      return { ok: false, error: `Unsupported vueDraftTarget: ${vueTarget}` };
    }
    if (store.isMultiUserDraft === true || ds.isMultiUserDraft === true) {
      return { ok: false, error: "Multi-user FantasyPros draft not supported in standalone monitor" };
    }
    const playerMap = (store.playerMap && typeof store.playerMap === "object" ? store.playerMap : null) || (ds.playerMap && typeof ds.playerMap === "object" ? ds.playerMap : {}) || {};
    const mockDraftKey = str(ds.mockDraftKey) || str(store.mockDraftKey) || null;
    const dcId = str(ds.dcId) || str(store.dcId) || null;
    const draftId = mockDraftKey ? `fp-mock-${mockDraftKey}` : dcId ? `fp-mock-${dcId}` : void 0;
    const teamsRaw = Array.isArray(ds.teams) ? ds.teams : [];
    const teams = extractTeams(teamsRaw, drafted);
    const teamCount = num(ds.teamCount, 0) || teams.length || maxOwnerPos(drafted) + 1;
    const ensuredTeams = teams.length > 0 ? teams : Array.from({ length: Math.max(teamCount, 0) }, (_, i) => ({
      teamId: `seat-${i}`,
      teamName: `Team ${i + 1}`,
      draftSlot: i + 1
    }));
    const draftName = str(ds.title) || str(ds.draftName) || str(ds.leagueName) || void 0;
    const fingerprint = buildFantasyProsFingerprint({
      mockDraftKey,
      dcId,
      draftName: draftName ?? null,
      teamCount: ensuredTeams.length,
      teamIds: ensuredTeams.map((t) => t.teamId)
    });
    const nowIso = opts?.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
    const picks = [];
    let seq = 0;
    for (const row of drafted) {
      if (!row || typeof row !== "object") continue;
      const r = row;
      const playerId = str(r.id);
      const overallPick = Math.floor(num(r.pick, 0));
      if (!playerId || overallPick < 1) continue;
      const round = Math.max(1, Math.floor(num(r.round, 1)));
      const pickInRound = Math.max(1, Math.floor(num(r.posInRound, 1)));
      const ownerPos = Math.floor(num(r.ownerPos, -1));
      const ownerLabel = str(r.owner);
      const isKeeper = Boolean(r.isKeeper);
      const keeperStatusKnown = Object.prototype.hasOwnProperty.call(r, "isKeeper");
      const pm = playerMap[playerId] || playerMap[String(Number(playerId))];
      const playerName = str(pm?.name) || [str(pm?.first_name), str(pm?.last_name)].filter(Boolean).join(" ") || `Player ${playerId}`;
      const position = normalizePos(str(pm?.position));
      const nflTeam = str(pm?.team) || void 0;
      const seat = ownerPos >= 0 ? ensuredTeams.find((t) => t.draftSlot === ownerPos + 1) || ensuredTeams[ownerPos] : void 0;
      const owner = resolveCurrentOwner({
        currentTeamId: seat?.teamId ?? (ownerPos >= 0 ? `seat-${ownerPos}` : void 0),
        currentTeamName: seat?.teamName ?? (ownerLabel || void 0),
        originalDraftSlot: ownerPos >= 0 ? ownerPos + 1 : void 0,
        teams: ensuredTeams
      });
      const tradeMeta = r.tradedFrom != null || r.originalOwnerPos != null;
      const originalOwnerPos = r.originalOwnerPos != null ? Math.floor(num(r.originalOwnerPos, ownerPos)) : ownerPos;
      const traded = tradeMeta && originalOwnerPos !== ownerPos ? true : owner.isTradedPick;
      const eventKey = buildEventKey({
        source: "fantasypros",
        sourceEventId: `${draftId ?? fingerprint}:${overallPick}:${playerId}`,
        draftId,
        overallPick,
        round,
        pickInRound,
        teamId: owner.currentTeamId,
        playerId,
        teamName: owner.currentTeamName,
        playerName
      });
      picks.push({
        eventKey,
        source: "fantasypros",
        draftId,
        overallPick,
        round,
        pickInRound,
        originalDraftSlot: originalOwnerPos >= 0 ? originalOwnerPos + 1 : void 0,
        currentTeamId: owner.currentTeamId,
        currentTeamName: owner.currentTeamName,
        currentOwnerName: ownerLabel || void 0,
        originalTeamId: owner.originalTeamId,
        originalTeamName: owner.originalTeamName,
        playerId,
        playerName,
        nflTeam,
        position,
        isKeeper,
        isTradedPick: traded,
        isLiveSelection: !isKeeper,
        keeperStatusKnown,
        sourceSequence: seq++,
        sourceTimestamp: nowIso
      });
    }
    const draftComplete = Boolean(ds.draftComplete || ds.isComplete);
    const overallPickCursor = num(ds.overallPick || ds.pick, picks.length);
    let status = "UNKNOWN";
    if (draftComplete) status = "COMPLETE";
    else if (picks.length === 0 && overallPickCursor <= 1) status = "NOT_STARTED";
    else if (picks.length > 0) status = "ACTIVE";
    else status = "NOT_STARTED";
    if (ds.paused === true || ds.isPaused === true) status = "PAUSED";
    const roundCount = num(ds.rounds, 0) || num(ds.totalRounds, 0) || (picks.length && teamCount ? Math.max(...picks.map((p) => p.round)) : void 0) || void 0;
    const userTeam = ensuredTeams.find((t) => t.isUserTeam);
    const onClockIdx = ds.teamIndexTheClock != null ? Math.floor(num(ds.teamIndexTheClock, -1)) : ds.teamOnTheClock != null ? Math.floor(num(ds.teamOnTheClock, -1)) : -1;
    const snapshot = {
      source: "fantasypros",
      draftId,
      draftName,
      status,
      teamCount: ensuredTeams.length,
      roundCount: roundCount || void 0,
      teams: ensuredTeams,
      picks,
      currentOverallPick: status === "COMPLETE" ? void 0 : overallPickCursor || void 0,
      currentRound: status === "COMPLETE" ? void 0 : Math.max(1, Math.floor(num(ds.round, Math.ceil(overallPickCursor / Math.max(ensuredTeams.length, 1))))),
      currentPickInRound: status === "COMPLETE" ? void 0 : (overallPickCursor - 1) % Math.max(ensuredTeams.length, 1) + 1,
      onTheClockTeamId: status === "ACTIVE" && onClockIdx >= 0 ? ensuredTeams[onClockIdx]?.teamId : void 0,
      userTeamId: userTeam?.teamId,
      lastUpdatedAt: nowIso,
      draftFingerprint: fingerprint
    };
    return { ok: true, snapshot, sourcePickCount: drafted.length };
  }
  function extractTeams(teamsRaw, drafted) {
    const out = [];
    for (let i = 0; i < teamsRaw.length; i++) {
      const t = teamsRaw[i];
      if (!t || typeof t !== "object") continue;
      const row = t;
      const teamId = str(row.id, `seat-${i}`);
      const teamName = str(row.name) || str(row.teamName) || `Team ${i + 1}`;
      const ownerName = str(row.participant?.name) || str(row.owner) || void 0;
      const isUserTeam = Boolean(row.isUserTeam || row.userTeam || row.participant?.human);
      out.push({
        teamId: String(teamId),
        teamName,
        ownerName,
        draftSlot: i + 1,
        isUserTeam
      });
    }
    if (out.length) return out;
    const seats = /* @__PURE__ */ new Map();
    for (const row of drafted) {
      if (!row || typeof row !== "object") continue;
      const r = row;
      const pos = Math.floor(num(r.ownerPos, -1));
      if (pos < 0) continue;
      if (!seats.has(pos)) seats.set(pos, str(r.owner, `Team ${pos + 1}`));
    }
    return [...seats.entries()].sort((a, b) => a[0] - b[0]).map(([pos, name]) => ({
      teamId: `seat-${pos}`,
      teamName: name || `Team ${pos + 1}`,
      draftSlot: pos + 1,
      isUserTeam: false
    }));
  }
  function maxOwnerPos(drafted) {
    let max = -1;
    for (const row of drafted) {
      if (!row || typeof row !== "object") continue;
      const pos = Math.floor(num(row.ownerPos, -1));
      if (pos > max) max = pos;
    }
    return max;
  }
  function normalizePos(pos) {
    const p = pos.trim().toUpperCase();
    if (!p) return void 0;
    if (p === "DST" || p === "DEF" || p === "D/ST") return "D/ST";
    if (p === "PK") return "K";
    return p;
  }
  function observeFantasyPros(win) {
    const store = readFantasyProsDebugStore(win);
    if (!store) {
      return { ok: false, error: "FantasyPros draft state not found (__debugStore.draftState)" };
    }
    return observeFantasyProsFromStore(store, {
      pathname: typeof win.location?.pathname === "string" ? win.location.pathname : ""
    });
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/normalize/mergeSnapshot.ts
  function mergePicks(existing, incoming) {
    const byKey = /* @__PURE__ */ new Map();
    const softToKey = /* @__PURE__ */ new Map();
    let duplicatesSuppressed = 0;
    for (const p of existing) {
      byKey.set(p.eventKey, p);
      softToKey.set(softPickIdentity(p), p.eventKey);
    }
    for (const next of incoming) {
      const soft = softPickIdentity(next);
      const existingKey = byKey.has(next.eventKey) ? next.eventKey : softToKey.get(soft);
      if (existingKey) {
        const prev = byKey.get(existingKey);
        if (existingKey !== next.eventKey || softToKey.has(soft)) {
          duplicatesSuppressed += 1;
        }
        byKey.set(existingKey, enrichPick(prev, next));
        softToKey.set(soft, existingKey);
        continue;
      }
      byKey.set(next.eventKey, next);
      softToKey.set(soft, next.eventKey);
    }
    return {
      picks: [...byKey.values()].sort((a, b) => {
        const oa = a.overallPick ?? 1e9;
        const ob = b.overallPick ?? 1e9;
        return oa - ob;
      }),
      duplicatesSuppressed
    };
  }
  function enrichPick(prev, next) {
    return {
      ...prev,
      ...Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== void 0 && v !== null && v !== "")
      ),
      eventKey: prev.eventKey,
      isKeeper: prev.isKeeper || next.isKeeper,
      isTradedPick: prev.isTradedPick || next.isTradedPick,
      keeperStatusKnown: prev.keeperStatusKnown || next.keeperStatusKnown,
      isLiveSelection: prev.isLiveSelection && next.isLiveSelection ? true : prev.isLiveSelection || next.isLiveSelection ? Boolean(next.isLiveSelection && !prev.isKeeper) : false,
      playerId: next.playerId || prev.playerId,
      nflTeam: next.nflTeam || prev.nflTeam,
      position: next.position || prev.position,
      currentTeamId: next.currentTeamId || prev.currentTeamId,
      currentTeamName: next.currentTeamName || prev.currentTeamName,
      currentOwnerName: next.currentOwnerName || prev.currentOwnerName,
      originalTeamId: next.originalTeamId || prev.originalTeamId,
      originalTeamName: next.originalTeamName || prev.originalTeamName,
      originalDraftSlot: next.originalDraftSlot ?? prev.originalDraftSlot,
      overallPick: next.overallPick ?? prev.overallPick,
      pickInRound: next.pickInRound ?? prev.pickInRound
    };
  }
  function applySnapshotUpdate(previous, next) {
    if (!previous || previous.draftFingerprint !== next.draftFingerprint || previous.draftId && next.draftId && previous.draftId !== next.draftId) {
      return { snapshot: next, duplicatesSuppressed: 0, reset: Boolean(previous) };
    }
    if (next.picks.length === 0 && previous.picks.length > 0 && next.status !== "NOT_STARTED") {
      return {
        snapshot: {
          ...previous,
          ...next,
          picks: previous.picks,
          teams: next.teams.length ? next.teams : previous.teams,
          teamCount: next.teamCount || previous.teamCount,
          lastUpdatedAt: next.lastUpdatedAt
        },
        duplicatesSuppressed: 0,
        reset: false
      };
    }
    const { picks, duplicatesSuppressed } = mergePicks(previous.picks, next.picks);
    return {
      snapshot: {
        ...next,
        teams: next.teams.length ? next.teams : previous.teams,
        teamCount: next.teamCount || previous.teamCount,
        picks
      },
      duplicatesSuppressed,
      reset: false
    };
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/board/boardStyles.ts
  var BOARD_STYLES = `
.dbm-root {
  --dbm-bg: #0f1419;
  --dbm-panel: #1a222c;
  --dbm-border: #2a3544;
  --dbm-text: #e8eef5;
  --dbm-muted: #8b9aab;
  --dbm-accent: #3d8bfd;
  --dbm-keeper: #c9a227;
  --dbm-trade: #2dd4bf;
  --dbm-user: #8b5cf6;
  --dbm-clock: #22c55e;
  --pos-QB: #f472b6; --pos-RB: #34d399; --pos-WR: #60a5fa; --pos-TE: #fbbf24;
  --pos-K: #c084fc; --pos-DST: #f87171; --pos-DP: #fb923c;
  --dbm-cell-w: 150px; --dbm-card-font: 12px;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--dbm-text); background: var(--dbm-bg); box-sizing: border-box;
}
.dbm-root *, .dbm-root *::before, .dbm-root *::after { box-sizing: border-box; }
.dbm-root[data-dbm-zoom="1"] { --dbm-cell-w: 120px; --dbm-card-font: 11px; }
.dbm-root[data-dbm-zoom="2"] { --dbm-cell-w: 150px; --dbm-card-font: 12px; }
.dbm-root[data-dbm-zoom="3"] { --dbm-cell-w: 185px; --dbm-card-font: 13px; }
.dbm-root[data-dbm-zoom="4"] { --dbm-cell-w: 230px; --dbm-card-font: 15px; }

/* ---- Header (stronger, sticky) ---- */
.dbm-header {
  display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
  padding: 14px 18px; border-bottom: 2px solid var(--dbm-accent);
  background: linear-gradient(180deg, #1b2836, #10161d);
  position: sticky; top: 0; z-index: 20;
}
.dbm-title {
  font-size: 22px; font-weight: 800; margin: 0; letter-spacing: 0.01em;
  display: flex; align-items: center; gap: 10px;
}
.dbm-title::before {
  content: ""; width: 10px; height: 22px; border-radius: 3px;
  background: var(--dbm-accent);
}
.dbm-meta { font-size: 13px; color: var(--dbm-text); display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.dbm-meta .dbm-metaval { color: var(--dbm-muted); }
.dbm-badge {
  display: inline-block; padding: 3px 10px; border-radius: 5px;
  font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
  border: 1px solid var(--dbm-border); background: var(--dbm-panel);
}
.dbm-badge.status-ACTIVE { border-color: #22c55e; color: #86efac; }
.dbm-badge.status-COMPLETE { border-color: var(--dbm-accent); color: #93c5fd; }
.dbm-badge.status-NOT_STARTED { color: var(--dbm-muted); }
.dbm-badge.status-PAUSED { border-color: #eab308; color: #fde047; }
.dbm-badge.status-ERROR { border-color: #ef4444; color: #fca5a5; }
.dbm-spacer { flex: 1 1 auto; }
.dbm-onclock {
  display: inline-block; padding: 3px 10px; border-radius: 5px;
  font-size: 12px; font-weight: 800; letter-spacing: 0.02em;
  border: 1px solid var(--dbm-clock); color: #86efac; background: rgba(34,197,94,0.08);
}

/* ---- Zoom + legend controls ---- */
.dbm-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dbm-zoom { display: flex; align-items: center; gap: 4px; }
.dbm-zoom button {
  width: 26px; height: 26px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--dbm-border); background: var(--dbm-panel);
  color: var(--dbm-text); font-size: 15px; font-weight: 800; line-height: 1;
}
.dbm-zoom button:hover { border-color: var(--dbm-accent); }
.dbm-zoom-label { font-size: 11px; color: var(--dbm-muted); min-width: 30px; text-align: center; }
.dbm-legend { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dbm-legend .lg { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dbm-muted); }
.dbm-legend .sw { width: 10px; height: 10px; border-radius: 2px; }
.dbm-error {
  margin: 12px 16px; padding: 12px 14px; border: 1px solid #7f1d1d;
  background: #450a0a; color: #fecaca; border-radius: 6px; font-size: 13px;
}

/* ---- Board scroll container ---- */
.dbm-board-wrap {
  overflow: scroll; width: 100%; max-height: calc(100vh - 150px);
  padding: 0; box-sizing: border-box; overscroll-behavior: contain;
  scrollbar-width: auto; position: relative;
}
.dbm-board-wrap::-webkit-scrollbar { height: 14px; width: 12px; }
.dbm-board-wrap::-webkit-scrollbar-thumb { background: #3d4a5c; border-radius: 7px; }
.dbm-board-wrap::-webkit-scrollbar-track { background: #151c24; }

.dbm-board {
  display: grid; border: 1px solid var(--dbm-border);
  width: max-content; min-width: 100%; background: var(--dbm-panel);
}
.dbm-corner, .dbm-team-head, .dbm-round-label, .dbm-cell {
  border-right: 1px solid var(--dbm-border);
  border-bottom: 1px solid var(--dbm-border);
  padding: 6px 8px; vertical-align: top;
}

/* Corner: sticky BOTH directions, top of stack */
.dbm-corner {
  position: sticky; left: 0; top: 0; z-index: 15;
  background: #10161d; font-size: 11px; color: var(--dbm-muted); font-weight: 800;
  min-width: 64px; width: 64px;
}
/* Team headers: sticky to top while scrolling vertically */
.dbm-team-head {
  position: sticky; top: 0; z-index: 12;
  background: #131b24; min-width: var(--dbm-cell-w); max-width: 240px;
}
.dbm-team-head.user {
  background: linear-gradient(180deg, #241a3d, #171227);
  box-shadow: inset 0 -3px 0 var(--dbm-user);
}
.dbm-team-name { font-size: 13px; font-weight: 800; line-height: 1.25; }
.dbm-team-owner { font-size: 11px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-team-slot { font-size: 10px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-myteam-badge {
  display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 3px;
  font-size: 9px; font-weight: 900; letter-spacing: 0.06em;
  background: var(--dbm-user); color: #fff; text-transform: uppercase;
}
/* Round labels: sticky to left while scrolling horizontally */
.dbm-round-label {
  position: sticky; left: 0; z-index: 10;
  background: #131b24; font-weight: 800; font-size: 13px;
  min-width: 64px; width: 64px; color: var(--dbm-text);
}

/* ---- Cells + user-column tint + active pick ---- */
.dbm-cell {
  min-width: var(--dbm-cell-w); max-width: 240px; min-height: 46px;
  background: var(--dbm-bg);
}
.dbm-cell.empty { background: #0c1015; }
.dbm-cell.user-col { background: #171325; }
.dbm-cell.user-col.empty { background: #130f1f; }
.dbm-cell.on-clock {
  outline: 2px solid var(--dbm-clock); outline-offset: -2px;
  animation: dbm-pulse 1.6s ease-in-out infinite;
}
.dbm-cell.on-clock::after {
  content: "ON THE CLOCK"; display: block; font-size: 9px; font-weight: 900;
  letter-spacing: 0.06em; color: var(--dbm-clock); margin-top: 2px;
}
@keyframes dbm-pulse {
  0%, 100% { box-shadow: inset 0 0 0 0 rgba(34,197,94,0.0); }
  50% { box-shadow: inset 0 0 22px 0 rgba(34,197,94,0.30); }
}

/* ---- Cards (clear text hierarchy) ---- */
.dbm-card {
  border: 1px solid var(--dbm-border); border-left: 3px solid var(--dbm-border);
  border-radius: 4px; padding: 5px 7px; margin-bottom: 4px; background: #18212b;
  font-size: var(--dbm-card-font); line-height: 1.28;
}
.dbm-card:last-child { margin-bottom: 0; }
.dbm-card.pos-QB { border-left-color: var(--pos-QB); }
.dbm-card.pos-RB { border-left-color: var(--pos-RB); }
.dbm-card.pos-WR { border-left-color: var(--pos-WR); }
.dbm-card.pos-TE { border-left-color: var(--pos-TE); }
.dbm-card.pos-K  { border-left-color: var(--pos-K); }
.dbm-card.pos-DST { border-left-color: var(--pos-DST); }
.dbm-card.pos-DP { border-left-color: var(--pos-DP); }
.dbm-card.keeper { box-shadow: inset 3px 0 0 var(--dbm-keeper); }
.dbm-card.trade { box-shadow: inset 3px 0 0 var(--dbm-trade); }
.dbm-card-row { display: flex; gap: 7px; align-items: flex-start; }
.dbm-headshot {
  width: 38px; height: 28px; border-radius: 3px; object-fit: cover;
  background: #0c1015; flex: 0 0 auto; margin-top: 1px;
}
.dbm-card-body { min-width: 0; flex: 1 1 auto; }
.dbm-card-top { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.dbm-overall {
  color: #fff; background: var(--dbm-accent); border-radius: 3px;
  padding: 0 5px; font-size: calc(var(--dbm-card-font) - 1px); font-weight: 900;
}
.dbm-player { font-weight: 800; font-size: calc(var(--dbm-card-font) + 1px); }
.dbm-sub {
  color: var(--dbm-text); font-size: var(--dbm-card-font); margin-top: 3px;
  font-weight: 600; opacity: 0.85;
}
.dbm-sub .pos { font-weight: 800; }
.dbm-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.dbm-tag {
  font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  padding: 1px 5px; border-radius: 3px; text-transform: uppercase;
}
.dbm-tag.keeper { background: #422006; color: #fbbf24; }
.dbm-tag.trade { background: #134e4a; color: #5eead4; }

/* ---- Diagnostics ---- */
.dbm-diag {
  margin: 8px 16px 16px; padding: 10px 12px; border: 1px dashed var(--dbm-border);
  border-radius: 6px; font-size: 11px; color: var(--dbm-muted);
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px 12px;
}
.dbm-diag strong { color: var(--dbm-text); font-weight: 600; }
`;

  // ../standalone/draft-board-monitor/src/draft-monitor/board/renderBoard.ts
  function ensureStyles(doc) {
    if (doc.getElementById("dbm-styles")) return;
    const style = doc.createElement("style");
    style.id = "dbm-styles";
    style.textContent = BOARD_STYLES;
    doc.head.appendChild(style);
  }
  function renderBoard(target, snapshot, diagnostics) {
    ensureStyles(target.document);
    const root = target.mount;
    const lastPick = snapshot?.picks[snapshot.picks.length - 1];
    const sig = [
      snapshot?.draftFingerprint ?? "",
      snapshot?.picks.length ?? 0,
      lastPick?.eventKey ?? "",
      diagnostics.status,
      diagnostics.parseError ?? "",
      diagnostics.duplicatesSuppressed
    ].join("~");
    if (root.getAttribute("data-dbm-sig") === sig) {
      const clock = root.querySelector("#dbm-last-read");
      if (clock) clock.textContent = diagnostics.lastSuccessfulReadAt || "\u2014";
      return;
    }
    const prevWrap = root.querySelector(".dbm-board-wrap");
    const keepX = prevWrap?.scrollLeft ?? 0;
    const keepY = prevWrap?.scrollTop ?? 0;
    root.className = "dbm-root";
    root.innerHTML = "";
    root.setAttribute("data-dbm-sig", sig);
    const header = el(target.document, "div", "dbm-header");
    const title = el(target.document, "h1", "dbm-title");
    title.textContent = "Draft Board Monitor";
    header.appendChild(title);
    const meta = el(target.document, "div", "dbm-meta");
    const status = diagnostics.status;
    meta.appendChild(badge(target.document, status, `status-${status}`));
    meta.appendChild(textSpan(target.document, snapshot?.source?.toUpperCase() || diagnostics.source.toUpperCase()));
    if (snapshot?.draftName) meta.appendChild(textSpan(target.document, snapshot.draftName));
    if (snapshot?.teamCount) meta.appendChild(textSpan(target.document, `${snapshot.teamCount} teams`));
    if (snapshot?.roundCount) meta.appendChild(textSpan(target.document, `${snapshot.roundCount} rounds`));
    if (snapshot?.currentOverallPick != null && status === "ACTIVE") {
      const onClock = el(target.document, "span", "dbm-onclock");
      onClock.textContent = `On the clock \xB7 Pick #${snapshot.currentOverallPick}`;
      meta.appendChild(onClock);
    }
    header.appendChild(meta);
    const spacer = el(target.document, "div", "dbm-spacer");
    header.appendChild(spacer);
    header.appendChild(buildControls(target.document, root));
    root.appendChild(header);
    if (diagnostics.parseError) {
      const err = el(target.document, "div", "dbm-error");
      err.textContent = diagnostics.parseError;
      root.appendChild(err);
    }
    if (!snapshot || snapshot.teams.length === 0 && snapshot.picks.length === 0 && diagnostics.parseError) {
      root.appendChild(renderDiagnostics(target.document, diagnostics));
      return;
    }
    const teams = snapshot.teams;
    const rounds = resolveRounds(snapshot);
    const grouped = groupPicksByRoundAndTeam(snapshot.picks);
    const wrap = el(target.document, "div", "dbm-board-wrap");
    const board = el(target.document, "div", "dbm-board");
    board.style.gridTemplateColumns = `64px repeat(${Math.max(teams.length, 1)}, minmax(var(--dbm-cell-w), 240px))`;
    board.appendChild(cell(target.document, "dbm-corner", "Rd \\ Tm"));
    for (const t of teams) {
      const head = el(target.document, "div", t.isUserTeam ? "dbm-team-head user" : "dbm-team-head");
      const name = el(target.document, "div", "dbm-team-name");
      name.textContent = t.teamName;
      head.appendChild(name);
      if (t.ownerName) {
        const o = el(target.document, "div", "dbm-team-owner");
        o.textContent = t.ownerName;
        head.appendChild(o);
      }
      if (t.draftSlot != null) {
        const s = el(target.document, "div", "dbm-team-slot");
        s.textContent = `Slot ${t.draftSlot}`;
        head.appendChild(s);
      }
      if (t.isUserTeam) {
        const badge2 = el(target.document, "div", "dbm-myteam-badge");
        badge2.textContent = "My Team";
        head.appendChild(badge2);
      }
      board.appendChild(head);
    }
    for (const round of rounds) {
      const label = cell(target.document, "dbm-round-label", `R${round}`);
      board.appendChild(label);
      const byTeam = grouped.get(round) || /* @__PURE__ */ new Map();
      for (const t of teams) {
        const picks = byTeam.get(t.teamId) || [];
        let cls = picks.length ? "dbm-cell" : "dbm-cell empty";
        if (t.isUserTeam) cls += " user-col";
        const c = el(target.document, "div", cls);
        for (const p of picks) {
          c.appendChild(renderCard(target.document, p));
        }
        board.appendChild(c);
      }
    }
    wrap.appendChild(board);
    root.appendChild(wrap);
    if (keepX || keepY) {
      wrap.scrollLeft = keepX;
      wrap.scrollTop = keepY;
    }
    root.appendChild(renderDiagnostics(target.document, diagnostics));
  }
  function resolveRounds(snapshot) {
    const maxFromPicks = snapshot.picks.reduce((m, p) => Math.max(m, p.round), 0);
    const count = snapshot.roundCount && snapshot.roundCount > 0 ? snapshot.roundCount : Math.max(maxFromPicks, 1);
    const nn = snapshot.picks.length === 0 && !snapshot.roundCount ? 1 : count;
    return Array.from({ length: nn }, (_, i) => i + 1);
  }
  function buildControls(doc, root) {
    const wrap = el(doc, "div", "dbm-controls");
    const legend = el(doc, "div", "dbm-legend");
    const positions = [
      ["QB", "--pos-QB"],
      ["RB", "--pos-RB"],
      ["WR", "--pos-WR"],
      ["TE", "--pos-TE"],
      ["K", "--pos-K"],
      ["DEF", "--pos-DST"],
      ["DP", "--pos-DP"]
    ];
    for (const [lbl, varName] of positions) {
      const lg = el(doc, "span", "lg");
      const sw = el(doc, "span", "sw");
      sw.style.background = `var(${varName})`;
      lg.appendChild(sw);
      lg.appendChild(doc.createTextNode(lbl));
      legend.appendChild(lg);
    }
    wrap.appendChild(legend);
    const zoom = el(doc, "div", "dbm-zoom");
    const cur = Number(root.getAttribute("data-dbm-zoom") || "2");
    const label = el(doc, "span", "dbm-zoom-label");
    const setZoom = (z) => {
      const clamped = Number.isFinite(z) ? Math.max(1, Math.min(4, Math.round(z))) : 2;
      root.setAttribute("data-dbm-zoom", String(clamped));
      label.textContent = `${["S", "M", "L", "XL"][clamped - 1]}`;
    };
    const minus = el(doc, "button", "");
    minus.textContent = "\u2212";
    minus.setAttribute("title", "Zoom out");
    minus.addEventListener(
      "click",
      () => setZoom(Number(root.getAttribute("data-dbm-zoom") || "2") - 1)
    );
    const plus = el(doc, "button", "");
    plus.textContent = "+";
    plus.setAttribute("title", "Zoom in");
    plus.addEventListener(
      "click",
      () => setZoom(Number(root.getAttribute("data-dbm-zoom") || "2") + 1)
    );
    const zlabel = el(doc, "span", "dbm-zoom-label");
    zlabel.textContent = "Zoom";
    zoom.appendChild(zlabel);
    zoom.appendChild(minus);
    zoom.appendChild(label);
    zoom.appendChild(plus);
    setZoom(cur);
    wrap.appendChild(zoom);
    return wrap;
  }
  function renderCard(doc, p) {
    const posClass = p.position ? ` pos-${p.position.replace(/[^A-Z]/gi, "").toUpperCase()}` : "";
    const card = el(doc, "div", `dbm-card${posClass}${p.isKeeper ? " keeper" : ""}${p.isTradedPick ? " trade" : ""}`);
    const row = el(doc, "div", "dbm-card-row");
    if (p.headshotUrl) {
      const img = doc.createElement("img");
      img.className = "dbm-headshot";
      img.src = p.headshotUrl;
      img.alt = "";
      img.loading = "lazy";
      row.appendChild(img);
    }
    const body = el(doc, "div", "dbm-card-body");
    const top = el(doc, "div", "dbm-card-top");
    if (p.overallPick != null) {
      const o = el(doc, "span", "dbm-overall");
      o.textContent = `#${p.overallPick}`;
      top.appendChild(o);
    }
    const name = el(doc, "span", "dbm-player");
    name.textContent = p.playerName;
    top.appendChild(name);
    body.appendChild(top);
    const sub = el(doc, "div", "dbm-sub");
    if (p.position) {
      const pos = el(doc, "span", "pos");
      pos.textContent = p.position;
      sub.appendChild(pos);
    }
    if (p.nflTeam) {
      sub.appendChild(doc.createTextNode(p.position ? ` \xB7 ${p.nflTeam}` : p.nflTeam));
    }
    body.appendChild(sub);
    row.appendChild(body);
    card.appendChild(row);
    if (p.isKeeper || p.isTradedPick) {
      const tags = el(doc, "div", "dbm-tags");
      if (p.isKeeper) {
        const k = el(doc, "span", "dbm-tag keeper");
        k.textContent = "Keeper";
        tags.appendChild(k);
      }
      if (p.isTradedPick) {
        const tr = el(doc, "span", "dbm-tag trade");
        tr.textContent = p.originalTeamName ? `Via trade (${p.originalTeamName})` : "Via trade";
        tags.appendChild(tr);
      }
      card.appendChild(tags);
    }
    return card;
  }
  function renderDiagnostics(doc, d) {
    const box = el(doc, "div", "dbm-diag");
    const rows = [
      ["Version", d.version],
      ["Source", d.source],
      ["Draft ID / fingerprint", d.draftIdOrFingerprint],
      ["Teams", String(d.teamCount)],
      ["Source picks", String(d.sourcePickCount)],
      ["Normalized picks", String(d.normalizedPickCount)],
      ["Duplicates suppressed", String(d.duplicatesSuppressed)],
      ["Keepers", String(d.keeperCount)],
      ["Traded picks", String(d.tradedPickCount)],
      ["My team", d.userTeam],
      ["Last successful read", d.lastSuccessfulReadAt || "\u2014"],
      ["Parse error", d.parseError || "\u2014"]
    ];
    for (const [k, v] of rows) {
      const item = el(doc, "div", "");
      const idAttr = k === "Last successful read" ? ' id="dbm-last-read-wrap"' : "";
      const valId = k === "Last successful read" ? ' id="dbm-last-read"' : "";
      item.innerHTML = `<strong${idAttr}>${escapeHtml(k)}:</strong> <span${valId}>${escapeHtml(v)}</span>`;
      box.appendChild(item);
    }
    return box;
  }
  function el(doc, tag, className) {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    return n;
  }
  function cell(doc, className, text) {
    const n = el(doc, "div", className);
    n.textContent = text;
    return n;
  }
  function badge(doc, text, extraClass) {
    const n = el(doc, "span", `dbm-badge ${extraClass}`);
    n.textContent = text;
    return n;
  }
  function textSpan(doc, text) {
    const n = el(doc, "span", "");
    n.textContent = text;
    return n;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/board/DraftBoardMonitor.ts
  var DraftBoardMonitor = class {
    constructor(opts) {
      this.snapshot = null;
      this.duplicatesSuppressedTotal = 0;
      this.lastError = null;
      this.lastSuccessfulReadAt = null;
      this.sourcePickCount = 0;
      this.mount = opts.mount;
      this.doc = opts.document ?? opts.mount.ownerDocument;
    }
    getSnapshot() {
      return this.snapshot;
    }
    applyAdapterResult(args) {
      if (!args.ok || !args.snapshot) {
        this.lastError = args.error || "Source read failed";
        this.paint();
        return;
      }
      this.lastError = null;
      this.lastSuccessfulReadAt = args.snapshot.lastUpdatedAt;
      this.sourcePickCount = args.sourcePickCount ?? args.snapshot.picks.length;
      const { snapshot, duplicatesSuppressed } = applySnapshotUpdate(
        this.snapshot,
        args.snapshot
      );
      this.duplicatesSuppressedTotal += duplicatesSuppressed;
      this.snapshot = snapshot;
      this.paint();
    }
    reset() {
      this.snapshot = null;
      this.duplicatesSuppressedTotal = 0;
      this.lastError = null;
      this.sourcePickCount = 0;
      this.paint();
    }
    diagnostics() {
      const s = this.snapshot;
      return {
        version: MONITOR_VERSION,
        source: s?.source ?? "unknown",
        draftIdOrFingerprint: s?.draftId || s?.draftFingerprint || "\u2014",
        teamCount: s?.teamCount ?? 0,
        sourcePickCount: this.sourcePickCount,
        normalizedPickCount: s?.picks.length ?? 0,
        duplicatesSuppressed: this.duplicatesSuppressedTotal,
        keeperCount: s?.picks.filter((p) => p.isKeeper).length ?? 0,
        tradedPickCount: s?.picks.filter((p) => p.isTradedPick).length ?? 0,
        userTeam: s?.userTeamNote ?? "\u2014",
        lastSuccessfulReadAt: this.lastSuccessfulReadAt,
        parseError: this.lastError,
        status: this.lastError ? "ERROR" : s?.status ?? "LOADING"
      };
    }
    paint() {
      renderBoard(
        { document: this.doc, mount: this.mount },
        this.snapshot,
        this.diagnostics()
      );
    }
  };

  // ../standalone/draft-board-monitor/src/draft-monitor/runtime/detectSource.ts
  function detectSource(win) {
    const href = String(win.location?.href ?? "");
    const host = String(win.location?.hostname ?? "");
    if (/draftwizard\.fantasypros\.com/i.test(host) || /fantasypros\.com/i.test(host)) {
      return { source: "fantasypros", reason: "fantasypros_host" };
    }
    if (/fantasy\.espn\.com/i.test(host) || /espn\.com/i.test(host)) {
      if (/\/draft/i.test(href) || /draft/i.test(href)) {
        return { source: "espn", reason: "espn_draft_host" };
      }
      return { source: "espn", reason: "espn_host" };
    }
    try {
      const w = win;
      if (w.__debugStore) {
        return { source: "fantasypros", reason: "debug_store_present" };
      }
    } catch {
    }
    if (win.document?.querySelector?.(".draft-columns, [class*='draft-columns']")) {
      return { source: "espn", reason: "draft_columns_dom" };
    }
    return { source: null, reason: "unsupported_page" };
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/runtime/espnBookmarkletPublisher.ts
  var ESPN_BM_CHANNEL = "GMWR_ESPN_BM_PAGE";
  var ESPN_BM_SOURCE = "espn-bookmarklet";
  var ESPN_BM_PROVIDER = "espn-live";
  var ESPN_BM_PROTOCOL_VERSION = 1;
  function buildEspnLiveDraftId(leagueId, season) {
    const lid = String(leagueId ?? "").trim() || "unknown";
    const yr = Number.isFinite(season) && season > 0 ? Math.floor(season) : (/* @__PURE__ */ new Date()).getFullYear();
    return `espn-live-${lid}-${yr}`;
  }
  function normToken(s) {
    return String(s ?? "").toLowerCase().replace(/[.'’`]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/[^a-z0-9]+/g, "").trim();
  }
  function buildSyntheticEspnPlayerId(args) {
    const n = normToken(args.playerName) || "unknown";
    const p = normToken(String(args.position ?? "unk")) || "unk";
    const t = normToken(String(args.nflTeam ?? "fa")) || "fa";
    return `syn:${n}|${p}|${t}`;
  }
  function resolveTransportPlayerId(pick) {
    const espnId = String(pick.playerId ?? "").trim();
    if (espnId) return { playerId: espnId, playerIdSource: "espn" };
    return {
      playerId: buildSyntheticEspnPlayerId({
        playerName: pick.playerName,
        position: pick.position,
        nflTeam: pick.nflTeam
      }),
      playerIdSource: "synthetic"
    };
  }
  function newNonce() {
    return `espn-bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function isValidArmConfig(raw) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw;
    const leagueId = String(c.leagueId ?? "").trim();
    const season = Math.floor(Number(c.season));
    if (!/^\d+$/.test(leagueId)) return null;
    if (!Number.isFinite(season) || season < 2e3 || season > 2100) return null;
    const sessionNonce = String(c.sessionNonce ?? "").trim() || newNonce();
    const draftPace = c.draftPace;
    const pace = draftPace === "broadcast" || draftPace === "brisk" || draftPace === "turbo" ? draftPace : void 0;
    return { leagueId, season, sessionNonce, draftPace: pace };
  }
  function toTransportPick(pick, draftId) {
    const overall = Math.floor(Number(pick.overallPick));
    const round = Math.floor(Number(pick.round));
    const pickInRound = Math.floor(Number(pick.pickInRound));
    const playerName = String(pick.playerName ?? "").trim();
    if (!Number.isFinite(overall) || overall < 1) return null;
    if (!Number.isFinite(round) || round < 1) return null;
    if (!Number.isFinite(pickInRound) || pickInRound < 1) return null;
    if (!playerName) return null;
    const { playerId, playerIdSource } = resolveTransportPlayerId(pick);
    const teamId = String(pick.currentTeamId ?? "").trim() || `slot-${pickInRound}`;
    const teamName = String(pick.currentTeamName ?? "").trim() || teamId;
    const eventKey = buildEventKey({
      source: "espn",
      draftId,
      overallPick: overall,
      round,
      pickInRound,
      teamId,
      playerId,
      teamName,
      playerName
    });
    return {
      eventKey,
      overallPick: overall,
      round,
      pickInRound,
      teamId,
      teamName,
      ownerName: String(pick.currentOwnerName ?? teamName).trim() || teamName,
      playerId,
      playerName,
      position: String(pick.position ?? "UNK").trim() || "UNK",
      nflTeam: pick.nflTeam != null && String(pick.nflTeam).trim() ? String(pick.nflTeam).trim() : null,
      isKeeper: Boolean(pick.isKeeper),
      isTradedPick: Boolean(pick.isTradedPick),
      playerIdSource
    };
  }
  var _EspnBookmarkletPublisher = class _EspnBookmarkletPublisher {
    constructor(opts = {}) {
      this.armed = false;
      this.armConfig = null;
      this.publishedKeys = /* @__PURE__ */ new Set();
      this.baselined = false;
      this.completionEmitted = false;
      this.picksEmittedLive = 0;
      this.duplicatesSuppressed = 0;
      this.inboundAttached = false;
      this.onInbound = null;
      /** Retained board for Phase 4 reconciliation (survives brief DISARM). */
      this.boardPicks = [];
      this.boardTeamCount = 0;
      this.boardDraftComplete = false;
      this.boardDraftId = null;
      this.boardLeagueId = null;
      this.boardSeason = null;
      /** Recent emitted batches (bounded) for diagnostics / duplicate-aware replay tests. */
      this.recentBatches = [];
      /** Monotonic per armed session — stamped on every outbound batch. */
      this.sessionRevision = 0;
      this.win = opts.window ?? (typeof window !== "undefined" ? window : null);
      this.nowIso = opts.nowIso ?? (() => (/* @__PURE__ */ new Date()).toISOString());
      this.emitFn = opts.emit ?? ((message) => {
        if (!this.win) return;
        try {
          this.win.postMessage(message, this.win.location?.origin || "*");
        } catch {
          try {
            this.win.postMessage(message, "*");
          } catch {
          }
        }
      });
    }
    get isArmed() {
      return this.armed;
    }
    get state() {
      return {
        armed: this.armed,
        baselined: this.baselined,
        completionEmitted: this.completionEmitted,
        publishedKeyCount: this.publishedKeys.size,
        picksEmittedLive: this.picksEmittedLive,
        duplicatesSuppressed: this.duplicatesSuppressed,
        boardPickCount: this.boardPicks.length,
        recentBatchCount: this.recentBatches.length,
        sessionRevision: this.sessionRevision,
        leagueId: this.armConfig?.leagueId ?? null,
        season: this.armConfig?.season ?? null,
        sessionNonce: this.armConfig?.sessionNonce ?? null,
        draftId: this.armConfig ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season) : null
      };
    }
    /** Listen for ARM / DISARM / PING from extension content (Phase 2+). Safe in Phase 1. */
    attachInboundListener() {
      if (this.inboundAttached || !this.win) return;
      this.onInbound = (ev) => {
        if (ev.source !== this.win) return;
        const d = ev.data;
        if (!d || typeof d !== "object") return;
        const msg = d;
        if (msg.channel !== ESPN_BM_CHANNEL) return;
        if (msg.type === "ARM" || msg.type === "GMWR_ESPN_BM_ARM") {
          this.arm(msg.config ?? msg);
          return;
        }
        if (msg.type === "DISARM" || msg.type === "GMWR_ESPN_BM_DISARM") {
          this.disarm();
          return;
        }
        if (msg.type === "PING" || msg.type === "GMWR_ESPN_BM_PING") {
          this.pong();
          return;
        }
        if (msg.type === "REPLAY_REQUEST" || msg.type === "GMWR_ESPN_BM_REPLAY_REQUEST") {
          this.handleReplayRequest(msg.config ?? msg);
        }
      };
      this.win.addEventListener("message", this.onInbound);
      this.inboundAttached = true;
      this.emitStatus("ready");
    }
    detachInboundListener() {
      if (!this.inboundAttached || !this.win || !this.onInbound) return;
      this.win.removeEventListener("message", this.onInbound);
      this.onInbound = null;
      this.inboundAttached = false;
    }
    arm(rawConfig) {
      const config = isValidArmConfig(rawConfig);
      if (!config) {
        this.emitStatus("error", { reason: "invalid_arm_config" });
        return { ok: false, error: "invalid_arm_config" };
      }
      const nextDraftId = buildEspnLiveDraftId(config.leagueId, config.season);
      if (this.boardDraftId && (this.boardDraftId !== nextDraftId || this.boardLeagueId !== config.leagueId || this.boardSeason !== config.season)) {
        this.boardPicks = [];
        this.boardTeamCount = 0;
        this.boardDraftComplete = false;
        this.recentBatches = [];
      }
      this.armed = true;
      this.armConfig = {
        ...config,
        sessionNonce: String(config.sessionNonce).trim() || newNonce()
      };
      this.publishedKeys = /* @__PURE__ */ new Set();
      this.baselined = false;
      this.completionEmitted = false;
      this.picksEmittedLive = 0;
      this.duplicatesSuppressed = 0;
      this.sessionRevision = 0;
      this.emitStatus("armed");
      return { ok: true, sessionNonce: this.armConfig.sessionNonce };
    }
    disarm() {
      this.armed = false;
      this.armConfig = null;
      this.publishedKeys = /* @__PURE__ */ new Set();
      this.baselined = false;
      this.completionEmitted = false;
      this.emitStatus("disarmed");
    }
    pong() {
      const draftId = this.armConfig ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season) : null;
      this.emitFn({
        type: "GMWR_ESPN_BM_PONG",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        revision: this.sessionRevision,
        channel: ESPN_BM_CHANNEL,
        source: ESPN_BM_SOURCE,
        provider: ESPN_BM_PROVIDER,
        armed: this.armed,
        draftId,
        leagueId: this.armConfig?.leagueId ?? null,
        season: this.armConfig?.season ?? null,
        sessionNonce: this.armConfig?.sessionNonce ?? null
      });
    }
    /**
     * Phase 4 — idempotent reconciliation after War Room reconnect.
     * afterOverallPick <= 0 → full board as baseline (no live notify).
     * afterOverallPick > 0 → only newer picks as liveNotify candidates.
     */
    handleReplayRequest(raw) {
      if (!this.armed || !this.armConfig) {
        this.emitStatus("error", { reason: "replay_not_armed" });
        return { ok: false, error: "not_armed" };
      }
      if (!raw || typeof raw !== "object") {
        this.emitStatus("error", { reason: "invalid_replay_request" });
        return { ok: false, error: "invalid_replay_request" };
      }
      const r = raw;
      const draftId = String(r.draftId ?? "").trim();
      const sessionNonce = String(r.sessionNonce ?? "").trim();
      const afterOverallPick = Math.floor(Number(r.afterOverallPick));
      const requestId = String(r.requestId ?? "").trim();
      const expectedDraftId = buildEspnLiveDraftId(
        this.armConfig.leagueId,
        this.armConfig.season
      );
      if (!draftId || draftId !== expectedDraftId) {
        this.emitStatus("error", {
          reason: "replay_wrong_draft_id",
          draftId: expectedDraftId,
          leagueId: this.armConfig.leagueId,
          season: this.armConfig.season
        });
        return { ok: false, error: "wrong_draft_id" };
      }
      if (!sessionNonce || sessionNonce !== this.armConfig.sessionNonce) {
        this.emitStatus("error", {
          reason: "replay_wrong_session_nonce",
          draftId: expectedDraftId,
          leagueId: this.armConfig.leagueId,
          season: this.armConfig.season
        });
        return { ok: false, error: "wrong_session_nonce" };
      }
      if (!Number.isFinite(afterOverallPick) || afterOverallPick < 0) {
        this.emitStatus("error", { reason: "invalid_after_overall_pick" });
        return { ok: false, error: "invalid_after_overall_pick" };
      }
      if (!requestId) {
        this.emitStatus("error", { reason: "missing_replay_request_id" });
        return { ok: false, error: "missing_replay_request_id" };
      }
      const boardMax = this.boardPicks.length > 0 ? Math.max(...this.boardPicks.map((p) => p.overallPick)) : 0;
      if (afterOverallPick > boardMax) {
        this.emitStatus("error", {
          reason: "stale_replay",
          draftId: expectedDraftId,
          leagueId: this.armConfig.leagueId,
          season: this.armConfig.season
        });
        return { ok: false, error: "stale_replay" };
      }
      const picks = this.boardPicks.filter((p) => p.overallPick > afterOverallPick).sort((a, b) => a.overallPick - b.overallPick);
      if (picks.length === 0) {
        this.emitStatus("monitoring", {
          draftId: expectedDraftId,
          leagueId: this.armConfig.leagueId,
          season: this.armConfig.season,
          draftComplete: this.boardDraftComplete
        });
        return { ok: true, emitted: 0 };
      }
      const fullReconcile = afterOverallPick <= 0;
      for (const row of picks) this.publishedKeys.add(row.eventKey);
      if (fullReconcile) this.baselined = true;
      this.emitBatch({
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
        sessionNonce: this.armConfig.sessionNonce,
        teamCount: this.boardTeamCount || 12,
        draftComplete: this.boardDraftComplete,
        baselineOnly: fullReconcile,
        liveNotify: !fullReconcile,
        observedAt: this.nowIso(),
        picks,
        rowsScanned: this.boardPicks.length,
        replay: true,
        replayRequestId: requestId.slice(0, 128),
        afterOverallPick
      });
      this.emitStatus("monitoring", {
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
        draftComplete: this.boardDraftComplete,
        baselineOnly: fullReconcile
      });
      return { ok: true, emitted: picks.length };
    }
    /**
     * Called after mirror applyAdapterResult. No-op unless armed.
     * First successful snapshot → baseline projection batch (liveNotify=false).
     * Later new picks → delta batches (liveNotify=true).
     * Completion always rides on a PICK_BATCH (delta, baseline, or empty once).
     */
    onSnapshot(snapshot) {
      if (!this.armed || !this.armConfig) {
        try {
          console.info("[espn-bm-path]", "mirror_skip_onSnapshot", {
            hop: "board-mirror",
            reject: "!armed || !armConfig",
            line: "espnBookmarkletPublisher.ts:onSnapshot",
            armed: this.armed,
            hasArmConfig: Boolean(this.armConfig),
            pickCount: snapshot?.picks?.length ?? null
          });
        } catch {
        }
        return;
      }
      if (!snapshot || snapshot.source !== "espn") return;
      const { leagueId, season, sessionNonce } = this.armConfig;
      const draftId = buildEspnLiveDraftId(leagueId, season);
      if (draftId.endsWith("-na")) {
        this.emitStatus("error", { reason: "invalid_draft_id", draftId, leagueId, season });
        return;
      }
      const observedAt = this.nowIso();
      const teamCount = snapshot.teamCount || snapshot.teams.length || 0;
      const draftComplete = snapshot.status === "COMPLETE";
      const transport = [];
      for (const pick of snapshot.picks) {
        const row = toTransportPick(pick, draftId);
        if (row) transport.push(row);
      }
      transport.sort((a, b) => a.overallPick - b.overallPick);
      this.boardPicks = transport;
      this.boardTeamCount = teamCount;
      this.boardDraftComplete = draftComplete;
      this.boardDraftId = draftId;
      this.boardLeagueId = leagueId;
      this.boardSeason = season;
      if (!this.baselined) {
        this.baselined = true;
        for (const row of transport) this.publishedKeys.add(row.eventKey);
        this.emitBatch({
          draftId,
          leagueId,
          season,
          sessionNonce,
          teamCount,
          draftComplete,
          baselineOnly: true,
          liveNotify: false,
          observedAt,
          picks: transport,
          rowsScanned: transport.length
        });
        this.emitStatus("monitoring", {
          draftId,
          leagueId,
          season,
          baselineOnly: true,
          draftComplete
        });
        if (draftComplete) {
          this.emitCompletionOnce({
            draftId,
            leagueId,
            season,
            sessionNonce,
            teamCount,
            observedAt,
            alreadyOnBatch: true
          });
        }
        return;
      }
      const delta = [];
      let skippedKnown = 0;
      for (const row of transport) {
        if (this.publishedKeys.has(row.eventKey)) {
          skippedKnown += 1;
          continue;
        }
        this.publishedKeys.add(row.eventKey);
        delta.push(row);
      }
      this.duplicatesSuppressed = Math.max(this.duplicatesSuppressed, skippedKnown);
      if (delta.length > 0) {
        this.picksEmittedLive += delta.length;
        this.emitBatch({
          draftId,
          leagueId,
          season,
          sessionNonce,
          teamCount,
          draftComplete,
          baselineOnly: false,
          liveNotify: true,
          observedAt,
          picks: delta,
          rowsScanned: transport.length
        });
        this.emitStatus("monitoring", { draftId, leagueId, season, draftComplete });
        if (draftComplete) {
          this.emitCompletionOnce({
            draftId,
            leagueId,
            season,
            sessionNonce,
            teamCount,
            observedAt,
            alreadyOnBatch: true
          });
        }
        return;
      }
      if (draftComplete) {
        this.emitCompletionOnce({
          draftId,
          leagueId,
          season,
          sessionNonce,
          teamCount,
          observedAt,
          alreadyOnBatch: false
        });
      }
    }
    /**
     * Emit completion exactly once per ARM session.
     * Prefer carrying draftComplete on an existing batch; otherwise emit an empty
     * PICK_BATCH so Phase 3 maps directly into NormalizedPickBatch.draftComplete
     * without a second event type.
     */
    emitCompletionOnce(args) {
      if (this.completionEmitted) return;
      this.completionEmitted = true;
      if (!args.alreadyOnBatch) {
        this.emitBatch({
          draftId: args.draftId,
          leagueId: args.leagueId,
          season: args.season,
          sessionNonce: args.sessionNonce,
          teamCount: args.teamCount,
          draftComplete: true,
          baselineOnly: false,
          liveNotify: false,
          observedAt: args.observedAt,
          picks: [],
          rowsScanned: this.publishedKeys.size
        });
      }
      this.emitStatus("complete", {
        draftId: args.draftId,
        leagueId: args.leagueId,
        season: args.season,
        draftComplete: true
      });
    }
    emitBatch(args) {
      const diagnostics = {
        picksEmitted: args.liveNotify ? this.picksEmittedLive : 0,
        duplicatesSuppressed: this.duplicatesSuppressed,
        rowsScanned: args.rowsScanned,
        baselineOnly: args.baselineOnly,
        liveNotify: args.liveNotify,
        ...args.replay ? {
          replay: true,
          replayRequestId: args.replayRequestId,
          afterOverallPick: args.afterOverallPick
        } : {}
      };
      const message = {
        type: "GMWR_ESPN_BM_PICK_BATCH",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        revision: ++this.sessionRevision,
        channel: ESPN_BM_CHANNEL,
        source: ESPN_BM_SOURCE,
        provider: ESPN_BM_PROVIDER,
        draftType: "live",
        draftId: args.draftId,
        leagueId: args.leagueId,
        season: args.season,
        sessionNonce: args.sessionNonce,
        teamCount: args.teamCount,
        draftComplete: args.draftComplete,
        baselineOnly: args.baselineOnly,
        liveNotify: args.liveNotify,
        observedAt: args.observedAt,
        picks: args.picks,
        diagnostics
      };
      try {
        console.info("[espn-bm-path]", "mirror_emit_PICK_BATCH", {
          hop: "board-mirror",
          sessionNonce: message.sessionNonce,
          draftId: message.draftId,
          protocolVersion: message.protocolVersion,
          revision: message.revision,
          batchSize: message.picks.length,
          baselineOnly: message.baselineOnly,
          liveNotify: message.liveNotify
        });
      } catch {
      }
      this.recentBatches.push(message);
      if (this.recentBatches.length > _EspnBookmarkletPublisher.RECENT_BATCH_LIMIT) {
        this.recentBatches.splice(
          0,
          this.recentBatches.length - _EspnBookmarkletPublisher.RECENT_BATCH_LIMIT
        );
      }
      this.emitFn(message);
    }
    emitStatus(status, extra) {
      const draftId = this.armConfig ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season) : extra?.draftId ?? null;
      this.emitFn({
        type: "GMWR_ESPN_BM_STATUS",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        revision: this.sessionRevision,
        channel: ESPN_BM_CHANNEL,
        source: ESPN_BM_SOURCE,
        provider: ESPN_BM_PROVIDER,
        status,
        reason: extra?.reason ?? null,
        draftId: extra?.draftId ?? draftId,
        leagueId: extra?.leagueId ?? this.armConfig?.leagueId ?? null,
        season: extra?.season ?? this.armConfig?.season ?? null,
        sessionNonce: this.armConfig?.sessionNonce ?? null,
        draftComplete: extra?.draftComplete,
        baselineOnly: extra?.baselineOnly,
        diagnostics: {
          picksEmitted: this.picksEmittedLive,
          duplicatesSuppressed: this.duplicatesSuppressed,
          rowsScanned: this.publishedKeys.size,
          baselineOnly: Boolean(extra?.baselineOnly),
          liveNotify: false
        }
      });
    }
  };
  _EspnBookmarkletPublisher.RECENT_BATCH_LIMIT = 48;
  var EspnBookmarkletPublisher = _EspnBookmarkletPublisher;

  // ../standalone/draft-board-monitor/src/draft-monitor/runtime/monitorController.ts
  var DEFAULT_POLL_MS = 1e3;
  var MonitorController = class {
    constructor(opts = {}) {
      this.timer = null;
      this.observer = null;
      this.monitor = null;
      this.displayDoc = null;
      this.displayWin = null;
      this.stopped = false;
      this.win = opts.window ?? window;
      this.pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
      this.preferPopup = opts.preferPopup !== false;
      this.espnPublisher = opts.espnPublisher === null ? null : opts.espnPublisher ?? new EspnBookmarkletPublisher({ window: this.win });
    }
    /** Phase 1/2 — expose publisher for ARM tests and extension handshake. */
    getEspnPublisher() {
      return this.espnPublisher;
    }
    start() {
      this.stopped = false;
      const detected = detectSource(this.win);
      if (!detected.source) {
        return {
          ok: false,
          error: `Unsupported page (${detected.reason}). Open a FantasyPros mock live room or ESPN draft tab.`
        };
      }
      const mount = this.createMount();
      if (!mount) {
        return { ok: false, error: "Could not create display mount (popup blocked?)" };
      }
      this.monitor = new DraftBoardMonitor({
        mount,
        document: this.displayDoc || this.win.document
      });
      if (detected.source === "espn") {
        this.espnPublisher?.attachInboundListener();
      }
      this.tick();
      this.timer = setInterval(() => this.tick(), this.pollMs);
      if (detected.source === "espn" && typeof MutationObserver !== "undefined") {
        const root = this.win.document.querySelector(".draft-columns") || this.win.document.body;
        if (root) {
          let scheduled = false;
          this.observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => {
              scheduled = false;
              this.tick();
            }, 250);
          });
          this.observer.observe(root, { childList: true, subtree: true, characterData: true });
        }
      }
      return { ok: true };
    }
    stop() {
      this.stopped = true;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.observer?.disconnect();
      this.observer = null;
      this.espnPublisher?.detachInboundListener();
      this.espnPublisher?.disarm();
    }
    tick() {
      if (this.stopped || !this.monitor) return;
      const detected = detectSource(this.win);
      if (detected.source === "fantasypros") {
        this.monitor.applyAdapterResult(observeFantasyPros(this.win));
        return;
      }
      if (detected.source === "espn") {
        this.monitor.applyAdapterResult(observeEspn(this.win));
        this.espnPublisher?.onSnapshot(this.monitor.getSnapshot());
        return;
      }
      this.monitor.applyAdapterResult({
        ok: false,
        error: `Source lost (${detected.reason})`
      });
    }
    createMount() {
      if (this.preferPopup) {
        try {
          const popup = this.win.open(
            "",
            "rfsn-draft-board-monitor",
            "width=1720,height=920,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes"
          );
          if (popup && popup.document) {
            this.displayWin = popup;
            this.displayDoc = popup.document;
            popup.document.title = "Draft Board Monitor";
            popup.document.body.innerHTML = "";
            popup.document.body.style.margin = "0";
            const mount2 = popup.document.createElement("div");
            mount2.id = "dbm-mount";
            popup.document.body.appendChild(mount2);
            popup.addEventListener("beforeunload", () => this.stop());
            return mount2;
          }
        } catch {
        }
      }
      this.displayDoc = this.win.document;
      let mount = this.win.document.getElementById("dbm-mount");
      if (!mount) {
        mount = this.win.document.createElement("div");
        mount.id = "dbm-mount";
        mount.style.cssText = "position:fixed;inset:0;z-index:2147483646;overflow:auto;background:#0f1419;";
        this.win.document.body.appendChild(mount);
      }
      return mount;
    }
  };
  function startDraftBoardMonitor(opts) {
    const c = new MonitorController(opts);
    const result = c.start();
    if (!result.ok) {
      console.error("[DraftBoardMonitor]", result.error);
      try {
        alert(result.error);
      } catch {
      }
    }
    return c;
  }

  // ../standalone/draft-board-monitor/src/draft-monitor/browserEntry.ts
  var api = {
    start: startDraftBoardMonitor,
    version: "1.0.0-standalone"
  };
  try {
    window.DraftBoardMonitor = api;
    window.startDraftBoardMonitor = startDraftBoardMonitor;
  } catch {
  }
  if (!window.__RFSN_BOARD_MIRROR_STARTED__) {
    window.__RFSN_BOARD_MIRROR_STARTED__ = true;
    try {
      document.documentElement.dataset.rfsnBoardMirror = "1";
    } catch {
    }
    const fromExtension = typeof document !== "undefined" && Boolean(document.currentScript?.getAttribute?.("data-rfsn-ext"));
    startDraftBoardMonitor({
      preferPopup: !fromExtension,
      pollMs: 1e3
    });
  }
})();
//# sourceMappingURL=draft-board-monitor.iife.js.map
