import type { MonitorDiagnostics, NormalizedDraftSnapshot } from "../normalize/draftTypes";
import { MONITOR_VERSION } from "../normalize/draftTypes";
import { applySnapshotUpdate } from "../normalize/mergeSnapshot";
import { renderBoard } from "./renderBoard";

export type DraftBoardMonitorOptions = {
  mount: HTMLElement;
  document?: Document;
};

/**
 * Shared board owner — receives normalized snapshots from any adapter.
 */
export class DraftBoardMonitor {
  private mount: HTMLElement;
  private doc: Document;
  private snapshot: NormalizedDraftSnapshot | null = null;
  private duplicatesSuppressedTotal = 0;
  private lastError: string | null = null;
  private lastSuccessfulReadAt: string | null = null;
  private sourcePickCount = 0;

  constructor(opts: DraftBoardMonitorOptions) {
    this.mount = opts.mount;
    this.doc = opts.document ?? opts.mount.ownerDocument;
  }

  getSnapshot(): NormalizedDraftSnapshot | null {
    return this.snapshot;
  }

  applyAdapterResult(args: {
    ok: boolean;
    error?: string;
    snapshot?: NormalizedDraftSnapshot;
    sourcePickCount?: number;
  }): void {
    if (!args.ok || !args.snapshot) {
      this.lastError = args.error || "Source read failed";
      this.paint();
      return;
    }

    this.lastError = null;
    this.lastSuccessfulReadAt = args.snapshot.lastUpdatedAt;
    this.sourcePickCount = args.sourcePickCount ?? args.snapshot.picks.length;

    const { snapshot, duplicatesSuppressed } = applySnapshotUpdate(
      this.snapshot,
      args.snapshot,
    );
    this.duplicatesSuppressedTotal += duplicatesSuppressed;
    this.snapshot = snapshot;
    this.paint();
  }

  reset(): void {
    this.snapshot = null;
    this.duplicatesSuppressedTotal = 0;
    this.lastError = null;
    this.sourcePickCount = 0;
    this.paint();
  }

  private diagnostics(): MonitorDiagnostics {
    const s = this.snapshot;
    return {
      version: MONITOR_VERSION,
      source: s?.source ?? "unknown",
      draftIdOrFingerprint: s?.draftId || s?.draftFingerprint || "—",
      teamCount: s?.teamCount ?? 0,
      sourcePickCount: this.sourcePickCount,
      normalizedPickCount: s?.picks.length ?? 0,
      duplicatesSuppressed: this.duplicatesSuppressedTotal,
      keeperCount: s?.picks.filter((p) => p.isKeeper).length ?? 0,
      tradedPickCount: s?.picks.filter((p) => p.isTradedPick).length ?? 0,
      lastSuccessfulReadAt: this.lastSuccessfulReadAt,
      parseError: this.lastError,
      status: this.lastError ? "ERROR" : s?.status ?? "LOADING",
    };
  }

  paint(): void {
    renderBoard(
      { document: this.doc, mount: this.mount },
      this.snapshot,
      this.diagnostics(),
    );
  }
}
