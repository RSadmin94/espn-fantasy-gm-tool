import { describe, expect, it } from "vitest";
import { capabilitiesFor, hasCapability, ownerProtectionCheck } from "./adminAccess";
import { isOwnerAccount, isConsoleAccount } from "./owners";

const ownerUser = {
  id: 1,
  openId: "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
  email: "owner@example.com",
  role: "user" as const,
};

const adminUser = {
  id: 2,
  openId: "user_admin",
  email: "admin@example.com",
  role: "admin" as const,
};

const regular = {
  id: 3,
  openId: "user_regular",
  email: "regular@example.com",
  role: "user" as const,
};

describe("owner authorization", () => {
  it("recognizes the application owner by Clerk id even when role is user", () => {
    expect(isOwnerAccount(ownerUser)).toBe(true);
    expect(isConsoleAccount(ownerUser)).toBe(true);
    expect(hasCapability(ownerUser, "OWNER_ACCESS")).toBe(true);
    expect(hasCapability(ownerUser, "MANAGE_USERS")).toBe(true);
  });

  it("gives limited admins view capabilities only", () => {
    expect(isOwnerAccount(adminUser)).toBe(false);
    expect(isConsoleAccount(adminUser)).toBe(true);
    expect(hasCapability(adminUser, "VIEW_USERS")).toBe(true);
    expect(hasCapability(adminUser, "MANAGE_USERS")).toBe(false);
    expect(hasCapability(adminUser, "OWNER_ACCESS")).toBe(false);
    expect(capabilitiesFor(adminUser)).not.toContain("MANAGE_FEATURES");
  });

  it("denies ordinary users all console capabilities", () => {
    expect(isConsoleAccount(regular)).toBe(false);
    expect(hasCapability(regular, "VIEW_ADMIN")).toBe(false);
    expect(capabilitiesFor(regular)).toEqual([]);
  });

  it("does not treat founder/beta emails as owners", () => {
    expect(
      isOwnerAccount({
        openId: "user_other",
        email: "flurrysports@gmail.com",
        role: "user",
      }),
    ).toBe(false);
    expect(
      isOwnerAccount({
        openId: "user_other",
        email: "stylsz22@gmail.com",
        role: "user",
      }),
    ).toBe(false);
  });

  it("does not treat a different founder Clerk id as the application owner", () => {
    expect(
      isOwnerAccount({
        openId: "user_3EZybqbNQ3RjILvNEjAlXCK06PS",
        email: "demetri@example.com",
        role: "user",
      }),
    ).toBe(false);
    expect(
      isConsoleAccount({
        openId: "user_3EZybqbNQ3RjILvNEjAlXCK06PS",
        email: "demetri@example.com",
        role: "user",
      }),
    ).toBe(false);
  });
});

describe("owner protection", () => {
  it("blocks suspending the owner account", () => {
    const r = ownerProtectionCheck({
      actor: adminUser,
      target: { ...ownerUser, role: "owner" },
      action: "suspend",
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks the owner from disabling their own AI", () => {
    const r = ownerProtectionCheck({
      actor: ownerUser,
      target: ownerUser,
      action: "disable_ai",
    });
    expect(r.allowed).toBe(false);
  });

  it("allows restricting a normal user", () => {
    const r = ownerProtectionCheck({
      actor: ownerUser,
      target: regular,
      action: "restrict",
    });
    expect(r.allowed).toBe(true);
  });

  it("blocks the owner from removing their own owner access", () => {
    const r = ownerProtectionCheck({
      actor: ownerUser,
      target: ownerUser,
      action: "demote_role",
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks a limited admin from restricting the owner account", () => {
    const r = ownerProtectionCheck({
      actor: adminUser,
      target: ownerUser,
      action: "restrict",
    });
    expect(r.allowed).toBe(false);
  });
});
