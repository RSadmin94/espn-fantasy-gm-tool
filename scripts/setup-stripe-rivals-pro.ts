/**
 * @deprecated Use `pnpm stripe:setup-products` instead.
 */
import { spawnSync } from "node:child_process";

console.warn("[deprecated] stripe:setup-rivals-pro — use pnpm stripe:setup-products");

const result = spawnSync("tsx", ["scripts/setup-stripe-products.ts"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});

process.exit(result.status ?? 1);
