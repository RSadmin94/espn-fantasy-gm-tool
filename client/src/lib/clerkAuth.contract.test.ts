import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const signOut = readFileSync(new URL("./signOutRivals.ts", import.meta.url), "utf8");

describe("Google account switching contract", () => {
  it("sends Clerk afterSignOutUrl to the in-app login screen", () => {
    expect(main).toContain("afterSignOutUrl={RIVALS_AFTER_SIGN_OUT_URL}");
    expect(signOut).toContain('export const RIVALS_AFTER_SIGN_OUT_URL = "/sign-in"');
  });

  it("asks Google for account selection instead of silently reusing the last identity", () => {
    expect(main).toContain("CLERK_GOOGLE_ACCOUNT_PICKER");
    expect(signOut).toContain('oidcPrompt: "select_account"');
  });

  it("does not attempt to log the user out of Google itself", () => {
    expect(signOut).not.toContain("accounts.google.com/Logout");
    expect(signOut).toContain("Does not log the user out of Google itself");
  });
});
