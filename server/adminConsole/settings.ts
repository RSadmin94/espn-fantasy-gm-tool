import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { getMonthlyAiBudgetUsd, setMonthlyAiBudgetUsd } from "../aiCost/aiBudget";
import { writeAdminAudit } from "./audit";

export const MAINTENANCE_MESSAGE_KEY = "admin_maintenance_message";

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: now } });
}

export async function loadAdminSettings() {
  const [budget, maintenanceMessage] = await Promise.all([
    getMonthlyAiBudgetUsd(),
    getSetting(MAINTENANCE_MESSAGE_KEY),
  ]);
  return {
    monthlyBudgetUsd: budget,
    maintenanceMessage: maintenanceMessage ?? "",
    note: "Environment secrets are not editable here. Only runtime settings stored in app_settings.",
  };
}

export async function saveAdminSettings(opts: {
  actor: { id: number; openId: string };
  monthlyBudgetUsd?: number | null;
  maintenanceMessage?: string;
}) {
  if (opts.monthlyBudgetUsd != null) {
    const previous = await getMonthlyAiBudgetUsd();
    await setMonthlyAiBudgetUsd(opts.monthlyBudgetUsd);
    await writeAdminAudit({
      actorUserId: opts.actor.id,
      actorOpenId: opts.actor.openId,
      action: "settings.budget",
      targetType: "setting",
      targetId: "monthly_ai_budget_usd",
      previousValue: previous,
      newValue: opts.monthlyBudgetUsd,
    });
  }
  if (opts.maintenanceMessage != null) {
    const previous = await getSetting(MAINTENANCE_MESSAGE_KEY);
    await setSetting(MAINTENANCE_MESSAGE_KEY, opts.maintenanceMessage.slice(0, 500));
    await writeAdminAudit({
      actorUserId: opts.actor.id,
      actorOpenId: opts.actor.openId,
      action: "settings.maintenance_message",
      targetType: "setting",
      targetId: MAINTENANCE_MESSAGE_KEY,
      previousValue: previous,
      newValue: opts.maintenanceMessage.slice(0, 500),
    });
  }
  return loadAdminSettings();
}
