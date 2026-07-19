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
  --dbm-user: #7c3aed;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--dbm-text);
  background: var(--dbm-bg);
  box-sizing: border-box;
}
.dbm-root *, .dbm-root *::before, .dbm-root *::after { box-sizing: border-box; }
.dbm-header {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline;
  padding: 12px 16px; border-bottom: 1px solid var(--dbm-border);
  background: linear-gradient(180deg, #15202b, var(--dbm-bg));
  position: sticky; top: 0; z-index: 5;
}
.dbm-title { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: 0.02em; }
.dbm-meta { font-size: 12px; color: var(--dbm-muted); display: flex; flex-wrap: wrap; gap: 10px; }
.dbm-badge {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  border: 1px solid var(--dbm-border); background: var(--dbm-panel);
}
.dbm-badge.status-ACTIVE { border-color: #22c55e; color: #86efac; }
.dbm-badge.status-COMPLETE { border-color: var(--dbm-accent); color: #93c5fd; }
.dbm-badge.status-NOT_STARTED { color: var(--dbm-muted); }
.dbm-badge.status-PAUSED { border-color: #eab308; color: #fde047; }
.dbm-badge.status-ERROR { border-color: #ef4444; color: #fca5a5; }
.dbm-error {
  margin: 12px 16px; padding: 12px 14px; border: 1px solid #7f1d1d;
  background: #450a0a; color: #fecaca; border-radius: 6px; font-size: 13px;
}
.dbm-board-wrap {
  overflow-x: scroll; overflow-y: auto;
  width: 100%;
  max-height: calc(100vh - 120px);
  padding: 8px;
  box-sizing: border-box;
  overscroll-behavior-x: contain;
  scrollbar-width: auto;
}
.dbm-board-wrap::-webkit-scrollbar { height: 14px; width: 12px; }
.dbm-board-wrap::-webkit-scrollbar-thumb { background: #3d4a5c; border-radius: 7px; }
.dbm-board-wrap::-webkit-scrollbar-track { background: #151c24; }
.dbm-board {
  display: grid;
  border: 1px solid var(--dbm-border);
  width: max-content;
  min-width: 100%;
  background: var(--dbm-panel);
}
.dbm-corner, .dbm-team-head, .dbm-round-label, .dbm-cell {
  border-right: 1px solid var(--dbm-border);
  border-bottom: 1px solid var(--dbm-border);
  padding: 6px 8px;
  vertical-align: top;
}
.dbm-corner {
  position: sticky; left: 0; top: 0; z-index: 4;
  background: #121820; font-size: 11px; color: var(--dbm-muted); font-weight: 700;
  min-width: 64px;
}
.dbm-team-head {
  position: sticky; top: 0; z-index: 3;
  background: #121820; min-width: 140px; max-width: 200px;
}
.dbm-team-head.user { box-shadow: inset 0 -3px 0 var(--dbm-user); }
.dbm-team-name { font-size: 13px; font-weight: 700; line-height: 1.25; }
.dbm-team-owner { font-size: 11px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-team-slot { font-size: 10px; color: var(--dbm-muted); margin-top: 2px; }
.dbm-round-label {
  position: sticky; left: 0; z-index: 2;
  background: #151c24; font-weight: 700; font-size: 12px;
  min-width: 64px;
}
.dbm-cell { min-width: 140px; max-width: 200px; min-height: 48px; background: var(--dbm-bg); }
.dbm-cell.empty { background: #0c1015; }
.dbm-card {
  border: 1px solid var(--dbm-border); border-radius: 4px;
  padding: 5px 6px; margin-bottom: 4px; background: #18212b;
  font-size: 12px; line-height: 1.3;
}
.dbm-card:last-child { margin-bottom: 0; }
.dbm-card-row { display: flex; gap: 6px; align-items: flex-start; }
.dbm-headshot {
  width: 34px; height: 25px; border-radius: 3px; object-fit: cover;
  background: #0c1015; flex: 0 0 auto; margin-top: 1px;
}
.dbm-card-body { min-width: 0; }
.dbm-card.keeper { border-color: var(--dbm-keeper); }
.dbm-card.trade { border-color: var(--dbm-trade); }
.dbm-card-top { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.dbm-overall { color: var(--dbm-accent); font-size: 11px; font-weight: 800; }
.dbm-player { font-weight: 700; }
.dbm-sub { color: var(--dbm-muted); font-size: 11px; margin-top: 2px; }
.dbm-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.dbm-tag {
  font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  padding: 1px 5px; border-radius: 3px; text-transform: uppercase;
}
.dbm-tag.keeper { background: #422006; color: #fbbf24; }
.dbm-tag.trade { background: #134e4a; color: #5eead4; }
.dbm-diag {
  margin: 8px 16px 16px; padding: 10px 12px; border: 1px dashed var(--dbm-border);
  border-radius: 6px; font-size: 11px; color: var(--dbm-muted);
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px 12px;
}
.dbm-diag strong { color: var(--dbm-text); font-weight: 600; }
`;
