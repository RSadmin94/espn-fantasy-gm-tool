// @vitest-environment jsdom
/**
 * RFSN-030 — ESPN connected-league monitor must stop on Live → Mock when
 * Live Draft toggle stays ON (sticky liveDraftActive).
 */
import { createElement, useState } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isConnectedLeagueLiveActive } from "@/lib/liveDraftSurfaceActive";

(globalThis as any).React = ReactNamespace;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

const espnFetchCalls: Array<{ at: number }> = [];
let mutationIdentity = 0;

vi.mock("@/lib/espnLiveDraftFetch", () => ({
  fetchEspnLiveDraftDetail: async () => {
    espnFetchCalls.push({ at: Date.now() });
    return { ok: false, kind: "cors_or_network", message: "probe" };
  },
}));

vi.mock("@/lib/espnApi", () => ({
  isGmWarRoomExtensionPresent: () => false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    rfsnBroadcast: {
      getAccess: {
        useQuery: (_input: unknown, opts: { enabled?: boolean } = {}) => ({
          data:
            opts.enabled === false
              ? undefined
              : { enabled: true, canAccess: true, ttsEnabled: true },
        }),
      },
      notifyLockedPick: {
        // New object each call — reproduces identity churn that used to storm the effect.
        useMutation: () => {
          mutationIdentity += 1;
          return {
            _id: mutationIdentity,
            mutateAsync: vi.fn(),
          };
        },
      },
    },
  },
}));

import { useEspnLiveDraftMonitor } from "@/hooks/useEspnLiveDraftMonitor";

function act<T>(fn: () => T): T {
  return flushSync(fn);
}

function MonitorHarness({
  preferLiveDraft,
  liveDraftActiveSticky,
  source = "connected-league",
  pollMs = 40,
}: {
  preferLiveDraft: boolean;
  liveDraftActiveSticky: boolean;
  source?: string;
  pollMs?: number;
}) {
  const [liveDraftActive] = useState(liveDraftActiveSticky);
  const connectedLeagueLive = isConnectedLeagueLiveActive({
    liveDraftActive,
    preferLiveDraft,
    source,
  });
  const status = useEspnLiveDraftMonitor({
    enabled: connectedLeagueLive,
    leagueId: "457622",
    season: 2026,
    pollMs,
  });
  return createElement("div", {
    "data-probe": JSON.stringify({
      connectedLeagueLive,
      monitorActive: status.active,
    }),
  });
}

describe("DraftWarRoom Live→Mock ESPN monitor lifecycle (RFSN-030)", () => {
  const warRoom = readFileSync(
    resolve(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
    "utf8",
  );

  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    espnFetchCalls.length = 0;
    mutationIdentity = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("wires connectedLeagueLive through isConnectedLeagueLiveActive (surface + source)", () => {
    expect(warRoom).toContain("isConnectedLeagueLiveActive");
    expect(warRoom).toContain("preferLiveDraft");
    expect(warRoom).not.toMatch(
      /connectedLeagueLive\s*=\s*liveDraftActive\s*&&\s*liveDraftSource/,
    );
  });

  it("Scenario 2: /draft/live + Live Draft ON → ESPN monitor active", async () => {
    act(() => {
      root.render(
        createElement(MonitorHarness, {
          preferLiveDraft: true,
          liveDraftActiveSticky: true,
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 90));
    const probe = JSON.parse(
      host.querySelector("[data-probe]")!.getAttribute("data-probe")!,
    );
    expect(probe.connectedLeagueLive).toBe(true);
    expect(probe.monitorActive).toBe(true);
    expect(espnFetchCalls.length).toBeGreaterThan(0);
  });

  it("Scenario 1: Live → Mock with sticky Live ON → monitor stopped", async () => {
    act(() => {
      root.render(
        createElement(MonitorHarness, {
          preferLiveDraft: true,
          liveDraftActiveSticky: true,
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 90));
    expect(espnFetchCalls.length).toBeGreaterThan(0);

    const beforeMock = espnFetchCalls.length;
    act(() => {
      root.render(
        createElement(MonitorHarness, {
          preferLiveDraft: false,
          liveDraftActiveSticky: true,
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 120));

    const probe = JSON.parse(
      host.querySelector("[data-probe]")!.getAttribute("data-probe")!,
    );
    expect(probe.connectedLeagueLive).toBe(false);
    expect(probe.monitorActive).toBe(false);
    expect(espnFetchCalls.length - beforeMock).toBe(0);
  });
});

describe("useEspnLiveDraftMonitor notifyMut identity", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    espnFetchCalls.length = 0;
    mutationIdentity = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("does not storm ESPN fetches when mutation object identity churns", async () => {
    function ChurnHarness() {
      const [, setTick] = useState(0);
      ReactNamespace.useEffect(() => {
        const id = window.setInterval(() => setTick((n) => n + 1), 15);
        return () => clearInterval(id);
      }, []);
      const status = useEspnLiveDraftMonitor({
        enabled: true,
        leagueId: "457622",
        season: 2026,
        pollMs: 80,
      });
      return createElement("div", {
        "data-active": String(status.active),
        "data-mut": String(mutationIdentity),
      });
    }

    act(() => {
      root.render(createElement(ChurnHarness));
    });
    await new Promise((r) => setTimeout(r, 220));

    // With 80ms poll, ~220ms → about 2–4 ticks. Storm would be dozens+.
    expect(espnFetchCalls.length).toBeGreaterThan(0);
    expect(espnFetchCalls.length).toBeLessThan(8);
    expect(mutationIdentity).toBeGreaterThan(5);
    expect(host.querySelector("[data-active]")!.getAttribute("data-active")).toBe(
      "true",
    );
  });
});
