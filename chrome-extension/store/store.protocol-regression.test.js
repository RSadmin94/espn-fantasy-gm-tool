import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const storeDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const extDir = path.join(storeDir, "..");
const packaged = path.join(
  storeDir,
  "..",
  "..",
  "store-submission",
  "package",
  "Fantasy-Football-Rivals-ESPN-Connector-v1.14.4",
);

const background = readFileSync(path.join(extDir, "background.js"), "utf8");
const bridge = readFileSync(path.join(extDir, "gmwarroom-bridge.js"), "utf8");
const handler = background.slice(background.indexOf("if (t === MSG_CONNECT_ESPN)"));

describe("v1.14.4 protocol regression vs certified connector source", () => {
  it("keeps GMWR_CONNECT_ESPN identifiers and presence marker", () => {
    expect(background).toContain('const MSG_CONNECT_ESPN = "GMWR_CONNECT_ESPN";');
    expect(bridge).toContain('d.type !== "GMWR_CONNECT_ESPN"');
    expect(bridge).toContain("dataset.gmwrExtension = \"1\"");
  });

  it("gates origin before reading ESPN cookies", () => {
    const originIdx = handler.indexOf("resolveWarRoomOrigin(sender)");
    const cookieIdx = handler.indexOf("getEspnCookieValues()");
    expect(originIdx).toBeGreaterThan(-1);
    expect(cookieIdx).toBeGreaterThan(originIdx);
  });

  it("preserves connect stages", () => {
    for (const stage of [
      "espn_signed_out",
      "ready",
      "no_leagues",
      "choose",
      "save_failed",
      "connected",
      "error",
    ]) {
      expect(handler).toContain(`stage: "${stage}"`);
    }
  });

  it("still discovers then saves through existing helpers", () => {
    expect(handler).toContain("discoverLeaguesWithEspnCookie(");
    expect(handler).toContain("postSaveCredentials(");
  });

  it("copies background.js and gmwarroom-bridge.js unchanged when packaged", () => {
    if (!existsSync(path.join(packaged, "background.js"))) {
      return;
    }
    expect(readFileSync(path.join(packaged, "background.js"), "utf8")).toBe(background);
    expect(readFileSync(path.join(packaged, "gmwarroom-bridge.js"), "utf8")).toBe(bridge);
  });
});
