ALTER TABLE `usage_events` ADD `eventType` varchar(32);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `page` varchar(256);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `action` varchar(128);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `sessionId` varchar(64);--> statement-breakpoint
CREATE INDEX `idx_ue_event_type` ON `usage_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `idx_ue_session` ON `usage_events` (`sessionId`);