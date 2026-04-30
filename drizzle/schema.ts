import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  index,
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
  (t) => [index("idx_season_view").on(t.season, t.viewName)]
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
