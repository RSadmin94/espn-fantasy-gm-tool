import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSessionUnlocked, setSessionUnlocked } from "@/lib/rivalsProSessionUnlock";
import { getTrpcToken, setTrpcToken } from "@/lib/trpcAuth";
import {
  CLERK_GOOGLE_ACCOUNT_PICKER,
  RIVALS_AFTER_SIGN_OUT_URL,
  signOutOfRivals,
} from "./signOutRivals";

describe("signOutOfRivals", () => {
  beforeEach(() => {
    setTrpcToken("session-jwt-account-a");
    setSessionUnlocked(true);
  });

  it("clears the Rivals session before Clerk signOut and asks to return to login", async () => {
    const signOut = vi.fn(async () => undefined);
    const queryClient = { clear: vi.fn() };

    await signOutOfRivals({ signOut, queryClient });

    expect(getTrpcToken()).toBeNull();
    expect(isSessionUnlocked()).toBe(false);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: RIVALS_AFTER_SIGN_OUT_URL });
    expect(RIVALS_AFTER_SIGN_OUT_URL).toBe("/sign-in");
  });

  it("still signs out of Clerk when queryClient is omitted", async () => {
    const signOut = vi.fn(async () => undefined);
    await signOutOfRivals({ signOut });
    expect(getTrpcToken()).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("forces Google account selection on the next sign-in rather than logging out of Google", () => {
    expect(CLERK_GOOGLE_ACCOUNT_PICKER.oidcPrompt).toBe("select_account");
  });
});
