/**
 * Stateless signed Historical Receipt share tokens (HMAC), mirroring rivalryShareToken.
 * Public code IS the token — no DB table required.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import type { HistoricalReceiptKind, HistoricalReceiptTone } from "../shared/historicalReceipts";
import { formatSeasonWeekLabel } from "../shared/historicalReceipts";

export type HistoricalReceiptSharePayload = {
  v: 1;
  k: HistoricalReceiptKind;
  lg: string; // league display name
  fn: string; // focal display name
  rn: string; // rival display name
  se: number | null; // season
  wk: number | null; // week
  hl: string; // headline
  ev: string; // evidence / body
  wm: string; // why this matters
  cr: string; // central result
  tn: HistoricalReceiptTone;
  fs?: number | null; // focal score
  rs?: number | null; // rival score
  mg?: number | null; // margin
  mt?: string | null; // matchup type
  sr?: string | null; // series record
  ec?: number | null; // elim count
  tl: string; // type label
};

/** Public read shape — no user IDs, emails, or credentials. */
export function payloadToPublicReceipt(p: HistoricalReceiptSharePayload) {
  return {
    kind: p.k,
    typeLabel: p.tl,
    leagueName: p.lg,
    focalName: p.fn,
    rivalName: p.rn,
    season: p.se,
    week: p.wk,
    whenLabel: formatSeasonWeekLabel(p.se, p.wk),
    headline: p.hl,
    evidence: p.ev,
    whyMatters: p.wm,
    centralResult: p.cr,
    tone: p.tn,
    focalScore: p.fs ?? null,
    rivalScore: p.rs ?? null,
    margin: p.mg ?? null,
    matchupType: p.mt ?? null,
    seriesRecord: p.sr ?? null,
    elimCount: p.ec ?? null,
  };
}

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

export function signHistoricalReceipt(p: HistoricalReceiptSharePayload): string {
  const body = b64urlEncode(deflateRawSync(Buffer.from(JSON.stringify(p), "utf8")));
  return `${body}.${sigFor(body)}`;
}

export function verifyHistoricalReceipt(token: string): HistoricalReceiptSharePayload | null {
  if (!token || token.length > 8192) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sigFor(body);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const json = inflateRawSync(b64urlDecode(body)).toString("utf8");
    const p = JSON.parse(json) as HistoricalReceiptSharePayload;
    if (!p || p.v !== 1 || typeof p.hl !== "string" || typeof p.fn !== "string" || typeof p.rn !== "string") {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
