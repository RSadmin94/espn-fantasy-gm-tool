/**
 * Yahoo league import orchestration — OAuth pending tokens → UniversalLeague → gm_*.
 * Mirrors the Sleeper import sink without changing ESPN/Sleeper paths.
 */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { decryptCredentialsFromDb, encryptCredentialsForDb } from "./_core/crypto";
import { invokeLLM } from "./_core/llm";
import { getDb, reconcileActiveLeague, setActiveLeagueForUser } from "./db";
import { gmTeams, leagueConnections } from "../drizzle/schema";
import { assertCanConnectLeague } from "./connectedLeagueLimits";
import { YahooAdapter } from "./providers/yahooAdapter";
import {
  persistUniversalLeague,
  type PersistUniversalLeagueResult,
} from "./universalPersistence";

export type YahooTokenCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type YahooImportFailureCode =
  | "no_db"
  | "no_pending_auth"
  | "invalid_credentials"
  | "fetch_failed"
  | "persist_failed"
  | "connection_failed";

export type YahooLeagueImportResult =
  | {
      success: true;
      steps: string[];
      league: {
        leagueId: string;
        leagueName: string;
        season: number;
        teamCount: number;
        scoringType: string;
        currentWeek: number;
        provider: "yahoo";
      };
      persist: PersistUniversalLeagueResult;
      teams: Array<{
        teamId: number;
        ownerId: string | null;
        ownerName: string;
        teamName: string;
      }>;
      matchupCount: number;
      transactionCount: number;
      draftPickCount: number;
      dnaProfile: unknown;
      warnings: string[];
    }
  | {
      success: false;
      code: YahooImportFailureCode;
      message: string;
      steps: string[];
    };

function asYahooTokens(raw: Record<string, unknown> | null): YahooTokenCredentials | null {
  if (!raw) return null;
  const accessToken = typeof raw.accessToken === "string" ? raw.accessToken : "";
  const refreshToken = typeof raw.refreshToken === "string" ? raw.refreshToken : "";
  const expiresAt = Number(raw.expiresAt);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) return null;
  return { accessToken, refreshToken, expiresAt };
}

/** Read Yahoo OAuth tokens from the pending league_connections row. */
export async function readYahooPendingCredentials(
  userId: number,
): Promise<YahooTokenCredentials | null> {
  const database = await getDb();
  if (!database) return null;

  const rows = await database
    .select()
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, "yahoo"),
        eq(leagueConnections.leagueId, "__pending__"),
      ),
    )
    .limit(1);

  if (!rows.length) return null;
  return asYahooTokens(decryptCredentialsFromDb(rows[0].credentials));
}

export async function writeYahooPendingCredentials(
  userId: number,
  tokens: YahooTokenCredentials,
  season: number = new Date().getFullYear(),
): Promise<void> {
  const database = await getDb();
  if (!database) return;

  const encrypted = encryptCredentialsForDb({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });

  await database
    .insert(leagueConnections)
    .values({
      userId,
      provider: "yahoo",
      leagueId: "__pending__",
      leagueName: "Pending Yahoo Connection",
      season,
      isActive: false,
      credentials: encrypted,
      syncStatus: "pending",
    })
    .onDuplicateKeyUpdate({
      set: {
        credentials: encrypted,
        syncStatus: "pending",
        updatedAt: new Date(),
      },
    });
}

function customerImportMessage(code: YahooImportFailureCode): string {
  switch (code) {
    case "no_db":
      return "We couldn't reach the database. Please try again in a moment.";
    case "no_pending_auth":
      return "Yahoo authorization was not found. Please connect Yahoo again.";
    case "invalid_credentials":
      return "Yahoo authorization expired or is invalid. Please connect Yahoo again.";
    case "fetch_failed":
      return "We couldn't load this Yahoo league. Please try again.";
    case "persist_failed":
      return "We imported the league but couldn't save it. Please try again.";
    case "connection_failed":
      return "We couldn't save your Yahoo connection. Please try again.";
    default:
      return "Yahoo import failed. Please try again.";
  }
}

function fail(
  code: YahooImportFailureCode,
  steps: string[],
  message?: string,
): YahooLeagueImportResult {
  return {
    success: false,
    code,
    message: message ?? customerImportMessage(code),
    steps,
  };
}

function toNumericTeamId(raw: string | number): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Import one Yahoo league through the shared UniversalLeague → gm_* pipeline.
 * Preserves DNA profile generation on the league_connections row.
 */
export async function runYahooLeagueImport(args: {
  userId: number;
  leagueId: string;
  leagueName?: string;
  season: number;
  dryRun?: boolean;
}): Promise<YahooLeagueImportResult> {
  const steps: string[] = [];
  const dryRun = Boolean(args.dryRun);
  const leagueId = String(args.leagueId ?? "").trim();
  if (!leagueId) {
    return fail("fetch_failed", steps, "A Yahoo league ID is required.");
  }

  try {
    await assertCanConnectLeague(args.userId, "yahoo", leagueId);
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw err;
  }

  const database = await getDb();
  if (!database) return fail("no_db", steps);

  const creds = await readYahooPendingCredentials(args.userId);
  if (!creds) return fail("no_pending_auth", steps);
  if (!creds.accessToken) return fail("invalid_credentials", steps);

  steps.push("Connecting to Yahoo Fantasy…");

  const adapter = new YahooAdapter(
    {
      leagueId,
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
    },
    async (newTokens) => {
      await writeYahooPendingCredentials(args.userId, {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt,
      });
    },
  );

  steps.push(`Fetching league data for ${args.leagueName || leagueId}…`);
  let league;
  try {
    league = await adapter.fetchAndNormalize(leagueId, args.season);
  } catch (err) {
    console.error("[YahooImport] fetchAndNormalize failed:", err);
    return fail("fetch_failed", steps);
  }

  steps.push(
    `Found league: ${league.settings.leagueName} (${league.teams.length} teams)`,
  );

  const warnings: string[] = [];
  if (league.matchups.length === 0) {
    warnings.push("Matchups unavailable for this Yahoo season snapshot.");
  }
  if (league.transactions.length === 0) {
    warnings.push("Transactions unavailable for this Yahoo season snapshot.");
  }
  if (league.draftPicks.length === 0) {
    warnings.push("Draft results unavailable for this Yahoo season snapshot.");
  }

  steps.push("Saving normalized league data…");
  let persist: PersistUniversalLeagueResult;
  try {
    persist = await persistUniversalLeague(league, { dryRun });
    if (persist.failures.length > 0 && persist.counts.teams.persisted === 0) {
      return fail("persist_failed", steps);
    }
    for (const f of persist.failures) {
      warnings.push(`${f.entity}: ${f.message}`);
    }
    warnings.push(...persist.warnings);
  } catch (err) {
    console.error("[YahooImport] persistUniversalLeague failed:", err);
    return fail("persist_failed", steps);
  }

  steps.push("Analyzing roster compositions…");
  steps.push("Detecting behavioral patterns…");

  const txByTeam = new Map<string, number>();
  for (const tx of league.transactions) {
    txByTeam.set(tx.teamId, (txByTeam.get(tx.teamId) || 0) + 1);
  }
  const tradesByTeam = new Map<string, number>();
  for (const tx of league.transactions.filter((t) => t.type === "TRADE")) {
    tradesByTeam.set(tx.teamId, (tradesByTeam.get(tx.teamId) || 0) + 1);
  }

  steps.push("Generating League DNA Profile…");
  const teamSummaries = league.teams
    .map((t) => {
      const trades = tradesByTeam.get(t.teamId) || 0;
      const moves = txByTeam.get(t.teamId) || 0;
      return `${t.ownerName} (${t.wins}-${t.losses}, ${t.pointsFor} PF): ${trades} trades, ${moves} total moves`;
    })
    .join("\n");

  let dnaProfile: unknown = null;
  try {
    const dnaResponse = await invokeLLM({
      messages: [
        {
          role: "system" as const,
          content:
            "You are an expert fantasy football analyst. Analyze this Yahoo Fantasy league and provide a DNA profile for each manager. For each manager, identify their archetype from: Aggressive Trader, Waiver Hawk, Draft & Hold, Contrarian, Reactive, Balanced, or Data-Driven. Return JSON matching the provided schema.",
        },
        {
          role: "user" as const,
          content: `League: ${league.settings.leagueName} (${league.settings.season} season, ${league.settings.scoringType} scoring)\nTeams and activity:\n${teamSummaries}\n\nGenerate the DNA profile.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "league_dna",
          strict: true,
          schema: {
            type: "object",
            properties: {
              leagueName: { type: "string" },
              season: { type: "number" },
              provider: { type: "string" },
              teamProfiles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    teamId: { type: "string" },
                    ownerName: { type: "string" },
                    archetype: { type: "string" },
                    archetypeReason: { type: "string" },
                    desperationScore: { type: "number" },
                    exploitabilityScore: { type: "number" },
                    keyTrait: { type: "string" },
                  },
                  required: [
                    "teamId",
                    "ownerName",
                    "archetype",
                    "archetypeReason",
                    "desperationScore",
                    "exploitabilityScore",
                    "keyTrait",
                  ],
                  additionalProperties: false,
                },
              },
              leagueSummary: { type: "string" },
            },
            required: ["leagueName", "season", "provider", "teamProfiles", "leagueSummary"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = dnaResponse.choices?.[0]?.message?.content;
    const dnaContent = typeof rawContent === "string" ? rawContent : null;
    try {
      dnaProfile = JSON.parse(dnaContent || "{}");
    } catch {
      dnaProfile = null;
      warnings.push("League DNA profile could not be parsed; league data was still saved.");
    }
  } catch (err) {
    console.warn("[YahooImport] DNA generation skipped:", err);
    warnings.push("League DNA profile unavailable; league data was still saved.");
  }

  steps.push("League DNA Profile complete.");

  const adapterCreds = (
    adapter as unknown as { credentials: YahooTokenCredentials }
  ).credentials;
  const encryptedYahooCreds = encryptCredentialsForDb({
    accessToken: adapterCreds.accessToken,
    refreshToken: adapterCreds.refreshToken,
    expiresAt: adapterCreds.expiresAt,
  });

  if (!dryRun) {
    try {
      await database
        .insert(leagueConnections)
        .values({
          userId: args.userId,
          provider: "yahoo",
          leagueId,
          leagueName: league.settings.leagueName,
          season: args.season,
          isActive: true,
          credentials: encryptedYahooCreds,
          syncStatus: "ok",
          dnaProfile,
          lastSyncedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            leagueName: league.settings.leagueName,
            isActive: true,
            credentials: encryptedYahooCreds,
            syncStatus: "ok",
            dnaProfile,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      await reconcileActiveLeague(args.userId);
    } catch (err) {
      console.error("[YahooImport] leagueConnections upsert failed:", err);
      return fail("connection_failed", steps);
    }
  }

  const teams = league.teams
    .map((t) => {
      const teamId = toNumericTeamId(t.teamId);
      if (teamId == null) return null;
      return {
        teamId,
        ownerId: t.ownerId ?? null,
        ownerName: t.ownerName,
        teamName: t.teamName,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  return {
    success: true,
    steps,
    league: {
      leagueId,
      leagueName: league.settings.leagueName,
      season: league.settings.season,
      teamCount: league.teams.length,
      scoringType: league.settings.scoringType,
      currentWeek: league.settings.currentWeek,
      provider: "yahoo",
    },
    persist,
    teams,
    matchupCount: league.matchups.length,
    transactionCount: league.transactions.length,
    draftPickCount: league.draftPicks.length,
    dnaProfile,
    warnings,
  };
}

export type SelectYahooTeamResult =
  | { success: true; leagueConnectionId: number; isSetupComplete: true }
  | { success: false; code: "no_db" | "connection_not_found" | "team_not_found"; message: string };

export async function runSelectYahooTeam(args: {
  userId: number;
  leagueId: string;
  teamId: number;
  ownerName?: string;
}): Promise<SelectYahooTeamResult> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      code: "no_db",
      message: "We couldn't reach the database. Please try again.",
    };
  }

  const leagueId = args.leagueId.trim();
  const [conn] = await db
    .select()
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, "yahoo"),
        eq(leagueConnections.leagueId, leagueId),
      ),
    )
    .limit(1);

  if (!conn) {
    return {
      success: false,
      code: "connection_not_found",
      message: "That Yahoo league connection was not found.",
    };
  }

  const season = conn.season;
  if (season == null) {
    return {
      success: false,
      code: "connection_not_found",
      message: "That Yahoo league connection is incomplete.",
    };
  }

  const [team] = await db
    .select({
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
    })
    .from(gmTeams)
    .where(
      and(
        eq(gmTeams.leagueId, leagueId),
        eq(gmTeams.season, season),
        eq(gmTeams.teamId, args.teamId),
      ),
    )
    .limit(1);

  if (!team) {
    return {
      success: false,
      code: "team_not_found",
      message: "That team was not found in the imported Yahoo league.",
    };
  }

  await db
    .update(leagueConnections)
    .set({
      selectedTeamId: args.teamId,
      selectedOwnerKey: `yahoo:team:${args.teamId}`,
      selectedOwnerName: args.ownerName || team.ownerName || null,
      selectedFranchiseName: team.name || null,
      selectedSeason: season,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(leagueConnections.id, conn.id));

  await setActiveLeagueForUser(args.userId, conn.id);
  await reconcileActiveLeague(args.userId);

  return { success: true, leagueConnectionId: conn.id, isSetupComplete: true };
}

/** Map Yahoo API/discovery errors to customer-readable copy (no tokens/raw dumps). */
export function yahooDiscoveryCustomerError(raw: string | null | undefined): string {
  const msg = String(raw ?? "").toLowerCase();
  if (!msg) return "We couldn't load your Yahoo leagues. Please try again.";
  if (msg.includes("authorization") || msg.includes("credential") || msg.includes("token")) {
    return "Yahoo authorization expired or is invalid. Please connect Yahoo again.";
  }
  if (msg.includes("database")) {
    return "We couldn't reach the database. Please try again in a moment.";
  }
  return "We couldn't load your Yahoo leagues. Please try again.";
}
