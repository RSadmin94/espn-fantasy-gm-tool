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

export interface EspnConnectFlowState {
  step: EspnConnectStep;
  leagues: EspnConnectLeagueOption[];
  league: { id: string; name: string } | null;
  problem: EspnConnectProblem | null;
  progress: EspnConnectProgress;
}

export function initialEspnConnectFlowState(): EspnConnectFlowState {
  return { step: "preflight", leagues: [], league: null, problem: null, progress: "searching" };
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
  return { ...state, step: "connecting", progress: "searching", problem: null, leagues: [] };
}

/** A finished connect run. `connected` is provisional until the backend read-back confirms it. */
export function applyConnectResult(
  state: EspnConnectFlowState,
  result: EspnConnectResult,
): EspnConnectFlowState {
  switch (result.stage) {
    case "connector_missing":
      return { ...state, step: "connector_missing", problem: null, leagues: [] };
    case "espn_signed_out":
      return { ...state, step: "espn_signed_out", problem: null, leagues: [] };
    case "choose":
      return { ...state, step: "choose", leagues: result.leagues, problem: null };
    case "connected":
      return {
        ...state,
        step: "connecting",
        progress: "confirming",
        problem: null,
        league: {
          id: result.leagueId ?? "",
          name: result.leagueName ?? `League ${result.leagueId ?? ""}`,
        },
      };
    case "no_leagues":
      return { ...state, step: "problem", leagues: [], problem: problemFor("no_leagues", result.error) };
    case "save_failed":
      return {
        ...state,
        step: "problem",
        problem: problemFor(
          "save_failed",
          result.saveHttpStatus ? `HTTP ${result.saveHttpStatus} ${result.error ?? ""}`.trim() : result.error,
        ),
      };
    case "timeout":
      return { ...state, step: "problem", problem: problemFor("timeout", result.error) };
    default:
      return { ...state, step: "problem", problem: problemFor("error", result.error) };
  }
}

/** The backend read-back is what actually decides whether the user is connected. */
export function applyReadBack(
  state: EspnConnectFlowState,
  found: boolean,
): EspnConnectFlowState {
  if (found) return { ...state, step: "connected", problem: null };
  return { ...state, step: "problem", problem: problemFor("read_back_missing", null) };
}

/** Moving from the league picker into the save, so the checklist shows the right line. */
export function startSaving(state: EspnConnectFlowState): EspnConnectFlowState {
  return { ...state, step: "connecting", progress: "linking", problem: null };
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
