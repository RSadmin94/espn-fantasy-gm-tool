import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import {
  parseWorkbookBytes,
  getSheet,
} from "./workbookParser";
import {
  validateSleeperWorkbookV8,
  listWorkbookAudit,
} from "./workbookValidation";
import {
  mapSleeperWorkbookV8ToUniversalLeague,
  previewSleeperWorkbook,
  importSleeperWorkbookFromBuffer,
} from "./sleeperWorkbookAdapter";
import { runSleeperWorkbookImport } from "../../sleeperWorkbookImport";
import { getDb } from "../../db";
import { leagueConnections, gmTeams } from "../../../drizzle/schema";
import { countUniversalPersistRows, persistUniversalLeague } from "../../universalPersistence";
import { computeCareerReport } from "../../careerReportService";
import { buildH2HAuthority } from "../../h2hAuthority";
import { buildOwnerIdentityAuthority } from "../../ownerIdentityAuthority";
import { setActiveLeagueForUser } from "../../db";

const TEST_USER_ID = 99_020;
const FIXTURE_PATHS = [
  process.env.SLEEPER_WORKBOOK_V8_PATH,
  path.join(process.env.USERPROFILE || "", "Downloads", "Sleeper Data Import v8.xlsx"),
].filter((p): p is string => Boolean(p));

function resolveFixturePath(): string | null {
  for (const candidate of FIXTURE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function buildMinimalV8WorkbookBuffer(): Buffer {
  const wb = XLSX.utils.book_new();

  const info = [
    ["Username", "owner_a", "user_a_id", ""],
    ["Year", 2025, "", ""],
    ["Through Week", 1, "", ""],
    ["League", "Workbook Test League (2025)", "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "Info");

  const users = [
    ["/display_name", "/user_id", "/metadata/team_name"],
    ["Owner A", "user_a_id", "Team Alpha"],
    ["Owner B", "user_b_id", "Team Beta"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(users), "Users");

  const rosterSummary = [
    ["Roster ID", "Owner", "Team Name"],
    [1, "Owner A", "Team Alpha"],
    [2, "Owner B", "Team Beta"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rosterSummary), "Roster Summary");

  const standings = [
    ["User", "Wins", "Losses", "Ties", "Total Points"],
    ["Owner A", 1, 0, 0, 100],
    ["Owner B", 0, 1, 0, 90],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(standings), "Standings");

  const weekly = [
    ["Week", "User", "Team Score", "Opponent", "Opp Score", "Result"],
    [1, "Owner A", 100, "Owner B", 90, "W"],
    [1, "Owner B", 90, "Owner A", 100, "L"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weekly), "Weekly Results");

  const draft = [
    ["Round", "Overall Pick", "Player", "Position", "NFL Team", "Drafted By", "Keeper"],
    [1, 1, "Player One", "RB", "KC", "Owner A", ""],
    [1, 2, "Player Two", "WR", "BUF", "Owner B", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(draft), "Draft Result");

  const leagues = [
    ["Season", "Status", "Name", "Total Rosters", "Settings Playoff Teams", "Settings Playoff Week Start", "Settings Leg", "Scoring Settings Rec", "League Id"],
    [2025, "in_season", "Workbook Test League", 2, 2, 15, 1, 1, "workbook_test_league"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leagues), "Leagues");

  const settings = [
    ["/name", "/settings/num_teams", "/settings/playoff_teams"],
    ["Workbook Test League", 2, 2],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settings), "Settings");

  const rosters = [
    ["Roster ID", "Owner", "Team Name", "Roster Slot", "Starter Slot", "Player ID", "Player", "Position", "NFL Team"],
    [1, "Owner A", "Team Alpha", "Bench", "", "p1", "Player One", "RB", "KC"],
    [2, "Owner B", "Team Beta", "Bench", "", "p2", "Player Two", "WR", "BUF"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rosters), "Rosters");

  const transactions = [
    ["Week", "Transaction ID", "Type", "Date", "User", "Action", "Player", "Position", "Waiver Bid"],
    [1, "tx1", "free_agent", 46204, "Owner A", "add", "Free Agent", "WR", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(transactions), "Transactions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

let dbAvailable = false;
const MINIMAL_LEAGUE_ID = "workbook_test_league";
const MINIMAL_SEASON = 2025;

async function selectWorkbookTeam(leagueId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [conn] = await db
    .select()
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, TEST_USER_ID), eq(leagueConnections.leagueId, leagueId)))
    .limit(1);
  if (!conn) return;
  await db
    .update(leagueConnections)
    .set({
      selectedTeamId: 1,
      selectedOwnerKey: "id:user_a_id",
      selectedOwnerName: "Owner A",
      selectedFranchiseName: "Team Alpha",
      selectedSeason: MINIMAL_SEASON,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(leagueConnections.id, conn.id));
  await setActiveLeagueForUser(TEST_USER_ID, conn.id);
}

async function cleanupWorkbookTestData(leagueId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(leagueConnections)
    .where(and(eq(leagueConnections.userId, TEST_USER_ID), eq(leagueConnections.leagueId, leagueId)));
  await db.delete(gmTeams).where(eq(gmTeams.leagueId, leagueId));
  const { gmMatchups, gmTransactions, gmDraftPicks, gmRosterEntries, gmLeagueSettings } = await import(
    "../../../drizzle/schema"
  );
  await db.delete(gmRosterEntries).where(eq(gmRosterEntries.leagueId, leagueId));
  await db.delete(gmDraftPicks).where(eq(gmDraftPicks.leagueId, leagueId));
  await db.delete(gmTransactions).where(eq(gmTransactions.leagueId, leagueId));
  await db.delete(gmMatchups).where(eq(gmMatchups.leagueId, leagueId));
  await db.delete(gmLeagueSettings).where(eq(gmLeagueSettings.leagueId, leagueId));
}

describe("Sleeper workbook parser", () => {
  it("loads a minimal v8 workbook successfully", () => {
    const buffer = buildMinimalV8WorkbookBuffer();
    const parsed = parseWorkbookBytes(buffer);
    expect(parsed.version).toBe("v8");
    expect(parsed.info.year).toBe(2025);
    expect(getSheet(parsed, "Users").length).toBeGreaterThan(1);
  });

  it("detects required worksheets", () => {
    const parsed = parseWorkbookBytes(buildMinimalV8WorkbookBuffer());
    const validation = validateSleeperWorkbookV8(parsed);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("maps workbook to UniversalLeague", () => {
    const { league } = importSleeperWorkbookFromBuffer(buildMinimalV8WorkbookBuffer());
    expect(league.settings.provider).toBe("sleeper_workbook");
    expect(league.settings.season).toBe(2025);
    expect(league.teams).toHaveLength(2);
    expect(league.matchups).toHaveLength(1);
    expect(league.draftPicks).toHaveLength(2);
    expect(league.transactions).toHaveLength(1);
    expect(league.teams[0]?.ownerId).toBe("user_a_id");
  });

  it("validation catches missing required tabs", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Username", "x"],
        ["Year", 2025],
        ["Through Week", 1],
        ["League", "Broken"],
      ]),
      "Info",
    );
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => parseWorkbookBytes(buffer)).toThrow("unsupported_workbook_version");
  });

  it("rejects structurally invalid workbooks missing Users", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Username", "x"],
        ["Year", 2025],
        ["Through Week", 1],
        ["League", "Broken"],
      ]),
      "Info",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["/display_name", "/user_id"]]), "Users");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Roster ID", "Owner", "Team Name"]]), "Roster Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Season"]]), "Leagues");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["/name"]]), "Settings");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Week"]]), "Weekly Results");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Round"]]), "Draft Result");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseWorkbookBytes(buffer);
    const validation = validateSleeperWorkbookV8(parsed);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("Users"))).toBe(true);
  });
});

describe("Sleeper workbook import persistence", { timeout: 60_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    dbAvailable = db != null;
    if (dbAvailable) await cleanupWorkbookTestData(MINIMAL_LEAGUE_ID);
  });

  afterEach(async () => {
    if (dbAvailable) await cleanupWorkbookTestData(MINIMAL_LEAGUE_ID);
  });

  it("imports through persistUniversalLeague successfully", async () => {
    if (!dbAvailable) return;
    const buffer = buildMinimalV8WorkbookBuffer();
    const { league } = importSleeperWorkbookFromBuffer(buffer);
    const result = await persistUniversalLeague(league, { dryRun: false });
    expect(result.failures).toHaveLength(0);
    expect(result.counts.teams.persisted).toBe(2);
    expect(result.counts.matchups.persisted).toBe(1);
    expect(result.counts.draftPicks.persisted).toBe(2);
  });

  it("re-import is idempotent", async () => {
    if (!dbAvailable) return;
    const fileBase64 = buildMinimalV8WorkbookBuffer().toString("base64");
    await runSleeperWorkbookImport({ userId: TEST_USER_ID, fileBase64 });
    const before = await countUniversalPersistRows(MINIMAL_LEAGUE_ID, MINIMAL_SEASON);
    await runSleeperWorkbookImport({ userId: TEST_USER_ID, fileBase64 });
    const after = await countUniversalPersistRows(MINIMAL_LEAGUE_ID, MINIMAL_SEASON);
    expect(after).toEqual(before);
  });

  it("career report recognizes imported season after team selection", async () => {
    if (!dbAvailable) return;
    const fileBase64 = buildMinimalV8WorkbookBuffer().toString("base64");
    await runSleeperWorkbookImport({ userId: TEST_USER_ID, fileBase64 });
    await selectWorkbookTeam(MINIMAL_LEAGUE_ID);
    const report = await computeCareerReport(TEST_USER_ID, "id:user_a_id");
    expect(report.timeline.some((t) => t.season === MINIMAL_SEASON)).toBe(true);
  });

  it("rivalry and H2H work for imported workbook league", async () => {
    if (!dbAvailable) return;
    const fileBase64 = buildMinimalV8WorkbookBuffer().toString("base64");
    await runSleeperWorkbookImport({ userId: TEST_USER_ID, fileBase64 });
    await selectWorkbookTeam(MINIMAL_LEAGUE_ID);

    const h2h = await buildH2HAuthority(MINIMAL_LEAGUE_ID);
    expect(h2h.opponentsOf("id:user_a_id")).toContain("id:user_b_id");
    const pair = h2h.getH2H("id:user_a_id", "id:user_b_id");
    expect(pair.career.games).toBe(1);
  });

  it("owner profile authority resolves imported owners", async () => {
    if (!dbAvailable) return;
    const fileBase64 = buildMinimalV8WorkbookBuffer().toString("base64");
    await runSleeperWorkbookImport({ userId: TEST_USER_ID, fileBase64 });
    const authority = await buildOwnerIdentityAuthority(MINIMAL_LEAGUE_ID);
    const resolved = authority.resolve(MINIMAL_SEASON, 1);
    expect(resolved.status).toBe("resolved");
    expect(resolved.canonicalPersonId).toBe("id:user_a_id");
  });
});

describe("Sleeper workbook reference fixture", () => {
  const fixturePath = resolveFixturePath();

  it("audits the supplied v8 workbook", () => {
    if (!fixturePath) return;
    const buffer = fs.readFileSync(fixturePath);
    const parsed = parseWorkbookBytes(buffer);
    const audit = listWorkbookAudit(parsed);
    expect(audit.length).toBeGreaterThan(10);
    expect(audit.some((s) => s.name === "Draft Result" && s.mapsTo === "draftPicks")).toBe(true);
  });

  it("previews the supplied workbook with expected counts", () => {
    if (!fixturePath) return;
    const preview = previewSleeperWorkbook(fs.readFileSync(fixturePath));
    expect(preview.valid).toBe(true);
    expect(preview.season).toBe(2026);
    expect(preview.teamCount).toBe(12);
    expect(preview.ownerCount).toBeGreaterThanOrEqual(12);
    expect(preview.draftPickCount).toBe(60);
    expect(preview.transactionCount).toBeGreaterThan(100);
    expect(preview.matchupCount).toBeGreaterThan(0);
  });
});
