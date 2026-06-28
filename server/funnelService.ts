/**
 * funnelService.ts
 *
 * Lightweight helper for recording conversion funnel events in `funnel_events`.
 * Fire-and-forget — never throw; funnel tracking must never block the main flow.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { funnelEvents } from "../drizzle/schema";

/** Legacy onboarding/checkout names plus rivalry-wall beta funnel. */
export type FunnelEventName =
  | "connected_league"
  | "completed_reveal"
  | "clicked_cta"
  | "started_checkout"
  | "completed_payment"
  | "wall_viewed"
  | "upgrade_clicked"
  | "checkout_opened";

export async function recordFunnelEvent(opts: {
  userId: number | null;
  event: FunnelEventName;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(funnelEvents).values({
      userId: opts.userId ?? undefined,
      event: opts.event,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.warn("[funnelService] Failed to record event:", opts.event, err);
  }
}

export interface RivalryFunnelStepRow {
  step: string;
  event: string;
  uniqueUsers: number;
  /** Drop-off from the previous funnel step (% of prior-step users who did not reach this step). */
  dropOffPct: number | null;
}

export interface RivalryFunnelStats {
  steps: RivalryFunnelStepRow[];
  /** completed_payment users / wall_viewed users */
  conversionRatePct: number | null;
  /** Derived: opened checkout, no completed_payment within 24h of first open. */
  checkoutAbandonedUsers: number;
  lastFeatureBreakdown: Array<{ feature: string; count: number }>;
}

const RIVALRY_FUNNEL_STEPS: Array<{ step: string; event: string }> = [
  { step: "1. Wall viewed", event: "wall_viewed" },
  { step: "2. Upgrade clicked", event: "upgrade_clicked" },
  { step: "3. Checkout opened", event: "checkout_opened" },
  { step: "4. Payment completed", event: "completed_payment" },
];

const RIVALRY_FUNNEL_EVENT_NAMES = RIVALRY_FUNNEL_STEPS.map((s) => s.event);

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(res)) return (Array.isArray(res[0]) ? res[0] : res) as Array<Record<string, unknown>>;
  if (res && typeof res === "object" && Array.isArray((res as { rows?: unknown[] }).rows)) {
    return (res as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

/**
 * Rivalry-wall conversion funnel stats — read-only SELECTs on funnel_events.
 *
 * checkout_abandoned is derived (no extra event rows):
 *   users with checkout_opened whose first open has no completed_payment within 24h.
 */
export async function getRivalryWallFunnelStats(): Promise<RivalryFunnelStats> {
  const empty: RivalryFunnelStats = {
    steps: RIVALRY_FUNNEL_STEPS.map((s) => ({ ...s, uniqueUsers: 0, dropOffPct: null })),
    conversionRatePct: null,
    checkoutAbandonedUsers: 0,
    lastFeatureBreakdown: [],
  };

  try {
    const db = await getDb();
    if (!db) return empty;

    const countByEvent = new Map<string, number>();
    for (const eventName of RIVALRY_FUNNEL_EVENT_NAMES) {
      const rows = await db
        .select({
          uniqueUsers: sql<number>`COUNT(DISTINCT ${funnelEvents.userId})`,
        })
        .from(funnelEvents)
        .where(sql`${funnelEvents.event} = ${eventName} AND ${funnelEvents.userId} IS NOT NULL`);
      countByEvent.set(eventName, Number(rows[0]?.uniqueUsers ?? 0));
    }

    let prevUsers: number | null = null;
    const steps: RivalryFunnelStepRow[] = RIVALRY_FUNNEL_STEPS.map(({ step, event }) => {
      const uniqueUsers = countByEvent.get(event) ?? 0;
      const dropOffPct =
        prevUsers != null && prevUsers > 0
          ? Math.round(((prevUsers - uniqueUsers) / prevUsers) * 1000) / 10
          : null;
      prevUsers = uniqueUsers;
      return { step, event, uniqueUsers, dropOffPct };
    });

    const wallUsers = countByEvent.get("wall_viewed") ?? 0;
    const paidUsers = countByEvent.get("completed_payment") ?? 0;
    const conversionRatePct =
      wallUsers > 0 ? Math.round((paidUsers / wallUsers) * 1000) / 10 : null;

    const abandonedRows = await db.execute(sql`
      SELECT COUNT(*) AS abandoned_users
      FROM (
        SELECT o.userId
        FROM (
          SELECT userId, MIN(createdAt) AS first_opened
          FROM funnel_events
          WHERE event = 'checkout_opened' AND userId IS NOT NULL
          GROUP BY userId
        ) o
        WHERE NOT EXISTS (
          SELECT 1 FROM funnel_events p
          WHERE p.userId = o.userId
            AND p.event = 'completed_payment'
            AND p.createdAt >= o.first_opened
            AND p.createdAt <= DATE_ADD(o.first_opened, INTERVAL 24 HOUR)
        )
      ) abandoned
    `);
    const abandonedRaw = rowsOf(abandonedRows);
    const checkoutAbandonedUsers = Number(abandonedRaw[0]?.abandoned_users ?? 0);

    const featureRows = await db.execute(sql`
      SELECT
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.lastFreeFeature')), '(none)') AS feature,
        COUNT(*) AS clicks
      FROM funnel_events
      WHERE event = 'upgrade_clicked' AND userId IS NOT NULL
      GROUP BY feature
      ORDER BY clicks DESC
      LIMIT 10
    `);
    const lastFeatureBreakdown = rowsOf(featureRows).map((r) => ({
      feature: String(r.feature ?? "(none)"),
      count: Number(r.clicks ?? 0),
    }));

    return { steps, conversionRatePct, checkoutAbandonedUsers, lastFeatureBreakdown };
  } catch (err) {
    console.warn("[funnelService] getRivalryWallFunnelStats failed:", err);
    return empty;
  }
}
