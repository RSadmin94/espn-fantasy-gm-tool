/**
 * ESPN Live bookmarklet-primary path wiring (DraftWarRoom + bridge).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createEspnBmIngestState,
  planEspnBookmarkletBatchIngest,
} from "@/lib/espnBookmarkletIngest";
import type { EspnBmBridgePickBatch } from "@/lib/espnBookmarkletBridge";
import { applyNormalizedPickBatch, createDraftSessionState } from "@shared/draftSource";
import { shouldEnableLegacyEspnLeagueFetch } from "@/lib/espnBookmarkletLivePath";
import {
  liveDraftStatusLines,
  resolveLiveDraftUiPhase,
} from "@/lib/liveDraftUx";

const warRoom = readFileSync(
  join(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
  "utf8",
);
const hook = readFileSync(
  join(process.cwd(), "client/src/hooks/useEspnBookmarkletDraftMonitor.ts"),
  "utf8",
);

function makeBatch(over: Partial<EspnBmBridgePickBatch> = {}): EspnBmBridgePickBatch {
  return {
    type: "GMWR_ESPN_BM_PICK_BATCH",
    protocolVersion: 1,
    revision: 1,
    provider: "espn-live",
    draftType: "live",
    draftId: "espn-live-457622-2026",
    leagueId: "457622",
    season: 2026,
    sessionNonce: "nonce-test",
    baselineOnly: false,
    liveNotify: true,
    draftComplete: false,
    teamCount: 12,
    observedAt: new Date().toISOString(),
    picks: [
      {
        eventKey: "espn-live:457622:2026:1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        teamId: "1",
        teamName: "Team 1",
        ownerName: "A",
        playerId: "4241389",
        playerName: "Ja'Marr Chase",
        position: "WR",
        nflTeam: "CIN",
        isKeeper: false,
        isTradedPick: false,
        playerIdSource: "espn",
      },
    ],
    ...over,
  };
}

describe("DraftWarRoom ESPN bookmarklet path wiring", () => {
  it("Session On + ESPN Live arms bookmarklet extension (GMWR_ESPN_BM_ARM)", () => {
    expect(warRoom).toContain("useEspnBookmarkletDraftMonitor");
    expect(warRoom).toMatch(
      /useEspnBookmarkletDraftMonitor\(\{[\s\S]*?enabled:\s*Boolean\(leagueId\)\s*&&\s*connectedLeagueLive/,
    );
    expect(warRoom).toContain("armExtension: true");
    expect(hook).toContain("postEspnBookmarkletArm");
    expect(hook).toContain("GMWR_ESPN_BM_PICK_BATCH");
  });

  it("wires PICK_BATCH into applyNormalizedPickBatch via onNormalizedBatch", () => {
    expect(warRoom).toContain("onNormalizedBatch: applyProjectionBatch");
    expect(warRoom).toContain(
      "applyNormalizedPickBatch(prev, batch, enrichFromPool)",
    );
    expect(hook).toContain("onNormalizedBatchRef.current?.(plan.projectionBatch)");
    expect(hook).toContain("toNotifyLockedPickRequest");
  });

  it("legacy league fetch is gated to extension_missing only", () => {
    expect(warRoom).toContain("shouldEnableLegacyEspnLeagueFetch");
    expect(warRoom).toContain("legacyLeagueFetchEnabled");
    expect(warRoom).not.toMatch(
      /connectedLeagueLive\s*&&\s*!espnBookmarklet\.transportActive/,
    );
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "waiting_for_espn_mirror",
      }),
    ).toBe(false);
  });

  it("reconnect UI prefers bookmarklet transport state", () => {
    expect(warRoom).toContain(
      'transportKind: connectedLeagueLive && preferBookmarkletStatus ? "espn-mirror"',
    );
    expect(warRoom).toContain("mirrorHandshake");
    expect(warRoom).toContain("lastRevision");
  });
});

describe("PICK_BATCH → applyNormalizedPickBatch pipeline", () => {
  it("first valid batch updates the board", () => {
    const batch = makeBatch();
    const plan = planEspnBookmarkletBatchIngest({
      batch,
      expectedLeagueId: "457622",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-test",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.projectionBatch?.picks).toHaveLength(1);

    const session = createDraftSessionState({
      sessionKey: "test",
      draftId: "espn-live-457622-2026",
      provider: "espn-live",
      baselineResults: {},
    });
    const applied = applyNormalizedPickBatch(
      session,
      plan.projectionBatch!,
      () => ({ adp: null, nflTeam: null, isKeeper: false }),
    );
    expect(applied.state.results[1]?.name).toMatch(/Chase/i);
  });

  it("duplicate batch is rejected", () => {
    const batch = makeBatch({ revision: 2 });
    const first = planEspnBookmarkletBatchIngest({
      batch,
      expectedLeagueId: "457622",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-test",
      state: createEspnBmIngestState(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const dup = planEspnBookmarkletBatchIngest({
      batch,
      expectedLeagueId: "457622",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-test",
      state: first.next,
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error).toBe("duplicate_batch");
  });
});

describe("ESPN Mirror reconnect UI", () => {
  it("waiting for Mirror is not reconnecting / league-fetch failed", () => {
    const s = {
      active: true,
      source: "espn" as const,
      monitoring: true,
      boothOnAir: false,
      draftComplete: false,
      lastError: null,
      connectorReady: false,
      transportKind: "espn-mirror" as const,
      lockedCount: 0,
    };
    expect(resolveLiveDraftUiPhase(s)).toBe("waiting");
    const lines = liveDraftStatusLines(s).join(" ");
    expect(lines).toMatch(/Waiting for ESPN Mirror/);
    expect(lines).not.toMatch(/League fetch failed|Reconnecting to league feed/i);
  });

  it("connected Mirror shows Connected to ESPN Mirror + revision", () => {
    const s = {
      active: true,
      source: "espn" as const,
      monitoring: true,
      boothOnAir: true,
      draftComplete: false,
      lastError: null,
      connectorReady: true,
      transportKind: "espn-mirror" as const,
      hasLockedPicks: true,
      lockedCount: 3,
      lastRevision: 7,
    };
    expect(resolveLiveDraftUiPhase(s)).toBe("waiting");
    const lines = liveDraftStatusLines(s);
    expect(lines[0]).toBe("Connected to ESPN Mirror");
    expect(lines.some((l) => /Picks 3 · rev 7/.test(l))).toBe(true);
  });
});
