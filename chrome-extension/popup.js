/**
 * Popup: ESPN cookies, 2026 league discovery (background), multi-select sync to War Room.
 */

const MSG_DISCOVER_LEAGUES = "GMWR_DISCOVER_LEAGUES_2026";
const MSG_SYNC_SELECTED_LEAGUES = "GMWR_SYNC_SELECTED_LEAGUES";

const ESPN_COOKIE_BASE_URLS = ["https://fantasy.espn.com/", "https://www.espn.com/"];

async function getCookiePresence() {
  let hasSwid = false;
  let hasS2 = false;
  for (const url of ESPN_COOKIE_BASE_URLS) {
    const [swid, s2] = await Promise.all([
      chrome.cookies.get({ url, name: "SWID" }),
      chrome.cookies.get({ url, name: "espn_s2" }),
    ]);
    if (swid?.value) hasSwid = true;
    if (s2?.value) hasS2 = true;
    if (hasSwid && hasS2) break;
  }
  return { hasSwid, hasS2 };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let state = {
  hasSwid: false,
  hasS2: false,
  leagues: /** @type {{ id: string, name: string }[]} */ ([]),
  tabLeagueId: /** @type {string | null} */ (null),
  selectedIds: /** @type {Set<string>} */ (new Set()),
  discoverBusy: false,
  syncBusy: false,
  discoverError: "",
  syncError: "",
};

function selectedArray() {
  return [...state.selectedIds];
}

function displayRows() {
  const rows = /** @type {{ id: string, name?: string, currentTab: boolean }[]} */ ([]);
  if (state.tabLeagueId) {
    rows.push({ id: state.tabLeagueId, currentTab: true });
  }
  for (const L of state.leagues) {
    if (state.tabLeagueId && L.id === state.tabLeagueId) continue;
    rows.push({ id: L.id, name: L.name, currentTab: false });
  }
  return rows;
}

function render(root) {
  const {
    hasSwid,
    hasS2,
    leagues,
    selectedIds,
    discoverBusy,
    syncBusy,
    discoverError,
    syncError,
  } = state;
  const credsOk = hasSwid && hasS2;
  const busy = discoverBusy || syncBusy;
  const rows = displayRows();
  let html = "";

  html += `<p class="meta">ESPN session: SWID ${hasSwid ? "ok" : "missing"} · espn_s2 ${hasS2 ? "ok" : "missing"}</p>`;

  if (!credsOk) {
    html += `<p>Open <strong>fantasy.espn.com</strong> or <strong>espn.com</strong>, sign in, then reopen this popup.</p>`;
    html += `<button type="button" class="secondary" disabled>Refresh leagues</button>`;
    html += `<button type="button" disabled>Sync Selected Leagues</button>`;
  } else {
    html += `<p>2026 leagues from ESPN profile (or your open league tab). Stay signed in at <strong>gmwarroom.online</strong> so sync can use your War Room session.</p>`;
    html += `<button type="button" class="secondary" id="refresh" ${busy ? "disabled" : ""}>Refresh leagues</button>`;

    if (discoverBusy) {
      html += `<p>Loading leagues…</p>`;
    } else if (rows.length === 0) {
      html += `<p>No leagues found. Open your league on ESPN (URL contains leagueId=) or tap Refresh.</p>`;
    } else {
      html += `<div class="league-list" id="list">`;
      for (const row of rows) {
        const checked = selectedIds.has(row.id) ? " checked" : "";
        const label = row.currentTab
          ? `Current ESPN League (ID: ${escapeHtml(row.id)})`
          : `${escapeHtml(row.name || `League ${row.id}`)}<span class="lid"> · ID ${escapeHtml(row.id)}</span>`;
        html += `<div class="league-row">`;
        html += `<input type="checkbox" id="cb-${escapeHtml(row.id)}" data-lid="${escapeHtml(row.id)}"${checked} />`;
        html += `<label for="cb-${escapeHtml(row.id)}">${label}</label>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    const canSync = rows.length > 0 && selectedIds.size > 0 && !busy;
    html += `<button type="button" id="sync" ${canSync ? "" : "disabled"}>Sync Selected Leagues</button>`;
  }

  if (discoverError) {
    html += `<div class="err">${escapeHtml(discoverError)}</div>`;
  }
  if (syncError) {
    html += `<div class="err">${escapeHtml(syncError)}</div>`;
  }

  root.innerHTML = html;

  root.querySelector("#refresh")?.addEventListener("click", onRefreshClick);
  root.querySelector("#sync")?.addEventListener("click", onSyncClick);
}

function onRootChange(ev) {
  const t = ev.target;
  if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
  const id = t.getAttribute("data-lid");
  if (!id) return;
  const next = new Set(state.selectedIds);
  if (t.checked) next.add(id);
  else next.delete(id);
  state = { ...state, selectedIds: next };
  render(document.getElementById("root"));
}

async function runDiscover() {
  const root = document.getElementById("root");
  state = {
    ...state,
    discoverBusy: true,
    discoverError: "",
    syncError: "",
  };
  render(root);
  try {
    const reply = await chrome.runtime.sendMessage({ type: MSG_DISCOVER_LEAGUES });
    const tabId =
      reply?.tabLeagueId != null && String(reply.tabLeagueId).trim() !== ""
        ? String(reply.tabLeagueId).trim()
        : null;

    if (!reply?.ok || !Array.isArray(reply.leagues)) {
      const initial = new Set();
      if (tabId) initial.add(tabId);
      state = {
        ...state,
        discoverBusy: false,
        leagues: [],
        tabLeagueId: tabId,
        selectedIds: initial,
        discoverError: reply?.error || "Could not load leagues.",
      };
    } else {
      const leagues = reply.leagues.map((L) => ({
        id: String(L.id),
        name: String(L.name || `League ${L.id}`),
      }));
      const initial = new Set();
      if (tabId) initial.add(tabId);
      state = {
        ...state,
        discoverBusy: false,
        leagues,
        tabLeagueId: tabId,
        selectedIds: initial,
        discoverError: "",
      };
    }
  } catch (e) {
    state = {
      ...state,
      discoverBusy: false,
      leagues: [],
      tabLeagueId: null,
      selectedIds: new Set(),
      discoverError: e instanceof Error ? e.message : String(e),
    };
  }
  render(root);
}

async function onRefreshClick() {
  await runDiscover();
}

async function onSyncClick() {
  const root = document.getElementById("root");
  const ids = selectedArray();
  state = { ...state, syncBusy: true, syncError: "" };
  render(root);
  try {
    const reply = await chrome.runtime.sendMessage({
      type: MSG_SYNC_SELECTED_LEAGUES,
      leagueIds: ids,
    });
    if (!reply?.ok) {
      const extra =
        reply?.failedLeagueId != null ? ` (league ID ${reply.failedLeagueId})` : "";
      state = {
        ...state,
        syncBusy: false,
        syncError: (reply?.error || "Sync failed.") + extra,
      };
      render(root);
      return;
    }
    state = { ...state, syncBusy: false, syncError: "" };
    window.close();
  } catch (e) {
    state = {
      ...state,
      syncBusy: false,
      syncError: e instanceof Error ? e.message : String(e),
    };
    render(root);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("root");
  root.addEventListener("change", onRootChange);
  const { hasSwid, hasS2 } = await getCookiePresence();
  state = { ...state, hasSwid, hasS2 };
  render(root);
  if (hasSwid && hasS2) {
    await runDiscover();
  }
});
