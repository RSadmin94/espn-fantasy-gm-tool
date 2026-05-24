/**
 * Popup: ESPN cookie presence UI; triggers background-only save (no gmwarroom content script).
 */

const ESPN_HOST = "fantasy.espn.com";
const MSG_OPEN_CONNECT = "GMWR_OPEN_CONNECT_AND_SAVE";

function isEspnFantasyUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === ESPN_HOST;
  } catch {
    return false;
  }
}

async function getCookiePresence() {
  const url = `https://${ESPN_HOST}/`;
  const [swid, s2] = await Promise.all([
    chrome.cookies.get({ url, name: "SWID" }),
    chrome.cookies.get({ url, name: "espn_s2" }),
  ]);
  return { hasSwid: Boolean(swid?.value), hasS2: Boolean(s2?.value) };
}

function render(root, state) {
  const { onEspn, hasSwid, hasS2, busy, error } = state;
  const credsOk = hasSwid && hasS2;
  let html = "";

  if (!onEspn) {
    html += `<p>Open <strong>${ESPN_HOST}</strong> in this window, sign in to ESPN, then open this popup again.</p>`;
    html += `<button type="button" disabled>Connect to War Room</button>`;
  } else if (credsOk) {
    html += `<div class="ok">ESPN Connected</div>`;
    html += `<p>Save ESPN to GM War Room. Stay signed in at <strong>gmwarroom.online</strong> in this browser so the extension can use your War Room session.</p>`;
    html += `<button type="button" id="go" ${busy ? "disabled" : ""}>Connect to War Room</button>`;
  } else {
    html += `<p>ESPN cookies not detected. Sign in at ESPN Fantasy in this browser, then retry.</p>`;
    html += `<p style="font-size:11px;">SWID: ${hasSwid ? "yes" : "no"} · espn_s2: ${hasS2 ? "yes" : "no"}</p>`;
    html += `<button type="button" disabled>Connect to War Room</button>`;
  }

  if (error) {
    html += `<div class="err">${escapeHtml(error)}</div>`;
  }

  root.innerHTML = html;
  const btn = root.querySelector("#go");
  if (btn && !busy) {
    btn.addEventListener("click", onConnectClick);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let state = {
  onEspn: false,
  hasSwid: false,
  hasS2: false,
  busy: false,
  error: "",
};

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onEspn = isEspnFantasyUrl(tab?.url);
  const { hasSwid, hasS2 } = await getCookiePresence();
  state = { ...state, onEspn, hasSwid, hasS2 };
  render(document.getElementById("root"), state);
}

async function onConnectClick() {
  state = { ...state, busy: true, error: "" };
  render(document.getElementById("root"), state);
  try {
    const reply = await chrome.runtime.sendMessage({ type: MSG_OPEN_CONNECT });
    if (!reply?.ok) {
      state = {
        ...state,
        busy: false,
        error: reply?.error || "Connection failed.",
      };
    } else {
      state = { ...state, busy: false, error: "" };
      window.close();
    }
  } catch (e) {
    state = {
      ...state,
      busy: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  render(document.getElementById("root"), state);
}

document.addEventListener("DOMContentLoaded", () => {
  void refresh();
});
