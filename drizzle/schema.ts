import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Cache raw ESPN API JSON payloads per season + view
export const espnSeasonCache = mysqlTable(
  "espn_season_cache",
  {
    id: int("id").autoincrement().primaryKey(),
    season: int("season").notNull(),
    viewName: varchar("viewName", { length: 64 }).notNull(),
    payload: json("payload").notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    // unique constraint enables onDuplicateKeyUpdate to work as a true upsert
    uniqueIndex("uq_season_view").on(t.season, t.viewName),
  ]
);

export type EspnSeasonCache = typeof espnSeasonCache.$inferSelect;

// Track when each season was last refreshed
export const refreshManifest = mysqlTable("refresh_manifest", {
  id: int("id").autoincrement().primaryKey(),
  season: int("season").notNull().unique(),
  lastRefreshedAt: timestamp("lastRefreshedAt").defaultNow().notNull(),
  viewsRefreshed: json("viewsRefreshed"),
  teamCount: int("teamCount"),
  rosterCount: int("rosterCount"),
  matchupCount: int("matchupCount"),
  draftPickCount: int("draftPickCount"),
  transactionCount: int("transactionCount"),
  status: mysqlEnum("status", ["success", "partial", "failed"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
});

export type RefreshManifest = typeof refreshManifest.$inferSelect;

// AI GM Advisor chat history
export const chatHistory = mysqlTable("chat_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  season: int("season"),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatHistory = typeof chatHistory.$inferSelect;

// Draft pick trade log — tracks picks acquired/traded away for a given draft year
export const pickTrades = mysqlTable(
  "pick_trades",
  {
    id: int("id").autoincrement().primaryKey(),
    draftYear: int("draftYear").notNull().default(2026),
    type: mysqlEnum("type", ["acquired", "traded_away"]).notNull(),
    round: int("round").notNull(),
    pickInRound: int("pickInRound").notNull(),
    label: varchar("label", { length: 8 }).notNull(),
    counterparty: varchar("counterparty", { length: 128 }).notNull(),
    notes: text("notes"),
    pickValue: int("pickValue").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_pick_trades_year").on(t.draftYear)]
);

export type PickTrade = typeof pickTrades.$inferSelect;
export type InsertPickTrade = typeof pickTrades.$inferInsert;

// Per-view health tracking for the ESPN data pipeline
export const espnViewHealth = mysqlTable(
  "espn_view_health",
  {
    id: int("id").autoincrement().primaryKey(),
    season: int("season").notNull(),
    viewName: varchar("viewName", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["ok", "error", "stale", "empty"]).notNull().default("ok"),
    errorMessage: text("errorMessage"),
    recordCount: int("recordCount"),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_view_health_season_view").on(t.season, t.viewName)]
);

export type EspnViewHealth = typeof espnViewHealth.$inferSelect;
export type InsertEspnViewHealth = typeof espnViewHealth.$inferInsert;

// Per-week player stats cache (targets, snaps, yards, receptions, fantasy points)
export const weeklyPlayerStats = mysqlTable(
  "weekly_player_stats",
  {
    id: int("id").autoincrement().primaryKey(),
    season: int("season").notNull(),
    week: int("week").notNull(),
    playerId: int("playerId").notNull(),
    playerName: varchar("playerName", { length: 128 }).notNull(),
    position: varchar("position", { length: 8 }).notNull(),
    proTeam: varchar("proTeam", { length: 8 }).notNull().default("?"),
    teamId: int("teamId"),
    ownerName: varchar("ownerName", { length: 128 }),
    // Receiving
    targets: int("targets").default(0),
    receptions: int("receptions").default(0),
    receivingYards: int("receivingYards").default(0),
    receivingTDs: int("receivingTDs").default(0),
    // Rushing
    rushingAttempts: int("rushingAttempts").default(0),
    rushingYards: int("rushingYards").default(0),
    rushingTDs: int("rushingTDs").default(0),
    // Passing
    passingAttempts: int("passingAttempts").default(0),
    completions: int("completions").default(0),
    passingYards: int("passingYards").default(0),
    passingTDs: int("passingTDs").default(0),
    interceptions: int("interceptions").default(0),
    // Usage
    snapCount: int("snapCount").default(0),
    snapPct: int("snapPct").default(0), // 0-100
    // Fantasy
    fantasyPoints: int("fantasyPoints").default(0), // stored as points * 100 for precision
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_wps_season_week").on(t.season, t.week),
    index("idx_wps_player_season").on(t.playerId, t.season),
    index("idx_wps_season_week_player").on(t.season, t.week, t.playerId),
  ]
);

export type WeeklyPlayerStats = typeof weeklyPlayerStats.$inferSelect;
export type InsertWeeklyPlayerStats = typeof weeklyPlayerStats.$inferInsert;

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────
export const scheduledJobs = mysqlTable("scheduled_jobs", {
  id: int("id").primaryKey().autoincrement(),
  name: text("name").notNull(),
  description: text("description"),
  cronExpression: text("cronExpression"),
  callbackPath: text("callbackPath"),
  taskUid: text("taskUid"),
  isEnabled: int("isEnabled").default(1).notNull(), // 1=enabled, 0=disabled
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "partial", "failed"]),
  lastRunDetails: text("lastRunDetails"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type InsertScheduledJob = typeof scheduledJobs.$inferInsert;
