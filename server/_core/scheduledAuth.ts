import type { Request } from "express";

export type ScheduledRequestAuth = {
  jobId: string;
  isCron: true;
};

export function authenticateScheduledRequest(req: Request): ScheduledRequestAuth | null {
  const expectedSecret = process.env.SCHEDULED_JOB_SECRET ?? "";
  const providedSecret =
    req.header("x-scheduled-job-secret") ??
    (typeof req.query.secret === "string" ? req.query.secret : "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return null;
  }

  if (!expectedSecret) {
    console.warn(
      "[ScheduledAuth] SCHEDULED_JOB_SECRET is not set; accepting scheduled request without shared-secret validation."
    );
  }

  return {
    jobId: req.header("x-scheduled-job-id") ?? req.header("x-railway-job-id") ?? "scheduled",
    isCron: true,
  };
}
