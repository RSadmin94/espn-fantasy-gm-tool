import type { DraftSource } from "../normalize/draftTypes";

export type DetectedSource = {
  source: DraftSource | null;
  reason: string;
};

export function detectSource(win: Window): DetectedSource {
  const href = String(win.location?.href ?? "");
  const host = String(win.location?.hostname ?? "");

  if (/draftwizard\.fantasypros\.com/i.test(host) || /fantasypros\.com/i.test(host)) {
    return { source: "fantasypros", reason: "fantasypros_host" };
  }
  if (/fantasy\.espn\.com/i.test(host) || /espn\.com/i.test(host)) {
    if (/\/draft/i.test(href) || /draft/i.test(href)) {
      return { source: "espn", reason: "espn_draft_host" };
    }
    return { source: "espn", reason: "espn_host" };
  }

  // Page markers
  try {
    const w = win as Window & { __debugStore?: unknown };
    if (w.__debugStore) {
      return { source: "fantasypros", reason: "debug_store_present" };
    }
  } catch {
    /* ignore */
  }

  if (win.document?.querySelector?.(".draft-columns, [class*='draft-columns']")) {
    return { source: "espn", reason: "draft_columns_dom" };
  }

  return { source: null, reason: "unsupported_page" };
}
