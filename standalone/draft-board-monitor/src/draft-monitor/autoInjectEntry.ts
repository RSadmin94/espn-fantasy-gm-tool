/**
 * RFSN-031B — Production auto-inject entry for ESPN Live Draft Connector.
 * Starts existing reader without standalone popup board; exposes versioned handshake.
 * Does not relocate espnAdapter parsing. Capture remains dormant until valid ARM.
 */
import { startDraftBoardMonitor } from "./runtime/monitorController";
import {
  ESPN_BM_PROTOCOL_VERSION,
} from "./runtime/espnBookmarkletPublisher";

export const ESPN_LIVE_READER_VERSION = "1.0.0";
export const ESPN_LIVE_READER_KIND = "espn-live-reader";

declare global {
  interface Window {
    __RFSN_ESPN_LIVE_READER__?: {
      kind: typeof ESPN_LIVE_READER_KIND;
      readerVersion: string;
      protocolVersion: number;
      lifecycle: string;
      startedAt: string;
      preferPopup: false;
    };
    DraftBoardMonitor?: {
      start: typeof startDraftBoardMonitor;
      version: string;
    };
    startDraftBoardMonitor?: typeof startDraftBoardMonitor;
  }
}

function installHandshake(lifecycle: string): void {
  try {
    window.__RFSN_ESPN_LIVE_READER__ = {
      kind: ESPN_LIVE_READER_KIND,
      readerVersion: ESPN_LIVE_READER_VERSION,
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      lifecycle,
      startedAt: new Date().toISOString(),
      preferPopup: false,
    };
  } catch {
    /* ignore */
  }
}

const api = {
  start: startDraftBoardMonitor,
  version: ESPN_LIVE_READER_VERSION,
};

try {
  window.DraftBoardMonitor = api;
  window.startDraftBoardMonitor = startDraftBoardMonitor;
} catch {
  /* ignore */
}

// Idempotent: if a compatible production reader already started, do not re-init.
const existing = window.__RFSN_ESPN_LIVE_READER__;
if (
  existing &&
  existing.kind === ESPN_LIVE_READER_KIND &&
  existing.readerVersion === ESPN_LIVE_READER_VERSION &&
  Number(existing.protocolVersion) === ESPN_BM_PROTOCOL_VERSION
) {
  installHandshake(existing.lifecycle || "reader_ready");
} else {
  installHandshake("injecting");
  try {
    console.info("[Rivals Live Draft Connector] Reader bootstrap (dormant until connected)", {
      readerVersion: ESPN_LIVE_READER_VERSION,
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
    });
  } catch {
    /* ignore */
  }
  startDraftBoardMonitor({ preferPopup: false, pollMs: 1000 });
  installHandshake("reader_ready");
}
