/**
 * Live Draft pick source — one active controller at a time.
 * - rfsn: built-in RFSN simulation (clock, AI/manual teams, booth)
 * - espn: real connected-league ESPN ingestion
 *
 * Legacy aliases ("manual" → rfsn, "connected-league" → espn) accepted at boundaries.
 */
export type LiveDraftSource = "rfsn" | "espn";

export function normalizeLiveDraftSource(raw: unknown): LiveDraftSource {
  const s = String(raw ?? "").trim();
  if (s === "espn" || s === "connected-league") return "espn";
  if (s === "rfsn" || s === "manual") return "rfsn";
  return "rfsn";
}

export function isEspnLiveDraftSource(source: string): boolean {
  return normalizeLiveDraftSource(source) === "espn";
}

export function isRfsnLiveDraftSource(source: string): boolean {
  return normalizeLiveDraftSource(source) === "rfsn";
}
