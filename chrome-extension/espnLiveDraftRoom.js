/**
 * RFSN-031B — Narrow ESPN live-draft URL classification (extension + tests).
 * No DOM scraping; URL-only. Does not authorize capture.
 */

/** @typedef {"live_draft_room"|"draft_recap"|"league_home"|"historical"|"unsupported"} EspnUrlKind */

/**
 * Supported live draft room patterns (football):
 * - /football/draft?leagueId=
 * - /football/league/draft?leagueId=
 * - /ffl/draft?leagueId= (legacy path occasionally seen)
 * Excludes draftrecap, league home, history, standings, etc.
 *
 * @param {string} href
 * @returns {EspnUrlKind}
 */
export function classifyEspnFantasyUrl(href) {
  let u;
  try {
    u = new URL(String(href || ""));
  } catch {
    return "unsupported";
  }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)espn\.com$/i.test(host) && host !== "fantasy.espn.com") {
    return "unsupported";
  }
  const path = (u.pathname || "").toLowerCase();
  const search = u.search || "";

  if (/draftrecap/i.test(path) || /[?&]view=draftrecap/i.test(search)) {
    return "draft_recap";
  }
  if (/\/history\b/i.test(path) || /\/league\/history/i.test(path)) {
    return "historical";
  }
  // Active live draft room — path must be a draft surface, not recap.
  if (
    /\/football\/draft\/?$/i.test(path) ||
    /\/football\/league\/draft\/?$/i.test(path) ||
    /\/ffl\/draft\/?$/i.test(path) ||
    /\/football\/draft\//i.test(path)
  ) {
    // Subpaths like /draft/recap already handled; allow room with or without leagueId
    // (leagueId absence is a separate matching failure, not "unsupported").
    if (!/recap/i.test(path)) return "live_draft_room";
  }
  // Query-style draft entry occasionally used by ESPN SPA redirects.
  if (/\/football\/league\/?$/i.test(path) && /[?&]draft=/i.test(search)) {
    return "live_draft_room";
  }
  if (/\/football\/league\/?$/i.test(path) || /\/football\/team\b/i.test(path)) {
    return "league_home";
  }
  if (/\/football\b/i.test(path)) {
    return "unsupported";
  }
  return "unsupported";
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isSupportedEspnLiveDraftRoomUrl(href) {
  return classifyEspnFantasyUrl(href) === "live_draft_room";
}

/**
 * @param {string} href
 * @returns {string|null} numeric league id or null
 */
export function extractEspnLeagueIdFromUrl(href) {
  try {
    const u = new URL(String(href || ""));
    const qp = u.searchParams.get("leagueId") || u.searchParams.get("league_id");
    if (qp && /^\d+$/.test(String(qp).trim())) return String(qp).trim();
    const m =
      String(href).match(/[?&]leagueId=(\d+)/i) ||
      String(href).match(/[?&]league_id=(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} href
 * @returns {number|null}
 */
export function extractEspnSeasonFromUrl(href) {
  try {
    const u = new URL(String(href || ""));
    const qp = u.searchParams.get("seasonId") || u.searchParams.get("season");
    const n = Math.floor(Number(qp));
    if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  } catch {
    /* ignore */
  }
  return null;
}
