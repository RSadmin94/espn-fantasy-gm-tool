// @vitest-environment jsdom
/**
 * DraftWarRoom integration: shared mount Live → Mock must not leave getLiveSnapshot armed
 * when Live Draft toggle stays ON (sticky liveDraftActive).
 */
import { createElement, useState } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skipToken } from "@tanstack/react-query";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isRfsnWarRoomBroadcastActive } from "@/lib/rfsnWarRoomBroadcastActive";

(globalThis as any).React = ReactNamespace;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

const snapshotQueryCalls: Array<{ input: unknown; opts: Record<string, unknown> }> = [];

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock("@/components/rfsn/RfsnAnalystBooth", () => ({
  RfsnAnalystBooth: () => null,
}));

vi.mock("@/components/rfsn/RfsnAudioControls", () => ({
  RfsnAudioControls: () => null,
}));

vi.mock("@/components/rfsn/RfsnCommentaryLog", () => ({
  RfsnCommentaryLog: () => null,
}));

vi.mock("@/hooks/useRfsnAudioPlayback", () => ({
  useRfsnAudioPlayback: () => ({
    state: "idle",
    unlocked: true,
    userEnabled: true,
    clearReplay: () => {},
    unlockAudio: () => {},
    playForCard: () => {},
  }),
}));

vi.mock("@/hooks/useRfsnBoothController", () => ({
  useRfsnBoothController: () => ({
    cardStates: {},
    activeCommentator: null,
    activeCard: null,
    sequenceIndex: -1,
    dismissFor: () => {},
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    rfsnBroadcast: {
      getAccess: {
        useQuery: () => ({ data: { ttsEnabled: true, canAccess: true } }),
      },
      getLiveSnapshot: {
        useQuery: (input: unknown, opts: Record<string, unknown> = {}) => {
          snapshotQueryCalls.push({ input, opts });
          return { data: undefined };
        },
      },
    },
  },
}));

import { RfsnBroadcastPanel } from "@/components/rfsn/RfsnBroadcastPanel";

function act<T>(fn: () => T): T {
  return flushSync(fn);
}

/** Mirrors LiveDraftEngine: sticky liveDraftActive + preferLiveDraft from the route. */
function WarRoomBroadcastActiveHarness({
  preferLiveDraft,
  liveDraftActiveSticky,
}: {
  preferLiveDraft: boolean;
  liveDraftActiveSticky: boolean;
}) {
  const [liveDraftActive] = useState(liveDraftActiveSticky);
  const active = isRfsnWarRoomBroadcastActive({
    liveDraftActive,
    preferLiveDraft,
  });
  return createElement(RfsnBroadcastPanel, {
    leagueId: "league-1",
    draftId: "draft-1",
    active,
  });
}

describe("DraftWarRoom Live→Mock broadcast poller lifecycle", () => {
  const warRoom = readFileSync(
    resolve(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
    "utf8",
  );

  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    snapshotQueryCalls.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("wires panel active through isRfsnWarRoomBroadcastActive(liveDraftActive, preferLiveDraft)", () => {
    expect(warRoom).toContain("isRfsnWarRoomBroadcastActive");
    expect(warRoom).toContain("liveDraftActive");
    expect(warRoom).toContain("preferLiveDraft");
    expect(warRoom).not.toMatch(/active=\{liveDraftActive\}/);
  });

  it("matrix: only Live surface + Live Draft ON arms polling", () => {
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: true }),
    ).toBe(true);
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: false, preferLiveDraft: true }),
    ).toBe(false);
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: false }),
    ).toBe(false);
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: false, preferLiveDraft: false }),
    ).toBe(false);
  });

  it("Live → Mock with Live Draft left ON → getLiveSnapshot is not armed", () => {
    // 1) Live surface, Live Draft ON
    act(() => {
      root.render(
        createElement(WarRoomBroadcastActiveHarness, {
          preferLiveDraft: true,
          liveDraftActiveSticky: true,
        }),
      );
    });
    const liveFetchable = snapshotQueryCalls.filter((c) => c.input !== skipToken);
    expect(liveFetchable.length).toBeGreaterThan(0);
    expect(liveFetchable.at(-1)!.opts.refetchInterval).toBe(2000);

    // 2) Navigate to Mock without toggling Live Draft off (sticky true, surface false)
    snapshotQueryCalls.length = 0;
    act(() => {
      root.render(
        createElement(WarRoomBroadcastActiveHarness, {
          preferLiveDraft: false,
          liveDraftActiveSticky: true,
        }),
      );
    });

    const mockFetchable = snapshotQueryCalls.filter((c) => c.input !== skipToken);
    expect(mockFetchable).toHaveLength(0);
    expect(snapshotQueryCalls.length).toBeGreaterThan(0);
    for (const call of snapshotQueryCalls) {
      expect(call.input).toBe(skipToken);
      expect(call.opts.enabled).toBe(false);
      expect(call.opts.refetchInterval).toBe(false);
    }
  });
});
