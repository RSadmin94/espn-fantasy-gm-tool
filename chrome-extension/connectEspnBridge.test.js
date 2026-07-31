/**
 * Wiring guard for the deterministic connect path. A background handler with no page relay (or a
 * relay with no reply type) fails silently in Chrome, so assert both halves stay connected.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (f) => readFileSync(path.join(extDir, f), "utf8");

const background = read("background.js");
const bridge = read("gmwarroom-bridge.js");
const manifest = JSON.parse(read("manifest.json"));

describe("GMWR_CONNECT_ESPN bridge", () => {
  it("declares the message type in the background worker", () => {
    expect(background).toMatch(/const MSG_CONNECT_ESPN = "GMWR_CONNECT_ESPN";/);
    expect(background).toMatch(/if \(t === MSG_CONNECT_ESPN\)/);
  });

  it("answers every branch with a stage", () => {
    for (const stage of [
      "espn_signed_out",
      "ready",
      "no_leagues",
      "choose",
      "save_failed",
      "connected",
      "error",
    ]) {
      expect(background).toContain(`stage: "${stage}"`);
    }
  });

  it("reuses the existing cookie read, discovery and saveCredentials helpers", () => {
    const handler = background.slice(background.indexOf("if (t === MSG_CONNECT_ESPN)"));
    expect(handler).toMatch(/getEspnCookieValues\(\)/);
    expect(handler).toMatch(/discoverLeaguesWithEspnCookie\(/);
    expect(handler).toMatch(/postSaveCredentials\(/);
  });

  it("relays the page request and posts a reply back", () => {
    expect(bridge).toMatch(/d\.type !== "GMWR_CONNECT_ESPN"/);
    expect(bridge).toMatch(/type: "GMWR_CONNECT_ESPN_REPLY"/);
  });

  it("ships a bumped extension version", () => {
    expect(manifest.version).toBe("1.14.0");
  });
});
