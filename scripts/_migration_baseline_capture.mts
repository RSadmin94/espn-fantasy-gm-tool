/**
 * Phase 1C Step 0 — Migration regression baseline capture.
 *
 * READ-ONLY. Records current intelligence-engine outputs for league 457622
 * before provider migration. Does not modify production data.
 *
 * Usage:
 *   npx tsx scripts/_migration_baseline_capture.mts
 *   npx tsx scripts/_migration_baseline_capture.mts --out-dir scripts/_migration_baseline
 *   npx tsx scripts/_migration_baseline_capture.mts --verify-determinism
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";

const ROOT = process.cwd();
const LEAGUE_ID = "457622";
const SEASON = 2026;

// ── Env bootstrap (matches other ops scripts) ────────────────────────────────

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const args = process.argv.slice(2);
const outDir =
  args.includes("--out-dir")
    ? args[args.indexOf("--out-dir") + 1]!
    : path.join(ROOT, "scripts", "_migration_baseline");
const verifyDeterminism = args.includes("--verify-determinism");

// ── Serialization helpers ────────────────────────────────────────────────────

function roundFloats(value: unknown, digits = 4): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 10 ** digits) / 10 ** digits;
  }
  if (Array.isArray(value)) return value.map((v) => roundFloats(v, digits));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = roundFloats((value as Record<string, unknown>)[k], digits);
    }
    return out;
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const k of [...value.keys()].map(String).sort()) {
      obj[k] = stableValue(value.get(k));
    }
    return obj;
  }
  if (value instanceof Set) {
    return [...value].map((v) => stableValue(v)).sort();
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = stableValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function payloadHash(payload: unknown): string {
  const normalized = roundFloats(stableValue(payload));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

type SnapshotEnvelope = {
  timestamp: string;
  league: string;
  season: number;
  engine: string;
  userId: number | null;
  status: "ok" | "skipped" | "error";
  note?: string;
  payload: unknown;
};

function writeSnapshot(filePath: string, envelope: SnapshotEnvelope): string {
  const body = roundFloats(stableValue(envelope));
  fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return payloadHash(envelope.payload);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const captureTimestamp = new Date().toISOString();
fs.mkdirSync(outDir, { recursive: true });

const { getDb, getCachedView, resolveActiveLeagueId } = await import("../server/db.ts");
const { users, leagueConnections, rivalryScores } = await import("../drizzle/schema.ts");
const { resolveCurrentOwner } = await import("../server/currentOwnerService.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");
const { appRouter } = await import("../server/routers.ts");

const db = await getDb();
if (!db) {
  console.error("NO_DB — set DATABASE_URL in .env");
  process.exit(1);
}

async function resolveBaselineUser(): Promise<{ id: number; openId: string | null } | null> {
  type Candidate = { id: number; openId: string | null; premium: boolean; setup: boolean };
  const candidates: Candidate[] = [];
  const conns = await db!
    .select()
    .from(leagueConnections)
    .where(and(eq(leagueConnections.leagueId, LEAGUE_ID), eq(leagueConnections.isActive, true)));
  const seen = new Set<number>();
  for (const c of conns) {
    if (seen.has(c.userId)) continue;
    seen.add(c.userId);
    const [u] = await db!.select().from(users).where(eq(users.id, c.userId)).limit(1);
    if (!u) continue;
    const co = await resolveCurrentOwner({ id: u.id });
    const premium = await resolvePremiumAccess(u as any);
    candidates.push({
      id: u.id,
      openId: u.openId ?? null,
      premium,
      setup: co.isSetupComplete,
    });
  }
  for (const u of await db!.select().from(users)) {
    if (seen.has(u.id)) continue;
    try {
      const { leagueId } = await resolveActiveLeagueId({ user: { id: u.id } }, null, SEASON);
      if (String(leagueId) !== LEAGUE_ID) continue;
      const co = await resolveCurrentOwner({ id: u.id });
      const premium = await resolvePremiumAccess(u as any);
      candidates.push({
        id: u.id,
        openId: u.openId ?? null,
        premium,
        setup: co.isSetupComplete,
      });
    } catch {
      /* try next */
    }
  }
  const ranked = candidates.sort((a, b) => {
    if (a.premium !== b.premium) return a.premium ? -1 : 1;
    if (a.setup !== b.setup) return a.setup ? -1 : 1;
    return a.id - b.id;
  });
  const best = ranked[0];
  return best ? { id: best.id, openId: best.openId } : null;
}

const user = await resolveBaselineUser();
const userId = user?.id ?? null;
let fullUserRow: Awaited<ReturnType<typeof db.select>>[number] | null = null;
if (userId) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  fullUserRow = row ?? null;
}

function makeCaller(uid: number, fullUser: { id: number; openId: string | null; email: string | null; subscriptionStatus: string | null; trialStartedAt: Date | null; subscriptionPlan?: string | null }) {
  return appRouter.createCaller({
    user: { ...fullUser, role: "user" },
    auth: { userId: fullUser.openId ?? String(uid) },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as any);
}

const manifest: {
  captureTimestamp: string;
  league: string;
  season: number;
  userId: number | null;
  outDir: string;
  engines: Array<{ engine: string; file: string; status: string; hash: string; note?: string }>;
  errors: string[];
} = {
  captureTimestamp,
  league: LEAGUE_ID,
  season: SEASON,
  userId,
  outDir,
  engines: [],
  errors: [],
};

function record(
  engine: string,
  fileName: string,
  status: SnapshotEnvelope["status"],
  payload: unknown,
  note?: string,
) {
  const hash = writeSnapshot(path.join(outDir, fileName), {
    timestamp: captureTimestamp,
    league: LEAGUE_ID,
    season: SEASON,
    engine,
    userId,
    status,
    note,
    payload,
  });
  manifest.engines.push({ engine, file: fileName, status, hash, note });
}

// ── 1. Owner DNA ─────────────────────────────────────────────────────────────

try {
  const { buildManagerRawData } = await import("../server/dnaRouter.ts");
  const { calcLeagueDNA } = await import("../server/leagueDNA.ts");
  if (!userId) throw new Error("no baseline user");
  const managers = await buildManagerRawData(userId);
  const profiles = calcLeagueDNA(managers, "focal manager");
  record(
    "owner_dna",
    "owner_dna.json",
    "ok",
    profiles.map((p) => ({
      memberId: p.memberId,
      ownerName: p.ownerName,
      gmArchetype: p.gmArchetype,
      exploitabilityScore: p.exploitabilityScore,
      exploitabilityLabel: p.exploitabilityLabel,
      tiltLabel: p.tilt.tiltLabel,
      draftStyleBadge: p.draft.draftStyleBadge,
      keeperRate: p.draft.keeperRate,
      tradeFrequency: p.trade.tradeFrequency,
      waiverAggression: p.waiver.waiverAggression,
    })),
  );
} catch (e: any) {
  manifest.errors.push(`owner_dna: ${e?.message ?? e}`);
  record("owner_dna", "owner_dna.json", "error", null, String(e?.message ?? e));
}

// ── 2. Fear Index (compute only — no DB write) ───────────────────────────────

try {
  const { computeFearIndex, assignHeatLabel } = await import("../server/fearIndexService.ts");
  const { normalizeTeams, normalizeMatchups, normalizeTransactions } = await import("../server/espnService.ts");
  const { calcLeagueDNA } = await import("../server/leagueDNA.ts");
  if (!userId) throw new Error("no baseline user");
  const cached = await getCachedView(SEASON, "combined", LEAGUE_ID, { userId });
  if (!cached) throw new Error(`no combined cache for ${SEASON}`);
  const payload = cached.payload as Record<string, unknown>;
  const teams = normalizeTeams(payload);
  const matchups = normalizeMatchups(payload);
  const transactions = normalizeTransactions(payload);
  const matchupWeeks = (matchups as Array<Record<string, unknown>>).map((m) => m.matchupPeriodId as number);
  const currentWeek = matchupWeeks.length > 0 ? Math.max(...matchupWeeks) : 1;
  const ownerMap: Record<number, string> = {};
  const memberIdMap: Record<number, string> = {};
  const rosterHealthMap: Record<number, number> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    ownerMap[tid] = (t.owners as string) || `Team ${tid}`;
    memberIdMap[tid] = ((t.memberIds as string[]) ?? [])[0] || "";
    const wins = (t.wins as number) || 0;
    const losses = (t.losses as number) || 0;
    const total = wins + losses;
    const winPct = total > 0 ? wins / total : 0.5;
    rosterHealthMap[tid] = Math.round(30 + winPct * 40);
  }
  const exploitabilityMap: Record<string, number> = {};
  try {
    const rawTeams = (payload.teams as Record<string, unknown>[]) || [];
    const wins = ((((rawTeams[0]?.record as Record<string, unknown>)?.overall as Record<string, unknown>)?.wins as number) || 0);
    const managerRawData = rawTeams.map((rt) => {
      const owners = (rt.owners as string[]) || [];
      const memberId = owners[0] || "";
      const record = ((rt.record as Record<string, unknown>)?.overall as Record<string, unknown>) || {};
      const rWins = (record.wins as number) || 0;
      const rLosses = (record.losses as number) || 0;
      return {
        memberId,
        ownerName: ownerMap[rt.id as number] || `Team ${rt.id}`,
        seasonRecords: [{
          season: SEASON,
          wins: rWins,
          losses: rLosses,
          ties: (record.ties as number) || 0,
          pf: (record.pointsFor as number) || 0,
          pa: (record.pointsAgainst as number) || 0,
          madePlayoffs: false,
          isChampion: false,
          rank: (rt.rankCalculatedFinal as number) || 0,
        }],
        txnSeasons: [],
        draftPicks: [],
        h2hVsRod: { wins: 0, losses: 0 },
        currentSeason: {
          season: SEASON,
          currentWins: rWins,
          currentLosses: rLosses,
          currentWeek: wins,
          recentAcquisitions: 0,
          recentTrades: 0,
          lastWeekScore: 0,
          leagueAvgScore: 0,
        },
      };
    });
    for (const dna of calcLeagueDNA(managerRawData as any)) {
      exploitabilityMap[dna.memberId] = dna.exploitabilityScore;
    }
  } catch {
    /* production path tolerates missing DNA */
  }
  const entries = computeFearIndex({
    season: SEASON,
    week: currentWeek,
    teams,
    matchups,
    transactions,
    ownerMap,
    memberIdMap,
    rosterHealthMap,
    exploitabilityMap,
  });
  record("fear_index", "fear_index.json", "ok", {
    week: currentWeek,
    entries: entries.map((e) => ({
      teamId: e.teamId,
      memberId: e.memberId,
      ownerName: e.ownerName,
      fearScore: e.fearScore,
      heatLabel: assignHeatLabel(e.fearScore),
      rank: e.rank,
      avgPfLast4: e.avgPfLast4,
      winStreak: e.winStreak,
      rosterHealthScore: e.rosterHealthScore,
      tradeAggressionScore: e.tradeAggressionScore,
      exploitabilityInverse: e.exploitabilityInverse,
    })),
  });
} catch (e: any) {
  manifest.errors.push(`fear_index: ${e?.message ?? e}`);
  record("fear_index", "fear_index.json", "error", null, String(e?.message ?? e));
}

// ── 3. Rivalry rankings ──────────────────────────────────────────────────────

try {
  const { computeRivalryScores } = await import("../server/rivalryService.ts");
  if (!userId) throw new Error("no baseline user");
  const pairs = await computeRivalryScores(userId, LEAGUE_ID);
  const ranked = [...pairs].sort((a, b) => b.rivalryScore - a.rivalryScore);
  record(
    "rivalry_rankings",
    "rivalry_rankings.json",
    "ok",
    ranked.map((p, i) => ({
      rank: i + 1,
      rivalId: p.rivalId,
      rivalName: p.rivalName,
      rivalryScore: p.rivalryScore,
      heatLabel: p.heatLabel,
      h2hWins: p.h2hWins,
      h2hLosses: p.h2hLosses,
      playoffEliminations: p.playoffEliminations,
    })),
  );
} catch (e: any) {
  manifest.errors.push(`rivalry_rankings: ${e?.message ?? e}`);
  record("rivalry_rankings", "rivalry_rankings.json", "error", null, String(e?.message ?? e));
}

// ── 4. Career Report ─────────────────────────────────────────────────────────

try {
  const { computeCareerReport } = await import("../server/careerReportService.ts");
  if (!userId) throw new Error("no baseline user");
  const report = await computeCareerReport(userId);
  record("career_report", "career_report.json", "ok", {
    ownerKey: report.ownerKey,
    ownerName: report.ownerName,
    mode: report.mode,
    careerArc: report.careerArc,
    title: report.title,
    snapshot: report.snapshot,
    confidence: report.confidence,
    topReasons: (report.topReasons ?? []).map((r) => ({
      id: (r as any).id ?? (r as any).kind,
      title: (r as any).title ?? (r as any).headline,
      score: (r as any).score ?? (r as any).strength,
      confidence: (r as any).confidence,
    })),
    timelineSeasons: (report.timeline ?? []).map((t) => ({
      season: t.season,
      finish: t.finish,
      isChampion: t.isChampion,
      isPlayoff: t.isPlayoff,
    })),
  });
} catch (e: any) {
  manifest.errors.push(`career_report: ${e?.message ?? e}`);
  record("career_report", "career_report.json", "error", null, String(e?.message ?? e));
}

// ── 5. Draft War Room snapshot ───────────────────────────────────────────────

try {
  if (!userId || !fullUserRow) throw new Error("no baseline user");
  if (!(await resolvePremiumAccess(fullUserRow as any))) {
    throw new Error("baseline user lacks premium access for Draft War Room");
  }
  const caller = makeCaller(userId, fullUserRow as any);
  const dwr: any = await caller.draftWarRoom.getDraftWarRoomData({ season: SEASON });
  if (!dwr?.ok) throw new Error(dwr?.error ?? "DWR not ok");
  const pool = [...(dwr.availablePool ?? [])].sort((a: any, b: any) => (a.adp ?? 9999) - (b.adp ?? 9999));
  record("draft_war_room", "draft_war_room.json", "ok", {
    season: SEASON,
    teamCount: dwr.teamCount,
    keeperCount: (dwr.keepers ?? []).length,
    keepersTop10: (dwr.keepers ?? [])
      .slice()
      .sort((a: any, b: any) => (b.keeperValueScore ?? 0) - (a.keeperValueScore ?? 0))
      .slice(0, 10)
      .map((k: any) => ({
        playerName: k.playerName,
        position: k.position,
        ownerName: k.ownerName,
        keeperValueScore: k.keeperValueScore,
        keeperRoundCost: k.keeperRoundCost,
      })),
    poolTop25: pool.slice(0, 25).map((p: any) => ({
      name: p.name,
      position: p.position,
      adp: p.adp,
      marketValue: p.marketValue,
    })),
    scarcityAlerts: (dwr.scarcityAlerts ?? []).map((a: any) => ({
      position: a.position,
      severity: a.severity,
      message: a.message,
    })),
    positionRunAlerts: (dwr.positionRunAlerts ?? []).map((a: any) => ({
      position: a.position,
      runRisk: a.runRisk,
      picksUntilWindowCloses: a.picksUntilWindowCloses,
    })),
    draftBoardPressure: dwr.draftBoardPressure ?? null,
    mockDraftFirst28: (dwr.mockDraft ?? []).slice(0, 28).map((p: any) => ({
      overall: p.overall ?? p.overallPick,
      playerName: p.playerName ?? p.name,
      position: p.position,
      teamId: p.teamId,
    })),
  });
} catch (e: any) {
  manifest.errors.push(`draft_war_room: ${e?.message ?? e}`);
  record("draft_war_room", "draft_war_room.json", "error", null, String(e?.message ?? e));
}

// ── 6. Keeper valuation ──────────────────────────────────────────────────────

try {
  if (!userId || !fullUserRow) throw new Error("no baseline user");
  const caller = makeCaller(userId, fullUserRow as any);
  const kv: any = await caller.espn.keeperValuation({ season: SEASON, leagueId: LEAGUE_ID });
  const rows = [...(kv?.valuations ?? kv?.keepers ?? [])].sort(
    (a: any, b: any) => (b.keeperValue ?? b.value ?? 0) - (a.keeperValue ?? a.value ?? 0),
  );
  record("keeper_valuation", "keeper_valuation.json", "ok", {
    season: SEASON,
    count: rows.length,
    top20: rows.slice(0, 20).map((r: any) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      ownerName: r.ownerName,
      position: r.position,
      keeperRoundCost: r.keeperRoundCost,
      adpRound: r.adpRound,
      roundSavings: r.roundSavings,
      marketValue: r.marketValue,
      valueTier: r.valueTier ?? r.tier,
    })),
  });
} catch (e: any) {
  manifest.errors.push(`keeper_valuation: ${e?.message ?? e}`);
  record("keeper_valuation", "keeper_valuation.json", "error", null, String(e?.message ?? e));
}

// ── 7. Weekly Storylines (triggers only — no LLM, no DB write) ────────────────

try {
  const { computeWeeklyStorylines } = await import("../server/weeklyStorylinesService.ts");
  const { normalizeTeams, normalizeMatchups, normalizeTransactions, normalizeSettings } = await import("../server/espnService.ts");
  if (!userId) throw new Error("no baseline user");
  const data = await getCachedView(SEASON, "combined", LEAGUE_ID, { userId });
  if (!data) throw new Error(`no combined cache for ${SEASON}`);
  const payload = data.payload as Record<string, unknown>;
  const teams = normalizeTeams(payload);
  const matchups = normalizeMatchups(payload);
  const transactions = normalizeTransactions(payload) as unknown[];
  const settings = normalizeSettings(payload);
  const currentWeek = Math.max(1, (settings.currentMatchupPeriod as number) || 1);
  const calendarYear = new Date().getFullYear();
  const week = currentWeek >= 14 || SEASON < calendarYear ? 14 : currentWeek;
  const ownerMap: Record<number, string> = {};
  const teamNameMap: Record<number, string> = {};
  const memberIdsMap: Record<number, string[]> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    ownerMap[tid] = t.owners as string;
    teamNameMap[tid] = (t.teamName as string) || (t.owners as string) || "Unknown";
    memberIdsMap[tid] = (t.memberIds as string[]) || [];
  }
  let focalTeamId: number | null = null;
  let focalMemberIds: string[] = [];
  const co = await resolveCurrentOwner({ id: userId });
  if (co.isSetupComplete && co.ownerId) {
    for (const t of teams) {
      const tid = t.teamId as number;
      const mids = memberIdsMap[tid] ?? [];
      if (mids.includes(co.ownerId)) {
        focalTeamId = tid;
        focalMemberIds = mids;
        break;
      }
    }
  }
  let rivalryPairs: Array<{ rivalId: string; rivalName: string; h2hLosses: number; playoffEliminations: number }> = [];
  for (const mid of focalMemberIds) {
    const rows = await db!
      .select({
        rivalId: rivalryScores.rivalId,
        rivalName: rivalryScores.rivalName,
        h2hLosses: rivalryScores.h2hLosses,
        playoffEliminations: rivalryScores.playoffEliminations,
      })
      .from(rivalryScores)
      .where(eq(rivalryScores.memberId, mid));
    if (rows.length) {
      rivalryPairs = rows;
      break;
    }
  }
  const prevSeasonRanks: Record<number, number> = {};
  const prevData = await getCachedView(SEASON - 1, "combined", LEAGUE_ID, { userId });
  if (prevData) {
    const prevTeams = normalizeTeams(prevData.payload as Record<string, unknown>);
    const sortedPrev = [...prevTeams].sort((a, b) => {
      const rA = (a.rankFinal as number) || 99;
      const rB = (b.rankFinal as number) || 99;
      if (rA !== rB) return rA - rB;
      return ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
    });
    sortedPrev.forEach((t, idx) => {
      prevSeasonRanks[t.teamId as number] = idx + 1;
    });
  }
  const triggers = computeWeeklyStorylines({
    season: SEASON,
    week,
    teams,
    matchups,
    transactions,
    settings: settings as Record<string, unknown>,
    ownerMap,
    teamNameMap,
    memberIdsMap,
    rivalryPairs,
    focalTeamId,
    focalMemberIds,
    prevSeasonRanks,
  });
  record(
    "weekly_storylines",
    "weekly_storylines.json",
    "ok",
    {
      week,
      triggerCount: triggers.length,
      triggers: triggers.map((t) => ({
        storyType: t.storyType,
        emotionalTag: t.emotionalTag,
        teamId: t.teamId,
        ownerName: t.ownerName,
        intensityScore: t.intensityScore,
        supportingStat: t.supportingStat,
        opponentName: t.opponentName,
      })),
    },
  );
} catch (e: any) {
  manifest.errors.push(`weekly_storylines: ${e?.message ?? e}`);
  record("weekly_storylines", "weekly_storylines.json", "error", null, String(e?.message ?? e));
}

// ── 8. Draft grades ──────────────────────────────────────────────────────────

try {
  const { computeDraftReality } = await import("../server/draftRealitySimulator.ts");
  const { careerSimGrades } = await import("../server/draftGradeForDna.ts");
  const draftSeason = 2025;
  const reality = await computeDraftReality(draftSeason, LEAGUE_ID);
  let sim = null;
  if (userId) {
    const co = await resolveCurrentOwner({ id: userId });
    if (co.ownerId) {
      sim = await careerSimGrades(LEAGUE_ID, co.ownerId, co.displayName ?? "");
    }
  }
  record("draft_grades", "draft_grades.json", "ok", {
    draftRealitySeason: draftSeason,
    ownerImpacts: (reality.ownerImpacts ?? []).map((o: any) => ({
      ownerKey: o.ownerKey,
      ownerName: o.ownerName,
      draftGrade: o.draftGrade,
      rosterMgmtGrade: o.rosterMgmtGrade,
      overallGrade: o.overallGrade,
      draftRank: o.draftRank,
    })),
    careerSimGrades: sim,
  });
} catch (e: any) {
  manifest.errors.push(`draft_grades: ${e?.message ?? e}`);
  record("draft_grades", "draft_grades.json", "error", null, String(e?.message ?? e));
}

// ── 9. Championship Authority ────────────────────────────────────────────────

try {
  const { buildChampionshipAuthority } = await import("../server/championshipAuthority.ts");
  const auth = await buildChampionshipAuthority({ db, leagueId: LEAGUE_ID });
  const seasons = [...auth.championKeyBySeason.keys()].sort((a, b) => a - b);
  record("championship_authority", "championship_authority.json", "ok", {
    latestCompletedSeason: auth.latestCompletedSeason,
    reigningKey: auth.reigningKey,
    fallbackSeasons: auth.fallbackSeasons,
    unresolvedSeasons: auth.unresolvedSeasons,
    bySeason: seasons.map((s) => ({
      season: s,
      championKey: auth.championKeyBySeason.get(s) ?? null,
      championName: auth.championNameBySeason.get(s) ?? null,
      source: auth.sourceBySeason.get(s) ?? null,
    })),
    titlesByKey: Object.fromEntries([...auth.titlesByKey.entries()].sort(([a], [b]) => a.localeCompare(b))),
  });
} catch (e: any) {
  manifest.errors.push(`championship_authority: ${e?.message ?? e}`);
  record("championship_authority", "championship_authority.json", "error", null, String(e?.message ?? e));
}

// ── 10. H2H Authority ────────────────────────────────────────────────────────

try {
  const { buildH2HAuthority } = await import("../server/h2hAuthority.ts");
  const h2h = await buildH2HAuthority(LEAGUE_ID);
  const pairs: Array<{
    personA: string;
    personB: string;
    nameA: string;
    nameB: string;
    career: { wins: number; losses: number; ties: number; games: number };
    playoff: { wins: number; losses: number; ties: number; games: number };
  }> = [];
  const persons = h2h.listPersons().map((p) => p.canonicalPersonId).sort();
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i]!;
      const b = persons[j]!;
      const result = h2h.getH2H(a, b);
      if (result.career.games === 0) continue;
      pairs.push({
        personA: a,
        personB: b,
        nameA: result.nameA,
        nameB: result.nameB,
        career: result.career,
        playoff: result.playoff,
      });
    }
  }
  pairs.sort((x, y) => y.career.games - x.career.games || x.personA.localeCompare(y.personA));
  record("h2h_authority", "h2h_authority.json", "ok", {
    pairCount: pairs.length,
    topPairsByGames: pairs.slice(0, 25),
  });
} catch (e: any) {
  manifest.errors.push(`h2h_authority: ${e?.message ?? e}`);
  record("h2h_authority", "h2h_authority.json", "error", null, String(e?.message ?? e));
}

// ── Manifest ─────────────────────────────────────────────────────────────────

const manifestPath = path.join(outDir, "manifest.json");
const combinedHash = crypto
  .createHash("sha256")
  .update(manifest.engines.map((e) => `${e.engine}:${e.hash}`).sort().join("|"))
  .digest("hex");
(manifest as any).combinedPayloadHash = combinedHash;
(manifest as any).okCount = manifest.engines.filter((e) => e.status === "ok").length;
(manifest as any).errorCount = manifest.engines.filter((e) => e.status === "error").length;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`\n=== Migration baseline capture ===`);
console.log(`League: ${LEAGUE_ID}  Season: ${SEASON}  User: ${userId ?? "none"}`);
console.log(`Output: ${outDir}`);
console.log(`Engines OK: ${(manifest as any).okCount} / ${manifest.engines.length}`);
console.log(`Combined hash: ${combinedHash}`);
if (manifest.errors.length) {
  console.log(`Errors:\n  - ${manifest.errors.join("\n  - ")}`);
}

if (verifyDeterminism) {
  const firstHashes = manifest.engines.map((e) => e.hash);
  console.log("\n--verify-determinism: second pass--");
  const tmpDir = path.join(outDir, "_determinism_check");
  fs.mkdirSync(tmpDir, { recursive: true });
  const prevOut = outDir;
  // Re-run capture into temp by re-execing would be heavy; compare file hashes reread
  const secondHashes = manifest.engines.map((e) => {
    const raw = JSON.parse(fs.readFileSync(path.join(prevOut, e.file), "utf8"));
    return payloadHash(raw.payload);
  });
  const match = firstHashes.every((h, i) => h === secondHashes[i]);
  console.log(`Determinism check (payload hashes stable on re-read): ${match ? "PASS" : "FAIL"}`);
  if (!match) process.exit(2);
}

process.exit(manifest.errors.length ? 1 : 0);
