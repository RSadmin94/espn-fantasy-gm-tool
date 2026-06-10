/**
 * leagueDisplayName.ts
 * ────────────────────
 * Self-healing resolution of a connected league's display name.
 *
 * Some connections were saved with a placeholder name ("League 457622" or
 * "ESPN League 457622") because the real name couldn't be fetched at connect
 * time (e.g. a private league previewed without authenticated cookies). The
 * real name lives in the cached combined ESPN payload (settings.name). When a
 * placeholder is detected on read, resolve the real name from cache and persist
 * it back, so the fix is permanent and future reads are already clean.
 */
import { getCachedView, getAllCachedSeasons, getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PLACEHOLDER_LEAGUE_NAME_RE = /^(espn\s+)?league\s+\d+$/i;

/** True when a stored league name is empty or the auto-generated ID placeholder. */
export function isPlaceholderLeagueName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n === "" || PLACEHOLDER_LEAGUE_NAME_RE.test(n);
}

export interface LeagueNameRow {
  id: number;
  leagueId: string;
  leagueName: string | null;
  season: number;
}

/**
 * Return the best display name for a league connection. If the stored name is a
 * placeholder, resolve the real name from the latest cached combined payload's
 * settings.name and persist it back to the row. Falls back to the stored value.
 */
export async function resolveLeagueDisplayName(
  row: LeagueNameRow,
  userId: number,
): Promise<string> {
  if (!isPlaceholderLeagueName(row.leagueName)) return row.leagueName as string;
  try {
    const seasons = Array.from(
      new Set<number>([row.season, ...(await getAllCachedSeasons(row.leagueId, userId))]),
    )
      .filter((s) => s > 2000)
      .sort((a, b) => b - a);
    for (const s of seasons) {
      const payload = (await getCachedView(s, "combined", row.leagueId, { userId })) as
        | Record<string, unknown>
        | null;
      const settings = payload?.settings as Record<string, unknown> | undefined;
      const nm = settings?.name;
      if (typeof nm === "string" && nm.trim()) {
        const clean = nm.trim();
        const db = await getDb();
        if (db) {
          await db
            .update(leagueConnections)
            .set({ leagueName: clean })
            .where(eq(leagueConnections.id, row.id));
        }
        return clean;
      }
    }
  } catch {
    /* fall through to stored value */
  }
  return row.leagueName || `League ${row.leagueId}`;
}
