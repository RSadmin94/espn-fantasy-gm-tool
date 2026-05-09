import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock, Play, Pause, Trash2, Plus, CheckCircle2, XCircle,
  RefreshCw, Calendar, AlertTriangle, Info,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const CRON_DISPLAY = "Every Monday at 6:00 AM UTC";
const CRON_EXPR = "0 0 6 * * 1";

export default function ScheduledRefresh() {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: jobs, refetch } = trpc.schedule.list.useQuery();
  const createMutation = trpc.schedule.create.useMutation();
  const pauseMutation = trpc.schedule.pause.useMutation();
  const resumeMutation = trpc.schedule.resume.useMutation();
  const deleteMutation = trpc.schedule.delete.useMutation();

  const job = jobs?.find((j) => j.name === "weekly-espn-refresh") ?? null;
  const isEnabled = job ? job.isEnabled === 1 : false;
  const hasJob = !!job?.taskUid;

  const handleCreate = async () => {
    if (!user) { toast.error("You must be signed in to create a scheduled job"); return; }
    setIsCreating(true);
    try {
      const result = await createMutation.mutateAsync({ cronExpression: CRON_EXPR });
      toast.success(`Weekly refresh scheduled! Next run: ${result.nextExecutionAt ? new Date(result.nextExecutionAt).toLocaleString() : "TBD"}`);
      refetch();
    } catch (err) {
      toast.error(`Failed to create job: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePause = async () => {
    if (!job?.taskUid) return;
    setIsPausing(true);
    try {
      await pauseMutation.mutateAsync({ taskUid: job.taskUid });
      toast.success("Weekly refresh paused");
      refetch();
    } catch (err) {
      toast.error(`Failed to pause: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    if (!job?.taskUid) return;
    setIsResuming(true);
    try {
      const result = await resumeMutation.mutateAsync({ taskUid: job.taskUid });
      toast.success(`Resumed! Next run: ${(result as { nextExecutionAt?: string }).nextExecutionAt ? new Date((result as { nextExecutionAt?: string }).nextExecutionAt!).toLocaleString() : "TBD"}`);
      refetch();
    } catch (err) {
      toast.error(`Failed to resume: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsResuming(false);
    }
  };

  const handleDelete = async () => {
    if (!job?.taskUid) return;
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync({ taskUid: job.taskUid });
      toast.success("Scheduled job deleted");
      refetch();
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Weekly Auto-Refresh</p>
          <p>
            This job automatically pulls fresh ESPN data for the <strong>2025 and 2026 seasons</strong> every Monday
            at 6:00 AM UTC — before the week's games begin. Closed seasons (2009–2024) are never re-fetched
            since their data is final.
          </p>
          <p className="text-xs">
            The job runs on the Manus platform and survives sandbox hibernation. You can pause, resume, or
            delete it at any time. View execution history in the Manus dashboard under Scheduled Tasks.
          </p>
        </div>
      </div>

      {/* Job status card */}
      <Card className="card-glow bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Weekly ESPN Refresh Job
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasJob ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  No scheduled job exists yet. Create one to enable automatic weekly data refresh.
                </p>
              </div>
              {!user ? (
                <p className="text-xs text-amber-400">
                  You must be signed in to create a scheduled job.
                </p>
              ) : (
                <Button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="espn-gradient text-white border-0"
                >
                  {isCreating ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Creating...</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-2" />Create Weekly Refresh Job</>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    {isEnabled ? (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Active</Badge></>
                    ) : (
                      <><XCircle className="w-4 h-4 text-amber-400" /><Badge variant="outline" className="border-amber-500/40 text-amber-400">Paused</Badge></>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Schedule</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">{CRON_DISPLAY}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Seasons Refreshed</p>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="border-primary/40 text-primary text-xs">2025</Badge>
                    <Badge variant="outline" className="border-primary/40 text-primary text-xs">2026</Badge>
                  </div>
                </div>
              </div>

              {/* Last run / next run */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-border bg-muted/10">
                  <p className="text-xs text-muted-foreground mb-1">Last Run</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                  </p>
                  {job.lastRunStatus && (
                    <Badge
                      variant="outline"
                      className={`text-xs mt-1 ${
                        job.lastRunStatus === "success"
                          ? "border-emerald-500/40 text-emerald-400"
                          : job.lastRunStatus === "partial"
                          ? "border-amber-500/40 text-amber-400"
                          : "border-red-500/40 text-red-400"
                      }`}
                    >
                      {job.lastRunStatus}
                    </Badge>
                  )}
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/10">
                  <p className="text-xs text-muted-foreground mb-1">Next Run</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : isEnabled ? "Scheduled" : "Paused"}
                  </p>
                </div>
              </div>

              {/* Task UID */}
              <div className="p-2 rounded border border-border bg-muted/5">
                <p className="text-xs text-muted-foreground">Task UID</p>
                <p className="text-xs font-mono text-foreground/60 break-all">{job.taskUid}</p>
              </div>

              {/* Actions */}
              {user && (
                <div className="flex gap-2 flex-wrap pt-1">
                  {isEnabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePause}
                      disabled={isPausing}
                    >
                      {isPausing ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Pause className="w-3 h-3 mr-1.5" />}
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResume}
                      disabled={isResuming}
                      className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      {isResuming ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Play className="w-3 h-3 mr-1.5" />}
                      Resume
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                  >
                    {isDeleting ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1.5" />}
                    Delete Job
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="card-glow bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
              <p className="font-medium text-foreground text-xs">1. Platform Trigger</p>
              <p className="text-xs">Every Monday at 6:00 AM UTC, the Manus platform sends a POST to <code className="text-primary">/api/scheduled/espn-refresh</code>.</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
              <p className="font-medium text-foreground text-xs">2. ESPN Fetch</p>
              <p className="text-xs">The server pulls all 11 ESPN API views for 2025 and 2026, normalizes the data, and validates quality.</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
              <p className="font-medium text-foreground text-xs">3. Cache Update</p>
              <p className="text-xs">Updated data is stored in the database. All AI tools (Start/Sit, Waiver Wire, GM Advisor) automatically use the fresh data.</p>
            </div>
          </div>
          <p className="text-xs pt-1">
            The job runs on the Manus platform independently of this sandbox — it will continue firing even when the sandbox is hibernated.
            View full execution history and logs in the Manus dashboard under <strong>Scheduled Tasks</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
