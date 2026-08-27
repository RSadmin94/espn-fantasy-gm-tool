/**
 * Wiring guard for the deterministic connect path. A background handler with no page relay (or a
 * relay with no reply type) fails silently in Chrome, so assert both halves stay connected.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (f) => readFileSync(path.join(extDir, f), "utf8");

const background = read("background.js");
const bridge = read("gmwarroom-bridge.js");
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));

/**
 * background.js is a classic service worker script, so it cannot be imported. Lift a single pure
 * function out of the real source instead of copying it, so the test cannot drift from what ships.
 */
function loadPureFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in background.js`);
  let depth = 0;
  let seenBody = false;
  let end = start;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      seenBody = true;
    } else if (ch === "}") {
      depth -= 1;
      if (seenBody && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return new Function(`${source.slice(start, end)}\nreturn ${name};`)();
}

/**
 * Every console.* call in a slice, captured whole. A log object spans several lines, so checking
 * line by line would miss a field sitting on its own line.
 */
function consoleCalls(source) {
  const out = [];
  let i = 0;
  while ((i = source.indexOf("console.", i)) !== -1) {
    let depth = 0;
    let j = source.indexOf("(", i);
    for (; j < source.length; j += 1) {
      if (source[j] === "(") depth += 1;
      else if (source[j] === ")" && --depth === 0) break;
    }
    out.push(source.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

const resolveWarRoomOrigin = loadPureFunction(background, "resolveWarRoomOrigin");
const PROD = "https://www.fantasyfootballrivals.com";
const PROD_APEX = "https://fantasyfootballrivals.com";

describe("GMWR_CONNECT_ESPN bridge", () => {
  it("declares the message type in the background worker", () => {
    expect(background).toMatch(/const MSG_CONNECT_ESPN = "GMWR_CONNECT_ESPN";/);
    expect(background).toMatch(/if \(t === MSG_CONNECT_ESPN\)/);
  });

  it("answers every branch with a stage", () => {
    for (const stage of [
      "espn_signed_out",
      "ready",
      "no_leagues",
      "choose",
      "save_failed",
      "connected",
      "error",
    ]) {
      expect(background).toContain(`stage: "${stage}"`);
    }
  });

  it("reuses the existing cookie read, discovery and saveCredentials helpers", () => {
    const handler = background.slice(background.indexOf("if (t === MSG_CONNECT_ESPN)"));
    expect(handler).toMatch(/getEspnCookieValues\(\)/);
    expect(handler).toMatch(/discoverLeaguesWithEspnCookie\(/);
    expect(handler).toMatch(/postSaveCredentials\(/);
  });

  it("relays the page request and posts a reply back", () => {
    expect(bridge).toMatch(/d\.type !== "GMWR_CONNECT_ESPN"/);
    expect(bridge).toMatch(/type: "GMWR_CONNECT_ESPN_REPLY"/);
  });

  it("ships a bumped extension version", () => {
    expect(manifest.version).toBe("1.14.3");
    expect(pkg.version).toBe(manifest.version);
  });

  it("does not request retired or development hosts in the Store artifact", () => {
    const hosts = JSON.stringify(manifest);
    expect(hosts).not.toMatch(/gmwarroom\.online/);
    expect(hosts).not.toMatch(/localhost/);
    expect(hosts).not.toMatch(/127\.0\.0\.1/);
    expect(hosts).not.toMatch(/\*\.fantasyfootballrivals\.com/);
    expect(manifest.host_permissions).toContain("https://www.fantasyfootballrivals.com/*");
    expect(manifest.host_permissions).toContain("https://fantasyfootballrivals.com/*");
  });
});

describe("resolveWarRoomOrigin", () => {
  it("refuses localhost and loopback in the Store build", () => {
    expect(resolveWarRoomOrigin({ origin: "http://localhost:3000" })).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "http://127.0.0.1:5173" })).toBeNull();
  });

  it("saves back to canonical Production www and apex only", () => {
    expect(resolveWarRoomOrigin({ origin: PROD })).toBe(PROD);
    expect(resolveWarRoomOrigin({ origin: PROD_APEX })).toBe(PROD_APEX);
    expect(resolveWarRoomOrigin({ origin: "https://sprint-8-preview.fantasyfootballrivals.com" })).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "https://preview.gmwarroom.online" })).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "https://gmwarroom.online" })).toBeNull();
  });

  it("refuses an unrecognized origin rather than sending it to production", () => {
    expect(resolveWarRoomOrigin({ origin: "https://evil.example" })).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "https://fantasyfootballrivals.com.evil.example" }))
      .toBeNull();
    expect(resolveWarRoomOrigin({ origin: "https://evil.example/fantasyfootballrivals.com" }))
      .toBeNull();
    expect(resolveWarRoomOrigin({ origin: "http://fantasyfootballrivals.com" })).toBeNull();
  });

  it("refuses when the sender says nothing usable", () => {
    expect(resolveWarRoomOrigin(undefined)).toBeNull();
    expect(resolveWarRoomOrigin({})).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "not a url" })).toBeNull();
    expect(resolveWarRoomOrigin({ origin: "" })).toBeNull();
  });

  it("reads the tab URL when the sender has no origin", () => {
    expect(
      resolveWarRoomOrigin({ tab: { url: "https://www.fantasyfootballrivals.com/connect/espn" } }),
    ).toBe(PROD);
    expect(resolveWarRoomOrigin({ tab: { url: "http://localhost:3000/connect" } })).toBeNull();
  });

  it("cannot be pointed somewhere by the message payload", () => {
    // The message is not a parameter, so a caller naming its own destination changes nothing.
    expect(resolveWarRoomOrigin.length).toBe(1);
    const attacker = { origin: "https://evil.example" };
    expect(resolveWarRoomOrigin(attacker)).toBeNull();
    expect(
      resolveWarRoomOrigin({ ...attacker, warRoomOrigin: PROD, saveUrl: `${PROD}/api` }),
    ).toBeNull();
  });

  it("is wired into the connect handler's cookie read and save", () => {
    const handler = background.slice(background.indexOf("if (t === MSG_CONNECT_ESPN)"));
    expect(handler).toMatch(/resolveWarRoomOrigin\(sender\)/);
    expect(handler).toMatch(/getWarRoomCookieHeaderString\(warRoomOrigin\)/);
    expect(handler).toMatch(/saveUrl,/);
  });
});

describe("connect destination safety", () => {
  const handler = background.slice(
    background.indexOf("if (t === MSG_CONNECT_ESPN)"),
    background.indexOf("MSG_CAPTURE_WEEKLY_STATS", background.indexOf("if (t === MSG_CONNECT_ESPN)")),
  );

  it("refuses an unapproved origin before reading any ESPN cookie", () => {
    const gate = handler.indexOf("if (!warRoomOrigin)");
    const cookieRead = handler.indexOf("getEspnCookieValues()");
    expect(gate).toBeGreaterThan(-1);
    expect(cookieRead).toBeGreaterThan(-1);
    // Ordering is the guarantee: a refused page cannot learn whether ESPN is signed in.
    expect(gate).toBeLessThan(cookieRead);
  });

  it("never falls back to a hardcoded origin when resolution fails", () => {
    expect(handler).not.toMatch(/resolveWarRoomOrigin\(sender,/);
    expect(handler).toMatch(/stage: "error"/);
  });

  it("tells the page which app received the connection", () => {
    const replies = handler.split("sendResponse({").slice(1);
    const anonymous = replies.filter((r) => !r.includes("savedTo: warRoomOrigin"));
    // Only the two replies that never had an approved destination: the refusal, and the crash
    // handler, which runs outside the scope where the origin was resolved.
    expect(anonymous).toHaveLength(2);
    for (const reply of anonymous) expect(reply).toMatch(/stage: "error"/);
  });

  it("keeps the ESPN session out of the connect logs", () => {
    for (const call of consoleCalls(handler)) {
      expect(call).not.toMatch(/swid|espnS2|espn_s2/i);
    }
  });

  it("logs a successful save without the session that authorised it", () => {
    const saveFn = background.slice(
      background.indexOf("async function postSaveCredentials("),
      background.indexOf("chrome.runtime.onMessage.addListener"),
    );
    const calls = consoleCalls(saveFn);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/swid|espnS2|espn_s2/i);
    }
    expect(calls.join("\n")).toContain("savedTo: targetUrl");
  });
});
