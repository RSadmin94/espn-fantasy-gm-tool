import {
  int,
  boolean,
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

// ─── Fantasy Data Cache (FantasyPros ECR/ADP + PFR stats) ─────────────────────
export const fantasyDataCache = mysqlTable(
  "fantasy_data_cache",
  {
    id: int("id").primaryKey().autoincrement(),
    cacheKey: varchar("cacheKey", { length: 64 }).notNull(),
    payload: json("payload").notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_fantasy_cache_key").on(t.cacheKey)]
);
export type FantasyDataCache = typeof fantasyDataCache.$inferSelect;
export type InsertFantasyDataCache = typeof fantasyDataCache.$inferInsert;

// ─── Mock Draft Results ───────────────────────────────────────────────────────
export const mockDraftResults = mysqlTable(
  "mock_draft_results",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId").notNull(),
    label: varchar("label", { length: 128 }).notNull().default("Mock Draft"),
    draftSlot: int("draftSlot").notNull(),
    totalTeams: int("totalTeams").notNull().default(14),
    totalRounds: int("totalRounds").notNull().default(15),
    grade: varchar("grade", { length: 4 }).notNull(),
    avgEcr: int("avgEcr").notNull(), // stored * 10 for one decimal precision
    totalVbd: int("totalVbd").notNull().default(0),
    rodPicksJson: json("rodPicksJson").notNull(), // array of DraftPick for Rod's team
    allPicksJson: json("allPicksJson").notNull(), // full 14-team pick list
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mock_draft_user").on(t.userId),
    index("idx_mock_draft_created").on(t.createdAt),
  ]
);
export type MockDraftResult = typeof mockDraftResults.$inferSelect;
export type InsertMockDraftResult = typeof mockDraftResults.$inferInsert;

// ─── ADP Trend Snapshots ─────────────────────────────────────────────────────
// Stores one row per player per fetch so we can compute rising/falling trends
export const adpTrendSnapshots = mysqlTable(
  "adp_trend_snapshots",
  {
    id: int("id").primaryKey().autoincrement(),
    fpId: int("fpId").notNull(),
    playerName: varchar("playerName", { length: 128 }).notNull(),
    position: varchar("position", { length: 8 }).notNull(),
    adp: int("adp"), // stored * 10 for one decimal, null if no ADP
    ecrRank: int("ecrRank").notNull(),
    snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_adp_trend_player").on(t.fpId),
    index("idx_adp_trend_snapshot").on(t.snapshotAt),
  ]
);
export type AdpTrendSnapshot = typeof adpTrendSnapshots.$inferSelect;
export type InsertAdpTrendSnapshot = typeof adpTrendSnapshots.$inferInsert;

// ─── Backtesting: Start/Sit Decisions ────────────────────────────────────────
// Logs each start/sit recommendation with Monte Carlo inputs and actual outcome
export const startSitDecisions = mysqlTable(
  "start_sit_decisions",
  {
    id: int("id").primaryKey().autoincrement(),
    season: int("season").notNull(),
    week: int("week").notNull(),
    // Player A (the one recommended to START)
    playerAName: varchar("playerAName", { length: 128 }).notNull(),
    playerAPosition: varchar("playerAPosition", { length: 8 }).notNull(),
    playerAProjection: int("playerAProjection").notNull(), // * 100 for precision
    playerAFloor: int("playerAFloor").notNull(),           // * 100
    playerACeiling: int("playerACeiling").notNull(),       // * 100
    playerABustPct: int("playerABustPct").notNull(),       // 0-100
    playerAActualPoints: int("playerAActualPoints"),       // * 100, null until resolved
    // Player B (the one recommended to SIT)
    playerBName: varchar("playerBName", { length: 128 }).notNull(),
    playerBPosition: varchar("playerBPosition", { length: 8 }).notNull(),
    playerBProjection: int("playerBProjection").notNull(),
    playerBFloor: int("playerBFloor").notNull(),
    playerBCeiling: int("playerBCeiling").notNull(),
    playerBBustPct: int("playerBBustPct").notNull(),
    playerBActualPoints: int("playerBActualPoints"),
    // Recommendation
    recommendation: mysqlEnum("recommendation", ["A", "B", "TOSS_UP"]).notNull(),
    winProbabilityA: int("winProbabilityA").notNull(), // 0-100
    agentConsensus: int("agentConsensus"),             // 0-100, % of agents agreeing
    aiVerdict: text("aiVerdict"),
    // Outcome (filled in after the week resolves)
    outcome: mysqlEnum("outcome", ["CORRECT", "INCORRECT", "PUSH"]),
    resolvedAt: timestamp("resolvedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ssd_season_week").on(t.season, t.week),
    index("idx_ssd_outcome").on(t.outcome),
  ]
);
export type StartSitDecision = typeof startSitDecisions.$inferSelect;
export type InsertStartSitDecision = typeof startSitDecisions.$inferInsert;

// ─── Backtesting: Trade Decisions ─────────────────────────────────────────────
// Logs each trade evaluation (accepted or rejected) and tracks what-if outcomes
export const tradeDecisions = mysqlTable(
  "trade_decisions",
  {
    id: int("id").primaryKey().autoincrement(),
    season: int("season").notNull(),
    week: int("week").notNull(),
    // Assets
    assetsGiven: json("assetsGiven").notNull(),    // string[]
    assetsReceived: json("assetsReceived").notNull(), // string[]
    // Valuation at decision time
    valueGiven: int("valueGiven").notNull(),       // composite score * 100
    valueReceived: int("valueReceived").notNull(),
    verdict: mysqlEnum("verdict", ["WIN", "FAIR", "LOSS"]).notNull(),
    champDeltaBefore: int("champDeltaBefore"),     // champ % * 100
    champDeltaAfter: int("champDeltaAfter"),
    aiSummary: text("aiSummary"),
    // Rod's actual decision
    rodDecision: mysqlEnum("rodDecision", ["ACCEPTED", "REJECTED", "PENDING"]).notNull().default("PENDING"),
    // Outcome after N weeks (filled in retrospectively)
    outcomeRating: mysqlEnum("outcomeRating", ["GREAT", "GOOD", "NEUTRAL", "BAD", "TERRIBLE"]),
    outcomeNotes: text("outcomeNotes"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_td_season_week").on(t.season, t.week),
    index("idx_td_verdict").on(t.verdict),
    index("idx_td_decision").on(t.rodDecision),
  ]
);
export type TradeDecision = typeof tradeDecisions.$inferSelect;
export type InsertTradeDecision = typeof tradeDecisions.$inferInsert;

// ─── Backtesting: Monte Carlo Calibration ─────────────────────────────────────
// Stores win-probability predictions and actual matchup outcomes for calibration
export const monteCarloCalibration = mysqlTable(
  "monte_carlo_calibration",
  {
    id: int("id").primaryKey().autoincrement(),
    season: int("season").notNull(),
    week: int("week").notNull(),
    teamName: varchar("teamName", { length: 128 }).notNull(),
    opponentName: varchar("opponentName", { length: 128 }).notNull(),
    predictedWinPct: int("predictedWinPct").notNull(), // 0-100
    projectedScore: int("projectedScore").notNull(),   // * 100
    projectedFloor: int("projectedFloor").notNull(),   // * 100
    projectedCeiling: int("projectedCeiling").notNull(), // * 100
    // Actuals (filled after week resolves)
    actualScore: int("actualScore"),                   // * 100
    actualOpponentScore: int("actualOpponentScore"),   // * 100
    actualWon: int("actualWon"),                       // 1=won, 0=lost, null=pending
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mcc_season_week").on(t.season, t.week),
    index("idx_mcc_team").on(t.teamName),
  ]
);
export type MonteCarloCalibration = typeof monteCarloCalibration.$inferSelect;
export type InsertMonteCarloCalibration = typeof monteCarloCalibration.$inferInsert;

// ─── Backtesting: Championship Equity Predictions ─────────────────────────────
// Tracks weekly champ % predictions vs end-of-season reality
export const champEquityPredictions = mysqlTable(
  "champ_equity_predictions",
  {
    id: int("id").primaryKey().autoincrement(),
    season: int("season").notNull(),
    week: int("week").notNull(),
    teamName: varchar("teamName", { length: 128 }).notNull(),
    predictedChampPct: int("predictedChampPct").notNull(), // * 100 for precision
    predictedPlayoffPct: int("predictedPlayoffPct").notNull(),
    currentRank: int("currentRank").notNull(),
    // Actuals (filled at season end)
    actuallyWonChamp: int("actuallyWonChamp"),   // 1=yes, 0=no, null=season ongoing
    actuallyMadePlayoffs: int("actuallyMadePlayoffs"),
    finalRank: int("finalRank"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cep_season_week").on(t.season, t.week),
    index("idx_cep_team").on(t.teamName),
  ]
);
export type ChampEquityPrediction = typeof champEquityPredictions.$inferSelect;
export type InsertChampEquityPrediction = typeof champEquityPredictions.$inferInsert;

// ─── Beat Reporter: Player News Signals ───────────────────────────────────────
// Stores structured signals extracted from ESPN news + injury reports per player
// Each row = one signal extracted from one news item for one player
export const playerNewsSignals = mysqlTable(
  "player_news_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    // Player identification
    playerName: varchar("playerName", { length: 128 }).notNull(),
    espnPlayerId: int("espnPlayerId"),
    nflTeam: varchar("nflTeam", { length: 8 }),
    position: varchar("position", { length: 8 }),
    // Signal classification
    signalType: mysqlEnum("signalType", [
      "role_up",
      "role_down",
      "injury_risk",
      "workload_risk",
      "hidden_opportunity",
      "depth_chart_change",
      "coach_trust_up",
      "coach_trust_down",
      "return_from_injury",
      "neutral",
    ]).notNull(),
    // Signal strength: 0.0 (weak) → 1.0 (strong)
    magnitude: int("magnitude").notNull().default(50), // stored as 0–100 integer
    // Projection impact: applied as multiplier in Monte Carlo (-25 to +25, stored as integer %)
    projectionImpactPct: int("projectionImpactPct").notNull().default(0),
    // LLM-generated one-sentence summary of the signal
    summary: text("summary").notNull(),
    // Confidence in signal extraction: 0–100
    confidence: int("confidence").notNull().default(70),
    // Source article metadata
    headline: text("headline"),
    articleDescription: text("articleDescription"),
    sourceType: mysqlEnum("sourceType", ["espn_news", "espn_injury", "rss"]).default("espn_news"),
    publishedAt: timestamp("publishedAt"),
    // Cache control
    cachedAt: timestamp("cachedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (t) => [
    index("idx_pns_player_name").on(t.playerName),
    index("idx_pns_espn_id").on(t.espnPlayerId),
    index("idx_pns_expires").on(t.expiresAt),
    index("idx_pns_signal_type").on(t.signalType),
  ]
);

export type PlayerNewsSignal = typeof playerNewsSignals.$inferSelect;
export type InsertPlayerNewsSignal = typeof playerNewsSignals.$inferInsert;

// ─── GM Decision Memory ────────────────────────────────────────────────────────
// Tracks every decision Rod makes (or ignores) across all tools, with outcomes.
export const gmDecisions = mysqlTable(
  "gm_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    // Which tool generated this decision
    toolSource: mysqlEnum("toolSource", [
      "start_sit",
      "trade_analyzer",
      "waiver_wire",
      "trade_offer",
      "keeper_lab",
      "draft_war_room",
      "manual",
    ]).notNull(),
    // Type of decision
    decisionType: mysqlEnum("decisionType", [
      "start_sit",
      "trade_accept",
      "trade_reject",
      "waiver_add",
      "waiver_pass",
      "keeper_keep",
      "keeper_drop",
      "draft_pick",
      "manual",
    ]).notNull(),
    // Human-readable description of the decision
    description: text("description").notNull(),
    // The AI recommendation (what the tool suggested)
    recommendation: text("recommendation"),
    // Did Rod follow the recommendation?
    followedRecommendation: boolean("followedRecommendation"),
    // Did Rod accept or reject the action (e.g. made the trade vs passed)
    accepted: boolean("accepted").notNull().default(true),
    // Key players / assets involved (JSON array of strings)
    playersInvolved: text("playersInvolved"), // JSON: string[]
    // Opponent / counterparty name if applicable
    counterparty: varchar("counterparty", { length: 128 }),
    // The full AI context/analysis at time of decision (for retrospective)
    aiContext: text("aiContext"),
    // Season and week context
    season: int("season").notNull(),
    weekNum: int("weekNum"),
    // Outcome tracking (filled in later)
    outcome: mysqlEnum("outcome", [
      "correct",
      "incorrect",
      "neutral",
      "pending",
    ]).notNull().default("pending"),
    // Outcome score: -100 to +100 (negative = bad outcome, positive = good)
    outcomeScore: int("outcomeScore"),
    // Free-text outcome notes
    outcomeNotes: text("outcomeNotes"),
    // When the outcome was resolved
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_gmd_tool").on(t.toolSource),
    index("idx_gmd_type").on(t.decisionType),
    index("idx_gmd_season_week").on(t.season, t.weekNum),
    index("idx_gmd_outcome").on(t.outcome),
    index("idx_gmd_created").on(t.createdAt),
  ]
);
export type GmDecision = typeof gmDecisions.$inferSelect;
export type InsertGmDecision = typeof gmDecisions.$inferInsert;

// Tags for filtering decisions by player, team, or topic
export const gmDecisionTags = mysqlTable(
  "gm_decision_tags",
  {
    id: int("id").autoincrement().primaryKey(),
    decisionId: int("decisionId").notNull(),
    tag: varchar("tag", { length: 128 }).notNull(),
  },
  (t) => [
    index("idx_gmdt_decision").on(t.decisionId),
    index("idx_gmdt_tag").on(t.tag),
  ]
);
export type GmDecisionTag = typeof gmDecisionTags.$inferSelect;
export type InsertGmDecisionTag = typeof gmDecisionTags.$inferInsert;
