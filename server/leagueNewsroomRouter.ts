/**
 * leagueNewsroomRouter.ts
 *
 * Preseason Newsroom (4A) + Championship March Archive (4B).
 * All articles are LLM-generated from verified DB evidence.
 * Generated articles are cached in league_wire_articles table.
 *
 * Article types:
 *   championship_march   — season-long journey of the champion
 *   keeper_preview       — predicted keepers before draft
 *   roster_construction  — per-owner roster needs
 *   season_archive       — index page per season
 */

import { z }                       from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb }                   from "./db";
import { sql as drizzleSql }       from "drizzle-orm";
import { invokeLLM }               from "./_core/llm";
import { buildChampionshipEvidence } from "./leagueNewsroomEvidence";

const LEAGUE_ID = "457622";
const LEAGUE_NAME = "ATLANTAS FINEST FF";

// ── LLM prompt templates ──────────────────────────────────────────────────────

const NEWSROOM_SYSTEM = `You are the official sports journalist and historian for ${LEAGUE_NAME}, a private fantasy football league that has been running since 2010.

Write in the voice of ESPN The Magazine, The Athletic, or Sports Illustrated — passionate, specific, narrative-driven.

ABSOLUTE RULES — NEVER VIOLATE:
1. Use ONLY data provided in the [EVIDENCE] block. Every claim must trace back to a specific evidence field.
2. Do NOT invent player stats, trade rumors, fantasy point totals, or rankings not in the evidence.
3. Do NOT fabricate quotes from owners.
4. If evidence fields are marked [NOT AVAILABLE], acknowledge the gap naturally and move on.
5. Write as if you have personal knowledge of this league's history and rivalries.
6. Be specific about names, scores, margins — all from the evidence.
7. Articles should feel like they were written by someone who watched every game.`;

// ── Article generator ─────────────────────────────────────────────────────────

async function generateArticle(params: {
  articleType: string;
  headline: string;
  systemExtra?: string;
  evidenceJson: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ body: string; headline: string }> {
  const { articleType, headline, evidenceJson, maxTokens = 1800, systemExtra } = params;

  const systemPrompt = NEWSROOM_SYSTEM + (systemExtra ? `\n\n${systemExtra}` : "");

  const evidenceBlock = JSON.stringify(evidenceJson, null, 2);

  const userPrompt = `Generate a ${articleType} article for ${LEAGUE_NAME}.

[ARTICLE TYPE]: ${articleType}
[SUGGESTED HEADLINE]: ${headline}

[EVIDENCE]:
${evidenceBlock}

Write the full article. Structure:
1. A punchy, specific headline (you may improve on the suggested one)
2. Subheadline (1 sentence)
3. Dateline: "ATLANTA FINEST FF LEAGUE WIRE — [Season] SEASON"
4. Article body (3-5 paragraphs)
5. Evidence citations at end: "Evidence: [list key data points used]"

Format output as JSON:
{
  "headline": "...",
  "subheadline": "...",
  "byline": "League Wire Staff",
  "dateline": "...",
  "body": "...",
  "evidence": ["...", "..."]
}`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    maxTokens,
    callType: "retrospective",
    temperature: 0.7,
  });

  const raw = result.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c: any) => c.text ?? "").join("") : "";

  // Strip JSON fences
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      headline: parsed.headline ?? headline,
      body: [
        `**${parsed.headline ?? headline}**`,
        parsed.subheadline ? `*${parsed.subheadline}*` : "",
        parsed.dateline ? `${parsed.dateline}` : "",
        "",
        parsed.body ?? "",
        "",
        parsed.evidence?.length ? `**Evidence:** ${parsed.evidence.join(" · ")}` : "",
      ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n"),
    };
  } catch {
    // Fall back to raw text
    return { headline, body: text };
  }
}

// ── Save article to DB ────────────────────────────────────────────────────────

async function saveArticle(db: any, params: {
  season: number; articleType: string; slug: string; category: string;
  headline: string; subheadline?: string; body: string; byline?: string;
  evidenceJson?: Record<string, unknown>; isPredicted?: boolean;
}) {
  const ev = params.evidenceJson ? JSON.stringify(params.evidenceJson) : null;
  await db.execute(drizzleSql`
    INSERT INTO league_wire_articles
      (leagueId, season, articleType, slug, category, headline, subheadline, body, byline, evidenceJson, isPredicted)
    VALUES
      (${LEAGUE_ID}, ${params.season}, ${params.articleType}, ${params.slug}, ${params.category},
       ${params.headline}, ${params.subheadline ?? null}, ${params.body}, ${params.byline ?? "League Wire Staff"},
       ${ev}, ${params.isPredicted ? 1 : 0})
    ON DUPLICATE KEY UPDATE
      headline     = ${params.headline},
      subheadline  = ${params.subheadline ?? null},
      body         = ${params.body},
      evidenceJson = ${ev},
      updatedAt    = NOW()
  `);
}

// ── Router ────────────────────────────────────────────────────────────────────

export const leagueNewsroomRouter = router({

  /** Available seasons for the archive */
  getArchiveSeasons: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(drizzleSql`
        SELECT DISTINCT season FROM league_medals
        WHERE leagueId = ${LEAGUE_ID}
        ORDER BY season DESC
      `) as unknown as [any[]];
      return (rows as any[]).map(r => Number(r.season));
    }),

  /** Articles for a season (from cache) */
  getSeasonArticles: publicProcedure
    .input(z.object({ season: z.number().int(), category: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(drizzleSql`
        SELECT id, season, articleType, slug, category, headline, subheadline, body, byline, isPredicted, createdAt
        FROM league_wire_articles
        WHERE leagueId = ${LEAGUE_ID} AND season = ${input.season}
        ${input.category ? drizzleSql`AND category = ${input.category}` : drizzleSql``}
        ORDER BY FIELD(articleType,'championship_march','season_summary','keeper_preview','roster_construction') ASC, createdAt DESC
      `) as unknown as [any[]];
      return rows as any[];
    }),

  /** All articles across all seasons for the newsroom feed */
  getNewsroomFeed: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(drizzleSql`
        SELECT id, season, articleType, slug, category, headline, subheadline, body, byline, isPredicted, createdAt
        FROM league_wire_articles
        WHERE leagueId = ${LEAGUE_ID} AND status = 'published'
        ORDER BY season DESC, createdAt DESC
        LIMIT ${input.limit}
      `) as unknown as [any[]];
      return rows as any[];
    }),

  /** Generate Championship March article for a season */
  generateChampionshipMarch: publicProcedure
    .input(z.object({ season: z.number().int().min(2010).max(2030) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };

      const { season } = input;
      const slug = `championship-march-${season}`;

      // Check cache first
      const [existing] = await db.execute(drizzleSql`
        SELECT id, headline FROM league_wire_articles
        WHERE leagueId = ${LEAGUE_ID} AND slug = ${slug}
      `) as unknown as [any[]];
      if ((existing as any[]).length > 0) {
        return { ok: true, cached: true, id: (existing as any[])[0].id };
      }

      // Build evidence
      const evidence = await buildChampionshipEvidence(db, season);
      if (!evidence) return { ok: false, error: `No data found for season ${season}` };

      // Prepare compact evidence for LLM (trim large arrays)
      const llmEvidence = {
        season,
        champion:     evidence.champion,
        runnerUp:     evidence.runnerUp,
        thirdPlace:   evidence.thirdPlace,
        championRegularSeasonRecord: evidence.regularSeason.championRecord,
        biggestWin:   evidence.regularSeason.biggestWin,
        closestEscape: evidence.regularSeason.closestEscape,
        weekHighScore: evidence.regularSeason.weekHighScore,
        weeksWon:     evidence.regularSeason.weeksLed,
        playoffPath:  evidence.playoffs.championPath,
        championshipGame: evidence.playoffs.championshipGame,
        standingsTop5: evidence.regularSeason.records.slice(0, 5).map(r => ({
          name: r.name, owner: r.owner, wins: r.wins, losses: r.losses
        })),
        topRivalries: evidence.rivalries.slice(0, 3),
        dataAvailability: evidence.dataAvailability,
      };

      const suggestedHeadline = `The ${season} Championship Run of ${evidence.champion.name}`;

      const systemExtra = `This is a Championship March article — the definitive account of how one team won the ${season} ${LEAGUE_NAME} championship. Write it like a retrospective feature. Glorify the journey. Acknowledge the competition. Note the key moments that defined the season. If playoff or draft data is missing, note this but do not fabricate it.`;

      const { headline, body } = await generateArticle({
        articleType: "championship_march",
        headline: suggestedHeadline,
        systemExtra,
        evidenceJson: llmEvidence,
        maxTokens: 2000,
      });

      await saveArticle(db, {
        season, articleType: "championship_march", slug, category: "archive",
        headline, body,
        byline: "League Wire Historical Staff",
        evidenceJson: llmEvidence,
        isPredicted: false,
      });

      return { ok: true, cached: false, headline };
    }),

  /** Generate all missing Championship March articles (batch) */
  generateAllChampionshipMarches: publicProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };

      const [seasonRows] = await db.execute(drizzleSql`
        SELECT DISTINCT m.season FROM matchups m
        INNER JOIN league_medals lm ON lm.leagueId = m.leagueId AND lm.season = m.season
        WHERE m.leagueId = ${LEAGUE_ID} AND m.isCompleted = 1
        ORDER BY m.season ASC
      `) as unknown as [any[]];

      const seasons = (seasonRows as any[]).map(r => Number(r.season));
      const results = [];

      for (const season of seasons) {
        const slug = `championship-march-${season}`;
        const [ex] = await db.execute(drizzleSql`
          SELECT id FROM league_wire_articles WHERE leagueId = ${LEAGUE_ID} AND slug = ${slug}
        `) as unknown as [any[]];

        if ((ex as any[]).length > 0) {
          results.push({ season, status: "cached" });
          continue;
        }

        try {
          const evidence = await buildChampionshipEvidence(db, season);
          if (!evidence) { results.push({ season, status: "no_data" }); continue; }

          const llmEvidence = {
            season, champion: evidence.champion, runnerUp: evidence.runnerUp,
            thirdPlace: evidence.thirdPlace,
            championRegularSeasonRecord: evidence.regularSeason.championRecord,
            biggestWin: evidence.regularSeason.biggestWin,
            closestEscape: evidence.regularSeason.closestEscape,
            playoffPath: evidence.playoffs.championPath,
            championshipGame: evidence.playoffs.championshipGame,
            standingsTop5: evidence.regularSeason.records.slice(0, 5).map(r => ({
              name: r.name, wins: r.wins, losses: r.losses
            })),
            topRivalries: evidence.rivalries.slice(0, 3),
          };

          const { headline, body } = await generateArticle({
            articleType: "championship_march",
            headline: `The ${season} Championship Run of ${evidence.champion.name}`,
            systemExtra: `Write a Championship March retrospective for the ${season} ${LEAGUE_NAME} season. The champion was ${evidence.champion.name}. This is their story.`,
            evidenceJson: llmEvidence,
            maxTokens: 2000,
          });

          await saveArticle(db, {
            season, articleType: "championship_march", slug, category: "archive",
            headline, body, byline: "League Wire Historical Staff",
            evidenceJson: llmEvidence,
          });

          results.push({ season, status: "generated", headline });
          await new Promise(r => setTimeout(r, 1500)); // rate limit
        } catch (err: unknown) {
          results.push({ season, status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      }

      return { ok: true, results };
    }),

  /** Generate keeper preview articles for upcoming season */
  generateKeeperPreviews: publicProcedure
    .input(z.object({ draftYear: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };
      const { draftYear } = input;

      // Get keeper pool from the espn keeperPool endpoint (data is already computed)
      // We'll use the draft_picks table for historical keeper analysis
      const [keeperRows] = await db.execute(drizzleSql`
        SELECT d.playerName, d.position, d.roundId, d.isKeeper, d.season,
               t.name as teamName, t.ownerName
        FROM draft_picks d
        JOIN teams t ON t.season = d.season AND t.teamId = d.teamId
        WHERE d.leagueId = ${LEAGUE_ID} AND d.isKeeper = 1
        ORDER BY d.season DESC, d.roundId
      `) as unknown as [any[]];

      const keepers = keeperRows as any[];

      if (!keepers.length) {
        return { ok: false, error: "No keeper data found. Run Full Import first." };
      }

      // Group keepers by owner to find tendencies
      const byOwner = new Map<string, any[]>();
      for (const k of keepers) {
        const key = k.ownerName ?? k.teamName;
        if (!byOwner.has(key)) byOwner.set(key, []);
        byOwner.get(key)!.push(k);
      }

      const evidenceJson = {
        draftYear,
        leagueName: LEAGUE_NAME,
        keeperHistorySeasonsAvailable: [...new Set(keepers.map(k => k.season))].sort(),
        keepersByOwner: Object.fromEntries(
          [...byOwner.entries()].slice(0, 5).map(([owner, ks]) => [
            owner,
            { totalKeepers: ks.length, seasons: [...new Set(ks.map(k => k.season))], recentKeepers: ks.slice(0, 3) }
          ])
        ),
        totalHistoricalKeeperInstances: keepers.length,
        note: `PREDICTED — NOT OFFICIAL. Based on ${draftYear - 1} draft history only.`,
      };

      const slug = `keeper-preview-${draftYear}`;
      const headline = `${LEAGUE_NAME} Keeper Preview: Who Stays and Who Goes in ${draftYear}`;

      const { body } = await generateArticle({
        articleType: "keeper_preview",
        headline,
        systemExtra: `IMPORTANT: This is a KEEPER PREDICTION article. Every keeper prediction must be labeled as "PREDICTED — NOT OFFICIAL" throughout. Base predictions only on historical keeper patterns from the evidence. State your confidence level (HIGH/MEDIUM/LOW) for each prediction. Never claim to know official keeper decisions.`,
        evidenceJson,
        maxTokens: 1800,
      });

      await saveArticle(db, {
        season: draftYear, articleType: "keeper_preview", slug, category: "preseason",
        headline, body, byline: "League Wire Draft Desk",
        evidenceJson, isPredicted: true,
      });

      return { ok: true, headline };
    }),

  /** Generate roster construction article for current season */
  generateRosterConstruction: publicProcedure
    .input(z.object({ season: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };
      const { season } = input;

      // Get current rosters with projections
      const [rosterRows] = await db.execute(drizzleSql`
        SELECT r.teamId, r.playerName, r.position, r.nflTeam, r.projectedPoints,
               r.slotId, r.injuryStatus, t.name as teamName, t.ownerName
        FROM roster_entries r
        JOIN teams t ON t.season = r.season AND t.teamId = r.teamId
        WHERE r.leagueId = ${LEAGUE_ID} AND r.season = ${season} AND r.week = 0
        ORDER BY r.teamId, r.projectedPoints DESC
      `) as unknown as [any[]];

      const rosters = rosterRows as any[];
      if (!rosters.length) return { ok: false, error: "No roster data for this season." };

      // Group by team and build needs analysis
      const teamMap = new Map<number, any[]>();
      for (const r of rosters) {
        const tid = Number(r.teamId);
        if (!teamMap.has(tid)) teamMap.set(tid, []);
        teamMap.get(tid)!.push(r);
      }

      const teamAnalyses = [...teamMap.entries()].map(([teamId, players]) => {
        const t = players[0];
        const posCount: Record<string, number> = {};
        for (const p of players) posCount[p.position] = (posCount[p.position] ?? 0) + 1;
        const projTotal = players.reduce((s: number, p: any) => s + parseFloat(p.projectedPoints ?? "0"), 0);
        const gaps: string[] = [];
        if (!posCount["QB"] || posCount["QB"] < 2) gaps.push("QB depth thin");
        if (!posCount["RB"] || posCount["RB"] < 3) gaps.push("RB corps needs reinforcement");
        if (!posCount["WR"] || posCount["WR"] < 3) gaps.push("WR corps needs depth");
        if (!posCount["TE"] || posCount["TE"] < 1) gaps.push("TE starter missing");

        return {
          teamName: t.teamName,
          ownerName: t.ownerName?.replace(/[()]/g, "").trim() ?? t.teamName,
          positionCounts: posCount,
          top5ByProjection: players.slice(0, 5).map((p: any) => ({
            name: p.playerName, pos: p.position, proj: parseFloat(p.projectedPoints ?? "0").toFixed(1)
          })),
          projectedTotal: Math.round(projTotal),
          gaps,
        };
      });

      const leagueAvg = Math.round(teamAnalyses.reduce((s, t) => s + t.projectedTotal, 0) / (teamAnalyses.length || 1));

      const evidenceJson = {
        season,
        leagueName: LEAGUE_NAME,
        teamCount: teamAnalyses.length,
        leagueAverageProjectedPoints: leagueAvg,
        teams: teamAnalyses,
        note: "Based on ESPN preseason projections. All projections are estimates.",
      };

      const slug = `roster-construction-${season}`;
      const headline = `${season} Roster Power Rankings: Who's Built to Win and Who Needs Help`;

      const { body } = await generateArticle({
        articleType: "roster_construction",
        headline,
        systemExtra: `Write a roster construction breakdown for the ${season} ${LEAGUE_NAME} season. Analyze each team's strengths and weaknesses based on their projected roster. Identify who is a title contender, who is rebuilding, and who faces the toughest path. Use only the projected points and position counts provided — do not fabricate specific player analysis not in the evidence.`,
        evidenceJson,
        maxTokens: 2000,
      });

      await saveArticle(db, {
        season, articleType: "roster_construction", slug, category: "preseason",
        headline, body, byline: "League Wire Draft Desk",
        evidenceJson, isPredicted: false,
      });

      return { ok: true, headline };
    }),

  /** Delete cached article to force regeneration */
  deleteArticle: publicProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.execute(drizzleSql`
        DELETE FROM league_wire_articles
        WHERE leagueId = ${LEAGUE_ID} AND slug = ${input.slug}
      `);
      return { ok: true };
    }),
});

export type LeagueNewsroomRouter = typeof leagueNewsroomRouter;
