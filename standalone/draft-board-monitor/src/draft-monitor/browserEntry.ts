import { startDraftBoardMonitor } from "./runtime/monitorController";

declare global {
  interface Window {
    DraftBoardMonitor?: {
      start: typeof startDraftBoardMonitor;
      version: string;
    };
    startDraftBoardMonitor?: typeof startDraftBoardMonitor;
    /** Idempotent guard for bookmarklet + extension page inject. */
    __RFSN_BOARD_MIRROR_STARTED__?: boolean;
  }
}

const api = {
  start: startDraftBoardMonitor,
  version: "1.0.0-standalone",
};

try {
  window.DraftBoardMonitor = api;
  window.startDraftBoardMonitor = startDraftBoardMonitor;
} catch {
  /* ignore */
}

// Auto-start when injected via bookmarklet / console paste / extension page script.
// Idempotent: extension may inject after a manual bookmarklet run (or twice on SPA nav).
if (!window.__RFSN_BOARD_MIRROR_STARTED__) {
  window.__RFSN_BOARD_MIRROR_STARTED__ = true;
  try {
    document.documentElement.dataset.rfsnBoardMirror = "1";
  } catch {
    /* ignore */
  }
  // Extension inject: prefer in-page panel (popup often blocked from content scripts).
  // Bookmarklet / console-paste still pass preferPopup via query on script URL when needed.
  const fromExtension =
    typeof document !== "undefined" &&
    Boolean(document.currentScript?.getAttribute?.("data-rfsn-ext"));
  startDraftBoardMonitor({
    preferPopup: !fromExtension,
    pollMs: 1000,
  });
}
