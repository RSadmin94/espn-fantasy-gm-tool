import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const privacy = readFileSync(new URL("./PrivacyPolicyPage.tsx", import.meta.url), "utf8");
const support = readFileSync(new URL("./SupportPage.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("./LegalPublicLayout.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");

describe("legal public routes", () => {
  it("registers /privacy and /support outside SignedInGate", () => {
    expect(main).toMatch(/path: "\/privacy", element: <PrivacyPolicyPage \/>/);
    expect(main).toMatch(/path: "\/support", element: <SupportPage \/>/);
    const privacyIdx = main.indexOf('path: "/privacy"');
    const supportIdx = main.indexOf('path: "/support"');
    const gateIdx = main.indexOf("element: <SignedInGate />");
    expect(privacyIdx).toBeGreaterThan(-1);
    expect(supportIdx).toBeGreaterThan(-1);
    expect(privacyIdx).toBeLessThan(gateIdx);
    expect(supportIdx).toBeLessThan(gateIdx);
  });
});

describe("privacy policy copy", () => {
  it("leads with ESPN Connector cookie access", () => {
    expect(privacy).toMatch(/ESPN Connector — what is accessed/);
    expect(privacy).toMatch(/SWID/);
    expect(privacy).toMatch(/espn_s2/);
    expect(privacy).not.toMatch(/never access cookies/i);
    expect(privacy).not.toMatch(/no data leaves your browser/i);
    expect(privacy).not.toMatch(/never store ESPN/i);
  });

  it("says connection data is sent to Rivals over HTTPS", () => {
    expect(privacy).toMatch(/fantasyfootballrivals\.com/);
    expect(privacy).toMatch(/encrypted/);
    expect(privacy).toMatch(/HTTPS/);
  });

  it("does not invent a retention calendar or fake hosts", () => {
    expect(privacy).not.toMatch(/\d+\s+days/);
    expect(privacy).toMatch(/do not publish a fixed calendar/);
    expect(privacy).not.toMatch(/chromewebstore\.google\.com/);
    expect(privacy).toMatch(/365globalsolutions\.com/);
    expect(privacy).toMatch(/gmwarroom\.online/);
  });

  it("covers accounts, AI, and children without a fake inbox", () => {
    expect(privacy).toMatch(/Clerk/);
    expect(privacy).toMatch(/AI language-model/);
    expect(privacy).toMatch(/children under 13/);
    expect(privacy).not.toMatch(/mailto:/);
    expect(privacy).not.toMatch(/support@/);
  });
});

describe("support page copy", () => {
  it("does not invent an email, phone, Discord, or Store URL", () => {
    expect(support).not.toMatch(/@/);
    expect(support).not.toMatch(/mailto:/);
    expect(support).not.toMatch(/discord\.gg/i);
    expect(support).not.toMatch(/chromewebstore\.google\.com/);
    expect(support).not.toMatch(/365globalsolutions\.com/);
    expect(support).toMatch(/do not publish a support[\s\S]*email/i);
  });

  it("covers ESPN Connector troubleshooting and Sleeper", () => {
    expect(support).toMatch(/Fantasy Football Rivals — ESPN Connector/);
    expect(support).toMatch(/Connector not detected/);
    expect(support).toMatch(/ESPN is signed out/);
    expect(support).toMatch(/League not found/);
    expect(support).toMatch(/Multiple ESPN leagues/);
    expect(support).toMatch(/Team selection/);
    expect(support).toMatch(/Sleeper/);
    expect(support).toMatch(/\/connect\/espn/);
  });
});

describe("legal layout", () => {
  it("uses Rivals branding and overflow-safe wrapping", () => {
    expect(layout).toMatch(/Fantasy Football Rivals/);
    expect(layout).toMatch(/overflow-x-hidden/);
    expect(layout).toMatch(/\/logo\.png/);
  });
});
