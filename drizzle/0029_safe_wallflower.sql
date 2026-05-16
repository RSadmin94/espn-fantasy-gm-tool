CREATE TABLE `scraped_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeKey` varchar(128) NOT NULL,
	`season` int NOT NULL,
	`executedAt` bigint NOT NULL,
	`sideAJson` text NOT NULL,
	`sideBJson` text NOT NULL,
	`rawJson` text,
	`scrapedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scraped_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_st_tradeKey` ON `scraped_trades` (`tradeKey`);--> statement-breakpoint
CREATE INDEX `idx_st_season` ON `scraped_trades` (`season`);--> statement-breakpoint
CREATE INDEX `idx_st_executedAt` ON `scraped_trades` (`executedAt`);