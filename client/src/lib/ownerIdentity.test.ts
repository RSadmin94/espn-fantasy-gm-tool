import { describe, expect, it } from "vitest";
import {
  castMemberDossierOwnerKey,
  ownerKeyFromMemberId,
  ownerKeysEqual,
  resolveDirectoryOwnerKey,
  rivalsOwnerDossierPath,
} from "@/lib/ownerIdentity";

/**
 * Identity contracts under test (server authority):
 * - dna.leagueCast.memberId = bare ESPN primaryOwner / members.id
 * - owners.ownerList.ownerKey / owners.ownerProfile ownerKey = resolveOwnerKey → typically `id:{memberId}`
 * - ownerKeyFromMemberId mirrors resolveOwnerKey(id,…) / ownerKeyFromId
 */

describe("ownerIdentity — Cast → Owner Dossier authority", () => {
  it("proves bare Cast memberId is not the ownerProfile key form", () => {
    const memberId = "{AE295BDF-FC02-479E-969E-0E712690503C}";
    expect(memberId.startsWith("id:")).toBe(false);
    const profileKey = ownerKeyFromMemberId(memberId);
    expect(profileKey).toBe(`id:${memberId}`);
    expect(profileKey).toMatch(/^id:/);
  });

  it("builds Cast dossier URLs with the authoritative ownerKey expected by owners.ownerProfile", () => {
    const memberId = "{AE295BDF-FC02-479E-969E-0E712690503C}";
    const ownerKey = ownerKeyFromMemberId(memberId);
    expect(rivalsOwnerDossierPath(ownerKey)).toBe(
      `/rivals/owners/${encodeURIComponent(`id:${memberId}`)}`,
    );
    // Prefer server-provided canonical ownerKey from dna.leagueCast when present.
    expect(
      castMemberDossierOwnerKey({
        memberId,
        ownerKey: "id:{CANONICAL-GUID}",
      }),
    ).toBe("id:{CANONICAL-GUID}");
    expect(castMemberDossierOwnerKey({ memberId })).toBe(`id:${memberId}`);
  });

  it("resolves route ids against owners.ownerList keys without display-name matching", () => {
    const directory = [
      "id:{11111111-1111-1111-1111-111111111111}",
      "id:{22222222-2222-2222-2222-222222222222}",
      "name:historical owner",
    ];
    const bare = "{11111111-1111-1111-1111-111111111111}";
    expect(resolveDirectoryOwnerKey(bare, directory)).toBe(directory[0]);
    expect(resolveDirectoryOwnerKey(directory[0], directory)).toBe(directory[0]);
    expect(resolveDirectoryOwnerKey("name:historical owner", directory)).toBe("name:historical owner");
    // Display names are not an identity authority here.
    expect(resolveDirectoryOwnerKey("Rod Sellers", directory)).toBeNull();
  });

  it("fails safely for invalid identifiers", () => {
    const directory = ["id:{11111111-1111-1111-1111-111111111111}"];
    expect(resolveDirectoryOwnerKey("id:{99999999-9999-9999-9999-999999999999}", directory)).toBeNull();
    expect(resolveDirectoryOwnerKey("", directory)).toBeNull();
    expect(resolveDirectoryOwnerKey(null, directory)).toBeNull();
    expect(ownerKeyFromMemberId("")).toBe("");
  });

  it("does not resolve two similar display names to each other (keys only)", () => {
    const rodA = "id:{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}";
    const rodB = "id:{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}";
    expect(ownerKeysEqual(rodA, rodB)).toBe(false);
    expect(resolveDirectoryOwnerKey(rodA, [rodA, rodB])).toBe(rodA);
    expect(resolveDirectoryOwnerKey(rodB, [rodA, rodB])).toBe(rodB);
    // Similar names never participate in ownerKeysEqual.
    expect(ownerKeysEqual("Rod Sellers", "Rod Seller")).toBe(false);
    expect(ownerKeysEqual("Rod Sellers", "Rod Sellers")).toBe(true);
  });

  it("preserves existing id:/brace normalization behavior from Owner Profiles", () => {
    const guid = "AE295BDF-FC02-479E-969E-0E712690503C";
    expect(ownerKeysEqual(`id:{${guid}}`, `{${guid}}`)).toBe(true);
    expect(ownerKeysEqual(`id:${guid}`, guid)).toBe(true);
    expect(ownerKeysEqual(`id:{${guid}}`, `id:{${guid.toLowerCase()}}`)).toBe(true);
  });
});
