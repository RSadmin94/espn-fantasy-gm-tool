/** Before/after mock draft comparison — does not modify repo (uses git checkout + restore). */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BACKUP = path.join(ROOT, "scripts", "_phase2a_backup");
const FILES = [
  "server/ownerDraftDnaModel.ts",
  "server/ownerDraftDnaModel.test.ts",
  "server/draftPickIntelligence.ts",
  "server/draftWarRoomRouter.ts",
];

function backup() {
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BACKUP, path.basename(f)));
  }
}

function restore() {
  for (const f of FILES) {
    const bak = path.join(BACKUP, path.basename(f));
    const dest = path.join(ROOT, f);
    if (fs.existsSync(bak)) fs.copyFileSync(bak, dest);
    else if (fs.existsSync(dest) && f.includes("ownerDraftDnaModel")) fs.unlinkSync(dest);
  }
}

function checkoutPhase1() {
  execSync("git checkout HEAD -- server/draftPickIntelligence.ts server/draftWarRoomRouter.ts", { cwd: ROOT });
  for (const f of ["server/ownerDraftDnaModel.ts", "server/ownerDraftDnaModel.test.ts"]) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function runOnce(label: string) {
  execSync(`pnpm exec tsx scripts/_mock_once.mts ${label}`, { cwd: ROOT, stdio: "inherit" });
}

type Row = { pick: number; round: number; owner: string; player: string; pos: string; factor: string | null };

backup();
try {
  checkoutPhase1();
  runOnce("before");
  restore();
  runOnce("after");
} finally {
  restore();
}

const before = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "_mock_before.json"), "utf8")) as Row[];
const after = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "_mock_after.json"), "utf8")) as Row[];

const changed: Array<{ pick: number; before: string; after: string; beforePos: string; afterPos: string }> = [];
for (let i = 0; i < Math.min(before.length, after.length); i++) {
  const b = before[i]!;
  const a = after[i]!;
  if (b.player !== a.player || b.pos !== a.pos) {
    changed.push({ pick: b.pick, before: b.player, after: a.player, beforePos: b.pos, afterPos: a.pos });
  }
}

const find = (rows: Row[], re: RegExp) => rows.find((r) => re.test(r.player));
const dpCount = (rows: Row[]) => rows.filter((r) => r.pos === "DP").length;

const report = {
  changedCount: changed.length,
  first5Changed: changed.slice(0, 5),
  before: {
    first20: before.slice(0, 20),
    garrett: find(before, /Myles Garrett/i),
    warner: find(before, /Fred Warner/i),
    dpCount: dpCount(before),
  },
  after: {
    first20: after.slice(0, 20),
    garrett: find(after, /Myles Garrett/i),
    warner: find(after, /Fred Warner/i),
    dpCount: dpCount(after),
  },
};

fs.writeFileSync(path.join(ROOT, "scripts", "_mock_compare_report.json"), JSON.stringify(report, null, 2));
console.log("\n=== COMPARISON REPORT ===\n");
console.log(JSON.stringify(report, null, 2));
