// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { RfsnPickClock, type RfsnPickClockProps } from "./RfsnPickClock";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function render(props: RfsnPickClockProps): HTMLDivElement {
  container = document.createElement("div");
  root = createRoot(container);
  flushSync(() => root.render(createElement(RfsnPickClock, props)));
  return container;
}
afterEach(() => flushSync(() => root?.unmount()));

const base: RfsnPickClockProps = {
  state: "running",
  round: 1,
  overallPick: 5,
  totalPicks: 168,
  onClockTeam: "RodZilla",
  onClockOwner: "Rod",
  remainingMs: 9000,
};

describe("RfsnPickClock — states", () => {
  it("running shows a mm:ss countdown and the on-clock team", () => {
    const c = render({ ...base, state: "running", remainingMs: 9000 });
    expect(c.querySelector("[data-clock-state='running']")).toBeTruthy();
    expect(c.textContent).toContain("0:09");
    expect(c.textContent).toContain("RodZilla");
  });
  it("urgent pulses and shows the low countdown", () => {
    const c = render({ ...base, state: "urgent", remainingMs: 2000 });
    const el = c.querySelector("[data-clock-state='urgent']") as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain("animate-pulse");
    expect(c.textContent).toContain("0:02");
  });
  it("paused_for_broadcast announces the pause reason", () => {
    const c = render({ ...base, state: "paused_for_broadcast" });
    expect(c.querySelector("[data-clock-state='paused_for_broadcast']")).toBeTruthy();
    expect(c.textContent).toMatch(/Paused for RFSN Broadcast/i);
  });
  it("manual_team_wait shows Your pick", () => {
    const c = render({ ...base, state: "manual_team_wait" });
    expect(c.textContent).toMatch(/Your pick/i);
  });
  it("complete shows Draft complete and drops the on-clock line", () => {
    const c = render({ ...base, state: "complete" });
    expect(c.textContent).toMatch(/Draft complete/i);
    expect(c.textContent).not.toMatch(/On the clock/i);
  });
  it("renders round + overall pick + total", () => {
    const c = render({ ...base, round: 2, overallPick: 20, totalPicks: 168 });
    const t = c.textContent ?? "";
    expect(t).toContain("2");
    expect(t).toContain("20");
    expect(t).toContain("168");
  });
});

describe("RfsnPickClock — responsive (desktop/mobile)", () => {
  it("reflows on narrow widths and hides the owner on mobile, showing it at sm+", () => {
    const c = render(base);
    const el = c.querySelector("[data-clock-state]") as HTMLElement;
    expect(el.className).toContain("flex-wrap"); // wraps on mobile widths
    const owner = [...c.querySelectorAll("span")].find((s) => s.textContent === "Rod");
    expect(owner?.className).toContain("hidden"); // hidden on mobile
    expect(owner?.className).toContain("sm:inline"); // shown desktop
  });
});
