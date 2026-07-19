/**
 * Sleeper NFL player headshot URLs (public CDN).
 * Verified pattern: https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg
 */

export function sleeperPlayerHeadshotUrl(
  sleeperPlayerId: string | null | undefined,
  opts?: { size?: "thumb" | "full" },
): string | null {
  const id = String(sleeperPlayerId ?? "").trim();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  // Defense / team IDs like "SF" exist in Sleeper; still valid CDN paths for some.
  if (opts?.size === "full") {
    return `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
  }
  return `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
}

export function espnPlayerHeadshotUrl(
  espnPlayerId: string | null | undefined,
  opts?: { w?: number; h?: number },
): string | null {
  const id = String(espnPlayerId ?? "").trim();
  if (!id || !/^\d+$/.test(id)) return null;
  const w = opts?.w ?? 80;
  const h = opts?.h ?? 58;
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=${w}&h=${h}&cb=1`;
}

/**
 * Prefer ESPN (already used across Rivals), fall back to Sleeper CDN.
 */
export function resolvePlayerHeadshotUrl(args: {
  espnPlayerId?: string | null;
  sleeperPlayerId?: string | null;
}): string | null {
  return (
    espnPlayerHeadshotUrl(args.espnPlayerId) ||
    sleeperPlayerHeadshotUrl(args.sleeperPlayerId) ||
    null
  );
}
