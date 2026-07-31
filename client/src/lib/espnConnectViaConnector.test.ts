/**
 * @vitest-environment jsdom
 *
 * Deterministic ESPN connect: every terminal stage of `connectEspnViaConnector` maps to exactly one
 * next action, and the page never falls back to polling the database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESPN_CONNECT_DISCOVER_TIMEOUT_MS,
  ESPN_CONNECT_PROBE_TIMEOUT_MS,
  ESPN_CONNECT_SAVE_TIMEOUT_MS,
  connectEspnViaConnector,
  findConnectedLeague,
  normalizeEspnConnectReply,
} from "./espnApi";

type ConnectRequest = {
  id: string;
  probe: boolean;
  leagueId: string;
  leagueName: string;
};

let teardown: (() => void) | null = null;
const seenRequests: ConnectRequest[] = [];

/** Stand in for the unpacked Connector: answers `GMWR_CONNECT_ESPN` over the same postMessage bridge. */
function installFakeConnector(reply: (req: ConnectRequest) => Record<string, unknown>) {
  document.documentElement.dataset.gmwrExtension = "1";
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as Record<string, unknown> | null;
    if (!d || d.type !== "GMWR_CONNECT_ESPN") return;
    const req: ConnectRequest = {
      id: String(d.id),
      probe: d.probe === true,
      leagueId: String(d.leagueId ?? ""),
      leagueName: String(d.leagueName ?? ""),
    };
    seenRequests.push(req);
    const data = { ...reply(req), type: "GMWR_CONNECT_ESPN_REPLY", id: req.id };
    // jsdom's postMessage leaves `source` null; a real content script reply carries source === window.
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data, source: window, origin: window.location.origin }),
      );
    }, 0);
  };
  window.addEventListener("message", onMsg);
  teardown = () => {
    window.removeEventListener("message", onMsg);
    delete document.documentElement.dataset.gmwrExtension;
  };
}

afterEach(() => {
  teardown?.();
  teardown = null;
  seenRequests.length = 0;
  delete document.documentElement.dataset.gmwrExtension;
});

describe("connectEspnViaConnector", () => {
  it("reports connector_missing immediately when the Connector is not installed", async () => {
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("connector_missing");
    expect(r.connectorPresent).toBe(false);
    expect(r.espnSignedIn).toBeNull();
    expect(r.elapsedMs).toBeLessThan(1000);
  });

  it("reports espn_signed_out when the Connector finds no ESPN cookies", async () => {
    installFakeConnector(() => ({ ok: false, stage: "espn_signed_out", espnSignedIn: false }));
    const r = await connectEspnViaConnector({ probe: true });
    expect(r.stage).toBe("espn_signed_out");
    expect(r.connectorPresent).toBe(true);
    expect(r.espnSignedIn).toBe(false);
    expect(seenRequests[0]?.probe).toBe(true);
  });

  it("connects a single league without the caller supplying a League ID", async () => {
    installFakeConnector((req) => {
      expect(req.leagueId).toBe("");
      return {
        ok: true,
        stage: "connected",
        espnSignedIn: true,
        leagueId: "457622",
        leagueName: "The League",
        httpStatus: 200,
      };
    });
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("connected");
    expect(r.leagueId).toBe("457622");
    expect(r.leagueName).toBe("The League");
    expect(r.saveHttpStatus).toBe(200);
  });

  it("returns the league list to choose from when ESPN has more than one league", async () => {
    installFakeConnector(() => ({
      ok: true,
      stage: "choose",
      espnSignedIn: true,
      leagues: [
        { id: "457622", name: "The League" },
        { id: "999111", name: "Dynasty Money" },
      ],
    }));
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("choose");
    expect(r.leagues.map((l) => l.id)).toEqual(["457622", "999111"]);
    expect(r.leagues[1]?.name).toBe("Dynasty Money");
  });

  it("saves the chosen league directly, skipping discovery", async () => {
    installFakeConnector((req) => ({
      ok: true,
      stage: "connected",
      espnSignedIn: true,
      leagueId: req.leagueId,
      leagueName: req.leagueName,
      httpStatus: 200,
    }));
    const r = await connectEspnViaConnector({ leagueId: "999111", leagueName: "Dynasty Money" });
    expect(seenRequests[0]?.leagueId).toBe("999111");
    expect(r.stage).toBe("connected");
    expect(r.leagueId).toBe("999111");
  });

  it("surfaces the specific save failure, including the HTTP status", async () => {
    installFakeConnector(() => ({
      ok: false,
      stage: "save_failed",
      espnSignedIn: true,
      leagueId: "457622",
      httpStatus: 500,
      error: "UNAUTHORIZED: sign in to Fantasy Football Rivals",
    }));
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("save_failed");
    expect(r.saveHttpStatus).toBe(500);
    expect(r.error).toBe("UNAUTHORIZED: sign in to Fantasy Football Rivals");
    expect(r.espnSignedIn).toBe(true);
  });

  it("reports no_leagues when the ESPN account has no fantasy football leagues", async () => {
    installFakeConnector(() => ({ ok: false, stage: "no_leagues", espnSignedIn: true, leagues: [] }));
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("no_leagues");
    expect(r.leagues).toEqual([]);
  });

  it("falls back to a typed error when the Connector replies with garbage", async () => {
    installFakeConnector(() => ({ ok: true, stage: "banana" }));
    const r = await connectEspnViaConnector();
    expect(r.stage).toBe("error");
    expect(r.error).toBeTruthy();
  });

  it("times out in seconds, not minutes, when the Connector never replies", async () => {
    document.documentElement.dataset.gmwrExtension = "1";
    const r = await connectEspnViaConnector({ probe: true, timeoutMs: 30 });
    expect(r.stage).toBe("timeout");
    expect(r.connectorPresent).toBe(true);
    expect(r.elapsedMs).toBeLessThan(2000);
  });
});

describe("normalizeEspnConnectReply", () => {
  it("keeps a save failure without an HTTP status readable", () => {
    const r = normalizeEspnConnectReply(
      { stage: "save_failed", espnSignedIn: true, error: "Save failed." },
      12,
    );
    expect(r.stage).toBe("save_failed");
    expect(r.saveHttpStatus).toBeNull();
    expect(r.error).toBe("Save failed.");
  });

  it("names a league that came back with an id but no name", () => {
    const r = normalizeEspnConnectReply({ stage: "connected", leagueId: "457622" }, 5);
    expect(r.leagueName).toBe("League 457622");
  });
});

describe("findConnectedLeague (backend read-back)", () => {
  const rows = [
    { id: 1, provider: "sleeper", leagueId: "111", leagueName: "Sleeper Squad" },
    { id: 2, provider: "espn", leagueId: "457622", leagueName: "The League" },
  ];

  it("finds the ESPN league the Connector claims it saved", () => {
    expect(findConnectedLeague(rows, "457622")?.id).toBe(2);
  });

  it("does not match a different provider holding the same id", () => {
    expect(findConnectedLeague(rows, "111")).toBeNull();
  });

  it("returns null when the save did not land", () => {
    expect(findConnectedLeague(rows, "999111")).toBeNull();
    expect(findConnectedLeague([], "457622")).toBeNull();
    expect(findConnectedLeague(rows, null)).toBeNull();
  });
});

describe("connect path timing (code property)", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const pageSource = readFileSync(
    path.join(repoRoot, "client", "src", "pages", "ConnectESPN.tsx"),
    "utf8",
  );

  it("keeps every connector timeout in the seconds range", () => {
    for (const ms of [
      ESPN_CONNECT_PROBE_TIMEOUT_MS,
      ESPN_CONNECT_SAVE_TIMEOUT_MS,
      ESPN_CONNECT_DISCOVER_TIMEOUT_MS,
    ]) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(30_000);
    }
  });

  it("does not poll the leagues query on the primary connect path", () => {
    expect(pageSource).not.toMatch(/refetchInterval/);
    expect(pageSource).not.toMatch(/2 \* 60 \* 1000/);
    expect(pageSource).not.toMatch(/POLL_INTERVAL_MS|TIMEOUT_MS/);
  });

  it("drives the primary connect path through the Connector", () => {
    expect(pageSource).toMatch(/connectEspnViaConnector/);
    expect(pageSource).toMatch(/findConnectedLeague/);
  });
});
