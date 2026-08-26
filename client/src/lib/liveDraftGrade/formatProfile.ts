import type { DefenseKey, FormatProfile, GradePos, QbMode } from "./types";

export type FormatProfileInput = {
  leagueId?: string | null;
  /** War Room lineup requirements (QB/RB/WR/TE/FLEX/K/DEF/DP) */
  lineupReqs?: Record<string, number> | null;
  /** Soft caps from server roster rules when available */
  softCap?: Partial<Record<string, number>> | null;
  /** Hard caps (= positionCaps from War Room today) */
  hardCap?: Partial<Record<string, number>> | null;
  positionCaps?: Record<string, number> | null;
  benchSlots?: number | null;
  irSlots?: number | null;
  superflexSlots?: number | null;
  /**
   * When false, never infer Superflex from QB hard-cap heuristics.
   * Post-Draft Evaluation sets this false and only honors an explicit slot-7 count.
   */
  allowSuperflexInference?: boolean | null;
  receptionPoints?: number | null;
  tePremium?: boolean | null;
  isBestBall?: boolean | null;
};

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function emptyStarters(): Record<GradePos, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0, DP: 0 };
}

function deriveQbMode(starters: Record<GradePos, number>, superflexSlots: number): QbMode {
  if (superflexSlots >= 1) return "superflex";
  if (starters.QB >= 2) return "two_qb";
  return "one_qb";
}

function defaultSoftFromHard(hard: Partial<Record<GradePos, number>>): Partial<Record<GradePos, number>> {
  const soft: Partial<Record<GradePos, number>> = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF", "DP"] as GradePos[]) {
    const h = hard[pos];
    if (h == null) continue;
    if (pos === "TE" || pos === "K" || pos === "DEF") soft[pos] = h;
    else soft[pos] = Math.max(0, h - 1);
  }
  return soft;
}

function buildNeedPriority(
  qbMode: QbMode,
  starters: Record<GradePos, number>,
  tePremium: boolean,
  defenseKey: DefenseKey,
): GradePos[] {
  const order: GradePos[] = [];
  const push = (p: GradePos) => {
    if (!order.includes(p)) order.push(p);
  };

  // 1QB: skill starters outrank QB — first QB is fine mid-round; QB depth while
  // WR/RB/TE/FLEX remain open is what opportunity-cost must punish.
  // Superflex / 2QB: QB need stays near the top.
  if (qbMode !== "one_qb") {
    push("QB");
  }
  push("RB");
  push("WR");
  if (tePremium) {
    push("TE");
  } else {
    push("TE");
  }
  if (starters.FLEX > 0) push("FLEX");
  if (qbMode === "one_qb" && starters.QB > 0) push("QB");
  if (starters.K > 0) push("K");
  if (defenseKey === "DP" && starters.DP > 0) push("DP");
  if (defenseKey === "DEF" && starters.DEF > 0) push("DEF");
  return order;
}

function targetShares(
  soft: Partial<Record<GradePos, number>>,
  isIdp: boolean,
): Partial<Record<"QB" | "RB" | "WR" | "TE" | "DP", number>> {
  const keys: Array<"QB" | "RB" | "WR" | "TE" | "DP"> = isIdp
    ? ["QB", "RB", "WR", "TE", "DP"]
    : ["QB", "RB", "WR", "TE"];
  const raw = keys.map((k) => Math.max(0, soft[k] ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const out: Partial<Record<"QB" | "RB" | "WR" | "TE" | "DP", number>> = {};
  keys.forEach((k, i) => {
    out[k] = raw[i]! / sum;
  });
  return out;
}

/**
 * Build FormatProfile from War Room league settings.
 * Prefer server-provided lineupReqs + soft/hard caps when present.
 */
export function buildFormatProfile(input: FormatProfileInput): FormatProfile {
  const hardIn = input.hardCap ?? input.positionCaps ?? {};
  const hardCap: Partial<Record<GradePos, number>> = {
    QB: n(hardIn.QB, 3),
    RB: n(hardIn.RB, 6),
    WR: n(hardIn.WR, 7),
    TE: n(hardIn.TE, 2),
    K: n(hardIn.K, 1),
    DEF: n(hardIn.DEF, 0),
    DP: n(hardIn.DP, 0),
  };

  const softCap =
    input.softCap && Object.keys(input.softCap).length > 0
      ? {
          QB: n(input.softCap.QB, (hardCap.QB ?? 3) - 1),
          RB: n(input.softCap.RB, (hardCap.RB ?? 6) - 1),
          WR: n(input.softCap.WR, (hardCap.WR ?? 7) - 1),
          TE: n(input.softCap.TE, hardCap.TE ?? 2),
          K: n(input.softCap.K, hardCap.K ?? 1),
          DEF: n(input.softCap.DEF, hardCap.DEF ?? 0),
          DP: n(input.softCap.DP, hardCap.DP ?? 0),
        }
      : defaultSoftFromHard(hardCap);

  const reqs = input.lineupReqs ?? {};
  const starters = emptyStarters();
  starters.QB = n(reqs.QB, hardCap.QB && hardCap.QB >= 4 ? 2 : 1);
  starters.RB = n(reqs.RB, 2);
  starters.WR = n(reqs.WR, 2);
  starters.TE = n(reqs.TE, 1);
  starters.FLEX = n(reqs.FLEX, 1);
  starters.K = n(reqs.K, (hardCap.K ?? 0) > 0 ? 1 : 0);
  starters.DEF = n(reqs.DEF, (hardCap.DEF ?? 0) > 0 ? 1 : 0);
  starters.DP = n(reqs.DP, (hardCap.DP ?? 0) > 0 ? 1 : 0);

  const superflexSlots = Math.max(0, n(input.superflexSlots, 0));
  const allowSfInference = input.allowSuperflexInference !== false;
  // Infer SF when server folded SF into hardCap but did not pass superflexSlots.
  // Disabled for Post-Draft Evaluation — Superflex must come from ESPN slot 7.
  const inferredSf =
    allowSfInference && superflexSlots === 0 && (hardCap.QB ?? 0) >= 4 && starters.QB <= 1
      ? 1
      : superflexSlots;
  const qbModeFinal: QbMode =
    inferredSf >= 1
      ? "superflex"
      : deriveQbMode(starters, inferredSf) === "two_qb"
        ? "two_qb"
        : allowSfInference && (hardCap.QB ?? 3) >= 4
          ? "superflex"
          : "one_qb";

  const isIdp = starters.DP > 0 || (hardCap.DP ?? 0) > 0;
  const defenseKey: DefenseKey = isIdp ? "DP" : starters.DEF > 0 || (hardCap.DEF ?? 0) > 0 ? "DEF" : "none";
  const tePremium = Boolean(input.tePremium);
  const isBestBall = Boolean(input.isBestBall);

  return {
    leagueId: String(input.leagueId ?? ""),
    source: input.lineupReqs ? "espn_reliable" : "client_inferred",
    starters,
    superflexSlots: inferredSf,
    qbMode: qbModeFinal,
    benchSlots: Math.max(0, n(input.benchSlots, 5)),
    irSlots: Math.max(0, n(input.irSlots, 2)),
    defenseKey,
    softCap,
    hardCap,
    targetShares: targetShares(softCap, isIdp),
    flexEligibility:
      qbModeFinal === "one_qb" ? ["RB", "WR", "TE"] : ["RB", "WR", "TE", "QB"],
    needPriority: buildNeedPriority(qbModeFinal, starters, tePremium, defenseKey),
    scoringHints: {
      receptionPoints: n(input.receptionPoints, 0.5),
      tePremium,
      isBestBall,
      isIdp,
    },
    keepersOccupySlots: true,
  };
}

export function normalizeGradePos(raw: string): GradePos | null {
  const p = String(raw ?? "").toUpperCase();
  if (p === "DST" || p === "D/ST") return "DEF";
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE" || p === "FLEX" || p === "K" || p === "DEF" || p === "DP") {
    return p;
  }
  return null;
}
