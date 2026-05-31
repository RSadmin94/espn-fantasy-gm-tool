import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.query(`
  CREATE TABLE IF NOT EXISTS league_wire_articles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    leagueId    VARCHAR(20)  NOT NULL,
    season      INT          NOT NULL,
    articleType VARCHAR(60)  NOT NULL,
    slug        VARCHAR(320) NOT NULL,
    category    VARCHAR(50)  NOT NULL DEFAULT 'archive',
    headline    VARCHAR(500) NOT NULL,
    subheadline VARCHAR(500),
    body        LONGTEXT     NOT NULL,
    byline      VARCHAR(200),
    evidenceJson JSON,
    isPredicted TINYINT(1)  NOT NULL DEFAULT 0,
    status      VARCHAR(20)  NOT NULL DEFAULT 'published',
    createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_article_slug (leagueId, slug),
    INDEX idx_lwa_season_type (leagueId, season, articleType),
    INDEX idx_lwa_category (leagueId, category, season)
  )
`);
console.log("✓ league_wire_articles table created");

// Verify
const [[cnt]] = await conn.query("SELECT COUNT(*) AS c FROM league_wire_articles");
console.log("Rows:", cnt.c);

await conn.end();
