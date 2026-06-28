-- Conversion funnel events (rivalry-wall beta instrumentation).
-- Idempotent: safe if drizzle-kit journal already created this on a dev DB.
CREATE TABLE IF NOT EXISTS `funnel_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NULL,
  `event` varchar(64) NOT NULL,
  `metadata` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `funnel_events_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_fe_userId` ON `funnel_events` (`userId`);
CREATE INDEX `idx_fe_event` ON `funnel_events` (`event`);
CREATE INDEX `idx_fe_createdAt` ON `funnel_events` (`createdAt`);
