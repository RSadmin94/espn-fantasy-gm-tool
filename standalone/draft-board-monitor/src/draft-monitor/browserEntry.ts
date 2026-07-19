import { startDraftBoardMonitor } from "./runtime/monitorController";

declare global {
  interface Window {
    DraftBoardMonitor?: {
      start: typeof startDraftBoardMonitor;
      version: string;
    };
    startDraftBoardMonitor?: typeof startDraftBoardMonitor;
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

// Auto-start when injected via bookmarklet / console paste
startDraftBoardMonitor({ preferPopup: true, pollMs: 1000 });
