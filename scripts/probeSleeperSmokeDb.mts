/**
 * Probe production/shared DB for leftover Sleeper smoke / integration connections.
 *
 * Usage: pnpm exec tsx scripts/probeSleeperSmokeDb.mts
 */
import "dotenv/config";
import { probeSleeperSmokeConnections } from "../server/testing/sleeperIntegrationCleanup";

const { rows, matchCount } = await probeSleeperSmokeConnections();
console.log(JSON.stringify(rows, null, 2));
console.log("Match count:", matchCount);
process.exit(matchCount === 0 ? 0 : 1);
