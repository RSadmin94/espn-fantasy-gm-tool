/**
 * The connect page's state machine, kept free of React so every transition is testable.
 *
 * The deterministic connector (`connectEspnViaConnector`) reports a stage; this module turns that
 * stage into the single screen the user should see next, and into copy that never mentions League
 * IDs, cookies, HTTP statuses, or the extension's internals.
 */
import type { EspnConnectLeagueOption, EspnConnectResult } from "./espnApi";

export type EspnConnectStep =
  | "preflight"
  | "connector_missing"
  | "espn_signed_out"
  /** Connector and ESPN session both present; either auto-advancing or waiting on the user. */
  | "ready"
  | "connecting"
  | "choose"
  | "connected"
  | "problem";

export type EspnConnectProblemKind =
  | "no_leagues"
  | "save_failed"
  | "timeout"
  | "error"
  | "read_back_missing";

export interface EspnConnectProblem {
  kind: EspnConnectProblemKind;
  headline: string;
  message: string;
  /** Technical cause, kept for telemetry and the Advanced panel — never shown as body copy. */
  detail: string | null;
}

/** Which line of the connecting checklist is still in flight. */
export type EspnConnectProgress = "searching" | "linking" | "confirming";

export interface EspnConnectLeagueRef {
  id: string;
  name: string;
}

/** Position within a multi-league save, so the checklist can say which one is linking. */
export interface EspnConnectPending {
  index: number;
  total: number;
  name: string;
}

export interface EspnConnectFlowState {
  step: EspnConnectStep;
  leagues: EspnConnectLeagueOption[];
  /** Leagues linked in this run, confirmed by the backend once the run reaches `connected`. */
  connected: EspnConnectLeagueRef[];
  /** Leagues the user picked that did not link, so a partial success can say which. */
  failed: EspnConnectLeagueRef[];
  pending: EspnConnectPending | null;
  problem: EspnConnectProblem | null;
  progress: EspnConnectProgress;
}

export function initialEspnConnectFlowState(): EspnConnectFlowState {
  return {
    step: "preflight",
    leagues: [],
    connected: [],
    failed: [],
    pending: null,
    problem: null,
    progress: "searching",
  };
}

function problemFor(
  kind: EspnConnectProblemKind,
  detail: string | null,
): EspnConnectProblem {
  switch (kind) {
    case "no_leagues":
      return {
        kind,
        headline: "No leagues found",
        message: "That ESPN account isn't in a fantasy football league yet.",
        detail,
      };
    case "save_failed":
      return {
        kind,
        headline: "We couldn't save your league",
        message: "ESPN answered, but linking your league didn't go through.",
        detail,
      };
    case "timeout":
      return {
        kind,
        headline: "The Connector didn't answer",
        message: "It may still be starting up. Give it another go.",
        detail,
      };
    case "read_back_missing":
      return {
        kind,
        headline: "That didn't finish saving",
        message: "Your ESPN session came through, but the league didn't stick.",
        detail,
      };
    default:
      return {
        kind: "error",
        headline: "Something went wrong",
        message: "We hit an unexpected problem connecting your league.",
        detail,
      };
  }
}

/** Preflight only ever answers three questions: no connector, no ESPN session, or go. */
export function applyPreflight(result: EspnConnectResult): EspnConnectFlowState {
  const base = initialEspnConnectFlowState();
  if (!result.connectorPresent) return { ...base, step: "connector_missing" };
  if (result.stage === "espn_signed_out") return { ...base, step: "espn_signed_out" };
  if (result.stage === "timeout" || result.stage === "error") {
    return { ...base, step: "problem", problem: problemFor(result.stage, result.error) };
  }
  return { ...base, step: "ready" };
}

/** Entering a connect run, whether auto-advanced from preflight or started by the user. */
export function startConnecting(state: EspnConnectFlowState): EspnConnectFlowState {
  return {
    ...state,
    step: "connecting",
    progress: "searching",
    problem: null,
    leagues: [],
    connected: [],
    failed: [],
    pending: null,
  };
}

/** A finished connect run. `connected` is provisional until the backend read-back confirms it. */
export function applyConnectResult(
  state: EspnConnectFlowState,
  result: EspnConnectResult,
): EspnConnectFlowState {
  switch (result.stage) {
    case "connector_missing":
      return { ...state, step: "connector_missing", problem: null, leagues: [], pending: null };
    case "espn_signed_out":
      return { ...state, step: "espn_signed_out", problem: null, leagues: [], pending: null };
    case "choose":
      return { ...state, step: "choose", leagues: result.leagues, problem: null };
    case "connected": {
      const linked: EspnConnectLeagueRef = {
        id: result.leagueId ?? "",
        name: result.leagueName ?? `League ${result.leagueId ?? ""}`,
      };
      return {
        ...state,
        step: "connecting",
        progress: "confirming",
        problem: null,
        connected: state.connected.some((l) => l.id === linked.id)
          ? state.connected
          : [...state.connected, linked],
      };
    }
    case "no_leagues":
      return {
        ...state,
        step: "problem",
        leagues: [],
        pending: null,
        problem: problemFor("no_leagues", result.error),
      };
    case "save_failed":
      return {
        ...state,
        step: "problem",
        pending: null,
        problem: problemFor(
          "save_failed",
          result.saveHttpStatus ? `HTTP ${result.saveHttpStatus} ${result.error ?? ""}`.trim() : result.error,
        ),
      };
    case "timeout":
      return { ...state, step: "problem", pending: null, problem: problemFor("timeout", result.error) };
    default:
      return { ...state, step: "problem", pending: null, problem: problemFor("error", result.error) };
  }
}

/**
 * The backend read-back is what actually decides whether the user is connected. A league the
 * connector claimed but the backend cannot see is a failure, even when its siblings succeeded.
 */
export function applyReadBack(
  state: EspnConnectFlowState,
  confirmedIds: readonly string[],
): EspnConnectFlowState {
  const confirmed = new Set(confirmedIds);
  const kept = state.connected.filter((l) => confirmed.has(l.id));
  const lost = state.connected.filter((l) => !confirmed.has(l.id));
  const failed = [...state.failed, ...lost];

  if (kept.length === 0) {
    return {
      ...state,
      step: "problem",
      connected: [],
      failed,
      pending: null,
      problem: problemFor("read_back_missing", null),
    };
  }
  return { ...state, step: "connected", connected: kept, failed, pending: null, problem: null };
}

/** Moving from the league picker into the saves, so the checklist shows the right line. */
export function startSaving(
  state: EspnConnectFlowState,
  picks: readonly EspnConnectLeagueRef[] = [],
): EspnConnectFlowState {
  return {
    ...state,
    step: "connecting",
    progress: "linking",
    problem: null,
    connected: [],
    failed: [],
    pending: picks.length
      ? { index: 0, total: picks.length, name: picks[0]?.name ?? "" }
      : state.pending,
  };
}

/** Advancing to the next league in a multi-league save. */
export function advanceSaving(
  state: EspnConnectFlowState,
  index: number,
  name: string,
  total: number,
): EspnConnectFlowState {
  return { ...state, step: "connecting", progress: "linking", pending: { index, total, name } };
}

/** One league in a batch did not link; the rest of the batch carries on. */
export function recordFailedLeague(
  state: EspnConnectFlowState,
  league: EspnConnectLeagueRef,
): EspnConnectFlowState {
  if (state.failed.some((l) => l.id === league.id)) return state;
  return { ...state, failed: [...state.failed, league] };
}

/** Every league the connector accepted is saved; waiting on the backend to confirm them. */
export function startConfirming(
  state: EspnConnectFlowState,
  linked: readonly EspnConnectLeagueRef[],
): EspnConnectFlowState {
  return {
    ...state,
    step: "connecting",
    progress: "confirming",
    pending: null,
    connected: [...linked],
  };
}

/**
 * Which leagues start ticked in the picker. Connecting everything is the common case, so the
 * default is all of them — trimmed to the slots the account has left rather than letting the user
 * pick a batch the backend would reject halfway through.
 */
export function defaultLeagueSelection(
  leagues: readonly EspnConnectLeagueOption[],
  remainingSlots: number | null,
): string[] {
  const cap = remainingSlots == null ? leagues.length : Math.max(0, remainingSlots);
  return leagues.slice(0, cap).map((league) => league.id);
}

/**
 * What the last connector call told us, carried alongside the funnel event so a step can be read
 * without joining it to anything else. Null means "not observed yet on this run".
 */
export interface ConnectFunnelFacts {
  connectorPresent: boolean | null;
  espnSignedIn: boolean | null;
  saveHttpStatus: number | null;
  leagueFound: boolean | null;
  elapsedMs: number | null;
}

export function emptyConnectFunnelFacts(): ConnectFunnelFacts {
  return {
    connectorPresent: null,
    espnSignedIn: null,
    saveHttpStatus: null,
    leagueFound: null,
    elapsedMs: null,
  };
}

/**
 * Funnel step name for a state. Every state a user can land on gets one, so the drop-off between
 * any two adjacent screens is a subtraction rather than an inference.
 */
export function connectFunnelStep(step: EspnConnectStep): string {
  return `onboarding_${step}`;
}

/**
 * The payload for a step event. Counts come from the state so a funnel row explains itself:
 * how many leagues were offered, how many linked, how many did not.
 */
export function connectFunnelExtra(
  state: EspnConnectFlowState,
  facts: ConnectFunnelFacts,
): Record<string, unknown> {
  return {
    provider: "espn",
    step: state.step,
    problemKind: state.problem?.kind ?? null,
    leagueCount: state.leagues.length,
    connectedCount: state.connected.length,
    failedCount: state.failed.length,
    connectorPresent: facts.connectorPresent,
    espnSignedIn: facts.espnSignedIn,
    saveHttpStatus: facts.saveHttpStatus,
    leagueFound: facts.leagueFound,
    elapsedMs: facts.elapsedMs,
  };
}

/**
 * Auto-advance is what makes the page feel like it just works, but it also saves credentials
 * without a click — so it only runs for someone who has no league yet and can act on the result.
 */
export function shouldAutoConnect(args: {
  step: EspnConnectStep;
  connectedLeagueCount: number | null;
  isDemo: boolean;
  atLimit: boolean;
  alreadyRan: boolean;
}): boolean {
  if (args.alreadyRan) return false;
  if (args.step !== "ready") return false;
  if (args.isDemo || args.atLimit) return false;
  return args.connectedLeagueCount === 0;
}
