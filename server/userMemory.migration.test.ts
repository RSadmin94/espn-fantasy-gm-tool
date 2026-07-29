import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("0034_user_memory migration", () => {
  const file = path.join(process.cwd(), "drizzle", "migrations", "0034_user_memory.sql");

  it("exists in the boot-time migrations directory", () => {
    expect(fs.existsSync(file)).toBe(true);
  });

  it("is additive CREATE TABLE IF NOT EXISTS with camelCase columns", () => {
    const sql = fs.readFileSync(file, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `user_memory`/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    for (const col of [
      "userId",
      "riskTolerance",
      "tradePhilosophy",
      "keeperPhilosophy",
      "draftStyle",
      "favoritePlayerTypes",
      "rivalManagers",
      "notes",
      "createdAt",
      "updatedAt",
    ]) {
      expect(sql).toContain(`\`${col}\``);
    }
  });
});
