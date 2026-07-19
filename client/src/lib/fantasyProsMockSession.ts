/**
 * RFSN-030C — FantasyPros mock session modes and surface gates.
 *
 * Sticky Live Draft toggle ≠ active product surface.
 * FantasyPros simulation is a Mock-surface connector session, not ESPN Live.
 */

export const RFSN_SESSION_MODE = {
  LIVE_CONNECTED_LEAGUE: "LIVE_CONNECTED_LEAGUE",
  IN_APP_SIMULATION: "IN_APP_SIMULATION",
  FANTASYPROS_SIMULATION: "FANTASYPROS_SIMULATION",
} as const;

export type RfsnSessionMode = (typeof RFSN_SESSION_MODE)[keyof typeof RFSN_SESSION_MODE];

export function resolveRfsnSessionMode(args: {
  preferLiveDraft: boolean;
  liveDraftActive: boolean;
  liveDraftSource: string;
  fantasyProsSessionActive: boolean;
}): RfsnSessionMode {
  if (args.fantasyProsSessionActive && !args.preferLiveDraft) {
    return RFSN_SESSION_MODE.FANTASYPROS_SIMULATION;
  }
  if (
    args.preferLiveDraft &&
    args.liveDraftActive &&
    args.liveDraftSource === "connected-league"
  ) {
    return RFSN_SESSION_MODE.LIVE_CONNECTED_LEAGUE;
  }
  return RFSN_SESSION_MODE.IN_APP_SIMULATION;
}

/** Booth / commentary polling for FantasyPros mock — Mock surface only. */
export function isFantasyProsSimulationBroadcastActive(args: {
  fantasyProsSessionActive: boolean;
  preferLiveDraft: boolean;
}): boolean {
  return Boolean(args.fantasyProsSessionActive && !args.preferLiveDraft);
}

export function isFantasyProsConnectorArmed(args: {
  fantasyProsSessionActive: boolean;
  preferLiveDraft: boolean;
}): boolean {
  return isFantasyProsSimulationBroadcastActive(args);
}

/** ESPN connected-league monitor must never run during FantasyPros simulation. */
export function shouldRunEspnConnectedLeagueMonitor(args: {
  liveDraftActive: boolean;
  preferLiveDraft: boolean;
  source: string;
  fantasyProsSessionActive: boolean;
}): boolean {
  if (args.fantasyProsSessionActive) return false;
  return (
    Boolean(args.liveDraftActive && args.preferLiveDraft) &&
    args.source === "connected-league"
  );
}
