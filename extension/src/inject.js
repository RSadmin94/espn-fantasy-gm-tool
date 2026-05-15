/**
 * ESPN GM Tool — DNA Advisor Content Script v2.0.0
 *
 * Clean rewrite. Priorities:
 *  1. DNA badges reliably appear on ESPN fantasy pages
 *  2. Slide-out panel shows team DNA profile or League Pulse
 *  3. Live trade history fetched directly from ESPN API
 *
 * Badge strategy:
 *  - Build teamId map from nav links (always present on ESPN fantasy pages)
 *  - Target span[class*="teamName"] broadly (covers all ESPN page layouts)
 *  - Also target team roster page header
 *  - MutationObserver + SPA intercept for React navigation
 */

(function () {
  "use strict";

  // ─── Guard: only run once per page load ──────────────────────────────────────
  if (window.__AF_INJECTED__) return;
  window.__AF_INJECTED__ = true;

  // ─── Constants ───────────────────────────────────────────────────────────────
  const BADGE_ATTR  = "data-af-done";
  const FAB_ID      = "af-fab";
  const VERSION     = "2.0.0";

  const ARCHETYPE_COLORS = {
    AGGRESSIVE_TRADER:     { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.5)",   text: "#f87171" },
    WAIVER_HAWK:           { bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.5)",  text: "#fb923c" },
    DRAFT_AND_HOLD:        { bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.5)",  text: "#60a5fa" },
    ANALYTICS_DRIVEN:      { bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.5)",  text: "#a78bfa" },
    EMOTIONAL_REACTOR:     { bg: "rgba(234,179,8,0.12)",   border: "rgba(234,179,8,0.5)",   text: "#facc15" },
    BALANCED_OPERATOR:     { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.5)",  text: "#34d399" },
    PASSIVE_MANAGER:       { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.5)", text: "#94a3b8" },
    CHAMPIONSHIP_PEDIGREE: { bg: "rgba(234,179,8,0.18)",   border: "rgba(234,179,8,0.7)",   text: "#fde047" },
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  let panelEl    = null;
  let overlayEl  = null;
  let panelStack = [];  // navigation history
  const nameMap  = new Map(); // ESPN team name (lowercase) → teamId

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function col(archetype) {
    return ARCHETYPE_COLORS[archetype] || ARCHETYPE_COLORS.BALANCED_OPERATOR;
  }

  function despColor(score) {
    if (score >= 70) return "#ef4444";
    if (score >= 45) return "#f59e0b";
    if (score >= 25) return "#eab308";
    return "#64748b";
  }

  function leagueId() {
    const u = new URL(location.href);
    return u.searchParams.get("leagueId") || u.searchParams.get("leagueid") ||
      (location.pathname.match(/\/leagues\/([^/]+)/)||[])[1] || null;
  }

  function teamIdFromUrl() {
    const u = new URL(location.href);
    const v = u.searchParams.get("teamId") || u.searchParams.get("teamid");
    return v ? parseInt(v, 10) : null;
  }

  function isRosterPage() {
    return location.pathname.includes("/football/team") && !!teamIdFromUrl();
  }

  // Send message to background service worker
  function bgMsg(type, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, provider: "espn", ...extra }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res?.error) return reject(new Error(res.error));
        resolve(res);
      });
    });
  }

  // ─── ESPN name → teamId map ───────────────────────────────────────────────────
  // Nav links like <a class="NavMain__SubNav__Link" href="...?teamId=3">Team Name (ABBR)Owner</a>
  function buildNameMap() {
    document.querySelectorAll("a[href*='teamId']").forEach(a => {
      const m = (a.getAttribute("href") || "").match(/[?&]teamId=(\d+)/i);
      if (!m) return;
      const tid = parseInt(m[1], 10);
      const raw = (a.textContent || "").split("(")[0].trim();
      if (raw.length > 1) nameMap.set(raw.toLowerCase(), tid);
    });
  }

  // ─── Badge injection ──────────────────────────────────────────────────────────
  function injectBadges() {
    const lid = leagueId();
    if (!lid) return;

    buildNameMap();

    if (isRosterPage()) {
      injectRosterBadge();
    } else {
      injectTeamNameBadges();
    }

    ensureFab(lid);
  }

  function injectTeamNameBadges() {
    // Cast a wide net: span.teamName, span.teamName.truncate, any span with class containing teamName
    const els = document.querySelectorAll(
      "span.teamName, span.teamName.truncate, span[class*='teamName']"
    );

    els.forEach(el => {
      if (el.getAttribute(BADGE_ATTR)) return;
      const rawName = (el.textContent || "").trim();
      if (rawName.length < 2) return;

      // Resolve teamId: name map first, then walk up DOM for href
      let tid = nameMap.get(rawName.toLowerCase()) || null;
      if (!tid) {
        let node = el.parentElement;
        for (let i = 0; i < 8; i++) {
          if (!node) break;
          const href = node.getAttribute?.("href") || "";
          const m = href.match(/[?&]teamId=(\d+)/i);
          if (m) { tid = parseInt(m[1], 10); break; }
          node = node.parentElement;
        }
      }

      el.setAttribute(BADGE_ATTR, "1");

      const btn = document.createElement("button");
      btn.className = "af-badge";
      btn.title = `DNA Advisor — ${rawName}`;
      btn.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 2c0 0 1.5 2 1.5 6S4 14 4 14M12 2c0 0-1.5 2-1.5 6s1.5 6 1.5 6M4 5h8M4 8h8M4 11h8"/></svg>DNA`;
      btn.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); openPanel(tid, rawName); });
      el.parentElement?.insertBefore(btn, el.nextSibling);
    });
  }

  function injectRosterBadge() {
    const tid = teamIdFromUrl();
    const candidates = [".my-team-name", ".teamName", ".teamInfo__name", ".team-name", "h1"];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el || el.getAttribute(BADGE_ATTR)) continue;
      const rawName = (el.textContent || "").trim();
      if (rawName.length < 2) continue;
      el.setAttribute(BADGE_ATTR, "1");
      const btn = document.createElement("button");
      btn.className = "af-badge af-badge-lg";
      btn.title = `Open DNA Profile — ${rawName}`;
      btn.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 2c0 0 1.5 2 1.5 6S4 14 4 14M12 2c0 0-1.5 2-1.5 6s1.5 6 1.5 6M4 5h8M4 8h8M4 11h8"/></svg>DNA Profile`;
      btn.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); openPanel(tid, rawName); });
      el.parentElement?.insertBefore(btn, el.nextSibling);
      break;
    }
  }

  // ─── Floating Action Button ───────────────────────────────────────────────────
  function ensureFab(lid) {
    if (document.getElementById(FAB_ID)) return;
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.className = "af-fab";
    fab.title = "League Pulse — DNA Advisor";
    fab.innerHTML = `<svg viewBox="0 0 20 20" fill="none" width="22" height="22" stroke="currentColor" stroke-width="1.8"><path d="M5 3c0 0 2 3 2 7s-2 7-2 7" stroke-linecap="round"/><path d="M15 3c0 0-2 3-2 7s2 7 2 7" stroke-linecap="round"/><path d="M5 6.5h10M5 10h10M5 13.5h10" stroke-width="1.2" opacity=".7" stroke-linecap="round"/></svg>`;
    fab.addEventListener("click", () => openPanel(null, "League Pulse"));
    document.body.appendChild(fab);
  }

  // ─── Panel ────────────────────────────────────────────────────────────────────
  function openPanel(teamId, label, pushHistory = true) {
    if (!panelEl) {
      overlayEl = document.createElement("div");
      overlayEl.className = "af-overlay";
      overlayEl.addEventListener("click", closePanel);
      document.body.appendChild(overlayEl);

      panelEl = document.createElement("div");
      panelEl.className = "af-panel";
      document.body.appendChild(panelEl);
      panelStack = [];
    } else if (pushHistory) {
      panelStack.push({ teamId: teamId === null ? undefined : teamId, label: panelEl.querySelector(".af-panel-title")?.textContent || label });
    }

    panelEl.innerHTML = loadingHTML(label);
    bindClose();

    if (teamId) {
      fetchTeamBrief(teamId, label);
    } else {
      fetchLeaguePulse();
    }
  }

  function closePanel() {
    panelEl?.remove(); overlayEl?.remove();
    panelEl = null; overlayEl = null; panelStack = [];
  }

  function goBack() {
    if (!panelStack.length) return;
    const prev = panelStack.pop();
    openPanel(prev.teamId ?? null, prev.label, false);
  }

  function bindClose() {
    panelEl?.querySelector(".af-close")?.addEventListener("click", closePanel);
    panelEl?.querySelector(".af-back")?.addEventListener("click", goBack);
  }

  // ─── Data fetching ────────────────────────────────────────────────────────────
  async function fetchTeamBrief(teamId, label) {
    try {
      const res = await bgMsg("TEAM_BRIEF", { teamId });
      if (!panelEl) return;
      panelEl.innerHTML = teamBriefHTML(res.data, res.fromCache);
      bindClose();
      bindPulseCells();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = errorHTML(label, err.message, () => fetchTeamBrief(teamId, label));
      bindClose();
    }
  }

  async function fetchLeaguePulse() {
    try {
      const res = await bgMsg("LEAGUE_PULSE");
      if (!panelEl) return;
      panelEl.innerHTML = leaguePulseHTML(res.data, res.fromCache);
      bindClose();
      bindPulseCells();
      bindTradesBtn();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = errorHTML("League Pulse", err.message, fetchLeaguePulse);
      bindClose();
    }
  }

  async function fetchLiveTrades() {
    const lid = leagueId();
    if (!lid) {
      if (!panelEl) return;
      panelEl.innerHTML = errorHTML("Trade History", "No league ID found in URL. Navigate to your ESPN fantasy league page first.", fetchLiveTrades);
      bindClose();
      return;
    }
    try {
      const season = new Date().getFullYear();
      const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${lid}?view=mTransactions2`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`ESPN API returned ${res.status}`);
      const json = await res.json();
      if (!panelEl) return;
      panelEl.innerHTML = tradesHTML(parseTrades(json));
      bindClose();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = errorHTML("Trade History", err.message, fetchLiveTrades);
      bindClose();
    }
  }

  function parseTrades(json) {
    const txns = json.transactions || [];
    const teams = json.teams || [];

    // Build team name lookup
    const teamNames = new Map();
    for (const t of teams) {
      const name = [t.location, t.nickname].filter(Boolean).join(" ") || t.name || `Team ${t.id}`;
      teamNames.set(t.id, name);
    }

    // Build proposal lookup
    const proposals = new Map();
    for (const tx of txns) {
      if (tx.type === "TRADE_PROPOSAL" || tx.type === "TRADE") {
        proposals.set(tx.id, tx);
      }
    }

    const trades = [];

    // 2026+: TRADE_UPHOLD / TRADE_ACCEPT → linked proposal
    for (const tx of txns) {
      if (tx.type !== "TRADE_UPHOLD" && tx.type !== "TRADE_ACCEPT") continue;
      const proposal = proposals.get(tx.relatedTransactionId);
      if (!proposal) continue;
      trades.push(buildTradeRecord(proposal, tx.processDate || tx.proposedDate, teamNames));
    }

    // Legacy: TRADE + EXECUTED
    for (const tx of txns) {
      if (tx.type === "TRADE" && tx.status === "EXECUTED") {
        trades.push(buildTradeRecord(tx, tx.processDate || tx.proposedDate, teamNames));
      }
    }

    return trades.sort((a, b) => (b.date || 0) - (a.date || 0));
  }

  function buildTradeRecord(proposal, date, teamNames) {
    const sides = new Map();
    for (const item of (proposal.items || [])) {
      const name = item.playerName || (item.playerId ? `Player ${item.playerId}` : null);
      if (!name) continue;
      if (item.fromTeamId != null) {
        if (!sides.has(item.fromTeamId)) sides.set(item.fromTeamId, { sent: [], received: [] });
        sides.get(item.fromTeamId).sent.push(name);
      }
      if (item.toTeamId != null) {
        if (!sides.has(item.toTeamId)) sides.set(item.toTeamId, { sent: [], received: [] });
        sides.get(item.toTeamId).received.push(name);
      }
    }
    const dateLabel = date
      ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Unknown date";
    return { id: proposal.id, date, dateLabel, sides, teamNames };
  }

  function bindPulseCells() {
    panelEl?.querySelectorAll(".af-pulse-cell[data-tid]").forEach(cell => {
      cell.addEventListener("click", () => {
        const tid = cell.dataset.tid;
        const parsedTid = isNaN(Number(tid)) ? tid : parseInt(tid, 10);
        const name = cell.querySelector(".af-pulse-name")?.textContent || "Team";
        openPanel(parsedTid, name);
      });
    });
  }

  function bindTradesBtn() {
    panelEl?.querySelector("#af-trades-btn")?.addEventListener("click", () => {
      panelStack.push({ teamId: undefined, label: "League Pulse" });
      panelEl.innerHTML = loadingHTML("Trade History");
      bindClose();
      fetchLiveTrades();
    });
  }

  // ─── HTML builders ────────────────────────────────────────────────────────────
  function panelHeader(title, subtitle, showBack) {
    return `
      <div class="af-panel-header">
        <div class="af-panel-header-left">
          ${showBack ? `<button class="af-back" title="Back">‹</button>` : ""}
          <div>
            <div class="af-panel-title">${esc(title)}</div>
            ${subtitle ? `<div class="af-panel-sub">${esc(subtitle)}</div>` : ""}
          </div>
        </div>
        <button class="af-close" title="Close">✕</button>
      </div>`;
  }

  function panelFooter() {
    return `<div class="af-panel-footer"><span class="af-footer-brand">ESPN GM Tool</span><span class="af-footer-ver">v${VERSION}</span></div>`;
  }

  function loadingHTML(label) {
    return `
      ${panelHeader(label, "", panelStack.length > 0)}
      <div class="af-panel-body af-center">
        <div class="af-spinner"></div>
        <span class="af-loading-text">Loading…</span>
      </div>
      ${panelFooter()}`;
  }

  function errorHTML(label, msg, retryFn) {
    const el = `
      ${panelHeader(label, "", panelStack.length > 0)}
      <div class="af-panel-body af-center">
        <div class="af-error-icon">⚠</div>
        <div class="af-error-msg">${esc(msg)}</div>
        <button class="af-retry-btn">Retry</button>
      </div>
      ${panelFooter()}`;
    // Store retry fn after render
    setTimeout(() => {
      panelEl?.querySelector(".af-retry-btn")?.addEventListener("click", retryFn);
    }, 0);
    return el;
  }

  function teamBriefHTML(data, fromCache) {
    if (!data) return errorHTML("Team Profile", "No data returned", () => {});
    const dna = data.dna || {};
    const archetype = dna.archetype || "BALANCED_OPERATOR";
    const c = col(archetype);
    const metrics = data.metrics || {};
    const opportunities = data.opportunities || [];
    const rosterHealth = data.rosterHealth || {};
    const isComplete = !!data.isSeasonComplete;
    const season = data.season || "";

    return `
      ${panelHeader(data.teamName || "Team Profile", `${data.ownerName || ""}${season ? " · " + season : ""}`, true)}
      <div class="af-panel-body">
        ${fromCache ? `<div class="af-cache-notice">Cached</div>` : ""}

        <div class="af-metrics-row">
          ${metrics.rank != null ? `<div class="af-metric"><div class="af-metric-val">#${metrics.rank}</div><div class="af-metric-lbl">${isComplete ? season + " Rank" : "Rank"}</div></div>` : ""}
          ${metrics.pointsFor != null ? `<div class="af-metric"><div class="af-metric-val">${metrics.pointsFor}</div><div class="af-metric-lbl">Points For</div></div>` : ""}
          ${metrics.wins != null ? `<div class="af-metric"><div class="af-metric-val">${metrics.wins}-${metrics.losses ?? 0}</div><div class="af-metric-lbl">Record</div></div>` : ""}
        </div>

        <div class="af-archetype-block" style="background:${c.bg};border-color:${c.border}">
          <div class="af-archetype-lbl">DNA Archetype</div>
          <div class="af-archetype-name" style="color:${c.text}">${esc(dna.archetypeLabel || archetype.replace(/_/g, " "))}</div>
          ${dna.archetypeReason ? `<div class="af-archetype-reason">${esc(dna.archetypeReason)}</div>` : ""}
        </div>

        ${opportunities.length > 0 ? `
        <div class="af-section">
          <div class="af-section-title">Opportunities</div>
          ${opportunities.slice(0, 4).map(op => `
            <div class="af-opp af-urgency-${(op.urgency || "monitor").toLowerCase()}">
              <div class="af-opp-type">${esc(op.type || "")}</div>
              <div class="af-opp-desc">${esc(op.description || "")}</div>
            </div>`).join("")}
        </div>` : ""}

        ${(rosterHealth.injuredCount > 0 || rosterHealth.byeCount > 0) ? `
        <div class="af-section">
          <div class="af-section-title">Roster Health</div>
          <div class="af-health-row">
            ${rosterHealth.injuredCount > 0 ? `<span class="af-chip af-chip-red">🤕 ${rosterHealth.injuredCount} injured</span>` : ""}
            ${rosterHealth.byeCount > 0 ? `<span class="af-chip af-chip-amber">📅 ${rosterHealth.byeCount} on bye</span>` : ""}
          </div>
        </div>` : ""}

        ${data.briefing ? `
        <div class="af-section">
          <div class="af-section-title">GM Briefing</div>
          <div class="af-briefing">${esc(data.briefing)}</div>
        </div>` : ""}
      </div>
      ${panelFooter()}`;
  }

  function leaguePulseHTML(data, fromCache) {
    if (!data || !data.teams) return errorHTML("League Pulse", "No league data", fetchLeaguePulse);
    const isComplete = !!data.isSeasonComplete;
    const season = data.season || new Date().getFullYear() - 1;
    const teams = isComplete
      ? [...data.teams].sort((a, b) => (a.standingRank || 99) - (b.standingRank || 99))
      : [...data.teams].sort((a, b) => (b.desperationScore || 0) - (a.desperationScore || 0));
    const subtitle = isComplete
      ? `${season} Final Standings · ${teams.length} teams`
      : `${teams.length} teams · Week ${data.currentWeek || "?"}`;
    const TIER = { "CHAMPION": "#fde047", "CONTENDER": "#34d399", "PLAYOFF TEAM": "#60a5fa", "BUBBLE": "#f59e0b", "REBUILDING": "#94a3b8" };

    return `
      ${panelHeader(isComplete ? `${season} Final Standings` : "League Pulse", subtitle, false)}
      <div class="af-panel-body">
        ${fromCache ? `<div class="af-cache-notice">Cached</div>` : ""}
        <div class="af-pulse-grid">
          ${teams.map(t => {
            const label = isComplete ? (t.desperationLabel || "") : String(t.desperationScore ?? "—");
            const labelColor = isComplete ? (TIER[t.desperationLabel] || "#94a3b8") : despColor(t.desperationScore || 0);
            const c = col(t.dna?.archetype || "BALANCED_OPERATOR");
            return `
              <div class="af-pulse-cell" data-tid="${esc(String(t.teamId || ""))}">
                ${isComplete ? `<div class="af-pulse-rank">#${t.standingRank || "?"}</div>` : ""}
                <div class="af-pulse-name">${esc(t.ownerName || t.teamName || "Team")}</div>
                <div class="af-pulse-arch" style="color:${c.text}">${esc((t.dna?.archetype || "").replace(/_/g, " "))}</div>
                <div class="af-pulse-desp" style="color:${labelColor}">${esc(label)}</div>
              </div>`;
          }).join("")}
        </div>
        <p class="af-pulse-hint">${isComplete ? "Click any team for their offseason profile" : "Click any team for their full DNA profile"}</p>
        <div class="af-trades-row">
          <button id="af-trades-btn" class="af-trades-btn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            View Live Trades
          </button>
        </div>
      </div>
      ${panelFooter()}`;
  }

  function tradesHTML(trades) {
    const header = panelHeader("Trade History", `${trades.length} trade${trades.length !== 1 ? "s" : ""} · Live from ESPN`, true);
    if (trades.length === 0) {
      return `${header}<div class="af-panel-body af-center"><div class="af-error-icon">↔</div><div class="af-error-msg">No accepted trades found for this season.</div></div>${panelFooter()}`;
    }
    const rows = trades.map(t => {
      const tids = Array.from(t.sides.keys());
      const sidesHtml = tids.map(tid => {
        const s = t.sides.get(tid);
        const name = t.teamNames.get(tid) || `Team ${tid}`;
        return `
          <div class="af-trade-side">
            <div class="af-trade-team">${esc(name)}</div>
            <div class="af-trade-got">Got: ${esc((s.received || []).join(", ") || "—")}</div>
            <div class="af-trade-gave">Gave: ${esc((s.sent || []).join(", ") || "—")}</div>
          </div>`;
      }).join(`<div class="af-trade-arrow">⇄</div>`);
      return `
        <div class="af-trade-card">
          <div class="af-trade-date">${esc(t.dateLabel)}</div>
          <div class="af-trade-sides">${sidesHtml}</div>
        </div>`;
    }).join("");
    return `${header}<div class="af-panel-body">${rows}</div>${panelFooter()}`;
  }

  // ─── SPA navigation handling ──────────────────────────────────────────────────
  let lastUrl = location.href;
  let debounceTimer = null;

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    closePanel();
    document.getElementById(FAB_ID)?.remove();
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(el => el.removeAttribute(BADGE_ATTR));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(injectBadges, 800);
  }

  const _push = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a);    onUrlChange(); };
  history.replaceState = (...a) => { _replace(...a); onUrlChange(); };
  window.addEventListener("popstate", onUrlChange);

  // MutationObserver — debounced badge injection on DOM changes
  let mutTimer = null;
  new MutationObserver(() => {
    clearTimeout(mutTimer);
    mutTimer = setTimeout(injectBadges, 500);
  }).observe(document.body, { childList: true, subtree: true });

  // ─── Init ─────────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(injectBadges, 600));
  } else {
    setTimeout(injectBadges, 600);
  }
  // Extra retry for slow ESPN React renders
  setTimeout(injectBadges, 1800);
  setTimeout(injectBadges, 3500);

  console.log(`[ESPN GM Tool v${VERSION}] Loaded | ${location.pathname}`);

})();
