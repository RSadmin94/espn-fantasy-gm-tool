import { describe, expect, it } from "vitest";
import {
  detectMirrorLaunchMode,
  mirrorStartOptions,
} from "../src/draft-monitor/runtime/mirrorLaunchMode";

describe("mirrorLaunchMode", () => {
  it("treats data-rfsn-ext as extension headless", () => {
    const el = {
      getAttribute: (n: string) => (n === "data-rfsn-ext" ? "1" : null),
      src: "",
    } as unknown as HTMLScriptElement;
    expect(detectMirrorLaunchMode({ currentScript: el })).toBe("extension-headless");
    expect(mirrorStartOptions("extension-headless")).toEqual({
      preferPopup: false,
      headless: true,
      pollMs: 1000,
    });
  });

  it("treats dataset.rfsnMirrorMode=headless as extension (currentScript null)", () => {
    const docEl = { dataset: { rfsnMirrorMode: "headless" } } as unknown as HTMLElement;
    expect(
      detectMirrorLaunchMode({ currentScript: null, documentElement: docEl }),
    ).toBe("extension-headless");
  });

  it("treats ?mode=headless on script URL as extension", () => {
    expect(
      detectMirrorLaunchMode({
        currentScript: null,
        scriptSrc: "chrome-extension://abc/providers/espn-live/board-mirror.iife.js?mode=headless",
      }),
    ).toBe("extension-headless");
  });

  it("defaults bookmarklet/console to standalone UI", () => {
    expect(detectMirrorLaunchMode({ currentScript: null })).toBe("standalone-ui");
    expect(mirrorStartOptions("standalone-ui")).toEqual({
      preferPopup: true,
      headless: false,
      pollMs: 1000,
    });
  });
});
