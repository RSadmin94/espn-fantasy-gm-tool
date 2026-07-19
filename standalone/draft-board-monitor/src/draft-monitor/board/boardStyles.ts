export const BOARD_STYLES = `
.dbm-root {
  --dbm-bg: #0f1419;
  --dbm-panel: #1a222c;
  --dbm-border: #2a3544;
  --dbm-text: #e8eef5;
  --dbm-muted: #8b9aab;
  --dbm-accent: #3d8bfd;
  --dbm-keeper: #c9a227;
  --dbm-trade: #2dd4bf;
  --dbm-user: #8b5cf6;
  --dbm-clock: #22c55e;
  --pos-QB: #f472b6; --pos-RB: #34d399; --pos-WR: #60a5fa; --pos-TE: #fbbf24;
  --pos-K: #c084fc; --pos-DST: #f87171; --pos-DP: #fb923c;
  --dbm-cell-w: 150px; --dbm-card-font: 12px;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--dbm-text); background: var(--dbm-bg); box-sizing: border-box;
}
.dbm-root *, .dbm-root *::before, .dbm-root *::after { box-sizing: border-box; }
.dbm-root[data-dbm-zoom="1"] { --dbm-cell-w: 120px; --dbm-card-font: 11px; }
.dbm-root[data-dbm-zoom="2"] { --dbm-cell-w: 150px; --dbm-card-font: 12px; }
.dbm-root[data-dbm-zoom="3"] { --dbm-cell-w: 185px; --dbm-card-font: 13px; }
.dbm-root[data-dbm-zoom="4"] { --dbm-cell-w: 230px; --dbm-card-font: 15px; }

/* ---- Header (stronger, sticky) ---- */
.dbm-header {
  display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
  padding: 14px 18px; border-bottom: 2px solid var(--dbm-accent);
  background: linear-gradient(180deg, #1b2836, #10161d);
  position: sticky; top: 0; z-index: 20;
}
.dbm-title {
  font-size: 22px; font-weight: 800; margin: 0; letter-spacing: 0.01em;
  display: flex; align-items: center; gap: 10px;
}
.dbm-title::before {
  content: ""; width: 10px; height: 22px; border-radius: 3px;
  background: var(--dbm-accent);
}
.dbm-meta { font-size: 13px; color: var(--dbm-text); display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.dbm-meta .dbm-metaval { color: var(--dbm-muted); }
.dbm-badge {
  display: inline-block; padding: 3px 10px; border-radius: 5px;
  font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
  border: 1px solid var(--dbm-border); background: var(--dbm-panel);
}
.dbm-badge.status-ACTIVE { border-color: #22c55e; color: #86efac; }
.dbm-badge.status-COMPLETE { border-color: var(--dbm-accent); color: #93c5fd; }
.dbm-badge.status-NOT_STARTED { color: var(--dbm-muted); }
.dbm-badge.status-PAUSED { border-color: #eab308; color: #fde047; }
.dbm-badge.status-ERROR { border-color: #ef4444; color: #fca5a5; }
.dbm-spacer { flex: 1 1 auto; }
.dbm-onclock {
  display: inline-block; padding: 3px 10px; border-radius: 5px;
  font-size: 12px; font-weight: 800; letter-spacing: 0.02em;
  border: 1px solid var(--dbm-clock); color: #86efac; background: rgba(34,197,94,0.08);
}

/* ---- Zoom + legend controls ---- */
.dbm-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dbm-zoom { display: flex; align-items: center; gap: 4px; }
.dbm-zoom button {
  width: 26px; height: 26px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--dbm-border); background: var(--dbm-panel);
  color: var(--dbm-text); font-size: 15px; font-weight: 800; line-height: 1;
}
.dbm-zoom button:hover { border-color: var(--dbm-accent); }
.dbm-zoom-label { font-size: 11px; color: var(--dbm-muted); min-width: 30px; text-align: center; }
.dbm-legend { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dbm-legend .lg { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dbm-muted); }
.dbm-legend .sw { width: 10px; height: 10px; border-radius: 2px; }
.dbm-error {
  margin: 12px 16px; padding: 12px 14px; border: 1px solid #7f1d1d;
  background: #450a0a; color: #fecaca; border-radius: 6px; font-size: 13px;
}

/* ---- Board scroll container ---- */
.dbm-board-wrap {
  overflow: scroll; width: 100%; max-height: calc(100vh - 150px);
  padding: 0; box-sizing: border-box; overscroll-behavior: contain;
  scrollbar-width: auto; position: relative;
}
.dbm-board-wrap::-webkit-scrollbar { height: 14px; width: 12px; }
.dbm-board-wrap::-webkit-scrollbar-thumb { background: #3d4a5c; border-radius: 7px; }
.dbm-board-wrap::-webkit-scrollbar-track { background: #151c24; }

.dbm-board {
  display: grid; border: 1px solid var(--dbm-border);
  width: max-content; min-width: 100%; background: var(--dbm-panel);
}
.dbm-corner, .dbm-team-head, .dbm-round-label, .dbm-cell {
  border-right: 1px solid var(--dbm-border);
  border-bottom: 1px solid var(--dbm-border);
  padding: 6px 8px; vertical-align: top;
}

/* Corner: sticky BOTH directions, top of stack */
.dbm-corner {
  position: sticky; left: 0; top: 0; z-index: 15;
  background: #10161d; font-size: 11px; color: var(--dbm-muted); font-weight: 800;
  min-width: 64px; width: 64px;
}
/* Team headers: sticky to top while scrolling vertically */
.dbm-team-head {
  position: sticky; top: 0; z-index: 12;
  background: #131b24; min-width: var(--dbm-cell-w); max-width: 240px;
}
.dbm-team-head.user {
  background: linear-gradient(180deg, #241a3d, #171227);
  box-shadow: inset 0 -3px 0 var(--dbm-user);
}
.dbm-team-name { font-size: 13px; font-weight: 800; line-height: 1.25; }
.dbm-team-owner { font-size: 11px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-team-slot { font-size: 10px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-myteam-badge {
  display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 3px;
  font-size: 9px; font-weight: 900; letter-spacing: 0.06em;
  background: var(--dbm-user); color: #fff; text-transform: uppercase;
}
/* Round labels: sticky to left while scrolling horizontally */
.dbm-round-label {
  position: sticky; left: 0; z-index: 10;
  background: #131b24; font-weight: 800; font-size: 13px;
  min-width: 64px; width: 64px; color: var(--dbm-text);
}

/* ---- Cells + user-column tint + active pick ---- */
.dbm-cell {
  min-width: var(--dbm-cell-w); max-width: 240px; min-height: 46px;
  background: var(--dbm-bg);
}
.dbm-cell.empty { background: #0c1015; }
.dbm-cell.user-col { background: #171325; }
.dbm-cell.user-col.empty { background: #130f1f; }
.dbm-cell.on-clock {
  outline: 2px solid var(--dbm-clock); outline-offset: -2px;
  animation: dbm-pulse 1.6s ease-in-out infinite;
}
.dbm-cell.on-clock::after {
  content: "ON THE CLOCK"; display: block; font-size: 9px; font-weight: 900;
  letter-spacing: 0.06em; color: var(--dbm-clock); margin-top: 2px;
}
@keyframes dbm-pulse {
  0%, 100% { box-shadow: inset 0 0 0 0 rgba(34,197,94,0.0); }
  50% { box-shadow: inset 0 0 22px 0 rgba(34,197,94,0.30); }
}

/* ---- Cards (clear text hierarchy) ---- */
.dbm-card {
  border: 1px solid var(--dbm-border); border-left: 3px solid var(--dbm-border);
  border-radius: 4px; padding: 5px 7px; margin-bottom: 4px; background: #18212b;
  font-size: var(--dbm-card-font); line-height: 1.28;
}
.dbm-card:last-child { margin-bottom: 0; }
.dbm-card.pos-QB { border-left-color: var(--pos-QB); }
.dbm-card.pos-RB { border-left-color: var(--pos-RB); }
.dbm-card.pos-WR { border-left-color: var(--pos-WR); }
.dbm-card.pos-TE { border-left-color: var(--pos-TE); }
.dbm-card.pos-K  { border-left-color: var(--pos-K); }
.dbm-card.pos-DST { border-left-color: var(--pos-DST); }
.dbm-card.pos-DP { border-left-color: var(--pos-DP); }
.dbm-card.keeper { box-shadow: inset 3px 0 0 var(--dbm-keeper); }
.dbm-card.trade { box-shadow: inset 3px 0 0 var(--dbm-trade); }
.dbm-card-row { display: flex; gap: 7px; align-items: flex-start; }
.dbm-headshot {
  width: 38px; height: 28px; border-radius: 3px; object-fit: cover;
  background: #0c1015; flex: 0 0 auto; margin-top: 1px;
}
.dbm-card-body { min-width: 0; flex: 1 1 auto; }
.dbm-card-top { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.dbm-overall {
  color: #fff; background: var(--dbm-accent); border-radius: 3px;
  padding: 0 5px; font-size: calc(var(--dbm-card-font) - 1px); font-weight: 900;
}
.dbm-player { font-weight: 800; font-size: calc(var(--dbm-card-font) + 1px); }
.dbm-sub {
  color: var(--dbm-text); font-size: var(--dbm-card-font); margin-top: 3px;
  font-weight: 600; opacity: 0.85;
}
.dbm-sub .pos { font-weight: 800; }
.dbm-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.dbm-tag {
  font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  padding: 1px 5px; border-radius: 3px; text-transform: uppercase;
}
.dbm-tag.keeper { background: #422006; color: #fbbf24; }
.dbm-tag.trade { background: #134e4a; color: #5eead4; }

/* ---- Diagnostics ---- */
.dbm-diag {
  margin: 8px 16px 16px; padding: 10px 12px; border: 1px dashed var(--dbm-border);
  border-radius: 6px; font-size: 11px; color: var(--dbm-muted);
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px 12px;
}
.dbm-diag strong { color: var(--dbm-text); font-weight: 600; }
`;
