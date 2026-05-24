/**
 * Runs on https://gmwarroom.online/* — performs saveCredentials with Clerk cookies (credentials:include).
 */

const TRPC_SAVE_URL = "https://gmwarroom.online/api/trpc/espn.saveCredentials";
const DASHBOARD_URL = "https://gmwarroom.online/dashboard";

function showBanner(html, variant) {
  const id = "gmwr-extension-banner";
  document.getElementById(id)?.remove();
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:2147483646",
    "padding:12px 16px",
    "font:14px/1.4 system-ui,sans-serif",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    variant === "error"
      ? "background:#3f1519;color:#fecaca;border-bottom:1px solid #7f1d1d"
      : "background:#052e16;color:#bbf7d0;border-bottom:1px solid #166534",
  ].join(";");
  el.innerHTML = html;
  document.documentElement.appendChild(el);
}

function trpcErrorText(json) {
  if (!json || typeof json !== "object") return "";
  if (Array.isArray(json) && json[0]?.error?.json?.message) {
    return String(json[0].error.json.message);
  }
  if (json[0]?.error?.message) return String(json[0].error.message);
  if (json.error?.json?.message) return String(json.error.json.message);
  if (json.error?.message) return String(json.error.message);
  try {
    return JSON.stringify(json).slice(0, 500);
  } catch {
    return "";
  }
}

function buildTrpcInputBody(input) {
  const json = {
    swid: input.swid,
    espnS2: input.espnS2,
  };
  if (input.leagueId && String(input.leagueId).trim()) {
    json.leagueId = String(input.leagueId).trim();
  }
  return JSON.stringify({ json });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GMWR_SAVE_ESPN_CREDS") return false;

  (async () => {
    const { swid, espnS2, leagueId } = message.payload || {};
    const hasSwid = Boolean(swid);
    const hasS2 = Boolean(espnS2);
    console.info("[GMWR] extension save request", {
      swidPresent: hasSwid,
      espnS2Present: hasS2,
      leagueId: leagueId || "(none)",
    });

    if (!hasSwid || !hasS2) {
      showBanner("GM War Room: missing ESPN credentials in extension message.", "error");
      sendResponse({ ok: false });
      return;
    }

    showBanner("GM War Room: saving ESPN connection…", "ok");

    const res = await fetch(TRPC_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildTrpcInputBody({ swid, espnS2, leagueId }),
      credentials: "include",
    });

    const status = res.status;
    let text = "";
    let json = null;
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        json = await res.json();
      } else {
        text = await res.text();
      }
    } catch {
      text = "(could not read response body)";
    }

    console.info("[GMWR] save credentials response", { status, leagueId: leagueId || "(none)" });

    if (!res.ok) {
      const detail = json ? trpcErrorText(json) : text;
      showBanner(
        `GM War Room: save failed — HTTP ${status}${detail ? ` — ${escapeHtml(detail)}` : ""}`,
        "error",
      );
      sendResponse({ ok: false, status });
      return;
    }

    if (json && (json.error || (Array.isArray(json) && json[0]?.error))) {
      const detail = trpcErrorText(json);
      showBanner(`GM War Room: save failed — HTTP ${status}${detail ? ` — ${escapeHtml(detail)}` : ""}`, "error");
      sendResponse({ ok: false, status });
      return;
    }

    showBanner("<strong>Saved to GM War Room</strong> — redirecting…", "ok");
    sendResponse({ ok: true, status });
    setTimeout(() => {
      window.location.assign(DASHBOARD_URL);
    }, 1200);
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    showBanner(`GM War Room: ${escapeHtml(msg)}`, "error");
    sendResponse({ ok: false });
  });

  return true;
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
