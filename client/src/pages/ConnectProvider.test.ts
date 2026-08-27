import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INITIAL_ONBOARDING_PROVIDERS } from "@/lib/onboardingSetup";

const page = readFileSync(new URL("./ConnectProvider.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

describe("provider chooser contract", () => {
  it("asks where the user plays, with ESPN and Sleeper only", () => {
    expect(page).toContain("Where do you play?");
    expect(page).toContain('href: "/connect/espn"');
    expect(page).toContain('href: "/connect/sleeper"');
    expect(INITIAL_ONBOARDING_PROVIDERS).toEqual(["espn", "sleeper"]);
    expect(page).not.toMatch(/Workbook|Yahoo|manual upload|league ID/i);
  });

  it("registers the chooser at /connect and ESPN at /connect/espn", () => {
    expect(main).toContain('path: "/connect"');
    expect(main).toContain("ConnectProvider");
    expect(main).toContain('path: "/connect/espn"');
    expect(main).toContain("ConnectESPN");
  });

  it("does not send signed-in users to the chooser when setup is already complete", () => {
    expect(main).toContain('fallbackRedirectUrl="/dashboard"');
  });
});
