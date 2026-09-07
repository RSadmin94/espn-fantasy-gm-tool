import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function pngSize(filePath) {
  const buf = readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const storeDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const extDir = path.join(storeDir, "..");
const read = (f) => readFileSync(path.join(storeDir, f), "utf8");
const readExt = (f) => readFileSync(path.join(extDir, f), "utf8");

const manifest = JSON.parse(read("manifest.json"));
const popupHtml = read("popup.html");
const popupJs = read("popup.js");
const background = readExt("background.js");
const bridge = readExt("gmwarroom-bridge.js");

describe("Store overlay 1.14.4", () => {
  it("uses Store-facing name and version", () => {
    expect(manifest.name).toBe("Fantasy Football Rivals — ESPN Connector");
    expect(manifest.version).toBe("1.14.4");
    expect(manifest.description).toMatch(/ESPN Fantasy Football/);
    expect(manifest.description).not.toMatch(/FantasyPros|GM War Room/i);
  });

  it("does not restore retired hosts", () => {
    const hosts = JSON.stringify(manifest);
    expect(hosts).not.toMatch(/gmwarroom\.online/);
    expect(hosts).not.toMatch(/localhost/);
    expect(hosts).not.toMatch(/127\.0\.0\.1/);
    expect(hosts).not.toMatch(/draftwizard\.fantasypros/);
    expect(hosts).not.toMatch(/\*\.fantasyfootballrivals\.com/);
  });

  it("keeps least-privilege permissions for the connector", () => {
    expect(manifest.permissions).toEqual([
      "cookies",
      "declarativeNetRequest",
      "declarativeNetRequestWithHostAccess",
    ]);
    expect(manifest.permissions).not.toContain("scripting");
    expect(manifest.permissions).not.toContain("storage");
    expect(manifest.permissions).not.toContain("tabs");
  });

  it("injects only the Rivals bridge, not FantasyPros or Live Draft", () => {
    const matches = (manifest.content_scripts || []).flatMap((c) => c.js || []);
    expect(matches).toEqual(["gmwarroom-bridge.js"]);
    expect(JSON.stringify(manifest)).not.toMatch(/fantasypros|espn-live|board-mirror/i);
  });

  it("declares extension icons with exact PNG dimensions", () => {
    expect(manifest.icons["16"]).toBe("icons/icon16.png");
    expect(manifest.icons["48"]).toBe("icons/icon48.png");
    expect(manifest.icons["128"]).toBe("icons/icon128.png");
    for (const [name, dim] of [
      ["icon16.png", 16],
      ["icon48.png", 48],
      ["icon128.png", 128],
    ]) {
      const file = path.join(storeDir, "icons", name);
      expect(existsSync(file)).toBe(true);
      expect(pngSize(file)).toEqual({ width: dim, height: dim });
    }
  });

  it("popup is connector-only", () => {
    expect(popupHtml).toMatch(/Fantasy Football Rivals — ESPN Connector/);
    expect(popupHtml).not.toMatch(/GM War Room/);
    expect(popupHtml).not.toMatch(/adminTools|FantasyPros|457622|FULL IMPORT|DEBUG/);
    expect(popupJs).not.toMatch(/GMWR_HIST_|FantasyPros|457622/);
  });

  it("does not change the certified connect protocol identifiers", () => {
    expect(background).toMatch(/const MSG_CONNECT_ESPN = "GMWR_CONNECT_ESPN";/);
    expect(bridge).toMatch(/d\.type !== "GMWR_CONNECT_ESPN"/);
    expect(bridge).toMatch(/dataset\.gmwrExtension = "1"/);
  });
});
