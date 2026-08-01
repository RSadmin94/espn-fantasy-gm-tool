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
  advanceSaving,
  applyConnectResult,
  applyPreflight,
  applyReadBack,
  connectFunnelExtra,
  connectFunnelStep,
  emptyConnectFunnelFacts,
  initialEspnConnectFlowState,
  recordFailedLeague,
  shouldAutoConnect,
  startConfirming,
  startConnecting,
  startSaving,
  type ConnectFunnelFacts,
  type EspnConnectFlowState,
  type EspnConnectLeagueRef,
  type EspnConnectStep,
} from "@/lib/espnConnectFlow";
import { useFunnel } from "@/lib/funnel";
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
  /** How many more leagues this account may connect, or null until the limit is known. */
  remainingSlots: number | null;
  recheck: () => void;
  connect: () => void;
  /** Link every league the user ticked, one after another. */
  chooseLeagues: (picks: readonly EspnConnectLeagueRef[]) => void;
}

export function useEspnConnectFlow(): UseEspnConnectFlow {
  const [state, setState] = useState<EspnConnectFlowState>(initialEspnConnectFlowState);
  const [busy, setBusy] = useState(false);
  const autoRanRef = useRef(false);
  const runIdRef = useRef(0);
  const track = useFunnel();
  /** Latest connector reading, so a step event explains itself without a join. */
  const factsRef = useRef<ConnectFunnelFacts>(emptyConnectFunnelFacts());
  const trackedStepRef = useRef<EspnConnectStep | null>(null);

  const utils = trpc.useUtils();
  const sessionQ = trpc.me.session.useQuery();
  const leaguesQ = trpc.league.getMyLeagues.useQuery();
  const limitsQ = trpc.league.getConnectionLimits.useQuery();

  const connectedLeagues = (leaguesQ.data as ConnectedLeagueRow[] | undefined) ?? [];
  const isDemo = sessionQ.data?.isDemo === true;
  const atLimit = limitsQ.data?.atLimit === true;
  const remainingSlots = limitsQ.data ? limitsQ.data.remaining : null;

  /** R7: one line per stage with the fields that explain what the user is about to see. */
  const report = useCallback(
    (phase: "preflight" | "connect" | "verify", r: EspnConnectResult, leagueFound: boolean | null) => {
      // Recorded before the state update that follows, so the step event it lands on is current.
      factsRef.current = {
        connectorPresent: r.connectorPresent,
        espnSignedIn: r.espnSignedIn,
        saveHttpStatus: r.saveHttpStatus,
        leagueFound,
        elapsedMs: r.elapsedMs,
      };
      console.info("[ConnectESPN] connect stage", {
        phase,
        stage: r.stage,
        connectorPresent: r.connectorPresent,
        espnSignedIn: r.espnSignedIn,
        saveHttpStatus: r.saveHttpStatus,
        savedTo: r.savedTo,
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

  /** The backend, not the connector, decides who is connected. */
  const verify = useCallback(
    async (runId: number, last: EspnConnectResult, claimed: readonly EspnConnectLeagueRef[]) => {
      void utils.league.getActive.invalidate();
      void utils.league.getConnectionLimits.invalidate();
      const rows = (await utils.league.getMyLeagues.fetch(undefined)) as
        | ConnectedLeagueRow[]
        | undefined;
      if (runId !== runIdRef.current) return;
      const confirmed = claimed
        .filter((league) => findConnectedLeague(rows ?? [], league.id))
        .map((league) => league.id);
      report("verify", last, confirmed.length > 0);
      setState((s) => applyReadBack(s, confirmed));
    },
    [report, utils],
  );

  /** Discovery run: the connector either links the only league or hands back a list to pick from. */
  const run = useCallback(async () => {
    const runId = ++runIdRef.current;
    setBusy(true);
    setState(startConnecting);
    try {
      const result = await connectEspnViaConnector();
      if (runId !== runIdRef.current) return;

      if (result.stage !== "connected") {
        report("connect", result, null);
        setState((s) => applyConnectResult(s, result));
        return;
      }

      report("connect", result, null);
      setState((s) => applyConnectResult(s, result));
      await verify(runId, result, [
        { id: result.leagueId ?? "", name: result.leagueName ?? "" },
      ]);
    } finally {
      if (runId === runIdRef.current) setBusy(false);
    }
  }, [report, verify]);

  /**
   * Save every league the user ticked. The connector links one league per call, so this walks the
   * list; a league that fails is recorded and the rest still go through.
   */
  const runPicks = useCallback(
    async (picks: readonly EspnConnectLeagueRef[]) => {
      if (picks.length === 0) return;
      const runId = ++runIdRef.current;
      setBusy(true);
      setState((s) => startSaving(s, picks));
      try {
        const linked: EspnConnectLeagueRef[] = [];
        let last: EspnConnectResult | null = null;

        for (let i = 0; i < picks.length; i += 1) {
          const pick = picks[i];
          setState((s) => advanceSaving(s, i, pick.name, picks.length));
          const result = await connectEspnViaConnector({
            leagueId: pick.id,
            leagueName: pick.name,
          });
          if (runId !== runIdRef.current) return;
          report("connect", result, null);
          last = result;

          if (result.stage === "connected") {
            linked.push({ id: result.leagueId ?? pick.id, name: result.leagueName ?? pick.name });
            continue;
          }
          // A missing connector or a dead ESPN session dooms every remaining pick, so stop asking.
          if (result.stage === "connector_missing" || result.stage === "espn_signed_out") {
            setState((s) => applyConnectResult(s, result));
            return;
          }
          setState((s) => recordFailedLeague(s, pick));
        }

        if (linked.length === 0) {
          setState((s) => (last ? applyConnectResult(s, last) : s));
          return;
        }

        setState((s) => startConfirming(s, linked));
        if (last) await verify(runId, last, linked);
      } finally {
        if (runId === runIdRef.current) setBusy(false);
      }
    },
    [report, verify],
  );

  /**
   * One event per step the user actually reaches, so drop-off between two adjacent screens is a
   * subtraction. Deduped on the step itself: progress moving inside `connecting` is not a new
   * funnel position, but returning to a step after a retry is.
   */
  useEffect(() => {
    if (trackedStepRef.current === state.step) return;
    trackedStepRef.current = state.step;
    track(connectFunnelStep(state.step), {
      eventType: "feature_open",
      page: "/connect",
      extra: connectFunnelExtra(state, factsRef.current),
    });
  }, [state, track]);

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
    remainingSlots,
    recheck: useCallback(() => void runPreflight(), [runPreflight]),
    connect: useCallback(() => void run(), [run]),
    chooseLeagues: useCallback(
      (picks: readonly EspnConnectLeagueRef[]) => void runPicks(picks),
      [runPicks],
    ),
  };
}
