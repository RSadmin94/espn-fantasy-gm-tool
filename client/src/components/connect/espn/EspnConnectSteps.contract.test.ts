import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const steps = readFileSync(new URL("./EspnConnectSteps.tsx", import.meta.url), "utf8");
const install = readFileSync(new URL("./connectorInstall.ts", import.meta.url), "utf8");

describe("ESPN onboarding copy contract", () => {
  it("does not expose implementation terms to the user", () => {
    expect(steps).not.toMatch(/SWID|espn_s2|content script|preflight|handshake/i);
    expect(steps).toContain("Connect ESPN securely");
    expect(steps).toContain("Install the Fantasy Football Rivals connector");
  });

  it("keeps the Web Store URL isolated and empty until a real listing exists", () => {
    expect(install).toContain("VITE_CONNECTOR_INSTALL_URL");
    expect(install).toContain("Do not invent a Chrome Web Store URL");
  });

  it("sends a successful connect to dashboard or team selection, not Connected Leagues", () => {
    expect(steps).toContain("continueTo.href");
    expect(steps).not.toContain('to="/connected-leagues">{many ? "Pick your teams"');
  });

  it("explains ESPN login without asking the user to remember the route", () => {
    expect(steps).toContain("ESPN login is required");
    expect(steps).toContain("we'll continue automatically");
  });

  it("does not offer a broken mobile install loop", () => {
    expect(steps).toContain("ESPN needs a desktop browser");
    expect(steps).toContain("Connect Sleeper instead");
  });
});
