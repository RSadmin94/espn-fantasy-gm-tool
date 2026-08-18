import { inArray } from "drizzle-orm";
import { gmPlayerRegistry } from "../drizzle/schema";
import {
  applyDraftPickIdentityMap,
  applyEspnDefenseIdentities,
  espnPlayerIdKey,
  pickNeedsIdentity,
  type DraftPickIdentityFields,
  type EspnPlayerIdentity,
} from "../shared/draftPickIdentity";
import { getDb } from "./db";
import { resolveUnknownPlayerIds } from "./espnService";

const CHUNK = 200;

export async function loadEspnPlayerIdentityMap(
  espnPlayerIds: Array<number | string | null | undefined>,
): Promise<Map<string, EspnPlayerIdentity>> {
  const ids = [
    ...new Set(
      espnPlayerIds
        .map((id) => espnPlayerIdKey(id))
        .filter((id): id is string => id != null),
    ),
  ];
  const map = new Map<string, EspnPlayerIdentity>();
  if (ids.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await db
      .select({
        espnPlayerId: gmPlayerRegistry.espnPlayerId,
        fullName: gmPlayerRegistry.fullName,
        position: gmPlayerRegistry.position,
      })
      .from(gmPlayerRegistry)
      .where(inArray(gmPlayerRegistry.espnPlayerId, chunk));
    for (const r of rows) {
      const key = String(r.espnPlayerId || "").trim();
      const fullName = String(r.fullName || "").trim();
      if (!key || !fullName) continue;
      map.set(key, { fullName, position: String(r.position || "").trim() });
    }
  }
  return map;
}

export async function fillMissingDraftPickIdentities<T extends DraftPickIdentityFields>(
  picks: T[],
): Promise<T[]> {
  let filled = applyEspnDefenseIdentities(picks);
  const ids = filled.filter(pickNeedsIdentity).map((p) => p.playerId);
  if (ids.length === 0) return filled;
  const registry = await loadEspnPlayerIdentityMap(ids);
  filled = applyDraftPickIdentityMap(filled, registry);
  const leftover = filled
    .filter(pickNeedsIdentity)
    .map((p) => Number(espnPlayerIdKey(p.playerId)))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (leftover.length === 0) return filled;
  const espnHits = await resolveUnknownPlayerIds([...new Set(leftover)]);
  if (espnHits.size === 0) return filled;
  const extra = new Map<string, EspnPlayerIdentity>();
  for (const [pid, info] of espnHits) {
    const name = String(info.name || "").trim();
    if (!name) continue;
    extra.set(String(pid), { fullName: name, position: String(info.position || "").trim() });
  }
  return applyDraftPickIdentityMap(filled, extra);
}
