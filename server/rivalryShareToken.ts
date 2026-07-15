// Stateless, signed rivalry share tokens — the public share CODE *is* the token.
//
// Mirrors receiptToken.ts on purpose. A self-contained HMAC-signed snapshot needs no
// DB table and no migration (this project's deploy does not run drizzle migrate), works
// the instant it deploys, and a shared /rivalry/:shareCode link keeps resolving because
// the frozen facts live inside the token. The HMAC stops anyone forging or editing one.
//
// Determinism: the payload is built from the canonical (leagueId, ownerA, ownerB) with A
// fixed as the lexicographically-smaller owner key, and carries no wall-clock timestamp —
// so the same rivalry produces the same code until the underlying record actually changes.
//
// Token format:  <base64url(deflateRaw(JSON))>.<base64url(HMAC-SHA256)[0:32]>
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";

export type RivalryTier = "legendary" | "real" | "quiet";

export type RivalrySharePayload = {
  v: 1;
  lg: string; // league name
  an: string; // owner A display name (canonical A = smaller owner key)
  bn: string; // owner B display name
  aw: number; // A regular-season wins vs B
  al: number; // A regular-season losses vs B (= B's wins)
  at: number; // regular-season ties
  pw: number; // A playoff wins vs B
  pl: number; // A playoff losses vs B
  tm: number; // total meetings (regular + playoff)
  ht: string; // heat label (display only)
  tr: RivalryTier; // deterministic rivalry tier
  sm?: string | null; // short summary line (story cold-open teaser); omitted when absent
};

function secret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    "gmwarroom-receipt-dev-secret"
  );
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64");
}

function sigFor(body: string): string {
  return b64urlEncode(createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
}

export function signRivalry(p: RivalrySharePayload): string {
  const body = b64urlEncode(deflateRawSync(Buffer.from(JSON.stringify(p), "utf8")));
  return `${body}.${sigFor(body)}`;
}

export function verifyRivalry(token: string): RivalrySharePayload | null {
  if (!token || token.length > 4096) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sigFor(body);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const json = inflateRawSync(b64urlDecode(body)).toString("utf8");
    const p = JSON.parse(json) as RivalrySharePayload;
    if (!p || p.v !== 1 || typeof p.an !== "string" || typeof p.bn !== "string") return null;
    return p;
  } catch {
    return null;
  }
}
