import { startDraftBoardMonitor } from "./runtime/monitorController";
import {
  detectMirrorLaunchMode,
  mirrorStartOptions,
} from "./runtime/mirrorLaunchMode";

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

  // Bookmarklet / console: standalone UI (popup, then floating panel).
  // Extension inject: headless scrape+publish only — never replace the ESPN page.
  const mode = detectMirrorLaunchMode({
    currentScript: typeof document !== "undefined" ? document.currentScript : null,
    scriptSrc:
      typeof document !== "undefined" && document.currentScript instanceof HTMLScriptElement
        ? document.currentScript.src
        : null,
    documentElement:
      typeof document !== "undefined" ? document.documentElement : null,
  });
  const opts = mirrorStartOptions(mode);
  startDraftBoardMonitor(opts);
}
