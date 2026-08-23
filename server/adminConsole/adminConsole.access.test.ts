import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import { NOT_ADMIN_ERR_MSG } from "../../shared/const";
import { classifyAppHealth } from "../adminConsole/overview";
import { classifyLeagueHealth } from "../adminConsole/leagues";

function caller(opts: { id: number; openId: string; email: string; role: "user" | "admin" | "owner" }) {
  return appRouter.createCaller({
    user: {
      id: opts.id,
      openId: opts.openId,
      email: opts.email,
      role: opts.role,
      name: opts.email,
      loginMethod: "clerk",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      activeLeagueId: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: "free",
      trialStartedAt: null,
      currentPeriodEnd: null,
      subscriptionPriceId: null,
      subscriptionInterval: null,
      subscriptionPlan: null,
    },
    auth: { userId: opts.openId },
    req: {} as never,
    res: {} as never,
  });
}

describe("adminConsole API access", () => {
  it("denies unauthenticated callers", async () => {
    const unauth = appRouter.createCaller({
      user: null,
      auth: { userId: null },
      req: {} as never,
      res: {} as never,
    });
    await expect(unauth.adminConsole.session()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("denies a normal user including direct procedure access", async () => {
    const c = caller({
      id: 99,
      openId: "user_regular_x",
      email: "regular@example.com",
      role: "user",
    });
    const session = await c.me.session();
    expect(session.isAdmin).toBe(false);
    expect(session.isOwner).toBe(false);
    await expect(c.adminConsole.session()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.adminConsole.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.usageCost.getDashboard({ preset: "mtd" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      c.adminConsole.setAccountControl({
        userId: 1,
        status: "throttled",
        aiDisabled: false,
        dailyTokenLimit: null,
        notes: null,
        reason: "test",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the application owner", async () => {
    const c = caller({
      id: 1,
      openId: "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
      email: "owner@example.com",
      role: "user",
    });
    const session = await c.adminConsole.session();
    expect(session.isOwner).toBe(true);
    expect(session.capabilities).toContain("OWNER_ACCESS");
    const overview = await c.adminConsole.overview();
    expect(overview.totalAccounts).toBeTypeOf("number");
    expect(["Healthy", "Degraded", "Critical"]).toContain(overview.health);
  });

  it("allows an admin to view but not mutate owner controls", async () => {
    const c = caller({
      id: 2,
      openId: "user_admin_x",
      email: "admin@example.com",
      role: "admin",
    });
    const session = await c.adminConsole.session();
    expect(session.isOwner).toBe(false);
    await expect(
      c.adminConsole.setAccountControl({
        userId: 99,
        status: "throttled",
        aiDisabled: false,
        dailyTokenLimit: null,
        notes: null,
        reason: "nope",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.adminConsole.session()).resolves.toBeTruthy();
    await expect(
      c.adminConsole.setFeatureOverride({
        featureId: "advisor",
        enabled: false,
        maintenance: false,
        restrictTo: "none",
        reason: "nope",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      c.adminConsole.saveSettings({
        monthlyBudgetUsd: 1,
        maintenanceMessage: "nope",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      c.adminConsole.setUserRole({
        userId: 99,
        role: "admin",
        reason: "nope",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin dashboard aggregations", () => {
  it("classifies health without inventing deployment data", () => {
    expect(
      classifyAppHealth({ healthStatus: "ok", failedSyncs: 0, errorRate: 0, projectedOverBudget: false }),
    ).toBe("Healthy");
    expect(
      classifyAppHealth({ healthStatus: "ok", failedSyncs: 2, errorRate: 0, projectedOverBudget: false }),
    ).toBe("Degraded");
    expect(
      classifyAppHealth({ healthStatus: "degraded", failedSyncs: 0, errorRate: 0, projectedOverBudget: false }),
    ).toBe("Critical");
  });

  it("classifies league data health from real sync signals", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    expect(
      classifyLeagueHealth({
        syncStatus: "ok",
        lastSyncedAt: new Date("2026-08-23T10:00:00Z"),
        teams: 12,
        drafts: 100,
        matchups: 80,
        now,
      }),
    ).toBe("healthy");
    expect(
      classifyLeagueHealth({
        syncStatus: "error",
        lastSyncedAt: new Date("2026-08-23T10:00:00Z"),
        teams: 12,
        drafts: 100,
        matchups: 80,
        now,
      }),
    ).toBe("failed");
    expect(
      classifyLeagueHealth({
        syncStatus: "ok",
        lastSyncedAt: new Date("2026-08-01T10:00:00Z"),
        teams: 12,
        drafts: 100,
        matchups: 80,
        now,
      }),
    ).toBe("stale");
  });
});

describe("admin console does not leak secrets", () => {
  it("integration payload uses Configured flags only", async () => {
    const c = caller({
      id: 1,
      openId: "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
      email: "owner@example.com",
      role: "owner",
    });
    const data = await c.adminConsole.integrations();
    const blob = JSON.stringify(data);
    expect(data.secretsNeverExposed).toBe(true);
    expect(blob).not.toMatch(/sk_live/);
    expect(blob).not.toMatch(/sk_test/);
    for (const comp of data.components) {
      if ("configured" in comp && comp.configured) {
        expect(["Configured", "Not configured"]).toContain(comp.configured);
      }
    }
  });
});

void NOT_ADMIN_ERR_MSG;
