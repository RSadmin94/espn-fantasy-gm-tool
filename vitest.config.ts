import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
      "shared/**/*.test.ts",
      "standalone/**/*.test.ts",
      "chrome-extension/**/*.test.js",
      "GM-War-Room-Extension-v1.10.0/**/*.test.js",
      "GM-War-Room-Extension-v1.11.0/**/*.test.js",
    ],
    environmentMatchGlobs: [
      ["client/src/**/*.test.tsx", "jsdom"],
    ],
  },
});
