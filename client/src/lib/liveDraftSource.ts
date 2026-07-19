/**
 * Draft experience source ids used by Live/Mock control surfaces.
 *
 * Product model (permanent):
 * - LIVE  = real in-season league draft (ESPN today; Sleeper/Yahoo later)
 * - MOCK  = everything else (RFSN Local Mock, FantasyPros Mock, …)
 *
 * Legacy aliases kept at boundaries so older tests/storage keep working.
 */
import type { DraftProviderId } from "@shared/draftSource";

/** Live page — real league providers only. */
export type LiveDraftSource = "espn";

/** Mock page — non-league drafts. */
export type MockDraftSource = "rfsn" | "fantasypros";

/**
 * Control-surface source id (either experience).
 * Prefer experience-specific types at call sites.
 */
export type DraftControlSource = LiveDraftSource | MockDraftSource;

/** @deprecated Use DraftControlSource */
export type LegacyLiveDraftSource = "rfsn" | "espn";

export function normalizeLiveDraftSource(raw: unknown): LiveDraftSource {
  const s = String(raw ?? "").trim();
  if (s === "espn" || s === "connected-league" || s === "espn-live") return "espn";
  // Live never runs RFSN local — coerce legacy values to ESPN League.
  return "espn";
}

export function normalizeMockDraftSource(raw: unknown): MockDraftSource {
  const s = String(raw ?? "").trim();
  if (
    s === "fantasypros" ||
    s === "fantasypros-mock" ||
    s === "fp" ||
    s === "fp-mock"
  ) {
    return "fantasypros";
  }
  return "rfsn";
}

/** Normalize any control source (Live or Mock). */
export function normalizeDraftControlSource(raw: unknown): DraftControlSource {
  const s = String(raw ?? "").trim();
  if (s === "espn" || s === "connected-league" || s === "espn-live") return "espn";
  if (
    s === "fantasypros" ||
    s === "fantasypros-mock" ||
    s === "fp" ||
    s === "fp-mock"
  ) {
    return "fantasypros";
  }
  if (s === "rfsn" || s === "manual" || s === "rfsn-local-mock") return "rfsn";
  return "rfsn";
}

export function isEspnLiveDraftSource(source: string): boolean {
  return normalizeDraftControlSource(source) === "espn";
}

export function isRfsnLiveDraftSource(source: string): boolean {
  return normalizeDraftControlSource(source) === "rfsn";
}

export function liveSourceToProviderId(_source: LiveDraftSource): DraftProviderId {
  return "espn-live";
}

export function mockSourceToProviderId(source: MockDraftSource): DraftProviderId {
  return source === "fantasypros" ? "fantasypros-mock" : "rfsn-local-mock";
}
