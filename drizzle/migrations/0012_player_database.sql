-- P2 Player Intelligence Pipeline
-- Two new canonical tables:
--   gm_player_registry  — canonical player identity (one row per player, ever)
--   gm_weekly_player_stats — canonical weekly fantasy performance (per player per week)
--
-- TiDB-specific notes:
--   • BIGINT AUTO_INCREMENT PRIMARY KEY: TiDB uses a clustered index on PKs by default.
--   • No GENERATED columns: TiDB 5.x support is limited; isStarter computed in app.
--   • No PostgreSQL-only syntax (no SERIAL, no RETURNING, no ON CONFLICT).
--   • All indexes created explicitly after table creation for clarity.
--   • UNIQUE INDEX names prefixed with "uq_", regular indexes with "idx_".

-- ─── Table 1: gm_player_registry ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `gm_player_registry` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `espnPlayerId`     VARCHAR(50)  NULL,
  `sleeperPlayerId`  VARCHAR(50)  NULL,
  `fullName`         VARCHAR(100) NOT NULL,
  `normalizedName`   VARCHAR(100) NOT NULL,
  `position`         VARCHAR(10)  NOT NULL DEFAULT '',
  `currentNflTeam`   VARCHAR(3)   NULL,
  `firstSeasonSeen`  INT          NULL,
  `lastSeasonSeen`   INT          NULL,
  `isActive`         TINYINT(1)   NOT NULL DEFAULT 1,
  `needsReview`      TINYINT(1)   NOT NULL DEFAULT 0,
  `reviewReason`     VARCHAR(255) NULL,
  `createdAt`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gm_player_registry_espn`    (`espnPlayerId`),
  UNIQUE KEY `uq_gm_player_registry_sleeper` (`sleeperPlayerId`),
  KEY `idx_gm_player_registry_norm`     (`normalizedName`),
  KEY `idx_gm_player_registry_position` (`position`),
  KEY `idx_gm_player_registry_active`   (`isActive`),
  KEY `idx_gm_player_registry_review`   (`needsReview`)
);

-- ─── Table 2: gm_weekly_player_stats ─────────────────────────────────────────
-- One row per (playerId, season, week, ownerKey).
-- pointsScored = fantasy points earned in this week under the ownerKey's scoring system.
-- rosterSlotId: 0=Bench, 1=Starter, 2=IR; unknown slot IDs preserved as-is.
-- isStarter: computed during ingestion from rosterSlotId and lineup slot rules.
-- sourceConfidence: 100.00 = verified ESPN payload; lower if inferred/reconstructed.
CREATE TABLE IF NOT EXISTS `gm_weekly_player_stats` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `playerId`         BIGINT         NOT NULL,
  `season`           INT            NOT NULL,
  `week`             INT            NOT NULL,
  `pointsScored`     DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  `rosterSlotId`     INT            NOT NULL DEFAULT 0,
  `isStarter`        TINYINT(1)     NOT NULL DEFAULT 0,
  `ownerKey`         VARCHAR(50)    NOT NULL,
  `teamId`           INT            NULL,
  `source`           VARCHAR(50)    NOT NULL DEFAULT 'espn',
  `sourceConfidence` DECIMAL(5,2)   NOT NULL DEFAULT 100.00,
  `needsReview`      TINYINT(1)     NOT NULL DEFAULT 0,
  `reviewReason`     VARCHAR(255)   NULL,
  `createdAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gm_wps` (`playerId`, `season`, `week`, `ownerKey`),
  KEY `idx_gm_wps_season_player` (`season`, `playerId`),
  KEY `idx_gm_wps_owner_season`  (`ownerKey`, `season`),
  KEY `idx_gm_wps_season_week`   (`season`, `week`),
  KEY `idx_gm_wps_team_season`   (`teamId`, `season`),
  KEY `idx_gm_wps_review`        (`needsReview`),
  CONSTRAINT `fk_gm_wps_player`
    FOREIGN KEY (`playerId`) REFERENCES `gm_player_registry` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
);
