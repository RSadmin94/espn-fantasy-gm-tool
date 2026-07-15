import type { AppDb } from "../../db";
import { gmDraftPicks } from "../../../drizzle/schema";
import { asc, eq } from "drizzle-orm";
import { loadOwnerProfileSharedData } from "../../ownerProfileService";
import { getBlankPickResolver } from "../blankPickResolver";
import type { DraftPickRow } from "./types";

export async function loadChoiceLedgerInputs(args: { db: AppDb; leagueId: string }) {
  const { db, leagueId } = args;
  const shared = await loadOwnerProfileSharedData({ db, leagueId });

  const orderedPicks = await db
    .select({
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      roundId: gmDraftPicks.roundId,
      roundPick: gmDraftPicks.roundPick,
      overallPick: gmDraftPicks.overallPick,
      isKeeper: gmDraftPicks.isKeeper,
      season: gmDraftPicks.season,
      teamId: gmDraftPicks.teamId,
      rawPick: gmDraftPicks.rawPick,
    })
    .from(gmDraftPicks)
    .where(eq(gmDraftPicks.leagueId, leagueId))
    .orderBy(asc(gmDraftPicks.season), asc(gmDraftPicks.overallPick));

  const draftRows: DraftPickRow[] = orderedPicks.map((r) => ({
    playerName: r.playerName ?? "",
    position: r.position ?? "",
    roundId: r.roundId,
    roundPick: r.roundPick,
    overallPick: r.overallPick,
    isKeeper: r.isKeeper,
    season: r.season,
    teamId: r.teamId,
    rawPick: r.rawPick,
  }));

  // Enrich blank picks (name/position "?") at read time from the registry + raw draftDetail + ESPN
  // D/ST map. Read-only: draft_picks is never mutated. Leagues with no blanks are untouched.
  const { map: resolver } = await getBlankPickResolver(db, leagueId);
  if (resolver.size > 0) {
    for (const row of draftRows) {
      if (row.playerName && row.position && row.position !== "?") continue;
      const id = resolver.get(`${row.season}:${row.overallPick}`);
      if (id) { row.playerName = id.playerName; row.position = id.position; }
    }
  }

  return { shared, draftRows };
}
