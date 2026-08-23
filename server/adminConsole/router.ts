import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  capabilityProcedure,
  ownerProcedure,
  router,
} from "../_core/trpc";
import { capabilitiesFor, consoleAccessLevel } from "../_core/adminAccess";
import { isOwnerAccount } from "../_core/owners";
import { loadAdminOverview, adminSearch } from "./overview";
import { listAdminUsers, loadAdminUserDetail, listAuthActivity } from "./users";
import { listAdminLeagues, loadAdminLeagueDetail } from "./leagues";
import { listAdminErrors } from "./errors";
import { listAdminJobs } from "./jobs";
import { loadAdminIntegrations } from "./integrations";
import { listAdminFeatures, loadAdminFeatureDetail } from "./features";
import { upsertFeatureOverride, listFeatureOverrides, isFeatureAllowedForUser } from "./featureFlags";
import { loadAdminSettings, saveAdminSettings } from "./settings";
import { listAdminAudit } from "./audit";
import { setAccountControl, setUserRole } from "./accountControls";
import { PRODUCT_FEATURE_CATALOG } from "./productFeatures";
import { getRivalryWallFunnelStats } from "../funnelService";
import { and, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { users, usageEvents, leagueConnections } from "../../drizzle/schema";
import { resolveDateRange } from "../aiCost/dateRange";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function loadProductAnalytics() {
  const db = await getDb();
  const today = resolveDateRange({ preset: "today" });
  const last7 = resolveDateRange({ preset: "last_7" });
  const last30 = resolveDateRange({ preset: "last_30" });
  if (!db) {
    return {
      dau: 0,
      wau: 0,
      mau: 0,
      signups30: 0,
      leagueConnections30: 0,
      funnel: await getRivalryWallFunnelStats(),
    };
  }
  const active = async (start: Date) => {
    const rows = await db
      .select({ c: sql<number>`COUNT(DISTINCT ${usageEvents.userId})` })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, start), sql`${usageEvents.userId} IS NOT NULL`));
    return num(rows[0]?.c);
  };
  const [dau, wau, mau, signups30, leagueConnections30, funnel] = await Promise.all([
    active(today.start),
    active(last7.start),
    active(last30.start),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, last30.start))
      .then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(leagueConnections)
      .where(gte(leagueConnections.createdAt, last30.start))
      .then((r) => num(r[0]?.c)),
    getRivalryWallFunnelStats(),
  ]);
  return { dau, wau, mau, signups30, leagueConnections30, funnel };
}

export const adminConsoleRouter = router({
  session: adminProcedure.query(({ ctx }) => ({
    isOwner: isOwnerAccount(ctx.user),
    accessLevel: consoleAccessLevel(ctx.user),
    capabilities: capabilitiesFor(ctx.user),
    userId: ctx.user.id,
  })),

  overview: adminProcedure.query(async () => loadAdminOverview()),

  search: adminProcedure
    .input(z.object({ q: z.string().max(128) }))
    .query(async ({ input }) => adminSearch(input.q)),

  users: capabilityProcedure("VIEW_USERS")
    .input(
      z
        .object({
          q: z.string().max(128).optional(),
          status: z.string().max(32).optional(),
          role: z.string().max(16).optional(),
          highUsage: z.boolean().optional(),
          highCost: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => listAdminUsers(input ?? {})),

  userDetail: capabilityProcedure("VIEW_USERS")
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const row = await loadAdminUserDetail(input.userId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return row;
    }),

  setAccountControl: ownerProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: z.enum(["active", "watched", "throttled", "restricted", "suspended"]),
        aiDisabled: z.boolean(),
        dailyTokenLimit: z.number().int().min(0).max(10_000_000).nullable(),
        notes: z.string().max(2000).nullable(),
        reason: z.string().max(500).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setAccountControl({
          actor: ctx.user,
          targetUserId: input.userId,
          status: input.status,
          aiDisabled: input.aiDisabled,
          dailyTokenLimit: input.dailyTokenLimit,
          notes: input.notes,
          reason: input.reason,
        });
      } catch (err) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: err instanceof Error ? err.message : "Blocked",
        });
      }
    }),

  setUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(["user", "admin", "owner"]),
        reason: z.string().max(500).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setUserRole({
          actor: ctx.user,
          targetUserId: input.userId,
          role: input.role,
          reason: input.reason,
        });
      } catch (err) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: err instanceof Error ? err.message : "Blocked",
        });
      }
    }),

  auth: adminProcedure.query(async () => listAuthActivity()),

  leagues: adminProcedure.query(async () => listAdminLeagues()),

  leagueDetail: adminProcedure
    .input(z.object({ provider: z.string().min(1).max(32), leagueId: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const row = await loadAdminLeagueDetail(input.provider, input.leagueId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      return row;
    }),

  dataHealth: adminProcedure.query(async () => listAdminLeagues()),

  features: adminProcedure.query(async () => listAdminFeatures()),

  featureDetail: adminProcedure
    .input(z.object({ featureId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const row = await loadAdminFeatureDetail(input.featureId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown feature" });
      return row;
    }),

  setFeatureOverride: ownerProcedure
    .input(
      z.object({
        featureId: z.string().min(1).max(64),
        enabled: z.boolean(),
        maintenance: z.boolean(),
        restrictTo: z.enum(["none", "admin", "owner"]),
        reason: z.string().max(500).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!PRODUCT_FEATURE_CATALOG.some((f) => f.id === input.featureId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown feature" });
      }
      return upsertFeatureOverride({
        actor: ctx.user,
        featureId: input.featureId,
        enabled: input.enabled,
        maintenance: input.maintenance,
        restrictTo: input.restrictTo,
        reason: input.reason,
      });
    }),

  analytics: adminProcedure.query(async () => loadProductAnalytics()),

  errors: capabilityProcedure("VIEW_ERRORS")
    .input(
      z
        .object({
          area: z.string().max(32).optional(),
          userId: z.string().max(64).optional(),
          leagueId: z.string().max(64).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => listAdminErrors(input ?? {})),

  jobs: adminProcedure.query(async () => listAdminJobs()),

  integrations: capabilityProcedure("VIEW_SYSTEM_HEALTH").query(async () => loadAdminIntegrations()),

  settings: capabilityProcedure("VIEW_ADMIN").query(async () => loadAdminSettings()),

  saveSettings: ownerProcedure
    .input(
      z.object({
        monthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable().optional(),
        maintenanceMessage: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      saveAdminSettings({
        actor: ctx.user,
        monthlyBudgetUsd: input.monthlyBudgetUsd,
        maintenanceMessage: input.maintenanceMessage,
      }),
    ),

  audit: capabilityProcedure("VIEW_AUDIT")
    .input(
      z
        .object({
          actorUserId: z.number().int().optional(),
          action: z.string().max(64).optional(),
          targetType: z.string().max(32).optional(),
          targetId: z.string().max(128).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => listAdminAudit(input ?? {})),
});

export async function publicFeatureGateState(user: Parameters<typeof isFeatureAllowedForUser>[1]) {
  const rows = await listFeatureOverrides();
  const blocked: Record<string, string> = {};
  for (const row of rows) {
    const check = isFeatureAllowedForUser(row, user);
    if (!check.allowed) blocked[row.featureId] = check.reason ?? "disabled";
  }
  return blocked;
}

