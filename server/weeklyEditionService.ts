import { and, eq, inArray } from "drizzle-orm";
import { gmRosterEntries } from "../drizzle/schema";
import { getDb } from "./db";
import { inspectLeagueWeek } from "./weeklyWeekInspect";
import { draftReceiptsForWeek, rivalryReceiptsForWeek, teamPacketsFromInspect } from "./weeklyWeekReceipts";
import { composeWeeklyEdition, sofiaStoriesFromEdition, storyFactPacket, type WeeklyEdition } from "./weeklyEdition";
import { getOrCreateWeeklyNarrative, listWeekNarratives, preferPublishedNarratives } from "./weeklySeasonNarratives";
import { isStarterSlot, type BenchRegret } from "./weeklyLineupOutcomes";
import { resolveCurrentOwner } from "./currentOwnerService";
import { SLOT_MAP } from "./espnService";

export async function loadWeeklyEdition(opts: {
  leagueId: string;
  season: number;
  week: number;
}): Promise<WeeklyEdition> {
  const inspect = await inspectLeagueWeek(opts);
  const rivalry = await rivalryReceiptsForWeek({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    matchups: inspect.matchups,
  });
  const regrets = inspect.matchups.map((m) => m.benchRegret).filter((r): r is BenchRegret => !!r);
  const drafts = await draftReceiptsForWeek({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    players: inspect.players,
    regrets,
  });
  const teams = teamPacketsFromInspect({
    matchups: inspect.matchups,
    leagueAverage: inspect.superlatives.leagueAverage,
    rivalry,
    drafts,
  });
  return composeWeeklyEdition({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    matchups: inspect.matchups,
    events: inspect.events,
    rivalry,
    teams,
    leagueAverage: inspect.superlatives.leagueAverage,
    mvp: inspect.superlatives.mvp,
    strongestRegret: inspect.superlatives.strongestRegret,
  });
}

export async function ensureEditionNarratives(opts: {
  leagueId: string;
  season: number;
  week: number;
  edition?: WeeklyEdition;
}) {
  const { resolveSeasonClockForLeague } = await import("./weeklySeasonEngine");
  const clock = await resolveSeasonClockForLeague({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
  });
  if (clock.weekStatus !== "FINAL") {
    return { edition: null as WeeklyEdition | null, results: [] as Awaited<ReturnType<typeof getOrCreateWeeklyNarrative>>[] };
  }
  const edition = opts.edition ?? (await loadWeeklyEdition(opts));
  const stories = sofiaStoriesFromEdition(edition);
  const results = [];
  for (const story of stories) {
    results.push(
      await getOrCreateWeeklyNarrative({
        leagueId: opts.leagueId,
        season: opts.season,
        week: opts.week,
        packet: storyFactPacket(story, { week: edition.week, season: edition.season }),
      }),
    );
  }
  return { edition, results };
}

export async function ensureOwnerTakeNarrative(opts: {
  leagueId: string;
  season: number;
  week: number;
  teamId: number;
}) {
  const { resolveSeasonClockForLeague } = await import("./weeklySeasonEngine");
  const clock = await resolveSeasonClockForLeague({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
  });
  if (clock.weekStatus !== "FINAL") {
    return { edition: null, take: null, narrative: null as null };
  }
  const edition = await loadWeeklyEdition(opts);
  const take = edition.ownerTakes.find((t) => t.teamId === opts.teamId);
  if (!take || !take.generateSofia) {
    return { edition, take: take ?? null, narrative: null as null };
  }
  const leagueStory = sofiaStoriesFromEdition(edition).find((s) => s.eventId === take.eventId);
  const packet = leagueStory
    ? storyFactPacket(leagueStory, { week: edition.week, season: edition.season })
    : {
        eventId: take.eventId,
        eventType: take.eventType,
        subject: take.ownerName,
        opponent: null,
        facts: take.facts,
        confidence: 90,
        tone: "Rivals booth — owner-facing, specific, no invented facts.",
      };
  const narrative = await getOrCreateWeeklyNarrative({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
    packet,
  });
  return { edition, take, narrative };
}

export async function weeklyEditionPayload(opts: {
  leagueId: string;
  season: number;
  week: number;
  userId?: number | null;
}) {
  const { resolveSeasonClockForLeague } = await import("./weeklySeasonEngine");
  const clock = await resolveSeasonClockForLeague({
    leagueId: opts.leagueId,
    season: opts.season,
    week: opts.week,
  });
  const owner = opts.userId != null ? await resolveCurrentOwner({ id: opts.userId }) : null;
  if (clock.weekStatus !== "FINAL") {
    return {
      edition: null,
      narratives: [],
      ownerTake: null,
      ownerTeamId: owner?.teamId ?? null,
      weekStatus: clock.weekStatus,
    };
  }
  const edition = await loadWeeklyEdition(opts);
  const narratives = preferPublishedNarratives(await listWeekNarratives(opts));
  const ownerTake =
    owner?.teamId != null ? edition.ownerTakes.find((t) => t.teamId === owner.teamId) ?? null : null;
  return {
    edition,
    narratives: narratives.map((n) => ({
      eventId: n.eventId,
      status: n.status,
      headline: n.headline,
      bodyText: n.bodyText,
      factFingerprint: n.factFingerprint,
      promptVersion: n.promptVersion,
    })),
    ownerTake,
    ownerTeamId: owner?.teamId ?? null,
    weekStatus: clock.weekStatus,
  };
}

export async function inspectRosterSnapshotThinness(opts: {
  leagueId: string;
  season: number;
  week: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      week: gmRosterEntries.week,
      slotId: gmRosterEntries.slotId,
      projected: gmRosterEntries.projectedPoints,
      teamId: gmRosterEntries.teamId,
      playerId: gmRosterEntries.playerId,
    })
    .from(gmRosterEntries)
    .where(
      and(
        eq(gmRosterEntries.leagueId, opts.leagueId),
        eq(gmRosterEntries.season, opts.season),
        inArray(gmRosterEntries.week, [0, opts.week]),
      ),
    );

  const tally = (week: number) => {
    const subset = rows.filter((r) => r.week === week);
    const bySlot: Record<string, number> = {};
    const teams = new Set<number>();
    let starters = 0;
    let bench = 0;
    let ir = 0;
    let projectedPositive = 0;
    for (const r of subset) {
      const key = SLOT_MAP[Number(r.slotId)] ?? `slot:${r.slotId}`;
      bySlot[key] = (bySlot[key] ?? 0) + 1;
      teams.add(Number(r.teamId));
      if (Number(r.slotId) === 20) bench += 1;
      else if (Number(r.slotId) === 21) ir += 1;
      else if (isStarterSlot(r.slotId)) starters += 1;
      if (r.projected != null && Number(r.projected) > 0) projectedPositive += 1;
    }
    return {
      total: subset.length,
      teams: teams.size,
      starters,
      bench,
      ir,
      bySlot,
      projectedPositive,
      startersPerTeam: teams.size ? Math.round((starters / teams.size) * 100) / 100 : 0,
      benchPerTeam: teams.size ? Math.round((bench / teams.size) * 100) / 100 : 0,
    };
  };

  const weekTally = tally(opts.week);
  const currentTally = tally(0);
  const reconstructable =
    weekTally.teams > 0 && weekTally.startersPerTeam >= 8 && weekTally.benchPerTeam >= 4;

  return {
    week: weekTally,
    currentWeek0: currentTally,
    reconstructable,
    classification: reconstructable
      ? "expected historical-provider behavior"
      : "relevant Week roster members may be missing",
    interpretation:
      "Scoring-period mRoster is the fantasy roster ESPN returned for that scoringPeriodId (starters + bench + IR present in the payload). Current week-0 is the live combined roster, which grows with later adds, IR expansion, and empty-slot churn. Do not copy week-0 into history. Season-total projectedPoints already exist on roster_entries from cached ESPN stats (statSourceId=1, statSplitTypeId=0). Weekly scoring-period projections are not currently extracted; keep INSUFFICIENT DATA until a future sprint maps those cached splits — no extra provider call.",
  };
}
