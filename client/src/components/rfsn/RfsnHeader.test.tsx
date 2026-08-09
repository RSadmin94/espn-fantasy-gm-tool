// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TYPE_KICKER } from "@/lib/typeScale";
import { RfsnHeader } from "./RfsnHeader";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => flushSync(() => root?.unmount()));

describe("RFSN-051C RfsnHeader readability", () => {
  it("renders round, pick, clock, and on-clock team without sub-11px arbitrary sizes", () => {
    container = document.createElement("div");
    root = createRoot(container);
    flushSync(() =>
      root.render(
        createElement(RfsnHeader, {
          round: 3,
          pickInRound: 4,
          overallPick: "28",
          onClockTeam: "LOZELL STYLES",
          clockSeconds: 75,
        }),
      ),
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/text-\[(?:8|9|10)px\]/);
    expect(html).toContain(TYPE_KICKER.split(" ")[0]);
    expect(container.textContent).toContain("Round");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("28");
    expect(container.textContent).toContain("LOZELL STYLES");
    expect(container.textContent).toContain("1:15");
  });
});
