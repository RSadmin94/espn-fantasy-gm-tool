ALTER TABLE `users` ADD COLUMN `subscriptionPriceId` varchar(128) NULL;
ALTER TABLE `users` ADD COLUMN `subscriptionInterval` enum('month','year') NULL;
ALTER TABLE `users` ADD COLUMN `subscriptionPlan` enum('rivals','league') NULL;
