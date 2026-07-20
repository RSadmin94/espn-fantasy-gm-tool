/**
 * ESPN Fantasy Football Draft Room adapter — read-only DOM Pick History.
 * Must run inside the user's existing authenticated draft tab.
 * Does not open a second ESPN draft-room connection or call APIs.
 *
 * Proven lessons encoded here:
 * - .draft-columns has multiple children — do not assume first is Pick History
 * - Identify pick-history by content signatures
 * - P# may be snake position in round, not permanent team slot
 * - Team ownership comes from the pick record's fantasy team name
 */
import {
  emptySnapshot,
  type DraftStatus,
  type NormalizedDraftPick,
  type NormalizedDraftSnapshot,
  type NormalizedDraftTeam,
} from "../normalize/draftTypes";
import { buildEventKey } from "../normalize/eventKey";
import { resolveCurrentOwner } from "../normalize/pickOwnership";
import { resolvePlayerIdentityDefault } from "@shared/playerIdentityLookup";
import { espnPlayerHeadshotUrl, sleeperPlayerHeadshotUrl } from "@shared/playerHeadshot";

export type EspnDomPickRecord = {
  playerName: string;
  playerId?: string;
  headshotUrl?: string;
  nflTeam?: string;
  position?: string;
  round: number;
  pickInRound?: number;
  overallPick?: number;
  fantasyTeamName: string;
  isKeeper: boolean;
  keeperStatusKnown: boolean;
  rawText: string;
  sourceSequence: number;
};

/** Shared identity enrich — same resolver as Rivals Player Database. */
export function enrichEspnPickIdentity(args: {
  playerName: string;
  playerId?: string;
  headshotUrl?: string;
  nflTeam?: string;
  position?: string;
}): { playerId?: string; headshotUrl?: string; headshotCandidates?: string[] } {
  const resolved = resolvePlayerIdentityDefault({
    espnPlayerId: args.playerId,
    playerName: args.playerName,
    nflTeam: args.nflTeam,
    position: args.position,
  });
  const espnId = args.playerId || resolved.espnPlayerId || undefined;
  const candidates: string[] = [];
  const sleeperFull = sleeperPlayerHeadshotUrl(resolved.sleeperPlayerId, { size: "full" });
  if (sleeperFull) candidates.push(sleeperFull);
  if (args.headshotUrl && !candidates.includes(args.headshotUrl)) {
    candidates.push(args.headshotUrl);
  }
  const espnFull = espnPlayerHeadshotUrl(espnId, { w: 200, h: 145 });
  if (espnFull && !candidates.includes(espnFull)) candidates.push(espnFull);
  if (candidates.length === 0 && resolved.headshotUrl) {
    candidates.push(resolved.headshotUrl);
  }
  return {
    playerId: espnId,
    headshotUrl: candidates[0],
    headshotCandidates: candidates,
  };
}

export type EspnReadResult = {
  ok: boolean;
  error?: string;
  snapshot?: NormalizedDraftSnapshot;
  sourcePickCount?: number;
  pickHistoryFound?: boolean;
};

const POS_RE = /\b(QB|RB|WR|TE|K|PK|DST|DEF|D\/ST|DL|LB|DB|DP)\b/i;
const ROUND_PICK_RE = /(?:R(?:ound)?\s*)?(\d+)\D{1,6}(?:P(?:ick)?\s*)?(\d+)/i;
const OVERALL_RE = /(?:overall|#)\s*(\d+)/i;

export function scorePickHistoryColumn(el: Element): number {
  const text = (el.textContent || "").slice(0, 8000);
  let score = 0;
  if (/pick\s*history|draft\s*history/i.test(text.slice(0, 400))) score += 50;
  if (/available|player pool|search players/i.test(text.slice(0, 400))) score -= 40;
  const roundHits = (text.match(/\bR(?:ound)?\s*\d+/gi) || []).length;
  score += Math.min(40, roundHits * 2);
  const posHits = (text.match(POS_RE) || []).length;
  score += Math.min(30, posHits);
  // Leaf-like rows
  const children = el.querySelectorAll("*");
  let leafish = 0;
  for (let i = 0; i < Math.min(children.length, 400); i++) {
    const c = children[i]!;
    const t = (c.textContent || "").trim();
    if (t.length > 8 && t.length < 120 && POS_RE.test(t) && /[A-Za-z]/.test(t)) {
      leafish += 1;
    }
  }
  score += Math.min(40, leafish);
  return score;
}

/** Find Pick History among .draft-columns children (or fallback containers). */
export function findEspnPickHistoryRoot(doc: Document): Element | null {
  // Live-DOM proven (2026-07-19 samples, leagues 1691310982 & 149274835):
  // the Pick History tab panel is DIV.pick-history, containing one
  // .pick-history-table per round rendered as a FixedDataTable grid.
  const direct =
    doc.querySelector(".pick-history") ||
    doc.querySelector("[class*='pick-history']");
  if (direct) return direct;

  const columnsRoot =
    doc.querySelector(".draft-columns") ||
    doc.querySelector("[class*='draft-columns']") ||
    doc.querySelector("[class*='draftColumns']");

  if (columnsRoot) {
    const children = [...columnsRoot.children];
    if (children.length === 0) {
      // columns root itself may be the history
      if (scorePickHistoryColumn(columnsRoot) >= 20) return columnsRoot;
    } else {
      let best: Element | null = null;
      let bestScore = -Infinity;
      for (const child of children) {
        const s = scorePickHistoryColumn(child);
        if (s > bestScore) {
          bestScore = s;
          best = child;
        }
      }
      if (best && bestScore >= 15) return best;
    }
  }

  // Fallback: labeled regions
  const candidates = [
    ...doc.querySelectorAll(
      "[aria-label*='Pick History' i], [aria-label*='Draft History' i], [class*='pickHistory' i], [class*='PickHistory' i], [class*='draftHistory' i]",
    ),
  ];
  let best: Element | null = null;
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

export function parseEspnPickLeafText(
  text: string,
  sourceSequence: number,
): EspnDomPickRecord | null {
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

  // Common ESPN shapes:
  // "Player Name TEAM, POS R1 P3 Fantasy Team"
  // "Player Name TEAM POS Round 1 Pick 3 Team Name"
  let working = raw;
  if (isKeeper) working = working.replace(/\bkeeper\b/gi, " ").replace(/\s+/g, " ").trim();

  const position = posM ? normalizeEspnPos(posM[1]!) : undefined;

  // Split fantasy team — often last segment after position/round
  let fantasyTeamName = "";
  let playerPart = working;

  // Try: "Name ABBR, POS" then round then team
  const nameTeamPos = working.match(
    /^(.+?)\s+([A-Z]{2,4})(?:,\s*|\s+)(QB|RB|WR|TE|K|PK|DST|DEF|D\/ST|DL|LB|DB|DP)\b(.*)$/i,
  );
  let playerName = "";
  let nflTeam: string | undefined;

  if (nameTeamPos) {
    playerName = nameTeamPos[1]!.trim();
    nflTeam = nameTeamPos[2]!.toUpperCase();
    const rest = nameTeamPos[4]!.trim();
    fantasyTeamName = stripRoundTokens(rest);
  } else {
    // Weaker: first tokens until position
    const idx = posM ? working.search(POS_RE) : -1;
    if (idx > 0) {
      const left = working.slice(0, idx).trim();
      const right = working.slice(idx).replace(POS_RE, "").trim();
      const leftParts = left.split(/\s+/);
      if (leftParts.length >= 2 && /^[A-Z]{2,4}$/.test(leftParts[leftParts.length - 1]!)) {
        nflTeam = leftParts.pop()!.toUpperCase();
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
  const pickInRound = rp ? Math.max(1, Math.floor(Number(rp[2]))) : undefined;
  const overallPick = overallM
    ? Math.max(1, Math.floor(Number(overallM[1])))
    : undefined;

  fantasyTeamName = fantasyTeamName
    .replace(OVERALL_RE, "")
    .replace(/\bP#?\s*\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!fantasyTeamName) fantasyTeamName = "Unknown Team";

  return {
    playerName,
    nflTeam,
    position: position || (posM ? normalizeEspnPos(posM[1]!) : undefined),
    round,
    pickInRound,
    overallPick,
    fantasyTeamName,
    isKeeper,
    keeperStatusKnown,
    rawText: raw,
    sourceSequence,
  };
}

function stripRoundTokens(s: string): string {
  return s
    .replace(ROUND_PICK_RE, " ")
    .replace(/\bR(?:ound)?\s*\d+\b/gi, " ")
    .replace(/\bP(?:ick)?\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEspnPos(pos: string): string {
  const p = pos.toUpperCase();
  if (p === "DST" || p === "DEF") return "D/ST";
  if (p === "PK") return "K";
  return p;
}

/** Extract leaf pick records from a pick-history container. */
export function extractEspnPickRecords(root: Element): EspnDomPickRecord[] {
  const records: EspnDomPickRecord[] = [];
  const seen = new Set<string>();

  const nodes = root.querySelectorAll("li, tr, [class*='pick'], [class*='Pick'], div, span");
  let seq = 0;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]!;
    // Prefer leaf-ish nodes with short text
    if (el.children.length > 3) continue;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > 160) continue;
    // Skip if a child already has the same full text (prefer deeper leaf)
    let childHasSame = false;
    for (const ch of Array.from(el.children)) {
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

  // If nothing found, try splitting by newlines on the root text
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

/**
 * Structured extractor for ESPN's real Pick History markup
 * (live-DOM proven 2026-07-19): .pick-history > .pick-history-tables >
 * .pick-history-table (one per round, .caption = "Round N") containing a
 * FixedDataTable grid — rows are [role="row"], cells [role="gridcell"] with
 * .public_fixedDataTableCell_cellContent. Data rows carry .player-column with
 * .playerinfo__playername / .playerinfo__playerteam / .positionPill; the
 * fantasy TEAM cell is plain cellContent text.
 * Returns [] when the structured markup is absent (caller falls back to the
 * legacy leaf-text extractor).
 */
export function extractEspnGridRecords(root: Element): EspnDomPickRecord[] {
  const matched = [
    ...root.querySelectorAll(".pick-history-table, [class*='pick-history-table']"),
  ];
  // Drop container matches (e.g. the plural ".pick-history-tables" wrapper)
  // that contain other matched tables — keep leaf round-tables only.
  const tables = matched.filter((t) => !matched.some((o) => o !== t && t.contains(o)));
  if (tables.length === 0) return [];
  const records: EspnDomPickRecord[] = [];
  const seen = new Set<string>();
  let seq = 0;

  for (const table of Array.from(tables)) {
    const captionText = (
      table.querySelector(".caption, [class*='caption']")?.textContent || ""
    ).trim();
    const roundM = captionText.match(/round\s*(\d+)/i);
    if (!roundM) continue;
    const round = Math.max(1, Math.floor(Number(roundM[1])));

    const rows = table.querySelectorAll("[role='row']");
    for (const row of Array.from(rows)) {
      const playerCol = row.querySelector(".player-column, [class*='player-column']");
      if (!playerCol) continue; // header row / spacer

      const playerName = (
        playerCol.querySelector(".playerinfo__playername")?.textContent || ""
      ).replace(/\s+/g, " ").trim();
      if (!playerName) continue;

      const nflTeamRaw = (
        playerCol.querySelector(".playerinfo__playerteam")?.textContent || ""
      ).trim().toUpperCase();
      const posRaw = (
        playerCol.querySelector(".positionPill, [class*='positionPill'], .playerinfo__playerpos")
          ?.textContent || ""
      ).trim();

      // ESPN headshot + player id straight from the row's own image
      // (…/headshots/nfl/players/full/{id}.png behind the combiner).
      let headshotUrl: string | undefined;
      let espnPlayerId: string | undefined;
      for (const img of Array.from(playerCol.querySelectorAll("img"))) {
        const src = img.getAttribute("src") || "";
        const m = src.match(/headshots\/nfl\/players\/full\/(\d+)\.png/i);
        if (m) {
          espnPlayerId = m[1];
          headshotUrl = src;
          break;
        }
      }

      // Cells: ESPN's PICK column is the OVERALL pick number (continues
      // across rounds — live-DOM proven: Round 2 starts at 15). Fantasy team
      // = first non-numeric cellContent outside .player-column.
      let overallPick: number | undefined;
      let fantasyTeamName = "";
      const cells = row.querySelectorAll(".public_fixedDataTableCell_cellContent");
      for (const cell of Array.from(cells)) {
        if (playerCol.contains(cell) || cell.contains(playerCol)) continue;
        const t = (cell.textContent || "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        if (/^\d{1,3}$/.test(t)) {
          if (overallPick == null) overallPick = Math.floor(Number(t));
          continue;
        }
        if (/^[\d.,-]+$/.test(t)) continue; // points columns
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
        nflTeam: /^[A-Z]{2,4}$/.test(nflTeamRaw) ? nflTeamRaw : undefined,
        position: posRaw ? normalizeEspnPos(posRaw) : undefined,
        round,
        pickInRound: undefined, // derived later from overall + team count
        overallPick,
        fantasyTeamName,
        isKeeper,
        keeperStatusKnown,
        rawText: rowText.slice(0, 160),
        sourceSequence: seq++,
      });
    }
  }
  return records;
}

export function buildEspnFingerprint(args: {
  leagueId?: string | null;
  seasonId?: string | null;
  draftName?: string | null;
  teamNames: string[];
  href?: string | null;
}): string {
  if (args.leagueId) {
    return `espn:league:${args.leagueId}:${args.seasonId ?? ""}`;
  }
  const teams = args.teamNames.slice().sort().join("|");
  const urlBit = String(args.href ?? "")
    .replace(/https?:\/\/[^/]+/i, "")
    .slice(0, 80);
  return `espn:fp:${args.draftName ?? "draft"}:${args.teamNames.length}:${hashStr(teams + urlBit)}`;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function observeEspnFromDocument(
  doc: Document,
  opts?: { href?: string; nowIso?: string },
): EspnReadResult {
  const href = opts?.href ?? "";
  const url = safeUrl(href);
  const leagueId =
    url?.searchParams.get("leagueId") ||
    textMatch(doc.body?.innerText || "", /leagueId[=:](\d+)/i)?.[1] ||
    null;
  const seasonId =
    url?.searchParams.get("seasonId") ||
    textMatch(doc.body?.innerText || "", /seasonId[=:](\d+)/i)?.[1] ||
    null;

  const pickRoot = findEspnPickHistoryRoot(doc);
  if (!pickRoot) {
    // Pre-draft: teams may exist without history
    const teamsOnly = detectEspnTeamsFromPage(doc);
    if (teamsOnly.length > 0) {
      const fingerprint = buildEspnFingerprint({
        leagueId,
        seasonId,
        teamNames: teamsOnly.map((t) => t.teamName),
        href,
      });
      const bodyText = pageText(doc);
      let status: DraftStatus = "NOT_STARTED";
      if (/draft is complete|your draft is complete|draft complete/i.test(bodyText)) status = "COMPLETE";
      else if (/on the clock|your turn/i.test(bodyText)) status = "ACTIVE";

      return {
        ok: true,
        pickHistoryFound: false,
        sourcePickCount: 0,
        snapshot: {
          source: "espn",
          draftId: leagueId ? `espn-live-${leagueId}-${seasonId || "na"}` : undefined,
          draftName: detectDraftName(doc),
          status,
          teamCount: teamsOnly.length,
          teams: teamsOnly,
          picks: [],
          lastUpdatedAt: opts?.nowIso ?? new Date().toISOString(),
          draftFingerprint: fingerprint,
        },
      };
    }
    return { ok: false, error: "ESPN Pick History not found", pickHistoryFound: false };
  }

  // Structured FixedDataTable grid first (live-DOM proven); legacy leaf parse as fallback.
  const gridRecords = extractEspnGridRecords(pickRoot);
  const usingGrid = gridRecords.length > 0;
  const records = usingGrid ? gridRecords : extractEspnPickRecords(pickRoot);

  let teams: NormalizedDraftTeam[];
  if (usingGrid) {
    // Round 1 pick order IS the draft slot order — authoritative team list.
    const r1 = records
      .filter((r) => r.round === 1 && r.fantasyTeamName !== "Unknown Team")
      .sort((a, b) => (a.overallPick ?? 999) - (b.overallPick ?? 999));
    const ordered = unique(r1.map((r) => r.fantasyTeamName));
    // Include any teams that only appear in later rounds (traded away R1 pick).
    for (const n of unique(records.map((r) => r.fantasyTeamName))) {
      if (n !== "Unknown Team" && !ordered.some((o) => norm(o) === norm(n))) ordered.push(n);
    }
    teams = ordered.map((name, i) => ({
      teamId: `espn-team:${slug(name)}`,
      teamName: name,
      draftSlot: i + 1,
    }));
    // ESPN's PICK column is overall; derive pick-in-round now that team count is known.
    const n = teams.length;
    if (n > 0) {
      for (const rec of records) {
        if (rec.pickInRound == null && rec.overallPick != null) {
          rec.pickInRound = rec.overallPick - (rec.round - 1) * n;
          if (rec.pickInRound < 1 || rec.pickInRound > n) rec.pickInRound = undefined;
        }
      }
    }
  } else {
    const teamNames = unique(
      records.map((r) => r.fantasyTeamName).filter((n) => n && n !== "Unknown Team"),
    );
    teams = teamNames.map((name, i) => ({
      teamId: `espn-team:${slug(name)}`,
      teamName: name,
      draftSlot: i + 1,
    }));
  }

  // Prefer page team list order only on the legacy path (page detection is
  // heuristic and produced garbage names on the live DOM; grid teams win).
  const pageTeams = usingGrid ? [] : detectEspnTeamsFromPage(doc);
  if (pageTeams.length >= teams.length && pageTeams.length > 0) {
    teams = pageTeams;
  } else if (pageTeams.length > 0) {
    // Merge names
    const byNorm = new Map(pageTeams.map((t) => [norm(t.teamName), t]));
    teams = teams.map(({ teamName: name }, i) => {
      const hit = byNorm.get(norm(name));
      return (
        hit || {
          teamId: `espn-team:${slug(name)}`,
          teamName: name,
          draftSlot: i + 1,
        }
      );
    });
  }

  // Best-effort user-team detection (ISOLATED: a failure here must never
  // affect team discovery, picks, ownership, rendering, polling, or rebuild).
  // Match rule: EXACTLY ONE exact normalized match tints a team. Zero or
  // multiple matches → no highlight. No fuzzy/substring matching.
  let userTeamNote = "off (auto): no team selector found";
  try {
    const userName = detectEspnUserTeamName(doc);
    if (userName) {
      const un = norm(userName);
      const matches = teams.filter((t) => norm(t.teamName) === un);
      if (matches.length === 1) {
        matches[0]!.isUserTeam = true;
        userTeamNote = `auto: "${matches[0]!.teamName}" (roster selector)`;
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
    href,
  });
  const draftId = leagueId
    ? `espn-live-${leagueId}-${seasonId || "na"}`
    : undefined;

  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const picks: NormalizedDraftPick[] = [];

  for (const rec of records) {
    const owner = resolveCurrentOwner({
      currentTeamName: rec.fantasyTeamName,
      teams,
    });

    // overall from round/pick when teamCount known
    let overall = rec.overallPick;
    if (
      overall == null &&
      rec.pickInRound != null &&
      teams.length > 0
    ) {
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
      playerName: rec.playerName,
    });

    const identity = enrichEspnPickIdentity({
      playerName: rec.playerName,
      playerId: rec.playerId,
      headshotUrl: rec.headshotUrl,
      nflTeam: rec.nflTeam,
      position: rec.position,
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
      headshotCandidates: identity.headshotCandidates,
      nflTeam: rec.nflTeam,
      position: rec.position,
      isKeeper: rec.isKeeper,
      isTradedPick: false, // set below if slot evidence appears
      isLiveSelection: !rec.isKeeper,
      keeperStatusKnown: rec.keeperStatusKnown,
      sourceSequence: rec.sourceSequence,
      sourceTimestamp: nowIso,
    });
  }

  // Detect traded picks: same round with team owning pickInRound that doesn't match snake slot.
  // MIRROR DOCTRINE: this is an INFERENCE, not evidence. On the proven grid path we
  // observed (live 2026-07-19) that ESPN round 1 can legitimately contain the same
  // team twice (traded/keeper slots), which breaks slot inference and mislabels
  // dozens of picks. So: never infer trades from the grid — placement is already by
  // current owner, and trade badges wait for explicit source evidence (M2).
  if (!usingGrid) {
    annotateTradesFromSnakeMismatch(picks, teams);
  }

  const bodyText = pageText(doc);
  let status: DraftStatus = "UNKNOWN";
  if (
    /draft is complete|your draft is complete|draft complete/i.test(bodyText) ||
    /draft is complete|your draft is complete|draft complete/i.test(pickRoot.textContent || "")
  ) {
    status = "COMPLETE";
  } else if (picks.length === 0) {
    status = "NOT_STARTED";
  } else if (/paused|draft paused/i.test(bodyText)) {
    status = "PAUSED";
  } else {
    status = "ACTIVE";
  }

  const roundCount = picks.length
    ? Math.max(...picks.map((p) => p.round))
    : undefined;

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
      currentOverallPick:
        status === "COMPLETE"
          ? undefined
          : picks.length
            ? Math.max(...picks.map((p) => p.overallPick ?? 0)) + 1
            : 1,
      userTeamId: userTeam?.teamId,
      userTeamNote,
      lastUpdatedAt: nowIso,
      draftFingerprint: fingerprint,
    },
  };
}

/**
 * If pickInRound implies a snake slot team that differs from the named fantasy team,
 * mark as traded and preserve original slot team.
 * Only when draftSlot ordering is known and safe.
 */
export function annotateTradesFromSnakeMismatch(
  picks: NormalizedDraftPick[],
  teams: NormalizedDraftTeam[],
): void {
  if (teams.length < 2) return;
  const bySlot = new Map(
    teams.filter((t) => t.draftSlot != null).map((t) => [t.draftSlot!, t]),
  );
  if (bySlot.size !== teams.length) return;

  for (const p of picks) {
    if (p.pickInRound == null) continue;
    const n = teams.length;
    const round = p.round;
    const pir = p.pickInRound;
    // Classic snake: odd rounds left-to-right, even right-to-left
    const slot =
      round % 2 === 1 ? pir : n - pir + 1;
    const original = bySlot.get(slot);
    if (!original) continue;
    if (original.teamId !== p.currentTeamId && norm(original.teamName) !== norm(p.currentTeamName)) {
      p.isTradedPick = true;
      p.originalTeamId = original.teamId;
      p.originalTeamName = original.teamName;
      p.originalDraftSlot = slot;
    }
  }
}

function detectEspnUserTeamName(doc: Document): string | null {
  // ESPN draft roster viewer: a <select> of fantasy teams whose current
  // selection defaults to the viewer's own team. Skip the rounds dropdown
  // (options look like "Round N" / "All Rounds").
  for (const sel of Array.from(doc.querySelectorAll("select"))) {
    const s = sel as HTMLSelectElement;
    const opts = Array.from(s.options || []);
    if (opts.length < 2) continue;
    if (opts.some((o) => /^round\s*\d+$|all rounds/i.test((o.textContent || "").trim()))) continue;
    const selected =
      (s.selectedOptions && s.selectedOptions[0]) ||
      opts.find((o) => o.selected) ||
      opts[s.selectedIndex] ||
      null;
    const name = (selected?.textContent || "").replace(/\s+/g, " ").trim();
    if (name && name.length > 2 && !/^(select|choose|view)/i.test(name)) return name;
  }
  return null;
}

function detectEspnTeamsFromPage(doc: Document): NormalizedDraftTeam[] {
  const out: NormalizedDraftTeam[] = [];
  const seen = new Set<string>();

  // Common roster/team header chips
  const nodes = doc.querySelectorAll(
    "[class*='teamName'], [class*='TeamName'], [class*='roster'], [data-team-id]",
  );
  let slot = 1;
  for (const el of Array.from(nodes).slice(0, 40)) {
    const name = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) continue;
    if (/round|pick|overall|available|qb|rb|wr/i.test(name)) continue;
    const key = norm(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const teamId =
      el.getAttribute("data-team-id") || `espn-team:${slug(name)}`;
    const isUser =
      /your team|you$/i.test(name) ||
      el.className.toString().toLowerCase().includes("user");
    out.push({
      teamId,
      teamName: name,
      draftSlot: slot++,
      isUserTeam: isUser,
    });
  }
  return out;
}

function detectDraftName(doc: Document): string | undefined {
  const title = doc.title?.trim();
  if (title && !/^espn/i.test(title)) return title.slice(0, 80);
  const h = doc.querySelector("h1, h2, .league-name, [class*='leagueName']");
  const t = h?.textContent?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 80) : undefined;
}

export function observeEspn(
  win: Window,
): EspnReadResult {
  return observeEspnFromDocument(win.document, {
    href: win.location?.href,
  });
}

export function espnAdapterErrorSnapshot(error: string): NormalizedDraftSnapshot {
  return emptySnapshot("espn", {
    status: "UNKNOWN",
    draftFingerprint: "espn:error",
    draftName: error,
  });
}

function pageText(doc: Document): string {
  return doc.body?.innerText || doc.body?.textContent || doc.documentElement?.textContent || "";
}

function safeUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

function textMatch(text: string, re: RegExp): RegExpMatchArray | null {
  return text.match(re);
}

function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = norm(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "team";
}
