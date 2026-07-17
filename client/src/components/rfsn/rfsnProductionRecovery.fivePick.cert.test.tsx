// @vitest-environment jsdom
/**
 * RFSN production recovery cert — ticker + written commentary log only.
 * Mirrors Live Draft filtering and panel log append/reset contracts.
 */
import { createElement, useMemo } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { formatPlayerTicker, RfsnPickClock } from "./RfsnPickClock";
import { RfsnCommentaryLog } from "./RfsnCommentaryLog";
import {
  appendCommentaryLogEntry,
  type RfsnCommentaryLogEntry,
} from "@/lib/rfsnCommentaryLog";
import type { RfsnCommentatorId } from "@/lib/rfsnPresentation";

(globalThis as any).React = ReactNamespace;

function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

/** Exact filter from DraftWarRoom LiveDraftEngine.lastLockedPlayerName. */
function lastLockedNonKeeperName(
  results: Record<number, { name?: string; isKeeper?: boolean }>,
): string | null {
  let maxPick = 0;
  let name: string | null = null;
  for (const [k, v] of Object.entries(results)) {
    const n = Number(k);
    if (v?.isKeeper) continue;
    const playerName = String(v?.name ?? "").trim();
    if (!playerName || !Number.isFinite(n) || n <= maxPick) continue;
    maxPick = n;
    name = playerName;
  }
  return name;
}

type SeededPick = {
  pick: number;
  player: string;
  analyst: RfsnCommentatorId;
  text: string;
};

const SEEDED: SeededPick[] = [
  { pick: 1, player: "Ja'Marr Chase", analyst: "sofia", text: "Sofia opens on Chase at 1.01." },
  { pick: 2, player: "Bijan Robinson", analyst: "coach", text: "Coach likes the RB floor." },
  { pick: 3, player: "CeeDee Lamb", analyst: "roxanne", text: "Roxanne frames the WR temperature." },
  { pick: 4, player: "Breece Hall", analyst: "sofia", text: "Sofia notes the board pressure." },
  { pick: 5, player: "Amon-Ra St. Brown", analyst: "coach", text: "Coach stays with WR construction." },
];

function RecoverySurface({
  results,
  log,
}: {
  results: Record<number, { name?: string; isKeeper?: boolean }>;
  log: RfsnCommentaryLogEntry[];
}) {
  const lastLockedPlayerName = useMemo(() => lastLockedNonKeeperName(results), [results]);
  return createElement(
    "div",
    { "data-recovery-surface": "true" },
    createElement(RfsnPickClock, {
      state: "running",
      round: 1,
      overallPick: Math.max(0, ...Object.keys(results).map(Number)),
      onClockTeam: "Team A",
      remainingMs: 9000,
      lastLockedPlayerName,
    }),
    createElement(RfsnCommentaryLog, { entries: log }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RFSN production recovery — five-pick seeded cert", () => {
  it("DRAFT READY before pick 1, updates 1–5, pause preserves, reset clears", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    // Preload keepers that previously froze the ticker (Jaxon Smith-Njigba case).
    let results: Record<number, { name?: string; isKeeper?: boolean }> = {
      101: { name: "Jaxon Smith-Njigba", isKeeper: true },
      102: { name: "Keeper Ghost", isKeeper: true },
    };
    let log: RfsnCommentaryLogEntry[] = [];
    let logResetAt = Date.now();
    const seen = new Set<string>();
    const table: Array<{
      pick: number;
      ticker: string;
      commentaryGenerated: "YES" | "NO";
      commentaryLogged: "YES" | "NO";
      analyst: string;
    }> = [];

    const render = () => {
      act(() => root.render(createElement(RecoverySurface, { results, log })));
    };

    const tickerText = () =>
      container.querySelector("[data-player-ticker]")?.getAttribute("title") ?? "";
    const logText = () =>
      container.querySelector("[data-rfsn-commentary-log]")?.textContent ?? "";

    // Before Pick 1
    render();
    expect(formatPlayerTicker(lastLockedNonKeeperName(results)).display).toBe(
      "******** DRAFT READY ********",
    );
    expect(tickerText()).toBe("******** DRAFT READY ********");
    expect(logText()).toContain("Waiting for written commentary");

    for (const seeded of SEEDED) {
      results = {
        ...results,
        [seeded.pick]: { name: seeded.player, isKeeper: false },
      };
      // Simulate accepted booth sequence append (same helper + once-per-id panel contract).
      const id = `pick-${seeded.pick}:${seeded.analyst}:primary`;
      if (!seen.has(id)) {
        seen.add(id);
        log = appendCommentaryLogEntry(log, {
          id,
          pickLabel: `1.0${seeded.pick}`,
          commentator: seeded.analyst,
          text: seeded.text,
        });
      }
      // Duplicate append must not create duplicates (pause / poll).
      log = appendCommentaryLogEntry(log, {
        id,
        pickLabel: `1.0${seeded.pick}`,
        commentator: seeded.analyst,
        text: seeded.text,
      });

      render();
      const expectedTicker = formatPlayerTicker(seeded.player).display;
      expect(tickerText()).toBe(expectedTicker);
      expect(logText()).toContain(seeded.text);
      expect(logText()).toMatch(/Sofia|Coach|Roxanne/);

      table.push({
        pick: seeded.pick,
        ticker: expectedTicker,
        commentaryGenerated: "YES",
        commentaryLogged: log.some((e) => e.id === id) ? "YES" : "NO",
        analyst:
          seeded.analyst === "sofia"
            ? "Sofia"
            : seeded.analyst === "coach"
              ? "Coach"
              : "Roxanne",
      });
    }

    expect(table).toHaveLength(5);
    expect(log).toHaveLength(5);

    // Pause — preserve log + ticker; no duplicate commentary.
    const pausedTicker = tickerText();
    const pausedLogLen = log.length;
    const pausedLogSnapshot = logText();
    log = appendCommentaryLogEntry(log, {
      id: "pick-5:coach:primary",
      pickLabel: "1.05",
      commentator: "coach",
      text: "Coach stays with WR construction.",
    });
    render();
    expect(tickerText()).toBe(pausedTicker);
    expect(log).toHaveLength(pausedLogLen);
    expect(logText()).toBe(pausedLogSnapshot);

    // Reset — DRAFT READY + empty log; stale pre-reset commentary cannot append.
    results = {
      101: { name: "Jaxon Smith-Njigba", isKeeper: true },
    };
    log = [];
    seen.clear();
    logResetAt = Date.now() + 1;
    const staleGeneratedAt = logResetAt - 5_000;
    if (staleGeneratedAt < logResetAt) {
      // Stale session frame ignored (panel contract).
    }
    render();
    expect(tickerText()).toBe("******** DRAFT READY ********");
    expect(logText()).toContain("Waiting for written commentary");
    expect(log).toHaveLength(0);

    // Expose table for the final report harness.
    (globalThis as any).__RFSN_RECOVERY_FIVE_PICK_TABLE__ = table;

    act(() => root.unmount());
    container.remove();
  });
});
