/**
 * crypto.test.ts — Unit tests for AES-256-GCM credential encryption helpers
 */
import { describe, it, expect, beforeAll } from "vitest";
import { encryptCredentials, decryptCredentials, encryptCredentialsForDb, decryptCredentialsFromDb } from "./_core/crypto";

// Set a deterministic test key (32 bytes = 64 hex chars)
const TEST_KEY = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

beforeAll(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
});

describe("encryptCredentials / decryptCredentials", () => {
  it("round-trips a simple credentials object", () => {
    const original = { swid: "{ABC-123}", espnS2: "abc123def456", leagueId: "457622" };
    const cipher = encryptCredentials(original);
    expect(cipher).toMatch(/^enc:v1:/);
    const decrypted = decryptCredentials(cipher);
    expect(decrypted).toEqual(original);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const obj = { swid: "test", espnS2: "test" };
    const c1 = encryptCredentials(obj);
    const c2 = encryptCredentials(obj);
    expect(c1).not.toBe(c2);
  });

  it("returns null for tampered ciphertext", () => {
    const obj = { swid: "test" };
    const cipher = encryptCredentials(obj);
    const tampered = cipher.slice(0, -4) + "0000";
    const result = decryptCredentials(tampered);
    expect(result).toBeNull();
  });

  it("handles b64 fallback format (no key)", () => {
    const savedKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const obj = { swid: "fallback", espnS2: "test" };
    const cipher = encryptCredentials(obj);
    expect(cipher).toMatch(/^b64:/);
    const decrypted = decryptCredentials(cipher);
    expect(decrypted).toEqual(obj);
    process.env.CREDENTIAL_ENCRYPTION_KEY = savedKey;
  });
});

describe("encryptCredentialsForDb / decryptCredentialsFromDb", () => {
  it("round-trips via DB format", () => {
    const original = { swid: "{XYZ}", espnS2: "xyz789", leagueId: "99999" };
    const dbVal = encryptCredentialsForDb(original);
    expect(dbVal).toHaveProperty("_enc");
    const decrypted = decryptCredentialsFromDb(dbVal);
    expect(decrypted).toEqual(original);
  });

  it("handles legacy plain-object format (pre-encryption migration)", () => {
    const legacy = { swid: "old", espnS2: "old_token" };
    const decrypted = decryptCredentialsFromDb(legacy);
    expect(decrypted).toEqual(legacy);
  });

  it("returns null for null input", () => {
    expect(decryptCredentialsFromDb(null)).toBeNull();
  });
});
