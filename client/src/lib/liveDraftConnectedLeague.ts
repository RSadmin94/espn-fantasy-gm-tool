/**
 * RFSN-013 — Connected League adapter seam for Live Draft.
 * Product UI imports only these neutral names; provider fetch stays in adapter modules.
 */
export {
  useEspnLiveDraftMonitor as useConnectedLeagueLiveMonitor,
  type EspnLiveMonitorStatus as ConnectedLeagueLiveMonitorStatus,
} from "@/hooks/useEspnLiveDraftMonitor";
export { buildEspnLiveDraftId as buildConnectedLeagueDraftId } from "@shared/espnLiveDraftMonitor";
