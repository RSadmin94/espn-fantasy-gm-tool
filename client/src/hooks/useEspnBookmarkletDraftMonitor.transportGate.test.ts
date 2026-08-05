/**
 * Transport vs product-auth gate for ESPN bookmarklet monitor.
 * Source contract: ARM/listen/board projection must not wait on canAccess;
 * notifyLockedPick remains behind canNotify.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hook = readFileSync(
  join(process.cwd(), "client/src/hooks/useEspnBookmarkletDraftMonitor.ts"),
  "utf8",
);

describe("useEspnBookmarkletDraftMonitor transport gate", () => {
  it("defines canTransport without canAccess", () => {
    expect(hook).toMatch(
      /\/\/ Transport handshake must not wait on canAccess/,
    );
    expect(hook).toContain("const canTransport = Boolean(enabled && leagueId)");
    expect(hook).not.toMatch(/canTransport[\s\S]{0,80}canAccess/);
  });

  it("keeps canNotify for notifyLockedPick / resetLiveSession only", () => {
    expect(hook).toContain("const canNotify = Boolean(accessQ.data?.canAccess)");
    expect(hook).toContain("canNotifyRef");
    expect(hook).toContain("notify_skipped_no_access");
    expect(hook).toMatch(
      /if\s*\(\s*canNotifyRef\.current\s*\)\s*\{[\s\S]{0,120}resetMutRef/,
    );
  });

  it("arms and listens on canTransport", () => {
    expect(hook).toMatch(/postEspnBookmarkletArm/);
    expect(hook).toMatch(/if\s*\(\s*!canTransport\s*\|\|\s*!armExtension/);
    expect(hook).toMatch(/if\s*\(\s*!canTransport\s*\|\|\s*!leagueId\s*\)\s*return/);
    expect(hook).toMatch(/\}, \[canTransport, leagueId, season, draftPace, draftId\]/);
  });

  it("exposes connection checkpoints for diagnostics", () => {
    for (const name of [
      "extension_presence",
      "arm_sent",
      "arm_reply",
      "status",
      "snapshot_applied",
      "connected",
    ] as const) {
      expect(hook).toContain(`checkpointLog("${name}"`);
    }
    expect(hook).toContain("EspnBmTransportCheckpoints");
  });
});
