// FILE: client/src/pages/hubs/CommandCenter.tsx
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import AppLayout from "@/components/AppLayout";
import TodaysMission from "@/components/TodaysMission";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Dashboard from "@/pages/Dashboard";
import Standings from "@/pages/Standings";
import Matchups from "@/pages/Matchups";
import ChampionshipEquity from "@/pages/ChampionshipEquity";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_SEASON = new Date().getFullYear();

function TrialBanner() {
  const { user } = useAuth();
  const checkoutMutation = trpc.billing.createCheckoutSession.useMutation();

  if (!user) return null;

  const subscriptionStatus = (user as { subscriptionStatus?: string }).subscriptionStatus ?? "free";
  const trialStartedAt = (user as { trialStartedAt?: string | Date | null }).trialStartedAt ?? null;

  if (subscriptionStatus === "active") return null;

  const handleUpgrade = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({ origin: window.location.origin });
      if (result?.url) window.open(result.url, "_blank");
    } catch (err) {
      console.error("[TrialBanner] Checkout error:", err);
    }
  };

  if (subscriptionStatus === "trialing" && trialStartedAt) {
    const elapsed = Date.now() - new Date(trialStartedAt).getTime();
    const daysLeft = Math.max(0, Math.ceil((TRIAL_DURATION_MS - elapsed) / (1000 * 60 * 60 * 24)));

    if (daysLeft === 0) {
      return (
        <UpgradeStrip
          message="Your free trial has ended. Upgrade to restore full access."
          cta="Upgrade Now →"
          onClick={handleUpgrade}
          pending={checkoutMutation.isPending}
          variant="error"
        />
      );
    }

    return (
      <UpgradeStrip
        message={
          <>
            <span className="text-white font-semibold">{daysLeft} day{daysLeft !== 1 ? "s" : ""}</span> left in your free trial.
          </>
        }
        cta="Upgrade — $29/mo →"
        onClick={handleUpgrade}
        pending={checkoutMutation.isPending}
        variant="default"
      />
    );
  }

  return (
    <div className="bg-zinc-900/80 border-b border-zinc-700/50 px-6 py-2.5 flex items-center gap-2">
      <p className="text-zinc-400 text-sm">
        Connect your ESPN league to start your{" "}
        <span className="text-white font-semibold">7-day free trial</span>.
      </p>
    </div>
  );
}

function UpgradeStrip({
  message,
  cta,
  onClick,
  pending,
  variant,
}: {
  message: React.ReactNode;
  cta: string;
  onClick: () => void;
  pending: boolean;
  variant: "default" | "error";
}) {
  const bg = variant === "error" ? "bg-red-950/60 border-red-800/50" : "bg-zinc-900/80 border-zinc-700/50";
  const text = variant === "error" ? "text-red-300" : "text-zinc-400";
  return (
    <div className={`${bg} border-b px-6 py-2.5 flex items-center justify-between gap-4`}>
      <p className={`${text} text-sm font-medium`}>{message}</p>
      <button
        onClick={onClick}
        disabled={pending}
        className="shrink-0 px-4 py-1.5 rounded-lg bg-white text-[#0a0a0a] text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
      >
        {pending ? "Opening…" : cta}
      </button>
    </div>
  );
}

function LeagueSyncBanner() {
  const { pathname, search } = useLocation();
  const location = `${pathname}${search}`;
  const connected = useMemo(() => {
    const q = location.includes("?") ? location.split("?")[1] : "";
    return new URLSearchParams(q).get("connected") === "1";
  }, [location]);

  const activeLeague = trpc.league.getActive.useQuery(undefined, {
    enabled: connected,
    refetchInterval: connected ? 5000 : false,
  });

  const standings = trpc.espn.standings.useQuery(
    { season: CURRENT_SEASON },
    {
      enabled: connected,
      refetchInterval: connected && activeLeague.data?.syncStatus === "pending" ? 5000 : false,
    }
  );

  const hasStandings = (standings.data?.length ?? 0) > 0;
  const syncDone = activeLeague.data?.syncStatus === "ok" && hasStandings;

  const syncing =
    connected &&
    !syncDone &&
    (activeLeague.data?.syncStatus === "pending" ||
      activeLeague.isLoading ||
      standings.isLoading ||
      !hasStandings);

  if (!syncing) return null;

  return (
    <div className="bg-blue-950/50 border-b border-blue-800/40 px-6 py-3 flex items-center gap-3">
      <Loader2 className="w-4 h-4 text-blue-300 animate-spin shrink-0" />
      <p className="text-blue-200 text-sm font-medium">Syncing your league data…</p>
      <p className="text-blue-300/70 text-xs hidden sm:inline">
        This usually takes under a minute after connecting ESPN.
      </p>
    </div>
  );
}

export default function CommandCenter() {
  const { pathname, search } = useLocation();
  const location = `${pathname}${search}`;

  useEffect(() => {
    if (!location.includes("connected=1")) return;
    const path = location.split("?")[0] || "/command-center";
    const t = window.setTimeout(() => {
      window.history.replaceState({}, "", path);
    }, 120_000);
    return () => window.clearTimeout(t);
  }, [location]);

  return (
    <AppLayout title="Command Center" subtitle="What matters most this week — and what to do about it">
      <TrialBanner />
      <LeagueSyncBanner />
      <TodaysMission season={CURRENT_SEASON} />
      <Tabs defaultValue="war-room" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="war-room" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              War Room
            </TabsTrigger>
            <TabsTrigger value="standings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Standings
            </TabsTrigger>
            <TabsTrigger value="matchups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Matchups
            </TabsTrigger>
            <TabsTrigger value="champ-equity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              🏆 Champ Equity
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="war-room" className="mt-0">
          <Dashboard />
        </TabsContent>
        <TabsContent value="standings" className="mt-0">
          <Standings />
        </TabsContent>
        <TabsContent value="matchups" className="mt-0">
          <Matchups />
        </TabsContent>
        <TabsContent value="champ-equity" className="mt-0">
          <ChampionshipEquity />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
