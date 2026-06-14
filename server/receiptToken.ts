// Stateless, signed "DNA Receipt" share tokens.
//
// Why stateless: applying a new DB table requires a manual prod migration on this
// project (deploy's `start` does not run drizzle migrate - see the still-missing
// weekly_storylines table). A self-contained HMAC-signed token needs no migration,
// works the instant it deploys, and "frozen + dated" comes for free because the
// snapshot lives inside the token. The HMAC stops anyone forging a Receipt.
//
// Token format:  <base64url(deflateRaw(JSON))>.<base64url(HMAC-SHA256)[0:32]>
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";

export type ReceiptBadge = { l: string; t: string };

export type ReceiptPayload = {
  v: 1;
  mid: string; // memberId (for warm/cold "this is you" detection)
  nm: string; // ownerName
  lg: string; // leagueName
  ar: string; // archetype
  rc: string; // archetype receipt line
  rk: [number, number] | null; // identity rank [rank, of]
  bd: ReceiptBadge[]; // badges [{label, tier}]
  ch: number; // championships
  cy: number[]; // championship years
  ts: number; // unix seconds - frozen date

  // --- Dossier free-enrichment (all OPTIONAL; absence = legacy token; keeps v:1) ---
  tw?: { n: string; m: number } | null; // league twin: name, similarity %
  bs?: string | null; // blind spot (one line)
  pt?: string | null; // primary trait (one line)
  rv?: { n: string; s: number; y?: number; pe?: number } | null; // top rival
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

export function signReceipt(p: ReceiptPayload): string {
  const body = b64urlEncode(deflateRawSync(Buffer.from(JSON.stringify(p), "utf8")));
  return `${body}.${sigFor(body)}`;
}

export function verifyReceipt(token: string): ReceiptPayload | null {
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
    const p = JSON.parse(json) as ReceiptPayload;
    if (!p || p.v !== 1 || typeof p.nm !== "string") return null;
    return p;
  } catch {
    return null;
  }
}
