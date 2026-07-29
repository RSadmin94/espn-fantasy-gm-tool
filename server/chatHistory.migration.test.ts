import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("0035_chat_history migration", () => {
  const file = path.join(process.cwd(), "drizzle", "migrations", "0035_chat_history.sql");

  it("exists and creates chat_history additively", () => {
    expect(fs.existsSync(file)).toBe(true);
    const sql = fs.readFileSync(file, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `chat_history`/i);
    expect(sql).toMatch(/`leagueId`/i);
    expect(sql).toMatch(/idx_chat_history_user_league/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
