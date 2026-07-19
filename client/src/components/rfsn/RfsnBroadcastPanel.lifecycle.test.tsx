// @vitest-environment jsdom
/**
 * Lifecycle regression: getLiveSnapshot must not poll when Live Draft is inactive
 * (e.g. Mock Draft on the shared War Room mount).
 */
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skipToken } from "@tanstack/react-query";

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

describe("RfsnBroadcastPanel live snapshot poller lifecycle", () => {
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

  it("Mock/inactive mode → getLiveSnapshot is not armed (0 fetchable invocations)", () => {
    act(() => {
      root.render(
        createElement(RfsnBroadcastPanel, {
          leagueId: "league-1",
          draftId: "draft-1",
          active: false,
        }),
      );
    });

    const fetchable = snapshotQueryCalls.filter((c) => c.input !== skipToken);
    expect(fetchable).toHaveLength(0);
    expect(snapshotQueryCalls.length).toBeGreaterThan(0);
    for (const call of snapshotQueryCalls) {
      expect(call.input).toBe(skipToken);
      expect(call.opts.enabled).toBe(false);
      expect(call.opts.refetchInterval).toBe(false);
      expect(call.opts).not.toHaveProperty("refetchIntervalInBackground");
    }
  });

  it("Live/active mode → polling remains enabled", () => {
    act(() => {
      root.render(
        createElement(RfsnBroadcastPanel, {
          leagueId: "league-1",
          draftId: "draft-1",
          active: true,
        }),
      );
    });

    const fetchable = snapshotQueryCalls.filter((c) => c.input !== skipToken);
    expect(fetchable.length).toBeGreaterThan(0);
    const last = snapshotQueryCalls[snapshotQueryCalls.length - 1]!;
    expect(last.input).toEqual({ leagueId: "league-1", draftId: "draft-1" });
    expect(last.opts.enabled).toBe(true);
    expect(last.opts.refetchInterval).toBe(2000);
    expect(last.opts).not.toHaveProperty("refetchIntervalInBackground");
  });
});
