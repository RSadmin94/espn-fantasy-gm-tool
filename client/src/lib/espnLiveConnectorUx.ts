/**
 * RFSN-031B — Customer-facing Live Draft Connector status copy.
 * No internal terms (ARM, inject, nonce, transport, bookmarklet).
 */

export type EspnConnectorMatchPhase =
  | "waiting_for_draft"
  | "draft_found_connecting"
  | "connected"
  | "league_mismatch"
  | "ambiguous_espn_drafts"
  | "update_required"
  | "connection_interrupted"
  | "reconnecting"
  | "connection_restored"
  | "board_reconciled"
  | "auto_inject_disabled";

export type EspnConnectorMatchInput = {
  liveDraftActive: boolean;
  autoInjectEnabled: boolean;
  /** Count of ESPN live_draft_room tabs reporting availability. */
  espnLiveRoomCount: number;
  /** Distinct ESPN league IDs among live rooms. */
  espnLeagueIds: string[];
  rivalsLeagueId: string | null;
  connectorReady: boolean;
  monitoring: boolean;
  lastError: string | null;
  incompatibleReader?: boolean;
  reconnecting?: boolean;
  boardReconciled?: boolean;
};

export function resolveEspnConnectorMatchPhase(
  input: EspnConnectorMatchInput,
): EspnConnectorMatchPhase {
  if (!input.liveDraftActive) return "waiting_for_draft";
  if (input.incompatibleReader) return "update_required";
  if (!input.autoInjectEnabled && input.espnLiveRoomCount === 0 && !input.connectorReady) {
    return "auto_inject_disabled";
  }
  if (input.boardReconciled && input.connectorReady) return "board_reconciled";
  if (input.reconnecting) return "reconnecting";
  if (input.lastError && /league_mismatch|different/i.test(input.lastError)) {
    return "league_mismatch";
  }
  if (input.espnLiveRoomCount > 1) {
    const unique = new Set(input.espnLeagueIds.filter(Boolean));
    if (unique.size > 1) return "ambiguous_espn_drafts";
  }
  const rivals = String(input.rivalsLeagueId ?? "").trim();
  if (rivals && input.espnLeagueIds.length === 1) {
    const espn = String(input.espnLeagueIds[0] ?? "").trim();
    if (espn && espn !== rivals) return "league_mismatch";
  }
  if (input.connectorReady && input.monitoring) return "connected";
  if (input.espnLiveRoomCount >= 1 && !input.connectorReady) {
    return "draft_found_connecting";
  }
  if (input.lastError) return "connection_interrupted";
  return "waiting_for_draft";
}

/** Primary + secondary customer lines. */
export function espnConnectorStatusLines(phase: EspnConnectorMatchPhase): string[] {
  switch (phase) {
    case "waiting_for_draft":
      return ["Waiting for your ESPN draft room", "Open your ESPN live draft to connect"];
    case "draft_found_connecting":
      return ["ESPN Draft Found", "Connecting it to your Rivals league…"];
    case "connected":
      return ["Live Draft Connected", "Rivals is following your ESPN draft"];
    case "league_mismatch":
      return [
        "Different ESPN draft found",
        "This draft belongs to another league.",
        "Open the matching league in Rivals to connect.",
      ];
    case "ambiguous_espn_drafts":
      return [
        "Two ESPN drafts found",
        "Select the draft you want Rivals to follow.",
      ];
    case "update_required":
      return [
        "Live Draft Connector update required",
        "Update the connector before your draft begins.",
      ];
    case "connection_interrupted":
      return ["Connection interrupted", "Rivals will reconnect when the draft is available"];
    case "reconnecting":
      return ["Reconnecting", "Restoring your Live Draft connection…"];
    case "connection_restored":
      return ["Connection restored", "Live Draft Connected"];
    case "board_reconciled":
      return ["Draft board reconciled", "Live Draft Connected"];
    case "auto_inject_disabled":
      return [
        "Waiting for your ESPN draft room",
        "Automatic connect is off — use Advanced Troubleshooting if needed",
      ];
    default:
      return ["Waiting for your ESPN draft room"];
  }
}

export type EspnConnectorDiagnostics = {
  extensionVersion: string | null;
  readerVersion: string | null;
  protocolVersion: number | null;
  detectedEspnUrlType: string | null;
  detectedEspnLeagueId: string | null;
  activeRivalsLeagueId: string | null;
  sessionNonceSuffix: string | null;
  readerLifecycleState: string | null;
  armState: string | null;
  lastHeartbeat: string | null;
  lastBatchRevision: number | null;
  lastSuccessfulPick: string | null;
  lastReplayRequest: string | null;
  lastError: string | null;
  featureFlagState: boolean;
};

export function buildEspnConnectorDiagnostics(partial: Partial<EspnConnectorDiagnostics>): EspnConnectorDiagnostics {
  return {
    extensionVersion: partial.extensionVersion ?? null,
    readerVersion: partial.readerVersion ?? null,
    protocolVersion: partial.protocolVersion ?? null,
    detectedEspnUrlType: partial.detectedEspnUrlType ?? null,
    detectedEspnLeagueId: partial.detectedEspnLeagueId ?? null,
    activeRivalsLeagueId: partial.activeRivalsLeagueId ?? null,
    sessionNonceSuffix: partial.sessionNonceSuffix ?? null,
    readerLifecycleState: partial.readerLifecycleState ?? null,
    armState: partial.armState ?? null,
    lastHeartbeat: partial.lastHeartbeat ?? null,
    lastBatchRevision: partial.lastBatchRevision ?? null,
    lastSuccessfulPick: partial.lastSuccessfulPick ?? null,
    lastReplayRequest: partial.lastReplayRequest ?? null,
    lastError: partial.lastError ?? null,
    featureFlagState: Boolean(partial.featureFlagState),
  };
}

export function maskSessionNonceSuffix(nonce: string | null | undefined): string | null {
  const s = String(nonce ?? "").trim();
  if (!s) return null;
  return s.length <= 6 ? "••••" : `…${s.slice(-6)}`;
}
