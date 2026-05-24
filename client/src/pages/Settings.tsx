import { useState } from "react";
import { Link } from "react-router";
import { useClerk, useUser } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  Trophy,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueRow {
  id: number;
  leagueId: string;
  leagueName: string;
  season: number;
  isActive: boolean;
  syncStatus: string | null;
  lastSyncedAt: Date | string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    syncing: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    failed:  "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      map[status] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function SettingRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", className)}>
      {children}
    </div>
  );
}

// ── 1. Profile section ────────────────────────────────────────────────────────

function ProfileSection() {
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!user) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </CardContent>
      </Card>
    );
  }

  const displayName = user.fullName || user.firstName || user.username || "—";
  const email = user.primaryEmailAddress?.emailAddress;
  const avatarUrl = user.imageUrl;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <User className="h-3.5 w-3.5" /> Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border">
        {/* Avatar + name */}
        <SettingRow>
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-10 w-10 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium text-foreground">{displayName}</div>
              {email && <div className="text-sm text-muted-foreground">{email}</div>}
            </div>
          </div>
        </SettingRow>

        {/* Clerk user ID */}
        <SettingRow>
          <div>
            <div className="text-xs font-medium text-muted-foreground">User ID</div>
            <div className="text-xs text-muted-foreground/60 font-mono mt-0.5">{user.id}</div>
          </div>
        </SettingRow>

        {/* Sign out */}
        <SettingRow>
          <div>
            <div className="text-sm font-medium text-foreground">Sign out</div>
            <div className="text-xs text-muted-foreground">End your current session</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => void signOut()}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

// ── 2. Connected leagues section ──────────────────────────────────────────────

function LeaguesSection() {
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const leaguesQ = trpc.league.getMyLeagues.useQuery();
  const activeQ = trpc.league.getActive.useQuery();

  const removeMutation = trpc.league.removeLeague.useMutation({
    onSuccess: () => {
      setConfirmRemoveId(null);
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
    },
  });

  const leagues = (leaguesQ.data as LeagueRow[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5" /> ESPN Leagues
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {leagues.length === 0
                ? "No leagues connected."
                : `${leagues.length} connected`}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5 h-8 text-xs shrink-0">
            <Link to="/connect">
              <Plus className="h-3 w-3" /> Add League
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 p-0">
        {leaguesQ.isLoading && (
          <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leagues…
          </div>
        )}

        {!leaguesQ.isLoading && leagues.length === 0 && (
          <div className="px-6 py-4 text-sm text-muted-foreground">
            No ESPN leagues connected.{" "}
            <Link to="/connect" className="text-primary underline underline-offset-2">
              Connect one
            </Link>
            .
          </div>
        )}

        {leagues.map((league, i) => {
          const isActive = activeQ.data?.id === league.id;
          const isConfirming = confirmRemoveId === league.id;

          return (
            <div
              key={league.id}
              className={cn(
                "px-6 py-3 border-b border-border last:border-0",
                isActive && "bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground text-sm">
                      {league.leagueName || `League ${league.leagueId}`}
                    </span>
                    {isActive && (
                      <Badge variant="outline" className="border-primary/30 text-primary text-xs py-0 h-4">
                        Active
                      </Badge>
                    )}
                    <SyncBadge status={league.syncStatus} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>ID: {league.leagueId}</span>
                    {league.lastSyncedAt && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(league.lastSyncedAt).toLocaleDateString(undefined, {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Remove / confirm */}
                <div className="shrink-0">
                  {isConfirming ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive">Remove?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs px-2"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate({ leagueConnectionId: league.id })}
                      >
                        {removeMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : "Yes, remove"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 text-muted-foreground"
                        onClick={() => setConfirmRemoveId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmRemoveId(league.id)}
                      aria-label="Remove league"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── 3. Subscription section ───────────────────────────────────────────────────

function SubscriptionSection() {
  const subQ = trpc.billing.getSubscriptionStatus.useQuery();
  const checkoutMutation = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (data) => { window.open(data.url, "_blank", "noopener,noreferrer"); },
  });
  const portalMutation = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => { window.open(data.url, "_blank", "noopener,noreferrer"); },
  });

  const sub = subQ.data;

  const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active:    { label: "Active",    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400", icon: <CheckCircle2 className="h-4 w-4" /> },
    trialing:  { label: "Trial",     className: "border-blue-500/20 bg-blue-500/10 text-blue-400",         icon: <Clock className="h-4 w-4" /> },
    canceled:  { label: "Canceled",  className: "border-red-500/20 bg-red-500/10 text-red-400",            icon: <AlertCircle className="h-4 w-4" /> },
    past_due:  { label: "Past due",  className: "border-orange-500/20 bg-orange-500/10 text-orange-400",   icon: <AlertTriangle className="h-4 w-4" /> },
    inactive:  { label: "Inactive",  className: "border-border bg-muted/30 text-muted-foreground",         icon: <ShieldCheck className="h-4 w-4" /> },
  };

  const cfg = statusConfig[sub?.status ?? "inactive"] ?? statusConfig.inactive;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <CreditCard className="h-3.5 w-3.5" /> Subscription
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {subQ.isError && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" /> {subQ.error.message}
          </div>
        )}

        {sub && (
          <>
            {/* Status badge */}
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium",
              cfg.className
            )}>
              {cfg.icon}
              <span>{cfg.label}</span>
              {sub.status === "trialing" && sub.trialDaysLeft != null && (
                <span className="ml-auto text-xs font-normal opacity-80">
                  {sub.trialDaysLeft > 0
                    ? `${sub.trialDaysLeft} day${sub.trialDaysLeft !== 1 ? "s" : ""} remaining`
                    : "Trial expired"}
                </span>
              )}
              {sub.status === "active" && sub.currentPeriodEnd && (
                <span className="ml-auto text-xs font-normal opacity-80">
                  Renews {new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {!sub.hasAccess && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate({ origin: window.location.origin })}
                >
                  {checkoutMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ExternalLink className="h-3.5 w-3.5" />}
                  Upgrade to Pro
                </Button>
              )}
              {sub.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={portalMutation.isPending}
                  onClick={() => portalMutation.mutate({ origin: window.location.origin })}
                >
                  {portalMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ExternalLink className="h-3.5 w-3.5" />}
                  Manage Billing
                </Button>
              )}
            </div>

            {(checkoutMutation.isError || portalMutation.isError) && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {checkoutMutation.error?.message ?? portalMutation.error?.message}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 4. Danger zone ────────────────────────────────────────────────────────────

function DangerZone() {
  const [clearState, setClearState] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const utils = trpc.useUtils();

  const clearHistoryMutation = trpc.advisor.clearHistory.useMutation({
    onSuccess: () => {
      setClearState("success");
      void utils.advisor.history.invalidate();
      setTimeout(() => setClearState("idle"), 3000);
    },
    onError: (err) => {
      setClearState("error");
      setErrorMsg(err.message);
    },
  });

  function handleClearHistory() {
    const confirmed = window.confirm(
      "Are you sure you want to clear your entire AI Advisor chat history? This cannot be undone."
    );
    if (!confirmed) return;
    setClearState("idle");
    clearHistoryMutation.mutate();
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-destructive flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
        </CardTitle>
        <CardDescription className="text-xs">
          Irreversible actions. Proceed with caution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border">
        <SettingRow className="px-0">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">Clear AI Advisor history</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes all AI chat messages across all seasons.
            </div>
            {clearState === "success" && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1">
                <CheckCircle2 className="h-3 w-3" /> History cleared.
              </div>
            )}
            {clearState === "error" && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                <AlertCircle className="h-3 w-3" /> {errorMsg}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={clearHistoryMutation.isPending}
            onClick={handleClearHistory}
          >
            {clearHistoryMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
            Clear history
          </Button>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your account, leagues, and preferences.
        </p>
      </div>

      <ProfileSection />
      <LeaguesSection />
      <SubscriptionSection />
      <DangerZone />

      {/* Quick nav to other pages */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Connect ESPN", href: "/connect" },
          { label: "Sync Data",    href: "/sync" },
          { label: "AI Advisor",   href: "/advisor" },
        ].map(({ label, href }) => (
          <Link
            key={href}
            to={href}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
          >
            {label}
            <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          </Link>
        ))}
      </div>
    </div>
  );
}
