-- Idempotent: add transactions.relatedTransactionId when missing (older MySQL has no ADD COLUMN IF NOT EXISTS).
SET @dbname = DATABASE();
SET @tablename = "transactions";
SET @columnname = "relatedTransactionId";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE transactions ADD COLUMN relatedTransactionId varchar(64) NULL AFTER transactionId"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
