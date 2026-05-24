/**
 * onboardingRouter.ts
 *
 * Provides the getRevealData procedure used by the /reveal page.
 * Returns three profiles in sequence: self, champion, rival.
 *
 * User matching strategy:
 *   1. Match ctx.user.name (case-insensitive) against manager.ownerName
 *   2. Fallback: first manager in the list
 *
 * Rival score formula (weighted blend):
 *   H2H losses (35%) + trade loss ratio (25%) + exploitability (20%) +
 *   playoff elimination proxy (15%) + recency proxy (5%)
 */
import { router, protectedProcedure } from "./_core/trpc";
import { buildManagerRawData } from "./dnaRouter";
import { calcLeagueDNA, type ManagerRawData, type ManagerDNA } from "./leagueDNA";
import { recordFunnelEvent } from "./funnelService";

export const onboardingRouter = router({
  getRevealData: protectedProcedure.query(async ({ ctx }) => {
    const managers: ManagerRawData[] = await buildManagerRawData(ctx.user.id);
    const dnaProfiles: ManagerDNA[] = calcLeagueDNA(managers);

    // ── 1. Find the logged-in user's manager ──────────────────────────────
    const userName = (ctx.user.name ?? "").toLowerCase().trim();
    let selfIndex = managers.findIndex(
      (m) => m.ownerName.toLowerCase().trim() === userName
    );
    if (selfIndex < 0) selfIndex = 0; // fallback: first manager

    const selfManager = managers[selfIndex];
    const selfDNA = dnaProfiles.find((d) => d.memberId === selfManager.memberId) ?? dnaProfiles[selfIndex];

    // ── 2. Find the champion ──────────────────────────────────────────────
    interface ChampCandidate { index: number; count: number; mostRecent: number }
    const championCandidates: ChampCandidate[] = managers.map((manager, index) => {
      const years = manager.seasonRecords
        .filter((r) => r.isChampion)
        .map((r) => r.season)
        .sort((a, b) => b - a);
      return { index, count: years.length, mostRecent: years[0] ?? 0 };
    });

    championCandidates.sort((a, b) =>
      b.count !== a.count ? b.count - a.count : b.mostRecent - a.mostRecent
    );

    const championIndex = championCandidates[0]?.index ?? 0;
    const championManager = managers[championIndex];
    const championDNA = dnaProfiles.find((d) => d.memberId === championManager.memberId) ?? dnaProfiles[championIndex];

    // ── 3. Calculate rival score ──────────────────────────────────────────
    let rivalIndex = -1;
    let highestRivalScore = -1;

    managers.forEach((manager, index) => {
      if (index === selfIndex || index === championIndex) return;

      const dna = dnaProfiles.find((d) => d.memberId === manager.memberId) ?? dnaProfiles[index];

      const h2h =
        manager.h2hVsRod.losses /
        Math.max(1, manager.h2hVsRod.wins + manager.h2hVsRod.losses);

      const tradeLoss = dna.trade.lossTradeRatio;
      const exploit = dna.exploitabilityScore / 100;
      const playoff = Math.min(1, manager.seasonRecords.filter((r) => r.isChampion).length / 10);
      const recency = manager.h2hVsRod.losses > 0 ? 0.5 : 0;

      const score =
        h2h * 0.35 +
        tradeLoss * 0.25 +
        exploit * 0.2 +
        playoff * 0.15 +
        recency * 0.05;

      if (score > highestRivalScore) {
        highestRivalScore = score;
        rivalIndex = index;
      }
    });

    // Fallback: pick any manager that is not self or champion
    if (rivalIndex < 0) {
      rivalIndex = managers.findIndex((_, i) => i !== selfIndex && i !== championIndex);
      if (rivalIndex < 0) rivalIndex = selfIndex === 0 ? 1 : 0;
    }

    const rivalManager = managers[rivalIndex];
    const rivalDNA = dnaProfiles.find((d) => d.memberId === rivalManager.memberId) ?? dnaProfiles[rivalIndex];

    // ── 4. Record funnel event ────────────────────────────────────────────
    await recordFunnelEvent({
      userId: ctx.user.id,
      event: "completed_reveal",
      metadata: {
        rivalName: rivalManager.ownerName,
        championName: championManager.ownerName,
      },
    });

    // ── 5. Build allProfiles for blur layer ───────────────────────────────
    const allProfiles = managers
      .map((manager) => {
        const dna = dnaProfiles.find((d) => d.memberId === manager.memberId);
        return {
          ownerName: manager.ownerName,
          gmArchetype: dna?.gmArchetype ?? "Unknown",
          exploitabilityScore: dna?.exploitabilityScore ?? 0,
          exploitabilityLabel: (dna?.exploitabilityLabel ?? "Market-Aware") as ManagerDNA["exploitabilityLabel"],
        };
      })
      .sort((a, b) => b.exploitabilityScore - a.exploitabilityScore);

    return {
      self: {
        ownerName: selfManager.ownerName,
        gmArchetype: selfDNA.gmArchetype,
        exploitabilityScore: selfDNA.exploitabilityScore,
        exploitabilityLabel: selfDNA.exploitabilityLabel,
        dnaSummary: selfDNA.dnaSummary,
        seasonsAnalyzed: selfManager.seasonRecords.length,
      },
      champion: {
        ownerName: championManager.ownerName,
        championshipCount: championManager.seasonRecords.filter((r) => r.isChampion).length,
        mostRecentTitle:
          championManager.seasonRecords
            .filter((r) => r.isChampion)
            .sort((a, b) => b.season - a.season)[0]?.season ?? 0,
        gmArchetype: championDNA.gmArchetype,
        exploitabilityScore: championDNA.exploitabilityScore,
        dnaSummary: championDNA.dnaSummary,
      },
      rival: {
        ownerName: rivalManager.ownerName,
        rivalScore: highestRivalScore,
        h2hRecord: {
          wins: rivalManager.h2hVsRod.wins,
          losses: rivalManager.h2hVsRod.losses,
        },
        exploitabilityScore: rivalDNA.exploitabilityScore,
        exploitabilityLabel: rivalDNA.exploitabilityLabel,
        exploitWindows: rivalDNA.exploitWindows.slice(0, 2),
        lossTradeRatio: rivalDNA.trade.lossTradeRatio,
        gmArchetype: rivalDNA.gmArchetype,
      },
      allProfiles,
    };
  }),
});
