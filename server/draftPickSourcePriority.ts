/**
 * Which draft_picks row wins when multiple rows share the same overallPick.
 * Season 2025: HTML draft recap scrape is canonical over mDraftDetail API.
 */

export const SEASON_DRAFT_RECAP_HTML_CANONICAL = 2025;

export function isDraftRecapHtmlRawPick(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const j = JSON.parse(raw) as { source?: string };
    return j.source === "draft_recap_html";
  } catch {
    return false;
  }
}

export function isEspnApiDraftRawPick(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const j = JSON.parse(raw) as { source?: string };
    return j.source === "espn_mDraftDetail_api";
  } catch {
    return false;
  }
}

/** Higher rank wins duplicate overallPick rows. */
export function draftPickSourceRank(season: number, raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const j = JSON.parse(raw) as { source?: string; overallPickNumber?: number };
    const yr = Math.floor(season);
    if (yr === SEASON_DRAFT_RECAP_HTML_CANONICAL) {
      if (j.source === "draft_recap_html") return 4;
      if (j.source === "espn_mDraftDetail_api") return 3;
      if (j.overallPickNumber != null) return 1;
      return 0;
    }
    if (j.source === "espn_mDraftDetail_api") return 3;
    if (j.source === "draft_recap_html") return 2;
    if (j.overallPickNumber != null) return 1;
    return 0;
  } catch {
    return 0;
  }
}

export function canonicalSourceLabelForSeason(season: number, scrapeRowCount: number): string {
  if (season === SEASON_DRAFT_RECAP_HTML_CANONICAL && scrapeRowCount > 0) {
    return "draft_recap_html";
  }
  if (season === SEASON_DRAFT_RECAP_HTML_CANONICAL) {
    return "espn_mDraftDetail_api_or_legacy";
  }
  return "default_priority";
}

export function sourcePriorityDescription(season: number): string {
  if (season === SEASON_DRAFT_RECAP_HTML_CANONICAL) {
    return "2025: draft_recap_html > espn_mDraftDetail_api > other";
  }
  return "other seasons: espn_mDraftDetail_api > draft_recap_html > other";
}

/** Rows in draft_picks with rawPick.source = draft_recap_html for this season. */
export async function countDraftRecapHtmlRows(leagueId: string, season: number): Promise<number> {
  const { getDb } = await import("./db.js");
  const { gmDraftPicks } = await import("../drizzle/schema.js");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return 0;
  const lid = String(leagueId).trim().slice(0, 32);
  const yr = Math.floor(season);
  const rows = await db
    .select({ rawPick: gmDraftPicks.rawPick })
    .from(gmDraftPicks)
    .where(and(eq(gmDraftPicks.leagueId, lid), eq(gmDraftPicks.season, yr)));
  return rows.filter((r) => isDraftRecapHtmlRawPick(r.rawPick)).length;
}
