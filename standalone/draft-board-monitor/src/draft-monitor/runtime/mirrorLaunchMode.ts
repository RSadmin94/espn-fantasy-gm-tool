/**
 * How the Draft Board Monitor IIFE was launched.
 * Extension Board Mirror must stay headless; bookmarklet/console may show UI.
 */

export type MirrorLaunchMode = "extension-headless" | "standalone-ui";

export function detectMirrorLaunchMode(args: {
  currentScript?: HTMLScriptElement | null;
  scriptSrc?: string | null;
  documentElement?: HTMLElement | null;
}): MirrorLaunchMode {
  const el = args.currentScript ?? null;
  if (el?.getAttribute?.("data-rfsn-ext")) {
    return "extension-headless";
  }

  const datasetMode = args.documentElement?.dataset?.rfsnMirrorMode;
  if (datasetMode === "headless" || datasetMode === "extension") {
    return "extension-headless";
  }

  const src = String(args.scriptSrc || el?.src || "");
  if (src) {
    try {
      const u = new URL(src, "https://example.invalid/");
      if (u.searchParams.get("rfsn_ext") === "1" || u.searchParams.get("mode") === "headless") {
        return "extension-headless";
      }
    } catch {
      /* ignore */
    }
  }

  return "standalone-ui";
}

export function mirrorStartOptions(mode: MirrorLaunchMode): {
  preferPopup: boolean;
  headless: boolean;
  pollMs: number;
} {
  if (mode === "extension-headless") {
    return { preferPopup: false, headless: true, pollMs: 1000 };
  }
  return { preferPopup: true, headless: false, pollMs: 1000 };
}
