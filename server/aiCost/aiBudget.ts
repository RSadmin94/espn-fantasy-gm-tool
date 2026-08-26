/**
 * Monthly AI budget — isolated from UI copy.
 *
 * Resolution order:
 *   1. `app_settings.monthly_ai_budget_usd` (admin-configurable)
 *   2. `AI_MONTHLY_BUDGET_USD` env
 *   3. null (budget not configured — dashboard shows an empty state)
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";

export const MONTHLY_AI_BUDGET_KEY = "monthly_ai_budget_usd";

function parseBudget(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function getMonthlyAiBudgetUsd(): Promise<number | null> {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, MONTHLY_AI_BUDGET_KEY))
        .limit(1);
      const stored = parseBudget(rows[0]?.value);
      if (stored != null) return stored;
    }
  } catch {
    /* fall through to env */
  }
  return parseBudget(process.env.AI_MONTHLY_BUDGET_USD);
}

export async function setMonthlyAiBudgetUsd(amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Budget must be a non-negative number");
  }
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const value = String(amount);
  await db
    .insert(appSettings)
    .values({ key: MONTHLY_AI_BUDGET_KEY, value, updatedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  return amount;
}
