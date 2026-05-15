/**
 * ESPN GM Tool — Fantasy DNA Advisor Content Script v1.4.0
 *
 * ESPN-first release. Sleeper/Yahoo stubs retained for future expansion.
 *
 * ESPN DOM Strategy (based on live DOM audit):
 *  - Team roster page (/football/team?teamId=X):
 *      • teamId extracted from URL → inject DNA badge in page header
 *  - Standings / Scoreboard / League pages:
 *      • Build a name→teamId map from NavMain__SubNav__Link anchors (these
 *        always have ?teamId=N in href and are present on every page)
 *      • Find span.teamName.truncate elements in the page body
 *      • Inject DNA badge next to each, using the name map to resolve teamId
 *  - Floating "League Pulse" FAB always present on any ESPN fantasy page
 *
 * SPA handling: MutationObserver + pushState/replaceState intercept
 */

(function () {
  "use strict";

  // ─── Constants ──────────────────────────────────────────────────────────────
  const BADGE_ATTR = "data-af-injected";
  const BADGE_CLASS = "af-dna-badge";
  const FAB_ID = "af-league-pulse-fab";

  // ─── Provider detection ───────────────────────────────────────────────────────
  function detectProvider() {
    const host = window.location.hostname;
    if (host.includes("espn.com")) return "espn";
    if (host.includes("sleeper.com") || host.includes("sleeper.app")) return "sleeper";
    if (host.includes("fantasysports.yahoo.com")) return "yahoo";
    return "unknown";
  }

  const PROVIDER = detectProvider();

  // DNA archetype colors
  const ARCHETYPE_COLORS = {
    AGGRESSIVE_TRADER:    { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.5)",   text: "#f87171" },
    WAIVER_HAWK:          { bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.5)",  text: "#fb923c" },
    DRAFT_AND_HOLD:       { bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.5)",  text: "#60a5fa" },
    ANALYTICS_DRIVEN:     { bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.5)",  text: "#a78bfa" },
    EMOTIONAL_REACTOR:    { bg: "rgba(234,179,8,0.12)",   border: "rgba(234,179,8,0.5)",   text: "#facc15" },
    BALANCED_OPERATOR:    { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.5)",  text: "#34d399" },
    PASSIVE_MANAGER:      { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.5)", text: "#94a3b8" },
    CHAMPIONSHIP_PEDIGREE:{ bg: "rgba(234,179,8,0.18)",   border: "rgba(234,179,8,0.7)",   text: "#fde047" },
  };

  const PROVIDER_LABELS = {
    espn:    { name: "ESPN Fantasy", color: "#ef4444" },
    sleeper: { name: "Sleeper",      color: "#7c3aed" },
    yahoo:   { name: "Yahoo Fantasy",color: "#7c00d4" },
    unknown: { name: "Fantasy",      color: "#64748b" },
  };

  // ─── State ───────────────────────────────────────────────────────────────────
  let panelEl = null;
  let overlayEl = null;
  let currentTeamId = null;
  let leaguePulseData = null;
  // Navigation history stack: each entry is { type: 'pulse'|'team', teamId?, teamLabel? }
  let panelHistory = [];

  // ESPN-specific: name → teamId map built from nav links
  const espnNameToTeamId = new Map();

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function msg(type, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, provider: PROVIDER, ...extra }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res?.error) return reject(new Error(res.error));
        resolve(res);
      });
    });
  }

  function getTeamIdFromUrl() {
    const url = new URL(window.location.href);
    const espnId = url.searchParams.get("teamId") || url.searchParams.get("teamid");
    if (espnId) return parseInt(espnId, 10) || null;
    const sleeperMatch = url.pathname.match(/\/leagues\/[^/]+\/team\/([^/]+)/);
    if (sleeperMatch) return sleeperMatch[1];
    const yahooMatch = url.pathname.match(/\/f1\/\d+\/(\d+)/);
    if (yahooMatch) return parseInt(yahooMatch[1], 10) || null;
    return null;
  }

  function getLeagueIdFromUrl() {
    const url = new URL(window.location.href);
    const espnId = url.searchParams.get("leagueId") || url.searchParams.get("leagueid");
    if (espnId) return espnId;
    const sleeperMatch = url.pathname.match(/\/leagues\/([^/]+)/);
    if (sleeperMatch) return sleeperMatch[1];
    const yahooMatch = url.pathname.match(/\/f1\/(\d+)/);
    if (yahooMatch) return yahooMatch[1];
    return null;
  }

  function isOnTeamRosterPage() {
    const path = window.location.pathname;
    return path.includes("/football/team") && !!getTeamIdFromUrl();
  }

  function desperationColor(score) {
    if (score >= 70) return "#ef4444";
    if (score >= 45) return "#f59e0b";
    if (score >= 25) return "#eab308";
    return "#64748b";
  }

  function archetypeColor(archetype) {
    return ARCHETYPE_COLORS[archetype] || ARCHETYPE_COLORS.BALANCED_OPERATOR;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function providerBadge() {
    const info = PROVIDER_LABELS[PROVIDER] || PROVIDER_LABELS.unknown;
    return `<span class="af-provider-badge" style="background:${info.color}22;color:${info.color};border-color:${info.color}44">${info.name}</span>`;
  }

  // ─── ESPN: Build name→teamId map from nav links ───────────────────────────────
  // The NavMain__SubNav__Link anchors always have ?teamId=N in their href.
  // We build a normalised name map so we can resolve teamId from span.teamName text.
  function buildEspnNameMap() {
    document.querySelectorAll("a.NavMain__SubNav__Link[href*='teamId']").forEach(a => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/[?&]teamId=(\d+)/i);
      if (!m) return;
      const teamId = parseInt(m[1], 10);
      // The link text is "TEAM NAME (ABBR)OWNER NAME" — take the part before "("
      const rawText = a.textContent || "";
      const name = rawText.split("(")[0].trim();
      if (name) espnNameToTeamId.set(name.toLowerCase(), teamId);
    });
  }

  // ─── Badge injection ─────────────────────────────────────────────────────────
  function injectBadges() {
    const leagueId = getLeagueIdFromUrl();
    if (!leagueId) return;

    if (PROVIDER === "espn") {
      injectEspnBadges(leagueId);
    }
    // Sleeper / Yahoo stubs — no-op for now
    ensureFab(leagueId);
  }

  function injectEspnBadges(leagueId) {
    // Refresh the name→teamId map (nav may have loaded after last call)
    buildEspnNameMap();

    // ── Strategy 1: Team roster page — inject header badge ──────────────────
    if (isOnTeamRosterPage()) {
      const teamId = getTeamIdFromUrl();
      injectEspnRosterPageBadge(teamId);
      return;
    }

    // ── Strategy 2: Standings / Scoreboard / League pages ───────────────────
    // Target: span.teamName.truncate (confirmed in live DOM audit)
    // Also target: a.team--link > span.teamName (same element, different parent)
    const teamNameEls = document.querySelectorAll("span.teamName.truncate, span.teamName");
    teamNameEls.forEach(el => {
      if (el.getAttribute(BADGE_ATTR)) return;
      const rawName = el.textContent?.trim() || "";
      if (rawName.length < 2) return;

      // Resolve teamId: try name map first, then walk up for href
      let teamId = espnNameToTeamId.get(rawName.toLowerCase()) || null;
      if (!teamId) {
        // Walk up to find an anchor with teamId in href
        let node = el.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!node) break;
          const href = node.getAttribute?.("href") || "";
          const m = href.match(/[?&]teamId=(\d+)/i);
          if (m) { teamId = parseInt(m[1], 10); break; }
          node = node.parentElement;
        }
      }

      el.setAttribute(BADGE_ATTR, "1");

      const badge = document.createElement("button");
      badge.className = BADGE_CLASS;
      badge.setAttribute("title", `DNA Advisor — ${rawName}`);
      badge.setAttribute("aria-label", "DNA Advisor");
      badge.innerHTML = dnaSvg() + "DNA";

      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openPanel(teamId, rawName);
      });

      // Insert after the span (not inside it, to avoid layout issues)
      el.parentElement?.insertBefore(badge, el.nextSibling);
    });
  }

  function injectEspnRosterPageBadge(teamId) {
    // Find the team name heading on the roster page
    // ESPN uses .my-team-name or the page <h1> or a prominent team name element
    const candidates = [
      ".my-team-name",
      ".teamName.truncate",
      ".teamInfo__name",
      ".team-name",
      "h1",
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el || el.getAttribute(BADGE_ATTR)) continue;
      const rawName = el.textContent?.trim() || "My Team";
      if (rawName.length < 2) continue;

      el.setAttribute(BADGE_ATTR, "1");

      const badge = document.createElement("button");
      badge.className = `${BADGE_CLASS} af-badge-primary`;
      badge.setAttribute("title", `Open DNA Advisor — ${rawName}`);
      badge.setAttribute("aria-label", "DNA Advisor");
      badge.innerHTML = dnaSvg() + "DNA Profile";

      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openPanel(teamId, rawName);
      });

      el.parentElement?.insertBefore(badge, el.nextSibling);
      break;
    }
  }

  // ─── Floating Action Button (League Pulse) ────────────────────────────────────
  function ensureFab(leagueId) {
    if (document.getElementById(FAB_ID)) return;

    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.className = "af-fab";
    fab.setAttribute("title", "Open League Pulse — DNA Advisor");
    fab.setAttribute("aria-label", "League Pulse");
    fab.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <path d="M5 3C5 3 7 6 7 10C7 14 5 17 5 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M15 3C15 3 13 6 13 10C13 14 15 17 15 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M5 6.5H15M5 10H15M5 13.5H15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
      </svg>
      <span>Pulse</span>
    `;

    fab.addEventListener("click", () => {
      openPanel(null, "League Pulse");
    });

    document.body.appendChild(fab);
  }

  function dnaSvg() {
    return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12" style="margin-right:3px;vertical-align:-1px"><path d="M4 2C4 2 6 4 6 8C6 12 4 14 4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 2C12 2 10 4 10 8C10 12 12 14 12 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 5H12M4 8H12M4 11H12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.6"/></svg>`;
  }

  // ─── Panel open / close ───────────────────────────────────────────────────────
    function openPanel(teamId, teamLabel, pushHistory = true) {
    if (!panelEl) {
      // First open — create the overlay and panel elements
      overlayEl = document.createElement("div");
      overlayEl.className = "af-overlay";
      overlayEl.addEventListener("click", closePanel);
      document.body.appendChild(overlayEl);
      panelEl = document.createElement("div");
      panelEl.className = "af-panel";
      panelEl.id = "af-dna-panel";
      document.body.appendChild(panelEl);
      panelHistory = [];
    } else if (pushHistory) {
      // Navigating to a new view — push current view onto history stack
      panelHistory.push(
        currentTeamId
          ? { type: 'team', teamId: currentTeamId, teamLabel: panelEl.querySelector('.af-panel-title')?.textContent || '' }
          : { type: 'pulse', teamLabel: panelEl.querySelector('.af-panel-title')?.textContent || 'League Pulse' }
      );
    }
    panelEl.innerHTML = buildLoadingHTML(teamLabel);
    currentTeamId = teamId;
    if (teamId) {
      loadTeamBrief(teamId, teamLabel);
    } else {
      loadLeaguePulse(teamLabel);
    }
  }
  function goBack() {
    if (!panelHistory.length) return;
    const prev = panelHistory.pop();
    if (prev.type === 'team') {
      openPanel(prev.teamId, prev.teamLabel, false);
    } else {
      openPanel(null, prev.teamLabel, false);
    }
  }

  function closePanel() {
    panelEl?.remove();
    overlayEl?.remove();
    panelEl = null;
    overlayEl = null;
    currentTeamId = null;
    panelHistory = [];
  }

  // ─── Data loading ─────────────────────────────────────────────────────────────
  async function loadTeamBrief(teamId, teamLabel) {
    try {
      const res = await msg("TEAM_BRIEF", { teamId });
      const data = res.data;
      if (!panelEl) return;
      panelEl.innerHTML = buildTeamBriefHTML(data, res.fromCache);
      attachPanelListeners();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = buildErrorHTML(teamLabel, err.message, () => loadTeamBrief(teamId, teamLabel));
      attachPanelListeners();
    }
  }

  async function loadLeaguePulse(teamLabel) {
    try {
      const res = await msg("LEAGUE_PULSE");
      leaguePulseData = res.data;
      if (!panelEl) return;
      panelEl.innerHTML = buildLeaguePulseHTML(leaguePulseData, res.fromCache);
      attachPanelListeners();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = buildErrorHTML(teamLabel, err.message, () => loadLeaguePulse(teamLabel));
      attachPanelListeners();
    }
  }

  function attachPanelListeners() {
    panelEl?.querySelector(".af-close-btn")?.addEventListener("click", closePanel);
    panelEl?.querySelector(".af-back-btn")?.addEventListener("click", goBack);
    panelEl?.querySelectorAll(".af-pulse-cell[data-teamid]").forEach(cell => {
      cell.addEventListener("click", () => {
        const tid = cell.getAttribute("data-teamid");
        const parsedTid = isNaN(Number(tid)) ? tid : parseInt(tid, 10);
        const name = cell.querySelector(".af-pulse-name")?.textContent || "Team";
        openPanel(parsedTid, name);
      });
    });
    panelEl?.querySelector(".af-retry-btn")?.addEventListener("click", () => {
      const retryFn = panelEl?._retryFn;
      if (retryFn) retryFn();
    });
    panelEl?.querySelector("#af-view-trades-btn")?.addEventListener("click", () => {
      // Push current pulse view onto history so back button works
      panelHistory.push({ type: 'pulse', teamLabel: 'League Pulse' });
      panelEl.innerHTML = buildLoadingHTML("Trade History");
      loadLiveTrades();
    });
  }

  // ─── HTML builders ────────────────────────────────────────────────────────────
  function buildLoadingHTML(label) {
    return `
      ${buildPanelHeader(label, "", "")}
      <div class="af-panel-body">
        <div class="af-loading-state">
          <div class="af-spinner"></div>
          <span>Loading DNA profile…</span>
        </div>
      </div>
      ${buildPanelFooter()}
    `;
  }

  function buildErrorHTML(label, errMsg, retryFn) {
    const helpText = PROVIDER === "sleeper"
      ? "Make sure your Sleeper league ID is configured in the extension settings."
      : "Make sure your ESPN league ID and cookies (espn_s2, SWID) are configured in the extension settings.";

    const html = `
      ${buildPanelHeader(label, "", "")}
      <div class="af-panel-body">
        <div class="af-error-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <strong>Failed to load</strong>
          <span style="color:#64748b;font-size:11px">${escapeHtml(errMsg)}</span>
          <span style="color:#64748b;font-size:11px;margin-top:4px">${escapeHtml(helpText)}</span>
          <button class="af-retry-btn">Retry</button>
        </div>
      </div>
      ${buildPanelFooter()}
    `;
    setTimeout(() => { if (panelEl) panelEl._retryFn = retryFn; }, 0);
    return html;
  }

  function buildPanelHeader(title, subtitle, archetype) {
    const col = archetype ? archetypeColor(archetype) : { text: PROVIDER_LABELS[PROVIDER]?.color || "#ef4444" };
    const showBack = panelHistory.length > 0;
    return `
      <div class="af-panel-header">
        <div class="af-panel-header-top">
          <div style="display:flex;align-items:center;gap:8px">
            ${showBack ? `<button class="af-back-btn" aria-label="Back" title="Back" style="background:none;border:none;cursor:pointer;color:#94a3b8;padding:0 4px 0 0;font-size:16px;line-height:1;display:flex;align-items:center">&#8592;</button>` : ''}
            <div>
              <h2 class="af-panel-title" style="color:${col.text}">${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="af-panel-subtitle">${escapeHtml(subtitle)}</p>` : ""}
              ${providerBadge()}
            </div>
          </div>
          <button class="af-close-btn" aria-label="Close">✕</button>
        </div>
      </div>
    `;
  }

  function buildPanelFooter() {
    const providerInfo = PROVIDER_LABELS[PROVIDER] || PROVIDER_LABELS.unknown;
    return `
      <div class="af-panel-footer">
        <span>ESPN GM Tool DNA Advisor</span>
        <span class="af-footer-dot">·</span>
        <span>${providerInfo.name}</span>
        <span class="af-footer-dot">·</span>
        <a href="#" class="af-footer-link" onclick="chrome.runtime.sendMessage({type:'OPEN_OPTIONS'});return false;">Settings</a>
      </div>
    `;
  }

  function buildTeamBriefHTML(data, fromCache) {
    if (!data) return buildErrorHTML("Team", "No data returned", () => {});

    const isComplete = !!data.isSeasonComplete;
    const season = data.season || new Date().getFullYear() - 1;

    const dna = data.dna || {};
    const archetype = dna.archetype || "BALANCED_OPERATOR";
    const col = archetypeColor(archetype);
    const desperationScore = data.desperationScore ?? 0;
    const dColor = desperationColor(desperationScore);

    const opportunities = data.opportunities || [];
    const rosterHealth = data.rosterHealth || {};
    const playoffOdds = data.playoffOdds;
    const record = data.record;

    // Completed-season tier label colors
    const TIER_COLORS = {
      "CHAMPION":    "#fde047",
      "CONTENDER":   "#34d399",
      "PLAYOFF TEAM":"#60a5fa",
      "BUBBLE":      "#f59e0b",
      "REBUILDING":  "#94a3b8",
    };
    const tierLabel = data.desperationLabel || "";
    const tierColor = TIER_COLORS[tierLabel] || dColor;

    const subtitleLabel = isComplete
      ? `${season} Final · ${data.gmArchetype || archetype}`
      : (dna.archetypeLabel || archetype);

    return `
      ${buildPanelHeader(data.teamName || data.ownerName || "Team", subtitleLabel, archetype)}
      <div class="af-panel-body">

        ${fromCache ? `<div class="af-cache-notice">Cached data · <a href="#" onclick="chrome.runtime.sendMessage({type:'CLEAR_CACHE'});return false;">Refresh</a></div>` : ""}

        <!-- Metrics row: season-aware -->
        <div class="af-metrics-row">
          ${isComplete ? `
          <div class="af-metric-card" style="border-color:${tierColor}44">
            <div class="af-metric-value" style="color:${tierColor};font-size:11px">${escapeHtml(tierLabel || "—")}</div>
            <div class="af-metric-label">${season} Finish</div>
          </div>` : `
          <div class="af-metric-card" style="border-color:${dColor}44">
            <div class="af-metric-value" style="color:${dColor}">${desperationScore}</div>
            <div class="af-metric-label">Desperation</div>
          </div>`}
          ${playoffOdds !== undefined && !isComplete ? `
          <div class="af-metric-card">
            <div class="af-metric-value" style="color:#60a5fa">${playoffOdds}%</div>
            <div class="af-metric-label">Playoff Odds</div>
          </div>` : ""}
          ${isComplete && data.standingRank ? `
          <div class="af-metric-card">
            <div class="af-metric-value" style="color:#94a3b8">#${data.standingRank}</div>
            <div class="af-metric-label">Final Rank</div>
          </div>` : ""}
          ${(data.wins !== undefined || record) ? `
          <div class="af-metric-card">
            <div class="af-metric-value" style="color:#94a3b8">${data.wins ?? record?.wins ?? "?"}-${data.losses ?? record?.losses ?? "?"}</div>
            <div class="af-metric-label">${isComplete ? season + " Record" : "Record"}</div>
          </div>` : ""}
        </div>

        <!-- DNA archetype badge -->
        <div class="af-archetype-block" style="background:${col.bg};border-color:${col.border}">
          <div class="af-archetype-label">DNA Archetype</div>
          <div class="af-archetype-name" style="color:${col.text}">${escapeHtml(dna.archetypeLabel || archetype.replace(/_/g, " "))}</div>
          ${dna.archetypeReason ? `<div class="af-archetype-reason">${escapeHtml(dna.archetypeReason)}</div>` : ""}
        </div>

        <!-- Opportunities -->
        ${opportunities.length > 0 ? `
        <div class="af-section">
          <div class="af-section-title">Your Opportunities</div>
          ${opportunities.slice(0, 4).map(op => `
            <div class="af-opportunity-item af-urgency-${(op.urgency || "monitor").toLowerCase()}">
              <div class="af-opp-type">${escapeHtml(op.type || "")}</div>
              <div class="af-opp-desc">${escapeHtml(op.description || "")}</div>
            </div>
          `).join("")}
        </div>` : ""}

        <!-- Roster health -->
        ${rosterHealth.injuredCount !== undefined ? `
        <div class="af-section">
          <div class="af-section-title">Roster Health</div>
          <div class="af-health-row">
            ${rosterHealth.injuredCount > 0 ? `<span class="af-health-chip af-chip-red">🤕 ${rosterHealth.injuredCount} injured</span>` : ""}
            ${rosterHealth.byeCount > 0 ? `<span class="af-health-chip af-chip-amber">📅 ${rosterHealth.byeCount} on bye</span>` : ""}
            ${rosterHealth.starterCount !== undefined ? `<span class="af-health-chip af-chip-neutral">${rosterHealth.starterCount} starters</span>` : ""}
          </div>
        </div>` : ""}

        <!-- AI briefing -->
        ${data.briefing ? `
        <div class="af-section">
          <div class="af-section-title">GM Briefing</div>
          <div class="af-briefing-text">${escapeHtml(data.briefing)}</div>
        </div>` : ""}

      </div>
      ${buildPanelFooter()}
    `;
  }

  function buildLeaguePulseHTML(data, fromCache) {
    if (!data || !data.teams) return buildErrorHTML("League Pulse", "No league data", () => {});

    const isComplete = !!data.isSeasonComplete;
    const season = data.season || new Date().getFullYear() - 1;

    // For completed seasons sort by final rank; for in-season sort by desperation
    const teams = isComplete
      ? [...data.teams].sort((a, b) => (a.standingRank || 99) - (b.standingRank || 99))
      : [...data.teams].sort((a, b) => (b.desperationScore || 0) - (a.desperationScore || 0));

    const headerSubtitle = isComplete
      ? `${season} Final Standings · ${teams.length} teams`
      : `${teams.length} teams · Week ${data.currentWeek || "?"}`;

    const TIER_COLORS = {
      "CHAMPION":    "#fde047",
      "CONTENDER":   "#34d399",
      "PLAYOFF TEAM":"#60a5fa",
      "BUBBLE":      "#f59e0b",
      "REBUILDING":  "#94a3b8",
    };

    return `
      ${buildPanelHeader(isComplete ? `${season} Final Standings` : "League Pulse", headerSubtitle, "")}
      <div class="af-panel-body">
        ${fromCache ? `<div class="af-cache-notice">Cached · <a href="#" onclick="chrome.runtime.sendMessage({type:'CLEAR_CACHE'});return false;">Refresh</a></div>` : ""}

        <div class="af-pulse-grid">
          ${teams.map(t => {
            const isComp = isComplete;
            const label = isComp ? (t.desperationLabel || "") : String(t.desperationScore ?? "—");
            const labelColor = isComp
              ? (TIER_COLORS[t.desperationLabel] || "#94a3b8")
              : desperationColor(t.desperationScore || 0);
            const col = archetypeColor(t.dna?.archetype || "BALANCED_OPERATOR");
            return `
              <div class="af-pulse-cell" data-teamid="${escapeHtml(String(t.teamId || ""))}">
                ${isComp ? `<div class="af-pulse-rank" style="color:#64748b;font-size:9px">#${t.standingRank || "?"}</div>` : ""}
                <div class="af-pulse-name">${escapeHtml(t.ownerName || t.teamName || "Team")}</div>
                <div class="af-pulse-archetype" style="color:${col.text}">${escapeHtml((t.dna?.archetype || "").replace(/_/g, " "))}</div>
                <div class="af-pulse-desp" style="color:${labelColor};font-size:${isComp ? "9px" : "11px"}">${escapeHtml(label)}</div>
              </div>
            `;
          }).join("")}
        </div>
        <p style="font-size:10px;color:#475569;text-align:center;margin-top:8px">
          ${isComplete ? `${season} season complete · Click any team for their offseason profile` : "Click any team for their full DNA profile"}
        </p>

        <!-- Live Trades shortcut -->
        <div style="border-top:1px solid #1e293b;margin-top:12px;padding-top:12px">
          <button id="af-view-trades-btn" style="width:100%;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#94a3b8;font-size:11px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <span style="display:flex;align-items:center;gap:6px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
              View Live Trades
            </span>
            <span style="color:#475569">›</span>
          </button>
        </div>
      </div>
      ${buildPanelFooter()}
    `;
  }

  // ─── Live ESPN trade fetching ──────────────────────────────────────────────────
  // Fetches mTransactions2 directly from ESPN using the browser's own cookies.
  // No backend, no cache — always live.
  async function fetchLiveTrades(leagueId, season) {
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTransactions2`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`ESPN API ${res.status}`);
    const json = await res.json();
    const transactions = json.transactions || [];

    // Build proposal lookup: id → transaction
    const proposalMap = new Map();
    for (const tx of transactions) {
      if (tx.type === "TRADE_PROPOSAL" || tx.type === "TRADE") {
        proposalMap.set(tx.id, tx);
      }
    }

    // Build team name map from json.teams
    const teamNameMap = new Map();
    for (const t of (json.teams || [])) {
      const name = t.location && t.nickname ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`);
      teamNameMap.set(t.id, name);
    }

    const trades = [];

    // 2026+: TRADE_UPHOLD / TRADE_ACCEPT → linked TRADE_PROPOSAL
    for (const tx of transactions) {
      if (tx.type !== "TRADE_UPHOLD" && tx.type !== "TRADE_ACCEPT") continue;
      const proposal = proposalMap.get(tx.relatedTransactionId);
      if (!proposal) continue;
      trades.push(buildLiveTradeRecord(proposal, tx.processDate || tx.proposedDate, teamNameMap));
    }

    // Legacy: type=TRADE status=EXECUTED
    for (const tx of transactions) {
      if (tx.type === "TRADE" && tx.status === "EXECUTED") {
        trades.push(buildLiveTradeRecord(tx, tx.processDate || tx.proposedDate, teamNameMap));
      }
    }

    // Sort newest first
    trades.sort((a, b) => (b.date || 0) - (a.date || 0));
    return trades;
  }

  function buildLiveTradeRecord(proposal, date, teamNameMap) {
    const items = proposal.items || [];
    const sides = new Map();
    for (const item of items) {
      const from = item.fromTeamId;
      const to = item.toTeamId;
      const name = item.playerName || (item.playerId ? `Player ${item.playerId}` : null);
      if (!name) continue;
      if (from != null) {
        if (!sides.has(from)) sides.set(from, { sent: [], received: [] });
        sides.get(from).sent.push(name);
      }
      if (to != null) {
        if (!sides.has(to)) sides.set(to, { sent: [], received: [] });
        sides.get(to).received.push(name);
      }
    }
    const teamIds = Array.from(sides.keys());
    const dateLabel = date
      ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Unknown Date";
    return { id: proposal.id, date, dateLabel, teamIds, sides, teamNameMap };
  }

  function buildTradesHTML(trades) {
    if (!trades || trades.length === 0) {
      return `
        ${buildPanelHeader("Trade History", "Live from ESPN", "")}
        <div class="af-panel-body">
          <div class="af-error-state" style="padding:24px 0">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/></svg>
            <strong style="color:#94a3b8">No trades found</strong>
            <span style="color:#475569;font-size:11px">No accepted trades in the current season view.</span>
          </div>
        </div>
        ${buildPanelFooter()}
      `;
    }

    const rows = trades.map(t => {
      const teamIds = t.teamIds || [];
      const sidesHtml = teamIds.map(tid => {
        const side = t.sides.get(tid);
        const teamName = t.teamNameMap.get(tid) || `Team ${tid}`;
        const received = (side?.received || []).join(", ") || "—";
        const sent = (side?.sent || []).join(", ") || "—";
        return `
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(teamName)}</div>
            <div style="font-size:10px;color:#34d399">Got: ${escapeHtml(received)}</div>
            <div style="font-size:10px;color:#f87171">Gave: ${escapeHtml(sent)}</div>
          </div>
        `;
      }).join(`<div style="color:#475569;font-size:11px;padding:0 6px;align-self:center">⇄</div>`);

      return `
        <div style="border:1px solid #1e293b;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#0f172a">
          <div style="font-size:10px;color:#475569;margin-bottom:6px">${escapeHtml(t.dateLabel)}</div>
          <div style="display:flex;align-items:flex-start;gap:4px">${sidesHtml}</div>
        </div>
      `;
    }).join("");

    return `
      ${buildPanelHeader("Trade History", `${trades.length} trade${trades.length !== 1 ? "s" : ""} · Live from ESPN`, "")}
      <div class="af-panel-body">${rows}</div>
      ${buildPanelFooter()}
    `;
  }

  async function loadLiveTrades() {
    const leagueId = getLeagueIdFromUrl();
    const season = new Date().getFullYear();
    if (!leagueId) {
      if (!panelEl) return;
      panelEl.innerHTML = buildErrorHTML("Trade History", "No league ID found in URL. Navigate to your ESPN fantasy league page first.", loadLiveTrades);
      attachPanelListeners();
      return;
    }
    try {
      const trades = await fetchLiveTrades(leagueId, season);
      if (!panelEl) return;
      panelEl.innerHTML = buildTradesHTML(trades);
      attachPanelListeners();
    } catch (err) {
      if (!panelEl) return;
      panelEl.innerHTML = buildErrorHTML("Trade History", err.message, loadLiveTrades);
      attachPanelListeners();
    }
  }

  // ─── SPA navigation handling ─────────────────────────────────────────────────
  let lastUrl = window.location.href;

  function onUrlChange() {
    const newUrl = window.location.href;
    if (newUrl !== lastUrl) {
      lastUrl = newUrl;
      closePanel();
      // Remove FAB so it gets re-added for the new page
      document.getElementById(FAB_ID)?.remove();
      // Clear injected markers so badges re-inject on new page
      document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(el => el.removeAttribute(BADGE_ATTR));
      // Re-inject after React renders
      setTimeout(injectBadges, 800);
      setTimeout(injectBadges, 2000);
    }
  }

  // Intercept pushState / replaceState
  const _pushState = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);
  history.pushState = (...args) => { _pushState(...args); onUrlChange(); };
  history.replaceState = (...args) => { _replaceState(...args); onUrlChange(); };
  window.addEventListener("popstate", onUrlChange);

  // MutationObserver for DOM changes (React renders)
  let injectTimeout = null;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectBadges, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ─── Init ─────────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(injectBadges, 500));
  } else {
    setTimeout(injectBadges, 500);
  }

  console.log(`[ESPN GM Tool DNA Advisor v1.4.0] Provider: ${PROVIDER} | URL: ${window.location.pathname}`);

})();
