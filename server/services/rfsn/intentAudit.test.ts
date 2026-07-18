/**
 * RFSN-009A intent audit tests — flagged phrases reject; clean interpretive lines pass.
 */
import { describe, expect, it } from "vitest";
import {
  INTENT_FLAGGED_PHRASES,
  auditIntentLanguage,
  intentAuditAction,
} from "./intentAudit";

describe("RFSN-009A intentAudit", () => {
  it("rejects every flagged phrase (word-boundary, case-insensitive)", () => {
    for (const phrase of INTENT_FLAGGED_PHRASES) {
      const line = `Rod ${phrase} this pick all along.`;
      const r = auditIntentLanguage(line);
      expect(r.ok, `expected reject for "${phrase}"`).toBe(false);
      if (!r.ok) {
        expect(r.flagged.some((f) => f.includes(phrase.split(" ")[0]!.toLowerCase()))).toBe(true);
      }
    }
  });

  it("passes clean interpretive lines", () => {
    const clean = [
      "This is the type of move that defines a championship window.",
      "The pressure now shifts to the rest of the draft board.",
      "The data shows Rod continues to favor this build.",
      "Rod found a formula he likes and refuses to let go.",
    ];
    for (const line of clean) {
      expect(auditIntentLanguage(line)).toEqual({ ok: true, flagged: [] });
    }
  });

  it("suppresses by default when flagged", () => {
    const { action, audit } = intentAuditAction("He wanted this player for years.");
    expect(audit.ok).toBe(false);
    expect(action).toBe("suppress");
  });

  it("allows one regenerate when orchestrator supports retry", () => {
    const first = intentAuditAction("He targeted this player.", { allowRegenerate: true });
    expect(first.action).toBe("regenerate");
    const second = intentAuditAction("He targeted this player.", {
      allowRegenerate: true,
      alreadyRegenerated: true,
    });
    expect(second.action).toBe("suppress");
  });

  it("does not flag partial word matches", () => {
    expect(auditIntentLanguage("The unwanted board pressure mounts.").ok).toBe(true);
  });
});
