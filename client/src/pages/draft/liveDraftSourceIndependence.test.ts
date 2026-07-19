/**
 * RFSN-013 — Live Draft product UI must stay source-independent.
 * Provider names and ESPN API terms belong only in adapter modules.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

const PRODUCT_UI = [
  "client/src/components/draft/LiveDraftControlPanel.tsx",
  "client/src/components/draft/LiveDraftRecentPicks.tsx",
  "client/src/lib/liveDraftUx.ts",
  "client/src/pages/draft/DraftWarRoomLayout.tsx",
  "client/src/lib/liveDraftConnectedLeague.ts",
] as const;

/** Adapter / fetch modules may name ESPN and mDraftDetail. */
const ADAPTER_ALLOWLIST = [
  "client/src/lib/espnLiveDraftFetch.ts",
  "client/src/hooks/useEspnLiveDraftMonitor.ts",
  "shared/espnLiveDraftMonitor.ts",
] as const;

const BANNED_IN_PRODUCT = ["ESPN", "mDraftDetail", "fantasy.espn.com"] as const;

describe("RFSN-013 Live Draft source independence", () => {
  it("product Live Draft surfaces do not name ESPN or mDraftDetail", () => {
    for (const rel of PRODUCT_UI) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      for (const banned of BANNED_IN_PRODUCT) {
        expect(src, `${rel} must not contain ${banned}`).not.toContain(banned);
      }
    }

    const hub = fs.readFileSync(path.join(repoRoot, "client/src/pages/draft/DraftHub.tsx"), "utf-8");
    expect(hub).not.toContain("ESPN Live");
    expect(hub).not.toContain("mDraftDetail");
    expect(hub).not.toContain("fantasy.espn.com");

    const warRoom = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoom.tsx"), "utf-8");
    expect(warRoom).not.toContain("ESPN Live");
    expect(warRoom).not.toContain("mDraftDetail");
    expect(warRoom).not.toContain("fantasy.espn.com");
    expect(warRoom).toContain("LiveDraftControlPanel");
    expect(warRoom).toContain("useConnectedLeagueLiveMonitor");
    expect(warRoom).not.toContain("useEspnLiveDraftMonitor");
  });

  it("ESPN adapter modules remain the only place for provider-specific fetch terms", () => {
    for (const rel of ADAPTER_ALLOWLIST) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(src.length).toBeGreaterThan(0);
    }
    const fetchSrc = fs.readFileSync(
      path.join(repoRoot, "client/src/lib/espnLiveDraftFetch.ts"),
      "utf-8",
    );
    expect(fetchSrc).toContain("mDraftDetail");
  });
});
