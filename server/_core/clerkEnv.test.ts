import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aliasClerkPublishableKey,
  clerkMiddlewareOptions,
  clerkPublishableKeyKind,
  clerkPublishableKeySource,
  describeClerkConfigGap,
  resolveClerkPublishableKey,
  resolveClerkSecretKey,
} from "./clerkEnv";

const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
const indexSrc = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const mainSrc = readFileSync(new URL("../../client/src/main.tsx", import.meta.url), "utf8");

describe("Clerk environment contract", () => {
  it("resolves the backend publishable key before falling back to the Vite key", () => {
    expect(
      resolveClerkPublishableKey({
        CLERK_PUBLISHABLE_KEY: "pk_test_backend",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_vite",
      }),
    ).toBe("pk_test_backend");
    expect(resolveClerkPublishableKey({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_vite" })).toBe(
      "pk_test_vite",
    );
    expect(clerkPublishableKeySource({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_vite" })).toBe(
      "VITE_CLERK_PUBLISHABLE_KEY",
    );
    expect(resolveClerkPublishableKey({})).toBe("");
  });

  it("aliases the Vite publishable key onto CLERK_PUBLISHABLE_KEY when the server var is unset", () => {
    const env: Record<string, string | undefined> = {
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_shared",
    };
    expect(aliasClerkPublishableKey(env)).toBe("VITE_CLERK_PUBLISHABLE_KEY");
    expect(env.CLERK_PUBLISHABLE_KEY).toBe("pk_test_shared");
  });

  it("does not overwrite an explicit CLERK_PUBLISHABLE_KEY", () => {
    const env: Record<string, string | undefined> = {
      CLERK_PUBLISHABLE_KEY: "pk_test_backend",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_vite",
    };
    expect(aliasClerkPublishableKey(env)).toBe("CLERK_PUBLISHABLE_KEY");
    expect(env.CLERK_PUBLISHABLE_KEY).toBe("pk_test_backend");
  });

  it("reads the secret only from CLERK_SECRET_KEY", () => {
    expect(resolveClerkSecretKey({ CLERK_SECRET_KEY: "sk_test_x" })).toBe("sk_test_x");
    expect(resolveClerkSecretKey({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe("");
  });

  it("classifies publishable key kinds without depending on real secret values", () => {
    expect(clerkPublishableKeyKind("")).toBe("missing");
    expect(clerkPublishableKeyKind("pk_test_abc")).toBe("test");
    expect(clerkPublishableKeyKind("pk_live_abc")).toBe("live");
    expect(clerkPublishableKeyKind("not-a-key")).toBe("unknown");
  });

  it("fails clearly when required Clerk variables are missing", () => {
    const missingBoth = describeClerkConfigGap({});
    expect(missingBoth).toContain("VITE_CLERK_PUBLISHABLE_KEY");
    expect(missingBoth).toContain("CLERK_PUBLISHABLE_KEY");
    expect(missingBoth).toContain("CLERK_SECRET_KEY");

    const missingSecret = describeClerkConfigGap({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x" });
    expect(missingSecret).toContain("CLERK_SECRET_KEY is missing");

    expect(
      describeClerkConfigGap({
        CLERK_PUBLISHABLE_KEY: "pk_test_x",
        CLERK_SECRET_KEY: "sk_test_x",
      }),
    ).toBeNull();
  });

  it("passes resolved keys into clerkMiddleware options", () => {
    expect(clerkMiddlewareOptions({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toEqual({
      publishableKey: "pk_test_x",
    });
    expect(
      clerkMiddlewareOptions({
        CLERK_PUBLISHABLE_KEY: "pk_test_pk",
        CLERK_SECRET_KEY: "sk_test_sk",
      }),
    ).toEqual({
      publishableKey: "pk_test_pk",
      secretKey: "sk_test_sk",
    });
    expect(clerkMiddlewareOptions({})).toEqual({});
  });

  it("documents Clerk variables in .env.example without real values", () => {
    expect(example).toContain("VITE_CLERK_PUBLISHABLE_KEY=");
    expect(example).toContain("CLERK_PUBLISHABLE_KEY=");
    expect(example).toContain("CLERK_SECRET_KEY=");
    expect(example).toMatch(/same Clerk instance/i);
    expect(example).not.toMatch(/pk_(?:live|test)_[A-Za-z0-9]+/);
    expect(example).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]+/);
  });

  it("keeps Vite-prefixed frontend initialization and Express middleware wiring", () => {
    expect(mainSrc).toContain("import.meta.env.VITE_CLERK_PUBLISHABLE_KEY");
    expect(indexSrc).toContain("clerkMiddleware(clerkMiddlewareOptions())");
  });
});
