/**
 * Stateless signed Owner Award share tokens (public catalog cards — no private data).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import { getOwnerAwardMetaById, type OwnerAwardRarity } from "../shared/ownerAwardMeta";

export type OwnerAwardSharePayload = {
  v: 1;
  id: string;
  dn: string; // display name
  lg: string; // league name
  sd: string; // short description
  ry: OwnerAwardRarity;
  cat: string;
  hn: string | null; // holder display name (public league identity)
  st: string | null; // formatted stat label
};

export function payloadToPublicAward(p: OwnerAwardSharePayload) {
  return {
    awardId: p.id,
    displayName: p.dn,
    leagueName: p.lg,
    shortDescription: p.sd,
    rarity: p.ry,
    category: p.cat,
    currentHolderName: p.hn,
    statLabel: p.st,
  };
}

function secret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    "gmwarroom-award-dev-secret"
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

export function signOwnerAwardShare(p: OwnerAwardSharePayload): string {
  const body = b64urlEncode(deflateRawSync(Buffer.from(JSON.stringify(p), "utf8")));
  return `${body}.${sigFor(body)}`;
}

export function verifyOwnerAwardShare(token: string): OwnerAwardSharePayload | null {
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
    const p = JSON.parse(json) as OwnerAwardSharePayload;
    if (!p || p.v !== 1 || typeof p.id !== "string" || typeof p.dn !== "string") return null;
    if (!getOwnerAwardMetaById(p.id)) return null;
    return p;
  } catch {
    return null;
  }
}
