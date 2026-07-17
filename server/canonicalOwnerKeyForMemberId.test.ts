import { describe, expect, it } from "vitest";
import {
  canonicalOwnerKeyForMemberId,
  resolveOwnerKey,
} from "./ownerProfileService";

describe("canonicalOwnerKeyForMemberId — Cast / ownerList contract", () => {
  it("matches resolveOwnerKey for bare ESPN member ids (ownerProfile / ownerList form)", () => {
    const memberId = "{AE295BDF-FC02-479E-969E-0E712690503C}";
    expect(resolveOwnerKey(memberId, "", "", new Map())).toBe(`id:${memberId}`);
    expect(canonicalOwnerKeyForMemberId(memberId)).toBe(`id:${memberId}`);
  });

  it("applies the existing person-merge remap ledger when present", () => {
    const raw = "id:{OLD-GUID}";
    const canon = "id:{CANON-GUID}";
    const remap = new Map([[raw, canon]]);
    expect(canonicalOwnerKeyForMemberId("{OLD-GUID}", remap)).toBe(canon);
  });
});
