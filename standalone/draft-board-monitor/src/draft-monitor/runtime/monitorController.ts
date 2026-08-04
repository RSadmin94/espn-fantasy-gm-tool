import { observeEspn } from "../adapters/espnAdapter";
import { observeFantasyPros } from "../adapters/fantasyProsAdapter";
import { DraftBoardMonitor } from "../board/DraftBoardMonitor";
import { detectSource } from "./detectSource";
import { EspnBookmarkletPublisher } from "./espnBookmarkletPublisher";

export type MonitorControllerOptions = {
  window?: Window;
  pollMs?: number;
  /** Prefer popup display window (same-origin blank). Falls back to in-page panel or headless. */
  preferPopup?: boolean;
  /**
   * Extension inject: scrape + publish only — never paint a board over the ESPN draft UI.
   * War Room / bookmarklet popup remains the visible board.
   */
  headless?: boolean;
  /**
   * Optional ESPN → Rivals publisher (Phase 1: page-local postMessage only).
   * When omitted, a default publisher is created for ESPN pages.
   */
  espnPublisher?: EspnBookmarkletPublisher | null;
};

const DEFAULT_POLL_MS = 1000;

/**
 * Standalone runtime: detect source → full backfill → poll → shared board.
 * ESPN publisher emits page-local postMessage only (no Rivals network in Phase 1).
 * Mirror paint/renderBoard path is unchanged.
 */
export class MonitorController {
  private win: Window;
  private pollMs: number;
  private preferPopup: boolean;
  private headless: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private observer: MutationObserver | null = null;
  private monitor: DraftBoardMonitor | null = null;
  private displayDoc: Document | null = null;
  private displayWin: Window | null = null;
  private stopped = false;
  private espnPublisher: EspnBookmarkletPublisher | null;

  constructor(opts: MonitorControllerOptions = {}) {
    this.win = opts.window ?? window;
    this.pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    this.preferPopup = opts.preferPopup !== false;
    this.headless = Boolean(opts.headless);
    this.espnPublisher =
      opts.espnPublisher === null
        ? null
        : opts.espnPublisher ??
          new EspnBookmarkletPublisher({ window: this.win });
  }

  /** Phase 1/2 — expose publisher for ARM tests and extension handshake. */
  getEspnPublisher(): EspnBookmarkletPublisher | null {
    return this.espnPublisher;
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

    if (detected.source === "espn") {
      this.espnPublisher?.attachInboundListener();
    }

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
    this.espnPublisher?.detachInboundListener();
    this.espnPublisher?.disarm();
  }

  private tick(): void {
    if (this.stopped || !this.monitor) return;
    const detected = detectSource(this.win);
    if (detected.source === "fantasypros") {
      this.monitor.applyAdapterResult(observeFantasyPros(this.win));
      return;
    }
    if (detected.source === "espn") {
      // Mirror first (unchanged), then optional publish delta beside tick.
      this.monitor.applyAdapterResult(observeEspn(this.win));
      this.espnPublisher?.onSnapshot(this.monitor.getSnapshot());
      return;
    }
    this.monitor.applyAdapterResult({
      ok: false,
      error: `Source lost (${detected.reason})`,
    });
  }

  private createMount(): HTMLElement | null {
    // Extension path: never cover ESPN. Publisher still needs a mount for snapshot state.
    if (this.headless) {
      return this.createHeadlessMount();
    }

    if (this.preferPopup) {
      try {
        const popup = this.win.open(
          "",
          "rfsn-draft-board-monitor",
          "width=1720,height=920,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes",
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
        /* fall through to floating panel */
      }
    }

    // Floating panel fallback — must NOT cover the host draft UI (no inset:0 takeover).
    this.displayDoc = this.win.document;
    let mount = this.win.document.getElementById("dbm-mount");
    if (!mount) {
      mount = this.win.document.createElement("div");
      mount.id = "dbm-mount";
      mount.setAttribute("data-rfsn-dbm", "floating");
      mount.style.cssText =
        "position:fixed;right:12px;top:12px;width:min(920px,46vw);height:min(78vh,880px);" +
        "z-index:2147483646;overflow:auto;background:#0f1419;border:2px solid #3d8bfd;" +
        "border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.55);resize:both;";
      this.win.document.body.appendChild(mount);
    }
    return mount as HTMLElement;
  }

  private createHeadlessMount(): HTMLElement {
    this.displayDoc = this.win.document;
    let mount = this.win.document.getElementById("dbm-mount");
    if (!mount) {
      mount = this.win.document.createElement("div");
      mount.id = "dbm-mount";
      (this.win.document.documentElement || this.win.document.body).appendChild(
        mount,
      );
    }
    // Always force headless styles — clears a prior full-page overlay from older builds.
    mount.setAttribute("data-rfsn-dbm", "headless");
    mount.setAttribute("aria-hidden", "true");
    mount.style.cssText =
      "display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";
    mount.innerHTML = "";
    return mount as HTMLElement;
  }
}

/** Entry for bookmarklet / console. */
export function startDraftBoardMonitor(opts?: MonitorControllerOptions): MonitorController {
  const c = new MonitorController(opts);
  const result = c.start();
  if (!result.ok) {
    console.error("[DraftBoardMonitor]", result.error);
    // Never alert on extension headless path — ESPN league pages stay undisturbed.
    if (!opts?.headless) {
      try {
        alert(result.error);
      } catch {
        /* ignore */
      }
    }
  }
  return c;
}
