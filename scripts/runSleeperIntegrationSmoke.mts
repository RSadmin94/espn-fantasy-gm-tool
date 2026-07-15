/**
 * Run Sleeper integration vitest suite, core smoke script, and DB probe.
 *
 * Usage: pnpm exec tsx scripts/runSleeperIntegrationSmoke.mts
 */
import { spawnSync } from "node:child_process";

const VITEST_FILES = [
  "server/sleeperConnect.test.ts",
  "server/sleeperLeagueImport.test.ts",
  "server/sleeperOwnerResolution.test.ts",
  "server/getAllCachedSeasons.test.ts",
  "server/espnDraftPicks.test.ts",
  "server/rivalryRouter.test.ts",
  "server/connectedLeagueArchitecture.test.ts",
  "server/universalPersistence.test.ts",
  "server/providers/workbook/sleeperWorkbookAdapter.test.ts",
];

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

let exitCode = run("pnpm", [
  "exec",
  "vitest",
  "run",
  "--no-file-parallelism",
  ...VITEST_FILES,
]);
if (exitCode !== 0) {
  process.exit(exitCode);
}

exitCode = run("pnpm", ["exec", "tsx", "scripts/runSleeperCoreSmoke.mts"]);
if (exitCode !== 0) {
  process.exit(exitCode);
}

exitCode = run("pnpm", ["exec", "tsx", "scripts/probeSleeperSmokeDb.mts"]);
process.exit(exitCode);
