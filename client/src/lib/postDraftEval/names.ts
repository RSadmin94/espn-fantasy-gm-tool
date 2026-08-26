const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\.?$/i;

export function normalizePlayerName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(SUFFIX, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePos(position: string | null | undefined): string {
  const p = String(position || "").toUpperCase().trim();
  if (p === "D/ST" || p === "DST" || p === "DEF") return "DEF";
  if (p === "PK") return "K";
  return p;
}

export function playerIdentityKeys(input: {
  playerId?: number | null;
  name?: string | null;
  position?: string | null;
}): string[] {
  const keys: string[] = [];
  const id = Number(input.playerId);
  if (Number.isFinite(id) && id > 0) keys.push(`id:${id}`);
  const name = normalizePlayerName(input.name ?? "");
  const pos = normalizePos(input.position);
  if (name) {
    keys.push(`name:${name}`);
    if (pos) keys.push(`name:${name}|${pos}`);
  }
  return keys;
}

export function playerIdentitiesOverlap(
  a: { playerId?: number | null; name?: string | null; position?: string | null },
  b: { playerId?: number | null; name?: string | null; position?: string | null },
): boolean {
  const other = new Set(playerIdentityKeys(b));
  return playerIdentityKeys(a).some((key) => other.has(key));
}
