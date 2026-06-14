// Short links for DNA Receipts: map a short code <-> the full signed Receipt token.
// Lets shared URLs be /r/<code> (~30 chars) instead of /p/<~400-char token>, and
// records a view count per share for the funnel. Reused by dnaRouter (mint + read)
// and receiptOg (the /r/:code crawler/landing route).
import { randomBytes } from "crypto";
import { getDb } from "./db";
import { receiptShares } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// Unambiguous base-56 alphabet (no 0/O/1/I/l) so codes are easy to read/type.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function genCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function mintShareCode(opts: {
  token: string;
  memberId?: string | null;
  leagueId?: string | null;
  createdByUserId?: number | null;
}): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode(8);
    try {
      await db.insert(receiptShares).values({
        code,
        token: opts.token,
        memberId: opts.memberId ?? null,
        leagueId: opts.leagueId ?? null,
        createdByUserId: opts.createdByUserId ?? null,
      });
      return code;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (msg.includes("duplicate") || msg.includes("primary")) continue; // code clash -> retry
      console.error("[receiptShare] mint failed:", e);
      return null;
    }
  }
  return null;
}

export async function resolveShareToken(code: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const clean = (code || "").trim();
  if (!clean || clean.length > 16) return null;
  try {
    const rows = await db
      .select({ token: receiptShares.token })
      .from(receiptShares)
      .where(eq(receiptShares.code, clean))
      .limit(1);
    const token = rows[0]?.token ?? null;
    if (token) {
      // best-effort view bump; never block the response on it
      void (async () => {
        try {
          await db
            .update(receiptShares)
            .set({ views: sql`${receiptShares.views} + 1` })
            .where(eq(receiptShares.code, clean));
        } catch { /* ignore */ }
      })();
    }
    return token;
  } catch (e) {
    console.error("[receiptShare] resolve failed:", e);
    return null;
  }
}

/**
 * Read the share row metadata (suggested owner + league) without bumping views.
 * Used by the claim path to preselect the owner/league from a /r/:code link.
 */
export async function resolveShareMeta(
  code: string,
): Promise<{ token: string; memberId: string | null; leagueId: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const clean = (code || "").trim();
  if (!clean || clean.length > 16) return null;
  try {
    const rows = await db
      .select({ token: receiptShares.token, memberId: receiptShares.memberId, leagueId: receiptShares.leagueId })
      .from(receiptShares)
      .where(eq(receiptShares.code, clean))
      .limit(1);
    const r = rows[0];
    return r ? { token: r.token, memberId: r.memberId ?? null, leagueId: r.leagueId ?? null } : null;
  } catch (e) {
    console.error("[receiptShare] meta resolve failed:", e);
    return null;
  }
}
