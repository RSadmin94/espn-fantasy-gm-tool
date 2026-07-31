/**
 * Drives the deterministic ESPN connect engine for the connect page.
 *
 * Nothing here decides what a screen looks like — it owns when to probe, when to run, when to
 * confirm against the backend, and what to report. The connector transport, `saveCredentials`,
 * and the typed stages are untouched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectEspnViaConnector,
  findConnectedLeague,
  type EspnConnectResult,
} from "@/lib/espnApi";
import {
  applyConnectResult,
  applyPreflight,
  applyReadBack,
  initialEspnConnectFlowState,
  shouldAutoConnect,
  startConnecting,
  startSaving,
  type EspnConnectFlowState,
} from "@/lib/espnConnectFlow";
import { trpc } from "@/lib/trpc";

interface ConnectedLeagueRow {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string;
}

export interface UseEspnConnectFlow {
  state: EspnConnectFlowState;
  /** True while a probe or connect run is in flight, so actions can be disabled. */
  busy: boolean;
  /** Leagues already connected to this account, once known. */
  connectedLeagues: ConnectedLeagueRow[];
  atLimit: boolean;
  recheck: () => void;
  connect: () => void;
  chooseLeague: (leagueId: string, leagueName: string) => void;
}

export function useEspnConnectFlow(): UseEspnConnectFlow {
  const [state, setState] = useState<EspnConnectFlowState>(initialEspnConnectFlowState);
  const [busy, setBusy] = useState(false);
  const autoRanRef = useRef(false);
  const runIdRef = useRef(0);

  const utils = trpc.useUtils();
  const sessionQ = trpc.me.session.useQuery();
  const leaguesQ = trpc.league.getMyLeagues.useQuery();
  const limitsQ = trpc.league.getConnectionLimits.useQuery();

  const connectedLeagues = (leaguesQ.data as ConnectedLeagueRow[] | undefined) ?? [];
  const isDemo = sessionQ.data?.isDemo === true;
  const atLimit = limitsQ.data?.atLimit === true;

  /** R7: one line per stage with the fields that explain what the user is about to see. */
  const report = useCallback(
    (phase: "preflight" | "connect" | "verify", r: EspnConnectResult, leagueFound: boolean | null) => {
      console.info("[ConnectESPN] connect stage", {
        phase,
        stage: r.stage,
        connectorPresent: r.connectorPresent,
        espnSignedIn: r.espnSignedIn,
        saveHttpStatus: r.saveHttpStatus,
        leagueFound,
        elapsedMs: r.elapsedMs,
      });
    },
    [],
  );

  const runPreflight = useCallback(async () => {
    const runId = ++runIdRef.current;
    setBusy(true);
    try {
      const probe = await connectEspnViaConnector({ probe: true });
      if (runId !== runIdRef.current) return;
      report("preflight", probe, null);
      setState(applyPreflight(probe));
    } finally {
      if (runId === runIdRef.current) setBusy(false);
    }
  }, [report]);

  const run = useCallback(
    async (opts?: { leagueId?: string; leagueName?: string }) => {
      const runId = ++runIdRef.current;
      setBusy(true);
      setState((s) => (opts?.leagueId ? startSaving(s) : startConnecting(s)));
      try {
        const result = await connectEspnViaConnector(opts);
        if (runId !== runIdRef.current) return;

        if (result.stage !== "connected") {
          report("connect", result, null);
          setState((s) => applyConnectResult(s, result));
          return;
        }

        setState((s) => applyConnectResult(s, result));
        void utils.league.getActive.invalidate();
        void utils.league.getConnectionLimits.invalidate();
        const rows = (await utils.league.getMyLeagues.fetch(undefined)) as
          | ConnectedLeagueRow[]
          | undefined;
        if (runId !== runIdRef.current) return;
        const saved = findConnectedLeague(rows ?? [], result.leagueId);
        report("verify", result, Boolean(saved));
        setState((s) => applyReadBack(s, Boolean(saved)));
      } finally {
        if (runId === runIdRef.current) setBusy(false);
      }
    },
    [report, utils],
  );

  useEffect(() => {
    void runPreflight();
  }, [runPreflight]);

  // Auto-advance for a cold-start user: no league yet, nothing to lose, one less click.
  useEffect(() => {
    if (!leaguesQ.isSuccess || !limitsQ.isSuccess || !sessionQ.isSuccess) return;
    if (
      !shouldAutoConnect({
        step: state.step,
        connectedLeagueCount: connectedLeagues.length,
        isDemo,
        atLimit,
        alreadyRan: autoRanRef.current,
      })
    ) {
      return;
    }
    autoRanRef.current = true;
    void run();
  }, [
    state.step,
    connectedLeagues.length,
    isDemo,
    atLimit,
    run,
    leaguesQ.isSuccess,
    limitsQ.isSuccess,
    sessionQ.isSuccess,
  ]);

  return {
    state,
    busy,
    connectedLeagues,
    atLimit,
    recheck: useCallback(() => void runPreflight(), [runPreflight]),
    connect: useCallback(() => void run(), [run]),
    chooseLeague: useCallback(
      (leagueId: string, leagueName: string) => void run({ leagueId, leagueName }),
      [run],
    ),
  };
}
