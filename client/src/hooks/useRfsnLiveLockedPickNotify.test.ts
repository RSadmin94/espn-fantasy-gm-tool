// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ accepted: true, pickId: "pick-1" })),
  accessData: { enabled: true, canAccess: true, ttsEnabled: true } as {
    enabled: boolean;
    canAccess: boolean;
    ttsEnabled: boolean;
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    rfsnBroadcast: {
      getAccess: {
        useQuery: () => ({ data: mocks.accessData, isLoading: false }),
      },
      notifyLockedPick: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
    },
  },
}));

function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

function renderHook<P, R>(
  useHook: (props: P) => R,
  options: { initialProps: P },
): { rerender: (props: P) => void } {
  const container = document.createElement("div");
  const root = createRoot(container);
  let props = options.initialProps;
  const Comp = () => {
    useHook(props);
    return null;
  };
  act(() => {
    root.render(createElement(Comp));
  });
  return {
    rerender: (next: P) => {
      props = next;
      act(() => {
        root.render(createElement(Comp));
      });
    },
  };
}

import { useRfsnLiveLockedPickNotify } from "./useRfsnLiveLockedPickNotify";

const schedule = [
  { pickNumber: 1, round: 1, roundPick: 1, teamId: "1", ownerName: "Alice" },
  { pickNumber: 2, round: 1, roundPick: 2, teamId: "2", ownerName: "Bob" },
];

const baseProps = {
  enabled: true,
  leagueId: "league-1",
  draftId: "war-room-live-2026",
  schedule,
  results: {} as Record<number, { name?: string; position?: string; id?: string | number }>,
  draftComplete: false,
  teamCount: 14,
  resetKey: "sig-1",
  baselineResults: {},
};

describe("useRfsnLiveLockedPickNotify", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockClear();
    mocks.accessData = { enabled: true, canAccess: true, ttsEnabled: true };
  });

  it("one finalized pick triggers one notification", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync.mock.calls[0]![0].pick.playerName).toBe("CeeDee Lamb");
  });

  it("duplicate rerender does not resend", async () => {
    const results = { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } };
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: { ...baseProps, results },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    rerender({ ...baseProps, results: { ...results } });
    rerender({ ...baseProps, results: { ...results } });
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("provisional pick without name does not notify", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: { 1: { position: "WR", id: "p1" } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("failed notification does not throw (pick flow unaffected)", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("network down"));
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    expect(() =>
      rerender({
        ...baseProps,
        results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
      }),
    ).not.toThrow();
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("two distinct picks trigger two notifications", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    rerender({
      ...baseProps,
      results: {
        1: { name: "CeeDee Lamb", position: "WR", id: "p1" },
        2: { name: "Josh Allen", position: "QB", id: "p2" },
      },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.mutateAsync.mock.calls[1]![0].pick.playerName).toBe("Josh Allen");
  });

  it("final pick sends draftComplete on the last scheduled pick only", async () => {
    const schedule = [
      { pickNumber: 1, round: 1, teamId: 1 },
      { pickNumber: 2, round: 1, teamId: 2 },
    ];
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: {
        ...baseProps,
        schedule,
        draftComplete: true,
        results: { 1: { name: "A", position: "WR", id: "a" } },
      },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync.mock.calls[0]![0].draftComplete).toBe(false);

    rerender({
      ...baseProps,
      schedule,
      draftComplete: true,
      results: {
        1: { name: "A", position: "WR", id: "a" },
        2: { name: "B", position: "QB", id: "b" },
      },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.mutateAsync.mock.calls[1]![0].draftComplete).toBe(true);
    expect(mocks.mutateAsync.mock.calls[1]![0].teamCount).toBe(14);
  });

  it("rapid picks preserve identity in payloads", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: {
        1: { name: "CeeDee Lamb", position: "WR", id: "p1" },
        2: { name: "Josh Allen", position: "QB", id: "p2" },
      },
    });
    await vi.waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.mutateAsync.mock.calls[0]![0]).toMatchObject({
      leagueId: "league-1",
      draftId: "war-room-live-2026",
      pick: { overallPick: 1, playerId: "p1" },
    });
    expect(mocks.mutateAsync.mock.calls[1]![0]).toMatchObject({
      leagueId: "league-1",
      draftId: "war-room-live-2026",
      pick: { overallPick: 2, playerId: "p2" },
    });
  });

  it("feature flag off does not call notifyLockedPick", async () => {
    mocks.accessData = { enabled: false, canAccess: false, ttsEnabled: false };
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("unauthorized context does not call notifyLockedPick", async () => {
    mocks.accessData = { enabled: true, canAccess: false, ttsEnabled: true };
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: baseProps,
    });
    rerender({
      ...baseProps,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("disabled hook does not call notifyLockedPick", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: { ...baseProps, enabled: false },
    });
    rerender({
      ...baseProps,
      enabled: false,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("missing leagueId does not call notifyLockedPick", async () => {
    const { rerender } = renderHook(useRfsnLiveLockedPickNotify, {
      initialProps: { ...baseProps, leagueId: null },
    });
    rerender({
      ...baseProps,
      leagueId: null,
      results: { 1: { name: "CeeDee Lamb", position: "WR", id: "p1" } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
