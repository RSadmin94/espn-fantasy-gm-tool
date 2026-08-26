import { z } from "zod";
import { adminProcedure, ownerProcedure, router } from "./_core/trpc";
import { writeAdminAudit } from "./adminConsole/audit";
import { resolveDateRange, type DatePreset } from "./aiCost/dateRange";
import { getMonthlyAiBudgetUsd, setMonthlyAiBudgetUsd } from "./aiCost/aiBudget";
import { loadUsageDashboard, loadUsageEventByRequestId } from "./aiCost/usageDashboard";
import { findAiUsageTrace, getRecentAiUsageTraces } from "./aiCost/debugTrace";
import { computeBudgetHealth } from "./aiCost/projections";

const presetSchema = z.enum(["today", "last_7", "last_30", "mtd", "previous_month", "custom"]);

const filterInput = z.object({
  preset: presetSchema.default("mtd"),
  start: z.string().optional(),
  end: z.string().optional(),
  provider: z.string().max(32).nullable().optional(),
  model: z.string().max(128).nullable().optional(),
  featureId: z.string().max(64).nullable().optional(),
  intent: z.string().max(64).nullable().optional(),
  leagueId: z.string().max(64).nullable().optional(),
  userId: z.string().max(64).nullable().optional(),
});

export const usageCostRouter = router({
  getDashboard: adminProcedure.input(filterInput).query(async ({ input }) => {
    const range = resolveDateRange({
      preset: input.preset as DatePreset,
      start: input.start,
      end: input.end,
    });
    return loadUsageDashboard({
      range,
      provider: input.provider,
      model: input.model,
      featureId: input.featureId,
      intent: input.intent,
      leagueId: input.leagueId,
      userId: input.userId,
    });
  }),

  getBudget: adminProcedure.query(async () => {
    const monthlyBudgetUsd = await getMonthlyAiBudgetUsd();
    return { monthlyBudgetUsd };
  }),

  setBudget: ownerProcedure
    .input(z.object({ monthlyBudgetUsd: z.number().min(0).max(1_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const previous = await getMonthlyAiBudgetUsd();
      const monthlyBudgetUsd = await setMonthlyAiBudgetUsd(input.monthlyBudgetUsd);
      await writeAdminAudit({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        action: "settings.budget",
        targetType: "setting",
        targetId: "monthly_ai_budget_usd",
        previousValue: previous,
        newValue: monthlyBudgetUsd,
      });
      return { monthlyBudgetUsd };
    }),

  /** Dev/admin trace of recent AI calls. Not a public endpoint. */
  debugRecentTraces: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(({ input }) => getRecentAiUsageTraces(input?.limit ?? 20)),

  debugTrace: adminProcedure
    .input(z.object({ requestId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const memory = findAiUsageTrace(input.requestId);
      const persisted = await loadUsageEventByRequestId(input.requestId);
      return { memory, persisted };
    }),
});

export { computeBudgetHealth };
