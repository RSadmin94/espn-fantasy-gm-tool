/**
 * Grounded rivalry overlay for live draft moments.
 * Maps rivalryService pairs onto the draft pick resolver's PID_* owner keys.
 * Never fabricates rivals when data is unavailable.
 */
import type { ReceiptContext } from "../draftMoments/draftMomentReceiptService";
import { normName } from "../draftMoments/draftMomentReceiptService";

/** Draft-moment identity key used by live pick resolver (`PID_OWNER_NAME`). */
export function liveDraftOwnerKey(ownerName: string): string {
  return `PID_${ownerName.trim().toUpperCase().replace(/\s+/g, "_")}`;
}

export type LiveRivalryOverlay = {
  focalOwnerName: string;
  rivals: Array<{ ownerName: string; heat: string }>;
};

/**
 * Attach rivalry onto a receipt context using PID_* keys.
 * Callers must supply real pairs — this never invents rivals.
 */
export function applyLiveRivalryOverlay(
  ctx: ReceiptContext,
  rivalry: LiveRivalryOverlay | null | undefined,
): ReceiptContext {
  if (!rivalry?.focalOwnerName?.trim()) return ctx;
  const rivalById = new Map(ctx.rivalById);
  for (const r of rivalry.rivals) {
    const name = String(r.ownerName ?? "").trim();
    if (!name) continue;
    rivalById.set(liveDraftOwnerKey(name), {
      rivalName: name,
      heat: String(r.heat ?? "Heated"),
    });
  }
  return {
    ...ctx,
    focalMemberId: liveDraftOwnerKey(rivalry.focalOwnerName),
    rivalById,
  };
}

/**
 * Load rivalry pairs for the signed-in user and map them onto live draft owner keys.
 * Returns null when rivalry data is unavailable.
 */
export async function loadLiveRivalryOverlay(args: {
  userId?: number | null;
  leagueId: string;
  ownerNames?: string[];
}): Promise<LiveRivalryOverlay | null> {
  if (args.userId == null) return null;
  try {
    const { computeRivalryScores } = await import("../../rivalryService");
    const pairs = await computeRivalryScores(args.userId, args.leagueId);
    if (!pairs.length) return null;
    const focalOwnerName = String(pairs[0]?.ownerName ?? "").trim();
    if (!focalOwnerName) return null;

    const draftNames = (args.ownerNames ?? []).map((n) => n.trim()).filter(Boolean);
    const rivals: Array<{ ownerName: string; heat: string }> = [];
    for (const p of pairs) {
      const rivalName = String(p.rivalName ?? "").trim();
      if (!rivalName) continue;
      const matched =
        draftNames.find((n) => normName(n) === normName(rivalName)) ??
        draftNames.find(
          (n) =>
            normName(n).includes(normName(rivalName)) ||
            normName(rivalName).includes(normName(n)),
        ) ??
        rivalName;
      rivals.push({ ownerName: matched, heat: String(p.heatLabel ?? "Heated") });
    }
    if (!rivals.length) return null;
    return { focalOwnerName, rivals };
  } catch (err) {
    console.warn(
      "[rfsn-live] rivalry overlay load failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
