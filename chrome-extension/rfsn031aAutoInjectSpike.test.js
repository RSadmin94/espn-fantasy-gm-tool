/**
 * RFSN-031A — architectural evidence tests (closed spike).
 * Updated for RFSN-031B: spike remains disabled; production WAR replaces active inject path.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ext = path.resolve(import.meta.dirname);
const root = path.resolve(import.meta.dirname, "..");

describe("RFSN-031A auto-inject spike — static evidence (CLOSED)", () => {
  it("FantasyPros already delivers page-world code via web_accessible_resources + script tag", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
    const war = manifest.web_accessible_resources || [];
    const fp = war.some((e) =>
      (e.resources || []).includes("providers/fantasypros/page-observer.js"),
    );
    expect(fp).toBe(true);
    const content = fs.readFileSync(path.join(ext, "providers/fantasypros/content.js"), "utf8");
    expect(content).toContain('chrome.runtime.getURL("providers/fantasypros/page-observer.js")');
    expect(content).toContain('createElement("script")');
  });

  it("production packages ESPN live reader IIFE as web_accessible resource (031B)", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
    const war = (manifest.web_accessible_resources || []).find((e) =>
      (e.resources || []).includes("providers/espn-live/espn-live-reader.iife.js"),
    );
    expect(war).toBeTruthy();
    expect(war.matches.some((m) => /espn\.com/.test(m))).toBe(true);
    const readerPath = path.join(ext, "providers/espn-live/espn-live-reader.iife.js");
    expect(fs.existsSync(readerPath)).toBe(true);
    const reader = fs.readFileSync(readerPath, "utf8");
    expect(reader).toContain("__RFSN_ESPN_LIVE_READER__");
    expect(reader).toContain("startDraftBoardMonitor");
    expect(reader.length).toBeGreaterThan(50_000);
  });

  it("ESPN content script keeps 031A spike disabled and uses 031B production inject", () => {
    const content = fs.readFileSync(path.join(ext, "providers/espn-live/content.js"), "utf8");
    const autoInject = fs.readFileSync(path.join(ext, "espnAutoInject.js"), "utf8");
    expect(content).toContain("RFSN_031A_SPIKE_ENABLED");
    expect(content).toMatch(/RFSN_031A_SPIKE_ENABLED\s*=\s*false/);
    expect(content).toContain("ESPN_LIVE_READER_ASSET");
    expect(autoInject).toContain("espn-live-reader.iife.js");
    expect(autoInject).toContain("rfsnEspnAutoInjectEnabled");
    // Frozen: content must still not parse ESPN draft DOM itself
    expect(content).not.toContain("draft-columns");
    expect(content).toContain("No DOM parsing");
  });

  it("background already proves chrome.scripting.executeScript world:MAIN on fantasy.espn.com", () => {
    const bg = fs.readFileSync(path.join(ext, "background.js"), "utf8");
    expect(bg).toContain('world: "MAIN"');
    expect(bg).toContain("scrapeDraftRecapPage");
    expect(bg).toContain("fantasy.espn.com/football/league/draftrecap");
  });

  it("host_permissions + content_scripts already cover ESPN draft hosts", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
    expect(manifest.permissions).toContain("scripting");
    expect(manifest.host_permissions.some((h) => /fantasy\.espn\.com/.test(h))).toBe(true);
    const espnCs = (manifest.content_scripts || []).find((cs) =>
      (cs.matches || []).some((m) => /espn\.com/.test(m)),
    );
    expect(espnCs).toBeTruthy();
    expect(espnCs.js.some((j) => /espn-live/.test(j))).toBe(true);
  });
});
