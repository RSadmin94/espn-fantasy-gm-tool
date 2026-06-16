/**
 * League Context Foundation — Step 2A: declared-format persistence (backend only).
 *
 * Read/write accessors for the league-level declared format override
 * (`league_format_declarations`). This is the authoritative source of league format
 * when present; the League Context resolver gives it precedence over ESPN detection.
 *
 * No UI, no Trade Analyzer wiring. Reads are defensive: if the table is missing (a deploy
 * where the migration has not yet run) or the DB is unavailable, getDeclaredLeagueFormat
 * returns null and the resolver simply falls back to detection — nothing throws.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { gmLeagueFormatDeclarations } from "../drizzle/schema";

export type DeclaredLeagueFormat = "redraft" | "keeper" | "dynasty";

const VALID_FORMATS: ReadonlySet<string> = new Set(["redraft", "keeper", "dynasty"]);

export function isDeclaredLeagueFormat(value: unknown): value is DeclaredLeagueFormat {
  return typeof value === "string" && VALID_FORMATS.has(value);
}

function normalizeLeagueId(leagueId: string): string {
  return String(leagueId).trim().slice(0, 32);
}

/**
 * Read the league-level declared format, or null when none exists / unavailable.
 * Never throws — a missing table or DB error is treated as "no declaration".
 */
export async function getDeclaredLeagueFormat(leagueId: string): Promise<DeclaredLeagueFormat | null> {
  const lid = normalizeLeagueId(leagueId);
  if (!lid) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select({ declaredFormat: gmLeagueFormatDeclarations.declaredFormat })
      .from(gmLeagueFormatDeclarations)
      .where(eq(gmLeagueFormatDeclarations.leagueId, lid))
      .limit(1);
    const value = rows?.[0]?.declaredFormat;
    return isDeclaredLeagueFormat(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Upsert the league-level declared format. Returns true on success, false on
 * invalid input or DB failure. (No caller in Step 2A — exposed for the later
 * declaration endpoint/UI.)
 */
export async function setDeclaredLeagueFormat(
  leagueId: string,
  format: DeclaredLeagueFormat,
  declaredByUserId?: number,
): Promise<boolean> {
  const lid = normalizeLeagueId(leagueId);
  if (!lid || !isDeclaredLeagueFormat(format)) return false;
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .insert(gmLeagueFormatDeclarations)
      .values({ leagueId: lid, declaredFormat: format, declaredByUserId: declaredByUserId ?? null })
      .onDuplicateKeyUpdate({ set: { declaredFormat: format, declaredByUserId: declaredByUserId ?? null } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a league's declared format (revert to detection). Returns true on success.
 */
export async function clearDeclaredLeagueFormat(leagueId: string): Promise<boolean> {
  const lid = normalizeLeagueId(leagueId);
  if (!lid) return false;
  try {
    const db = await getDb();
    if (!db) return false;
    await db.delete(gmLeagueFormatDeclarations).where(eq(gmLeagueFormatDeclarations.leagueId, lid));
    return true;
  } catch {
    return false;
  }
}
