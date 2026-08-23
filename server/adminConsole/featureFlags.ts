import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminFeatureOverrides, type AdminFeatureOverride } from "../../drizzle/schema";
import { writeAdminAudit } from "./audit";
import { isOwnerAccount } from "../_core/owners";
import type { User } from "../../drizzle/schema";

let cache: { at: number; rows: AdminFeatureOverride[] } | null = null;
const TTL_MS = 15_000;

export function clearFeatureOverrideCache(): void {
  cache = null;
}

export async function listFeatureOverrides(): Promise<AdminFeatureOverride[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(adminFeatureOverrides);
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getFeatureOverride(featureId: string): Promise<AdminFeatureOverride | null> {
  const rows = await listFeatureOverrides();
  return rows.find((r) => r.featureId === featureId) ?? null;
}

export function isFeatureAllowedForUser(
  override: AdminFeatureOverride | null,
  user: Pick<User, "openId" | "email" | "role"> | null,
): { allowed: boolean; reason?: string } {
  if (!override) return { allowed: true };
  if (!override.enabled) {
    return { allowed: false, reason: "This feature is disabled." };
  }
  if (override.maintenance) {
    return { allowed: false, reason: "This feature is in maintenance." };
  }
  if (override.restrictTo === "owner" && !isOwnerAccount(user)) {
    return { allowed: false, reason: "This feature is restricted to the application owner." };
  }
  if (override.restrictTo === "admin") {
    if (!user || (user.role !== "admin" && !isOwnerAccount(user))) {
      return { allowed: false, reason: "This feature is restricted to admin accounts." };
    }
  }
  return { allowed: true };
}

export async function upsertFeatureOverride(opts: {
  actor: { id: number; openId: string };
  featureId: string;
  enabled: boolean;
  maintenance: boolean;
  restrictTo: "none" | "admin" | "owner";
  reason: string | null;
}): Promise<AdminFeatureOverride> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const previous = await getFeatureOverride(opts.featureId);
  const now = new Date();
  const values = {
    featureId: opts.featureId.slice(0, 64),
    enabled: opts.enabled,
    maintenance: opts.maintenance,
    restrictTo: opts.restrictTo,
    updatedAt: now,
  };
  await db
    .insert(adminFeatureOverrides)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        enabled: values.enabled,
        maintenance: values.maintenance,
        restrictTo: values.restrictTo,
        updatedAt: now,
      },
    });
  clearFeatureOverrideCache();
  await writeAdminAudit({
    actorUserId: opts.actor.id,
    actorOpenId: opts.actor.openId,
    action: "feature.override",
    targetType: "feature",
    targetId: values.featureId,
    previousValue: previous,
    newValue: values,
    reason: opts.reason,
  });
  const next = await getFeatureOverride(values.featureId);
  if (!next) throw new Error("Failed to persist feature override");
  return next;
}
