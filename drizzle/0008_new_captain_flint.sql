CREATE TABLE `fantasy_data_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fantasy_data_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fantasy_cache_key` UNIQUE(`cacheKey`)
);
