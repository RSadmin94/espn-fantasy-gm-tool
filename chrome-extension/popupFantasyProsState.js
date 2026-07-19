/**
 * RFSN-030C — pure FantasyPros popup view-model helpers (no Chrome APIs).
 * Used by popup.js and unit tests.
 */

export const MSG_FP_MOCK_ARM = "GMWR_FP_MOCK_ARM";
export const MSG_FP_MOCK_DISARM = "GMWR_FP_MOCK_DISARM";
export const MSG_FP_MOCK_PING = "GMWR_FP_MOCK_PING";
export const MSG_FP_MOCK_GET_STATE = "GMWR_FP_MOCK_GET_STATE";

/**
 * @typedef {{
 *   id: string,
 *   name?: string,
 * }} FpLeagueOption
 *
 * @typedef {{
 *   detected: boolean,
 *   fantasyProsTabs: number,
 *   reached: number,
 *   armed: boolean,
 *   monitoring: boolean,
 *   connectedLabel: string,
 *   detectionLabel: string,
 *   monitoringLabel: string,
 *   draftId: string | null,
 *   providerDraftId: string | null,
 *   picksEmitted: number,
 *   picksObserved: number,
 *   rowsScanned: number,
 *   duplicatesSuppressed: number,
 *   ffrTabs: number,
 *   lastPickAt: string | null,
 *   lastStatus: string | null,
 *   selectedLeagueId: string,
 *   leagueOptions: FpLeagueOption[],
 *   error: string,
 *   busy: boolean,
 * }} FantasyProsPopupView
 */

/**
 * @param {unknown} getStateReply
 * @param {unknown} pingReply
 * @param {{ selectedLeagueId?: string, leagueOptions?: FpLeagueOption[], error?: string, busy?: boolean }} [ui]
 * @returns {FantasyProsPopupView}
 */
export function deriveFantasyProsPopupView(getStateReply, pingReply, ui = {}) {
  const gs = getStateReply && typeof getStateReply === "object" ? /** @type {Record<string, unknown>} */ (getStateReply) : {};
  const ping = pingReply && typeof pingReply === "object" ? /** @type {Record<string, unknown>} */ (pingReply) : {};
  const lastStatus =
    gs.lastStatus && typeof gs.lastStatus === "object"
      ? /** @type {Record<string, unknown>} */ (gs.lastStatus)
      : null;
  const diagnostics =
    lastStatus?.diagnostics && typeof lastStatus.diagnostics === "object"
      ? /** @type {Record<string, unknown>} */ (lastStatus.diagnostics)
      : null;

  const fantasyProsTabs = Number(ping.fantasyProsTabs ?? gs.fantasyProsTabs ?? 0) || 0;
  const reached = Number(ping.reached ?? gs.reached ?? 0) || 0;
  const detected = fantasyProsTabs > 0 || reached > 0;
  const armed = Boolean(gs.armed ?? ping.armed);
  const statusStr = lastStatus?.status != null ? String(lastStatus.status) : armed ? "armed" : "idle";
  const monitoring =
    armed &&
    (statusStr === "monitoring" ||
      statusStr === "armed" ||
      statusStr === "waiting_for_fantasypros_tab");

  const picksFromEmitted = Number(diagnostics?.picksEmitted ?? gs.picksEmitted);
  const picksFromState = Number(gs.picksEmitted ?? gs.picksObserved);
  // Do not adopt legacy diagnostics.picksObserved — it used to inflate every poll.
  const picksEmitted = [picksFromEmitted, picksFromState]
    .map((n) => (Number.isFinite(n) && n >= 0 ? n : null))
    .find((n) => n != null) ?? 0;
  const rowsScanned = Number(diagnostics?.rowsScanned);
  const duplicatesSuppressed = Number(diagnostics?.duplicatesSuppressed);
  const ffrTabs = Number(gs.ffrTabs) || 0;

  const draftId =
    (lastStatus?.draftId != null && String(lastStatus.draftId)) ||
    (gs.config && typeof gs.config === "object" && /** @type {any} */ (gs.config).draftId
      ? String(/** @type {any} */ (gs.config).draftId)
      : null) ||
    null;
  const providerDraftId =
    lastStatus?.providerDraftId != null ? String(lastStatus.providerDraftId) : null;

  const selectedLeagueId = String(ui.selectedLeagueId || "").trim();
  const leagueOptions = Array.isArray(ui.leagueOptions) ? ui.leagueOptions : [];

  return {
    detected,
    fantasyProsTabs,
    reached,
    armed,
    monitoring,
    connectedLabel: armed
      ? reached > 0 || statusStr === "monitoring" || statusStr === "armed"
        ? "Connected"
        : "Armed · waiting for FantasyPros tab"
      : "Not connected",
    detectionLabel: detected
      ? `Detected (${fantasyProsTabs} tab${fantasyProsTabs === 1 ? "" : "s"})`
      : "Not detected — open draftwizard.fantasypros.com mock live",
    monitoringLabel: armed ? (monitoring ? "Monitoring" : "Armed") : "Stopped",
    draftId,
    providerDraftId,
    picksEmitted,
    picksObserved: picksEmitted,
    rowsScanned: Number.isFinite(rowsScanned) && rowsScanned >= 0 ? rowsScanned : 0,
    duplicatesSuppressed:
      Number.isFinite(duplicatesSuppressed) && duplicatesSuppressed >= 0
        ? duplicatesSuppressed
        : 0,
    ffrTabs,
    lastPickAt: gs.lastPickAt != null ? String(gs.lastPickAt) : null,
    lastStatus: statusStr,
    selectedLeagueId,
    leagueOptions,
    error: String(ui.error || ""),
    busy: Boolean(ui.busy),
  };
}

/**
 * @param {string} leagueId
 * @returns {{ type: string, config: { leagueId: string, provider: string, source: string } }}
 */
export function buildFantasyProsArmMessage(leagueId) {
  const id = String(leagueId || "").trim();
  return {
    type: MSG_FP_MOCK_ARM,
    config: {
      leagueId: id,
      provider: "fantasypros",
      source: "solo-mock",
    },
  };
}

/** @returns {{ type: string }} */
export function buildFantasyProsDisarmMessage() {
  return { type: MSG_FP_MOCK_DISARM };
}

/**
 * Escape for HTML text/attributes.
 * @param {unknown} s
 */
export function escapeFpHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {FantasyProsPopupView} view
 * @returns {string}
 */
export function renderFantasyProsSectionHtml(view) {
  const canStart =
    !view.busy &&
    !view.armed &&
    /^\d+$/.test(view.selectedLeagueId);
  const canStop = !view.busy && view.armed;

  let html = `<section class="fp-section" data-fantasypros-popup data-rfsn-030c>`;
  html += `<hr class="fp-rule" />`;
  html += `<h2 class="h2">FantasyPros Mock</h2>`;
  html += `<p class="meta">Simulation mode — relays solo mock picks into RFSN. Keep <strong>/draft/mock</strong> open and press <strong>Start FantasyPros Mock Commentary</strong> on the War Room panel (popup Start alone does not call notifyLockedPick). Does not change ESPN sync.</p>`;

  html += `<p class="meta" data-fp-detection>${escapeFpHtml(view.detectionLabel)}</p>`;
  html += `<p class="meta" data-fp-connected>Session: <strong>${escapeFpHtml(view.connectedLabel)}</strong> · ${escapeFpHtml(view.monitoringLabel)}</p>`;

  if (view.draftId) {
    html += `<p class="meta" data-fp-session>Mock session: <span class="lid">${escapeFpHtml(view.draftId)}</span></p>`;
  } else {
    html += `<p class="meta" data-fp-session>Mock session: —</p>`;
  }

  html += `<label class="meta" for="fpLeague">FFR league</label>`;
  html += `<select id="fpLeague" data-fp-league ${view.busy || view.armed ? "disabled" : ""}>`;
  if (view.leagueOptions.length === 0) {
    html += `<option value="">Sync / add a league above first</option>`;
  } else {
    html += `<option value="">Select league…</option>`;
    for (const L of view.leagueOptions) {
      const sel = L.id === view.selectedLeagueId ? " selected" : "";
      const label = `${L.name || `League ${L.id}`} · ${L.id}`;
      html += `<option value="${escapeFpHtml(L.id)}"${sel}>${escapeFpHtml(label)}</option>`;
    }
  }
  html += `</select>`;

  html += `<p class="meta" data-fp-picks>Picks emitted: <strong>${escapeFpHtml(view.picksEmitted)}</strong>`;
  html += ` · scanned ${escapeFpHtml(view.rowsScanned)} · suppressed ${escapeFpHtml(view.duplicatesSuppressed)}`;
  if (view.ffrTabs > 0) {
    html += ` · FFR tabs ${escapeFpHtml(view.ffrTabs)}`;
  }
  if (view.lastPickAt) {
    html += ` · last relay ${escapeFpHtml(view.lastPickAt)}`;
  }
  html += `</p>`;

  html += `<div class="fp-actions">`;
  html += `<button type="button" class="secondary" id="fpDetect" ${view.busy ? "disabled" : ""}>Detect FantasyPros tab</button>`;
  if (!view.armed) {
    html += `<button type="button" id="fpStart" ${canStart ? "" : "disabled"}>Start FantasyPros simulation</button>`;
  } else {
    html += `<button type="button" class="secondary" id="fpStop" ${canStop ? "" : "disabled"}>Stop simulation</button>`;
  }
  html += `</div>`;

  if (view.error) {
    html += `<div class="err" data-fp-error>${escapeFpHtml(view.error)}</div>`;
  }

  html += `</section>`;
  return html;
}
