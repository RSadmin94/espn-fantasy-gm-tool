/**
 * Helpers for OPTIONAL enrichment tables that may not exist in every environment.
 *
 * `rivalry_scores` and `reputation_events` are enrichment layers (heat labels, lore
 * sentences, reputation badges). The core Rivalry Center / all-time H2H is served live
 * from the combined ESPN cache + gmMatchups and does NOT depend on these tables.
 *
 * In environments where these tables have not been migrated (e.g. current production),
 * read paths should degrade to empty results and write paths should no-op, rather than
 * throwing ER_NO_SUCH_TABLE. This module centralizes the "is the backing table absent?"
 * check so that behavior is consistent and easy to audit.
 *
 * NOTE: Drizzle wraps driver errors in a DrizzleQueryError whose own `message` is just
 * "Failed query: ...". The underlying mysql2 error (with code ER_NO_SUCH_TABLE / errno
 * 1146 / sqlMessage "Table '...' doesn't exist") is carried on the `.cause` chain, so we
 * must walk that chain rather than only inspecting the top-level error.
 *
 * This is intentionally NOT a feature: it only prevents optional-enrichment DB access
 * from crashing endpoints when the table is absent.
 */

/** True when a DB error (or any error in its `.cause` chain) means the table does not exist. */
export function isMissingTableError(e: unknown): boolean {
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 6; depth++) {
    const err = cur as { code?: string; errno?: number; message?: string; sqlMessage?: string; cause?: unknown };
    const code = err.code;
    const errno = err.errno;
    const text = String(err.sqlMessage ?? "") + " " + String(err.message ?? "");
    if (
      code === "ER_NO_SUCH_TABLE" ||
      errno === 1146 ||
      /no such table/i.test(text) ||
      /unknown table/i.test(text) ||
      /doesn'?t exist/i.test(text) ||
      /relation .*does not exist/i.test(text)
    ) {
      return true;
    }
    cur = err.cause;
  }
  return false;
}
