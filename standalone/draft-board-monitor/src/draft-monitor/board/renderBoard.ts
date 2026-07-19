import type { MonitorDiagnostics, NormalizedDraftSnapshot } from "../normalize/draftTypes";
import { groupPicksByRoundAndTeam } from "../normalize/pickOwnership";
import { BOARD_STYLES } from "./boardStyles";

export type RenderTarget = {
  document: Document;
  mount: HTMLElement;
};

export function ensureStyles(doc: Document): void {
  if (doc.getElementById("dbm-styles")) return;
  const style = doc.createElement("style");
  style.id = "dbm-styles";
  style.textContent = BOARD_STYLES;
  doc.head.appendChild(style);
}

export function renderBoard(
  target: RenderTarget,
  snapshot: NormalizedDraftSnapshot | null,
  diagnostics: MonitorDiagnostics,
): void {
  ensureStyles(target.document);
  const root = target.mount;

  // Skip full rebuild when nothing meaningful changed — the poll ticks every
  // few seconds and a rebuild resets scroll position. Only refresh the
  // "last read" clock in that case.
  const lastPick = snapshot?.picks[snapshot.picks.length - 1];
  const sig = [
    snapshot?.draftFingerprint ?? "",
    snapshot?.picks.length ?? 0,
    lastPick?.eventKey ?? "",
    diagnostics.status,
    diagnostics.parseError ?? "",
    diagnostics.duplicatesSuppressed,
  ].join("~");
  if (root.getAttribute("data-dbm-sig") === sig) {
    const clock = root.querySelector("#dbm-last-read");
    if (clock) clock.textContent = diagnostics.lastSuccessfulReadAt || "—";
    return;
  }

  // Preserve scroll position across rebuilds.
  const prevWrap = root.querySelector<HTMLElement>(".dbm-board-wrap");
  const keepX = prevWrap?.scrollLeft ?? 0;
  const keepY = prevWrap?.scrollTop ?? 0;

  root.className = "dbm-root";
  root.innerHTML = "";
  root.setAttribute("data-dbm-sig", sig);

  const header = el(target.document, "div", "dbm-header");
  const title = el(target.document, "h1", "dbm-title");
  title.textContent = "Draft Board Monitor";
  header.appendChild(title);

  const meta = el(target.document, "div", "dbm-meta");
  const status = diagnostics.status;
  meta.appendChild(badge(target.document, status, `status-${status}`));
  meta.appendChild(textSpan(target.document, snapshot?.source?.toUpperCase() || diagnostics.source.toUpperCase()));
  if (snapshot?.draftName) meta.appendChild(textSpan(target.document, snapshot.draftName));
  if (snapshot?.teamCount) meta.appendChild(textSpan(target.document, `${snapshot.teamCount} teams`));
  if (snapshot?.roundCount) meta.appendChild(textSpan(target.document, `${snapshot.roundCount} rounds`));
  if (snapshot?.currentOverallPick != null && status === "ACTIVE") {
    const onClock = el(target.document, "span", "dbm-onclock");
    onClock.textContent = `On the clock · Pick #${snapshot.currentOverallPick}`;
    meta.appendChild(onClock);
  }
  header.appendChild(meta);

  const spacer = el(target.document, "div", "dbm-spacer");
  header.appendChild(spacer);
  header.appendChild(buildControls(target.document, root));
  root.appendChild(header);

  if (diagnostics.parseError) {
    const err = el(target.document, "div", "dbm-error");
    err.textContent = diagnostics.parseError;
    root.appendChild(err);
  }

  if (!snapshot || (snapshot.teams.length === 0 && snapshot.picks.length === 0 && diagnostics.parseError)) {
    root.appendChild(renderDiagnostics(target.document, diagnostics));
    return;
  }

  const teams = snapshot.teams;
  const rounds = resolveRounds(snapshot);
  const grouped = groupPicksByRoundAndTeam(snapshot.picks);

  // ON-THE-CLOCK: the ESPN pick-history snapshot exposes only COMPLETED picks,
  // so upcoming-pick *current ownership* is unknown (a traded upcoming pick
  // would be mis-attributed by snake math). We therefore do NOT highlight a
  // team cell for the upcoming pick — that could illuminate the wrong team.
  // The next-pick *position* is surfaced in the header instead (no team named).
  // Accurate team highlighting would require reading ESPN's explicit
  // "ON THE CLOCK: PICK N — Team" label (a future evidence-based enhancement).

  const wrap = el(target.document, "div", "dbm-board-wrap");
  const board = el(target.document, "div", "dbm-board");
  board.style.gridTemplateColumns = `64px repeat(${Math.max(teams.length, 1)}, minmax(var(--dbm-cell-w), 240px))`;

  board.appendChild(cell(target.document, "dbm-corner", "Rd \\ Tm"));
  for (const t of teams) {
    const head = el(target.document, "div", t.isUserTeam ? "dbm-team-head user" : "dbm-team-head");
    const name = el(target.document, "div", "dbm-team-name");
    name.textContent = t.teamName;
    head.appendChild(name);
    if (t.ownerName) {
      const o = el(target.document, "div", "dbm-team-owner");
      o.textContent = t.ownerName;
      head.appendChild(o);
    }
    if (t.draftSlot != null) {
      const s = el(target.document, "div", "dbm-team-slot");
      s.textContent = `Slot ${t.draftSlot}`;
      head.appendChild(s);
    }
    if (t.isUserTeam) {
      const badge2 = el(target.document, "div", "dbm-myteam-badge");
      badge2.textContent = "My Team";
      head.appendChild(badge2);
    }
    board.appendChild(head);
  }

  for (const round of rounds) {
    const label = cell(target.document, "dbm-round-label", `R${round}`);
    board.appendChild(label);
    const byTeam = grouped.get(round) || new Map();
    for (const t of teams) {
      const picks = byTeam.get(t.teamId) || [];
      let cls = picks.length ? "dbm-cell" : "dbm-cell empty";
      if (t.isUserTeam) cls += " user-col";
      const c = el(target.document, "div", cls);
      for (const p of picks) {
        c.appendChild(renderCard(target.document, p));
      }
      board.appendChild(c);
    }
  }

  wrap.appendChild(board);
  root.appendChild(wrap);
  // Restore scroll position captured before this rebuild.
  if (keepX || keepY) {
    wrap.scrollLeft = keepX;
    wrap.scrollTop = keepY;
  }
  root.appendChild(renderDiagnostics(target.document, diagnostics));
}

function resolveRounds(snapshot: NormalizedDraftSnapshot): number[] {
  const maxFromPicks = snapshot.picks.reduce((m, p) => Math.max(m, p.round), 0);
  const count = snapshot.roundCount && snapshot.roundCount > 0
    ? snapshot.roundCount
    : Math.max(maxFromPicks, 1);
  const nn = snapshot.picks.length === 0 && !snapshot.roundCount ? 1 : count;
  return Array.from({ length: nn }, (_, i) => i + 1);
}

function buildControls(doc: Document, root: HTMLElement): HTMLElement {
  const wrap = el(doc, "div", "dbm-controls");
  // Position legend
  const legend = el(doc, "div", "dbm-legend");
  const positions: [string, string][] = [
    ["QB", "--pos-QB"], ["RB", "--pos-RB"], ["WR", "--pos-WR"],
    ["TE", "--pos-TE"], ["K", "--pos-K"], ["DEF", "--pos-DST"], ["DP", "--pos-DP"],
  ];
  for (const [lbl, varName] of positions) {
    const lg = el(doc, "span", "lg");
    const sw = el(doc, "span", "sw");
    sw.style.background = `var(${varName})`;
    lg.appendChild(sw);
    lg.appendChild(doc.createTextNode(lbl));
    legend.appendChild(lg);
  }
  wrap.appendChild(legend);
  // Zoom
  const zoom = el(doc, "div", "dbm-zoom");
  const cur = Number(root.getAttribute("data-dbm-zoom") || "2");
  const label = el(doc, "span", "dbm-zoom-label");
  const setZoom = (z: number) => {
    // Default safely (2 = M) when z is NaN/invalid; clamp to 1..4.
    const clamped = Number.isFinite(z) ? Math.max(1, Math.min(4, Math.round(z))) : 2;
    root.setAttribute("data-dbm-zoom", String(clamped));
    label.textContent = `${["S", "M", "L", "XL"][clamped - 1]}`;
  };
  const minus = el(doc, "button", "");
  minus.textContent = "\u2212";
  minus.setAttribute("title", "Zoom out");
  minus.addEventListener("click", () =>
    setZoom(Number(root.getAttribute("data-dbm-zoom") || "2") - 1),
  );
  const plus = el(doc, "button", "");
  plus.textContent = "+";
  plus.setAttribute("title", "Zoom in");
  plus.addEventListener("click", () =>
    setZoom(Number(root.getAttribute("data-dbm-zoom") || "2") + 1),
  );
  const zlabel = el(doc, "span", "dbm-zoom-label");
  zlabel.textContent = "Zoom";
  zoom.appendChild(zlabel);
  zoom.appendChild(minus);
  zoom.appendChild(label);
  zoom.appendChild(plus);
  setZoom(cur);
  wrap.appendChild(zoom);
  return wrap;
}

function renderCard(doc: Document, p: import("../normalize/draftTypes").NormalizedDraftPick): HTMLElement {
  const posClass = p.position ? ` pos-${p.position.replace(/[^A-Z]/gi, "").toUpperCase()}` : "";
  const card = el(doc, "div", `dbm-card${posClass}${p.isKeeper ? " keeper" : ""}${p.isTradedPick ? " trade" : ""}`);
  const row = el(doc, "div", "dbm-card-row");
  if (p.headshotUrl) {
    const img = doc.createElement("img");
    img.className = "dbm-headshot";
    img.src = p.headshotUrl;
    img.alt = "";
    img.loading = "lazy";
    row.appendChild(img);
  }
  const body = el(doc, "div", "dbm-card-body");
  const top = el(doc, "div", "dbm-card-top");
  if (p.overallPick != null) {
    const o = el(doc, "span", "dbm-overall");
    o.textContent = `#${p.overallPick}`;
    top.appendChild(o);
  }
  const name = el(doc, "span", "dbm-player");
  name.textContent = p.playerName;
  top.appendChild(name);
  body.appendChild(top);

  const sub = el(doc, "div", "dbm-sub");
  if (p.position) {
    const pos = el(doc, "span", "pos");
    pos.textContent = p.position;
    sub.appendChild(pos);
  }
  if (p.nflTeam) {
    sub.appendChild(doc.createTextNode(p.position ? ` · ${p.nflTeam}` : p.nflTeam));
  }
  body.appendChild(sub);
  row.appendChild(body);
  card.appendChild(row);

  if (p.isKeeper || p.isTradedPick) {
    const tags = el(doc, "div", "dbm-tags");
    if (p.isKeeper) {
      const k = el(doc, "span", "dbm-tag keeper");
      k.textContent = "Keeper";
      tags.appendChild(k);
    }
    if (p.isTradedPick) {
      const tr = el(doc, "span", "dbm-tag trade");
      tr.textContent = p.originalTeamName
        ? `Via trade (${p.originalTeamName})`
        : "Via trade";
      tags.appendChild(tr);
    }
    card.appendChild(tags);
  }
  return card;
}

function renderDiagnostics(doc: Document, d: MonitorDiagnostics): HTMLElement {
  const box = el(doc, "div", "dbm-diag");
  const rows: [string, string][] = [
    ["Version", d.version],
    ["Source", d.source],
    ["Draft ID / fingerprint", d.draftIdOrFingerprint],
    ["Teams", String(d.teamCount)],
    ["Source picks", String(d.sourcePickCount)],
    ["Normalized picks", String(d.normalizedPickCount)],
    ["Duplicates suppressed", String(d.duplicatesSuppressed)],
    ["Keepers", String(d.keeperCount)],
    ["Traded picks", String(d.tradedPickCount)],
    ["My team", d.userTeam],
    ["Last successful read", d.lastSuccessfulReadAt || "—"],
    ["Parse error", d.parseError || "—"],
  ];
  for (const [k, v] of rows) {
    const item = el(doc, "div", "");
    const idAttr = k === "Last successful read" ? ' id="dbm-last-read-wrap"' : "";
    const valId = k === "Last successful read" ? ' id="dbm-last-read"' : "";
    item.innerHTML = `<strong${idAttr}>${escapeHtml(k)}:</strong> <span${valId}>${escapeHtml(v)}</span>`;
    box.appendChild(item);
  }
  return box;
}

function el(doc: Document, tag: string, className: string): HTMLElement {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  return n;
}

function cell(doc: Document, className: string, text: string): HTMLElement {
  const n = el(doc, "div", className);
  n.textContent = text;
  return n;
}

function badge(doc: Document, text: string, extraClass: string): HTMLElement {
  const n = el(doc, "span", `dbm-badge ${extraClass}`);
  n.textContent = text;
  return n;
}

function textSpan(doc: Document, text: string): HTMLElement {
  const n = el(doc, "span", "");
  n.textContent = text;
  return n;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
