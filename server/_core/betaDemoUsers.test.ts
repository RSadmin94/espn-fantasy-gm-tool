import { describe, expect, it } from "vitest";
import {
  BETA_DEMO_LEAGUE_DISPLAY_NAME,
  hasBetaDemoPremiumAccess,
  isBetaDemoAccount,
} from "./betaDemoUsers";

describe("betaDemoUsers", () => {
  it("recognizes Zach Brunner by email", () => {
    expect(
      isBetaDemoAccount({ openId: "user_new", email: "flurrysports@gmail.com" }),
    ).toBe(true);
  });

  it("does not treat arbitrary emails as beta demo", () => {
    expect(isBetaDemoAccount({ openId: "user_x", email: "random@example.com" })).toBe(false);
  });

  it("grants premium demo only to whitelisted beta emails", () => {
    expect(
      hasBetaDemoPremiumAccess({ openId: "user_new", email: "flurrysports@gmail.com" }),
    ).toBe(true);
    expect(
      hasBetaDemoPremiumAccess({ openId: "user_new", email: "other-beta@example.com" }),
    ).toBe(false);
  });

  it("exposes the curated league display name", () => {
    expect(BETA_DEMO_LEAGUE_DISPLAY_NAME).toBe("Atlantans Finest FF");
  });
});
