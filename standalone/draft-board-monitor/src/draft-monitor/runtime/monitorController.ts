import { observeEspn } from "../adapters/espnAdapter";
import { observeFantasyPros } from "../adapters/fantasyProsAdapter";
import { DraftBoardMonitor } from "../board/DraftBoardMonitor";
import { detectSource } from "./detectSource";

export type MonitorControllerOptions = {
  window?: Window;
  pollMs?: number;
  /** Prefer popup display window (same-origin blank). Falls back to in-page panel. */
  preferPopup?: boolean;
};

const DEFAULT_POLL_MS = 1000;

/**
 * Standalone runtime: detect source → full backfill → poll → shared board.
 * No Rivals network calls.
 */
export class MonitorController {
  private win: Window;
  private pollMs: number;
  private preferPopup: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private observer: MutationObserver | null = null;
  private monitor: DraftBoardMonitor | null = null;
  private displayDoc: Document | null = null;
  private displayWin: Window | null = null;
  private stopped = false;

  constructor(opts: MonitorControllerOptions = {}) {
    this.win = opts.window ?? window;
    this.pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    this.preferPopup = opts.preferPopup !== false;
  }

  start(): { ok: boolean; error?: string } {
    this.stopped = false;
    const detected = detectSource(this.win);
    if (!detected.source) {
      return {
        ok: false,
        error: `Unsupported page (${detected.reason}). Open a FantasyPros mock live room or ESPN draft tab.`,
      };
    }

    const mount = this.createMount();
    if (!mount) {
      return { ok: false, error: "Could not create display mount (popup blocked?)" };
    }

    this.monitor = new DraftBoardMonitor({
      mount,
      document: this.displayDoc || this.win.document,
    });

    this.tick();
    this.timer = setInterval(() => this.tick(), this.pollMs);

    // Modest MutationObserver for ESPN DOM — scoped, not full-page thrash
    if (detected.source === "espn" && typeof MutationObserver !== "undefined") {
      const root =
        this.win.document.querySelector(".draft-columns") ||
        this.win.document.body;
      if (root) {
        let scheduled = false;
        this.observer = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          setTimeout(() => {
            scheduled = false;
            this.tick();
          }, 250);
        });
        this.observer.observe(root, { childList: true, subtree: true, characterData: true });
      }
    }

    return { ok: true };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.observer?.disconnect();
    this.observer = null;
  }

  private tick(): void {
    if (this.stopped || !this.monitor) return;
    const detected = detectSource(this.win);
    if (detected.source === "fantasypros") {
      this.monitor.applyAdapterResult(observeFantasyPros(this.win));
      return;
    }
    if (detected.source === "espn") {
      this.monitor.applyAdapterResult(observeEspn(this.win));
      return;
    }
    this.monitor.applyAdapterResult({
      ok: false,
      error: `Source lost (${detected.reason})`,
    });
  }

  private createMount(): HTMLElement | null {
    if (this.preferPopup) {
      try {
        const popup = this.win.open(
          "",
          "rfsn-draft-board-monitor",
          "width=1280,height=800,menubar=no,toolbar=no,location=no,status=no",
        );
        if (popup && popup.document) {
          this.displayWin = popup;
          this.displayDoc = popup.document;
          popup.document.title = "Draft Board Monitor";
          popup.document.body.innerHTML = "";
          popup.document.body.style.margin = "0";
          const mount = popup.document.createElement("div");
          mount.id = "dbm-mount";
          popup.document.body.appendChild(mount);
          popup.addEventListener("beforeunload", () => this.stop());
          return mount;
        }
      } catch {
        /* fall through to in-page */
      }
    }

    // In-page panel (does not modify ESPN draft controls — appends overlay only)
    this.displayDoc = this.win.document;
    let mount = this.win.document.getElementById("dbm-mount");
    if (!mount) {
      mount = this.win.document.createElement("div");
      mount.id = "dbm-mount";
      mount.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;overflow:auto;background:#0f1419;";
      this.win.document.body.appendChild(mount);
    }
    return mount as HTMLElement;
  }
}

/** Entry for bookmarklet / console. */
export function startDraftBoardMonitor(opts?: MonitorControllerOptions): MonitorController {
  const c = new MonitorController(opts);
  const result = c.start();
  if (!result.ok) {
    console.error("[DraftBoardMonitor]", result.error);
    try {
      alert(result.error);
    } catch {
      /* ignore */
    }
  }
  return c;
}
