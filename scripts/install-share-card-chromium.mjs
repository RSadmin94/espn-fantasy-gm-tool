/**
 * RFSN-053G — install Playwright Chromium for server-side Share Card PNG export.
 */
import { execSync } from "node:child_process";

try {
  execSync("npx playwright install chromium", { stdio: "inherit" });
} catch (err) {
  console.warn("[053G] playwright chromium install failed; PNG export will error until Chromium is available.");
  console.warn(err);
}
