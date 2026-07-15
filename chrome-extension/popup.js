/**
 * Popup: ESPN cookies, 2026 league discovery (background), multi-select sync to War Room.
 */

const MSG_DISCOVER_LEAGUES = "GMWR_DISCOVER_LEAGUES_2026";
const MSG_SYNC_SELECTED_LEAGUES = "GMWR_SYNC_SELECTED_LEAGUES";
const MSG_IS_ADMIN = "GMWR_IS_ADMIN";
const MSG_HIST_DISCOVER = "GMWR_HIST_DISCOVER";
const MSG_HIST_TEST = "GMWR_HIST_TEST";
const MSG_SYNC_TRENDS = "GMWR_SYNC_TRENDS";
const MSG_HIST_FULL = "GMWR_HIST_FULL";
const MSG_HIST_STATUS = "GMWR_HIST_STATUS";
const MSG_ROSTER_MATRIX_TEST = "GMWR_ROSTER_MATRIX_TEST";
const MSG_ROSTER_2017_POC = "GMWR_ROSTER_2017_POC";
const MSG_ROSTER_FULL = "GMWR_ROSTER_FULL";
const MSG_CAPTURE_WEEKLY_STATS = "GMWR_CAPTURE_WEEKLY_STATS";

const KNOWN_LEAGUES_KEY = "gmwr_known_leagues";

function mergeLeagues(a, b) {
  const seen = new Set();
  const out = [];
  for (const L of [...(a || []), ...(b || [])]) {
    const id = String(L && L.id != null ? L.id : "").trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String((L && L.name) || `League ${id}`).trim() });
  }
  return out;
}

async function loadStoredLeagues() {
  try {
    const obj = await chrome.storage.local.get(KNOWN_LEAGUES_KEY);
    const arr = obj && Array.isArray(obj[KNOWN_LEAGUES_KEY]) ? obj[KNOWN_LEAGUES_KEY] : [];
    return mergeLeagues(arr, []);
  } catch {
    return [];
  }
}

async function saveStoredLeagues(leagues) {
  try {
    await chrome.storage.local.set({ [KNOWN_LEAGUES_KEY]: mergeLeagues(leagues, []) });
  } catch {
    /* ignore */
  }
}

let discoveredSeasons = /** @type {number[]} */ ([]);

function setHistOut(text) {
  const el = document.getElementById("histOut");
  if (el) el.textContent = text;
}

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
    html += `<p>2026 leagues from ESPN profile (or your open league tab). Stay signed in at <strong>fantasyfootballrivals.com</strong> so sync can use your War Room session.</p>`;
    html += `<button type="button" class="secondary" id="refresh" ${busy ? "disabled" : ""}>Refresh leagues</button>`;
    html += `<div style="display:flex;gap:6px;margin:0 0 10px;">`;
    html += `<input id="addLid" type="text" inputmode="numeric" placeholder="Add a league by ID (e.g. 457622)" style="flex:1;padding:6px;border-radius:6px;border:1px solid #444;background:#1e1e1e;color:#eee;box-sizing:border-box;" ${busy ? "disabled" : ""} />`;
    html += `<button type="button" class="secondary" id="addBtn" style="width:auto;margin:0;padding:8px 12px;" ${busy ? "disabled" : ""}>Add</button>`;
    html += `</div>`;

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
        if (!row.currentTab) {
          html += `<button type="button" class="rm" data-rm="${escapeHtml(row.id)}" title="Remove from list" style="width:auto;margin:0;padding:0 7px;background:#3f3f46;border-radius:6px;font-size:12px;line-height:1.6;">&times;</button>`;
        }
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
  root.querySelector("#addBtn")?.addEventListener("click", onAddLeague);
  root.querySelector("#addLid")?.addEventListener("keydown", (e) => { if (e.key === "Enter") onAddLeague(); });
  root.querySelectorAll("button.rm").forEach((b) =>
    b.addEventListener("click", () => onRemoveLeague(b.getAttribute("data-rm"))),
  );
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
  state = { ...state, discoverBusy: true, discoverError: "", syncError: "" };
  render(root);
  try {
    const reply = await chrome.runtime.sendMessage({ type: MSG_DISCOVER_LEAGUES });
    const tabId =
      reply?.tabLeagueId != null && String(reply.tabLeagueId).trim() !== ""
        ? String(reply.tabLeagueId).trim()
        : null;
    const tabL = tabId ? [{ id: tabId, name: `League ${tabId}` }] : [];
    const discovered =
      reply?.ok && Array.isArray(reply.leagues)
        ? reply.leagues.map((L) => ({ id: String(L.id), name: String(L.name || `League ${L.id}`) }))
        : [];
    const merged = mergeLeagues(state.leagues, mergeLeagues(discovered, tabL));
    await saveStoredLeagues(merged);
    const sel = new Set(state.selectedIds);
    if (tabId) sel.add(tabId);
    state = {
      ...state,
      discoverBusy: false,
      leagues: merged,
      tabLeagueId: tabId,
      selectedIds: sel,
      discoverError: reply?.ok ? "" : reply?.error || "",
    };
  } catch (e) {
    state = { ...state, discoverBusy: false, discoverError: e instanceof Error ? e.message : String(e) };
  }
  render(root);
}

async function onAddLeague() {
  const root = document.getElementById("root");
  const input = root.querySelector("#addLid");
  const id = ((input && input.value) || "").replace(/[^0-9]/g, "").trim();
  if (!/^\d+$/.test(id)) {
    state = { ...state, discoverError: "Enter a numeric league ID (the number in your ESPN league URL)." };
    render(root);
    return;
  }
  const merged = mergeLeagues(state.leagues, [{ id, name: `League ${id}` }]);
  await saveStoredLeagues(merged);
  const sel = new Set(state.selectedIds);
  sel.add(id);
  state = { ...state, leagues: merged, selectedIds: sel, discoverError: "" };
  render(root);
}

async function onRemoveLeague(id) {
  const root = document.getElementById("root");
  const next = (state.leagues || []).filter((L) => L.id !== id);
  await saveStoredLeagues(next);
  const sel = new Set(state.selectedIds);
  sel.delete(id);
  state = { ...state, leagues: next, selectedIds: sel };
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
      leagues: ids.map((id) => ({ id, name: (state.leagues.find((L) => L.id === id) || {}).name || "" })),
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
  const stored = await loadStoredLeagues();
  state = { ...state, hasSwid, hasS2, leagues: stored };
  render(root);
  if (hasSwid && hasS2) {
    await runDiscover();
  }

  // Power tools (historical import, roster scrape, weekly stats) are gated to the GM War Room owner account.
  try {
    const adminEl = document.getElementById("adminTools");
    if (adminEl) {
      const who = await chrome.runtime.sendMessage({ type: MSG_IS_ADMIN });
      if (who && who.ok && who.isAdmin) adminEl.hidden = false;
      else adminEl.remove();
    }
  } catch {
    document.getElementById("adminTools")?.remove();
  }

  document.getElementById("histDiscover")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    setHistOut("Discovering seasons from ESPN history…");
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_HIST_DISCOVER, leagueId: lid });
      if (!r?.ok) {
        setHistOut(r?.error || "Discover failed.");
        return;
      }
      discoveredSeasons = Array.isArray(r.seasons) ? r.seasons : [];
      setHistOut(`Found ${discoveredSeasons.length} seasons:\n${discoveredSeasons.join(", ")}`);
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("histStatus")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    setHistOut("Loading DB status…");
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_HIST_STATUS, leagueId: lid });
      if (!r?.ok) {
        setHistOut(r?.error || "Status failed.");
        return;
      }
      const rows = r.data?.seasons || [];
      const lines = rows.map(
        (row) =>
          `${row.season}\tdraft:${row.draftPicks}\tteams:${row.teams}\tmatchups:${row.matchups}\ttx:${row.transactions}\t${(row.errors || []).join(",")}`,
      );
      setHistOut(["leagueId\t" + r.data?.leagueId, "season\tdraft\tteams\tmatchups\ttx\terrors", ...lines].join("\n"));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("histRoster2017Poc")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    setHistOut("Scraping 2017 League Rosters (hidden tab)…");
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_ROSTER_2017_POC, leagueId: lid });
      setHistOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("histRosterMatrix")?.addEventListener("click", async () => {
    setHistOut("Roster endpoint matrix (debug): fetching ESPN with extension cookies…");
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_ROSTER_MATRIX_TEST });
      if (!r?.ok) {
        setHistOut(r?.error || "Roster matrix failed.");
        return;
      }
      setHistOut(JSON.stringify({ ok: true, rows: r.rows }, null, 2));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("histTest")?.addEventListener("click", async () => {
    const lid    = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    const season = new Date().getFullYear();
    setHistOut(`Fetching ${season} player universe from ESPN...`);
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_HIST_TEST, leagueId: lid, season });
      if (!r?.ok) { setHistOut("Error: " + (r?.error || "unknown")); return; }
      setHistOut([
        `Season:   ${r.season}`,
        `Fetched:  ${r.fetched} players from ESPN`,
        `Inserted: ${r.inserted} new players`,
        `Updated:  ${r.updated} existing players`,
        ``,
        r.inserted + r.updated >= 250
          ? "\u2713 Player registry populated."
          : `\u26A0 Only ${r.inserted + r.updated} players \u2014 check ESPN session.`,
      ].join("\n"));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });


  document.getElementById("syncTrends")?.addEventListener("click", async () => {
    const lid    = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    const season = new Date().getFullYear();
    setHistOut(`Syncing ${season} ESPN live draft trends / ADP...`);
    try {
      const r = await chrome.runtime.sendMessage({ type: MSG_SYNC_TRENDS, leagueId: lid, season });
      if (!r?.ok) { setHistOut("Error: " + (r?.error || "unknown")); return; }
      const lines = [
        `Season:        ${r.season}`,
        `Fetched:       ${r.fetched} players from ESPN`,
        `With ADP:      ${r.withAdp}`,
        `No ADP (skip): ${r.skippedNoAdp}`,
        `Inserted:      ${r.inserted}`,
        `Updated:       ${r.updated}`,
        `Errors:        ${r.errors}`,
      ];
      if (r.errors && r.errorSamples?.length) lines.push(``, `First error: ${r.errorSamples[0]}`);
      lines.push(``, r.withAdp >= 100
        ? "\u2713 ADP / draft trends synced."
        : `\u26A0 Only ${r.withAdp} players have ADP \u2014 ESPN may not have ${r.season} draft data yet.`);
      setHistOut(lines.join("\n"));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });


  document.getElementById("histFull")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    if (!discoveredSeasons.length) {
      setHistOut("Run Discover seasons first.");
      return;
    }
    setHistOut(`FULL IMPORT ${discoveredSeasons.length} seasons…`);
    try {
      const r = await chrome.runtime.sendMessage({
        type: MSG_HIST_FULL,
        leagueId: lid,
        seasons: discoveredSeasons,
        force: false,
      });
      setHistOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setHistOut(e instanceof Error ? e.message : String(e));
    }
  });

  // ── Historical Roster Capture ──────────────────────────────────────────────
  function setRosterOut(text) {
    const el = document.getElementById("rosterOut");
    if (el) el.textContent = text;
  }

  document.getElementById("rosterFull")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    setRosterOut("Scraping rosters for 2018–2025…\nThis opens 8 background tabs (~6 min). Do not close the browser.");
    try {
      const r = await chrome.runtime.sendMessage({
        type: MSG_ROSTER_FULL,
        leagueId: lid,
      });
      setRosterOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setRosterOut(e instanceof Error ? e.message : String(e));
    }
  });

  // â”€â”€â”€ Weekly Player Stats Capture â”€â”€â”€
  function setWsOut(text) {
    const el = document.getElementById("wsOut");
    if (el) el.textContent = text;
  }

  // Capture ALL seasons 2018-2025 in one click (each with its correct week range).
  document.getElementById("captureAllSeasons")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    // 2018-2020 ran 16 weeks; 2021+ ran 17. 2025 already captured but re-running is idempotent (upsert).
    const SEASONS = [
      { season: 2018, fromWeek: 1, toWeek: 16 },
      { season: 2019, fromWeek: 1, toWeek: 16 },
      { season: 2020, fromWeek: 1, toWeek: 16 },
      { season: 2021, fromWeek: 1, toWeek: 17 },
      { season: 2022, fromWeek: 1, toWeek: 17 },
      { season: 2023, fromWeek: 1, toWeek: 17 },
      { season: 2024, fromWeek: 1, toWeek: 17 },
      { season: 2025, fromWeek: 1, toWeek: 17 },
    ];
    const summary = [];
    for (let i = 0; i < SEASONS.length; i++) {
      const { season, fromWeek, toWeek } = SEASONS[i];
      setWsOut(
        `[${i + 1}/${SEASONS.length}] Capturing ${season} weeks ${fromWeek}-${toWeek}…\n` +
        `Done so far:\n` + summary.map((s) => `  ${s.season}: ${s.totalStats} stats (${s.ok ? "ok" : "ERR " + s.error})`).join("\n") +
        `\n\nKeep this open. This runs all 8 seasons (~10-15 min total).`
      );
      try {
        const r = await chrome.runtime.sendMessage({
          type: MSG_CAPTURE_WEEKLY_STATS,
          leagueId: lid,
          season,
          fromWeek,
          toWeek,
        });
        summary.push({ season, ok: !!r?.ok, totalStats: r?.totalStats ?? 0, error: r?.error ?? null });
      } catch (e) {
        summary.push({ season, ok: false, totalStats: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const grand = summary.reduce((a, s) => a + (s.totalStats || 0), 0);
    setWsOut("ALL SEASONS COMPLETE\n\n" + JSON.stringify({ grandTotalStats: grand, seasons: summary }, null, 2));
  });
  document.getElementById("captureWeeklyStats")?.addEventListener("click", async () => {
    const lid = (document.getElementById("histLeagueId")?.value || "").trim() || "457622";
    const season = parseInt((document.getElementById("wsSeason")?.value || "2025").trim(), 10) || 2025;
    const fromWeek = parseInt((document.getElementById("wsFromWeek")?.value || "1").trim(), 10) || 1;
    const toWeek = parseInt((document.getElementById("wsToWeek")?.value || "17").trim(), 10) || 17;
    setWsOut(`Capturing ${season} weeks ${fromWeek}-${toWeek}â€¦\nFetching box scores from ESPN and ingesting. Keep this open (~1-2 min).`);
    try {
      const r = await chrome.runtime.sendMessage({
        type: MSG_CAPTURE_WEEKLY_STATS,
        leagueId: lid,
        season,
        fromWeek,
        toWeek,
      });
      setWsOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setWsOut(e instanceof Error ? e.message : String(e));
    }
  });

});
