import { getDb } from "../db";
import { adminAuditLog } from "../../drizzle/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export type AuditWrite = {
  actorUserId: number;
  actorOpenId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
};

function clip(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 4000 ? `${s.slice(0, 3997)}...` : s;
}

export async function writeAdminAudit(entry: AuditWrite): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuditLog).values({
    actorUserId: entry.actorUserId,
    actorOpenId: entry.actorOpenId ?? null,
    action: entry.action.slice(0, 64),
    targetType: entry.targetType.slice(0, 32),
    targetId: String(entry.targetId).slice(0, 128),
    previousValue: clip(entry.previousValue),
    newValue: clip(entry.newValue),
    reason: entry.reason ? entry.reason.slice(0, 2000) : null,
    createdAt: new Date(),
  });
}

export async function listAdminAudit(opts: {
  actorUserId?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  start?: Date;
  end?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const conds = [];
  if (opts.actorUserId != null) conds.push(eq(adminAuditLog.actorUserId, opts.actorUserId));
  if (opts.action) conds.push(eq(adminAuditLog.action, opts.action));
  if (opts.targetType) conds.push(eq(adminAuditLog.targetType, opts.targetType));
  if (opts.targetId) conds.push(eq(adminAuditLog.targetId, opts.targetId));
  if (opts.start) conds.push(gte(adminAuditLog.createdAt, opts.start));
  if (opts.end) conds.push(lte(adminAuditLog.createdAt, opts.end));
  const where = conds.length ? and(...conds) : undefined;
  const limit = Math.min(opts.limit ?? 100, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(adminAuditLog)
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ c: sql<number>`COUNT(*)` }).from(adminAuditLog).where(where),
  ]);
  return { rows, total: Number(countRows[0]?.c ?? 0) };
}
