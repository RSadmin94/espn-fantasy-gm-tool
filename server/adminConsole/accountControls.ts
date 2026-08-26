import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminAccountControls, users, type AdminAccountControl } from "../../drizzle/schema";
import { isOwnerAccount } from "../_core/owners";
import { ownerProtectionCheck } from "../_core/adminAccess";
import { writeAdminAudit } from "./audit";

const cache = new Map<number, { at: number; row: AdminAccountControl | null }>();
const TTL_MS = 15_000;

export function clearAccountControlCache(userId?: number): void {
  if (userId == null) cache.clear();
  else cache.delete(userId);
}

export async function getAccountControl(userId: number): Promise<AdminAccountControl | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(adminAccountControls)
    .where(eq(adminAccountControls.userId, userId))
    .limit(1);
  const row = rows[0] ?? null;
  cache.set(userId, { at: Date.now(), row });
  return row;
}

export type AiPolicyResult = {
  allowed: boolean;
  reason?: string;
  tokenBudgetMultiplier: number;
  dailyTokenLimit: number | null;
};

export type AccountControlPolicySlice = {
  status: AdminAccountControl["status"];
  aiDisabled: boolean;
  dailyTokenLimit?: number | null;
};

/** Pure AI-policy decision used by LLM/advisor guards. */
export function aiPolicyFromControl(ctrl: AccountControlPolicySlice | null | undefined): AiPolicyResult {
  if (!ctrl) return { allowed: true, tokenBudgetMultiplier: 1, dailyTokenLimit: null };
  if (ctrl.status === "suspended") {
    return { allowed: false, reason: "This account is suspended.", tokenBudgetMultiplier: 0, dailyTokenLimit: null };
  }
  if (ctrl.aiDisabled) {
    return {
      allowed: false,
      reason: "AI access is disabled for this account.",
      tokenBudgetMultiplier: 0,
      dailyTokenLimit: null,
    };
  }
  const dailyTokenLimit =
    ctrl.dailyTokenLimit != null && ctrl.dailyTokenLimit > 0 ? ctrl.dailyTokenLimit : null;
  if (ctrl.status === "throttled" || ctrl.status === "restricted") {
    return { allowed: true, tokenBudgetMultiplier: 0.2, dailyTokenLimit };
  }
  return { allowed: true, tokenBudgetMultiplier: 1, dailyTokenLimit };
}

export async function evaluateAiPolicy(userId: number): Promise<AiPolicyResult> {
  const ctrl = await getAccountControl(userId);
  return aiPolicyFromControl(ctrl);
}

export async function setAccountControl(opts: {
  actor: { id: number; openId: string; email: string | null; role: "user" | "admin" | "owner" };
  targetUserId: number;
  status: AdminAccountControl["status"];
  aiDisabled: boolean;
  dailyTokenLimit: number | null;
  notes: string | null;
  reason: string | null;
}): Promise<AdminAccountControl> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const targetRows = await db.select().from(users).where(eq(users.id, opts.targetUserId)).limit(1);
  const target = targetRows[0];
  if (!target) throw new Error("User not found");

  const action =
    opts.status === "suspended"
      ? "suspend"
      : opts.aiDisabled
        ? "disable_ai"
        : opts.status === "restricted" || opts.status === "throttled"
          ? "restrict"
          : "restrict";

  const protection = ownerProtectionCheck({
    actor: opts.actor,
    target,
    action,
  });
  if (!protection.allowed) {
    throw new Error(protection.reason ?? "Owner protection blocked this action.");
  }
  if (isOwnerAccount(target) && (opts.status === "suspended" || opts.aiDisabled)) {
    throw new Error("The owner account cannot be suspended or have AI disabled.");
  }

  const previous = await getAccountControl(opts.targetUserId);
  const now = new Date();
  const values = {
    userId: opts.targetUserId,
    status: opts.status,
    aiDisabled: opts.aiDisabled,
    dailyTokenLimit: opts.dailyTokenLimit,
    notes: opts.notes,
    updatedAt: now,
    updatedByUserId: opts.actor.id,
  };
  await db
    .insert(adminAccountControls)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        status: values.status,
        aiDisabled: values.aiDisabled,
        dailyTokenLimit: values.dailyTokenLimit,
        notes: values.notes,
        updatedAt: now,
        updatedByUserId: opts.actor.id,
      },
    });
  clearAccountControlCache(opts.targetUserId);
  await writeAdminAudit({
    actorUserId: opts.actor.id,
    actorOpenId: opts.actor.openId,
    action: "account_control.update",
    targetType: "user",
    targetId: String(opts.targetUserId),
    previousValue: previous,
    newValue: values,
    reason: opts.reason,
  });
  const next = await getAccountControl(opts.targetUserId);
  if (!next) throw new Error("Failed to persist account control");
  return next;
}

export async function setUserRole(opts: {
  actor: { id: number; openId: string; email: string | null; role: "user" | "admin" | "owner" };
  targetUserId: number;
  role: "user" | "admin" | "owner";
  reason: string | null;
}): Promise<{ role: "user" | "admin" | "owner" }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const targetRows = await db.select().from(users).where(eq(users.id, opts.targetUserId)).limit(1);
  const target = targetRows[0];
  if (!target) throw new Error("User not found");

  if (opts.role !== "owner" && isOwnerAccount(target)) {
    const protection = ownerProtectionCheck({
      actor: opts.actor,
      target,
      action: "demote_role",
    });
    if (!protection.allowed) throw new Error(protection.reason ?? "Blocked");
  }
  if (opts.actor.id === opts.targetUserId && opts.role !== "owner" && isOwnerAccount(opts.actor)) {
    throw new Error("You cannot remove your own owner access.");
  }

  const previous = target.role;
  await db.update(users).set({ role: opts.role }).where(eq(users.id, opts.targetUserId));
  await writeAdminAudit({
    actorUserId: opts.actor.id,
    actorOpenId: opts.actor.openId,
    action: "user.role_change",
    targetType: "user",
    targetId: String(opts.targetUserId),
    previousValue: previous,
    newValue: opts.role,
    reason: opts.reason,
  });
  return { role: opts.role };
}
