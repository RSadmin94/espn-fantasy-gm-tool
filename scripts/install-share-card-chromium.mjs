/**
 * RFSN-053G — install Playwright Chromium for server-side Share Card PNG export.
 * Railway Preview is Nixpacks (nodejs_20 + chromium). Keep browsers under /app
 * so runtime HOME cannot miss the build-time cache.
 */
import { execSync } from "node:child_process";

const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() || "/app/ms-playwright";
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath };

try {
  execSync("npx playwright install chromium", { stdio: "inherit", env });
} catch (err) {
  console.warn("[053G] playwright chromium install failed; PNG export will use system chromium if present.");
  console.warn(err);
}

try {
  execSync("npx playwright install-deps chromium", { stdio: "inherit", env });
} catch (err) {
  console.warn("[053G] playwright install-deps skipped (Nixpacks uses nix chromium).");
  console.warn(err);
}
