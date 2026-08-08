import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@clerk/react-router";
import { Loader2, ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { useFunnel } from "@/lib/funnel";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const MUTED = "var(--color-muted-foreground)";
const LINE = "rgba(255,255,255,0.08)";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(139,92,246,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function claimErrorText(error?: string): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.includes("already_claimed")) return "That team has already been claimed by another account.";
  if (error.includes("owner_not_found")) return "We couldn't match that team. Try choosing from the list.";
  return "Something went wrong. Please try again.";
}

type Owner = { teamId: number; ownerKey: string; ownerName: string; franchiseName: string; claimed: boolean };

export function Claim() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const track = useFunnel();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const preview = trpc.league.previewClaim.useQuery(
    { code },
    { enabled: !!isSignedIn && !!code, staleTime: Infinity, retry: false },
  );

  const claim = trpc.league.claimOwner.useMutation({
    onSuccess: (res) => {
      if (res?.success) {
        // Bridge event: carries visitorId (metadata) + userId (server ctx) — stitches anon -> user.
        track("claim_completed", { eventType: "feature_open", page: "/claim", extra: { code: code || null, confidence: res.confidence ?? null, leagueConnectionId: res.leagueConnectionId ?? null } });
        navigate("/league-dna");
      } else {
        setErrMsg(claimErrorText(res?.error));
        setPendingKey(null);
      }
    },
    onError: () => {
      setErrMsg("Something went wrong. Please try again.");
      setPendingKey(null);
    },
  });

  // Funnel: claim screen reached with intent. Fires once when the preview is ready.
  const firedStart = useRef(false);
  useEffect(() => {
    if (preview.data && !firedStart.current) {
      firedStart.current = true;
      track("claim_started", { eventType: "feature_open", page: "/claim", extra: { code: code || null, leagueId: preview.data.leagueId } });
    }
  }, [preview.data, track, code]);

  if (!isLoaded) {
    return <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} /></div></Shell>;
  }

  // Not signed in: bounce to sign-in, preserving the code so we return here after auth.
  if (!isSignedIn) {
    const back = "/claim" + (code ? `?code=${encodeURIComponent(code)}` : "");
    return <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(back)}`} replace />;
  }

  if (preview.isLoading) {
    return <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} /></div></Shell>;
  }

  const data = preview.data;
  if (!data || data.owners.length === 0) {
    return (
      <Shell>
        <div className="rounded-2xl p-8 text-center" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
          <p className="text-lg font-black">We couldn't find your league yet.</p>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            This league may not be synced. Ask whoever runs your league for their Receipt link, or connect it from Settings.
          </p>
        </div>
      </Shell>
    );
  }

  const busy = pendingKey !== null;
  const doClaim = (o: Owner) => {
    setErrMsg(null);
    setPendingKey(o.ownerKey);
    claim.mutate({ leagueId: data.leagueId, ownerKey: o.ownerKey, teamId: o.teamId, season: data.season, code });
  };

  const header = (
    <div className="text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>Fantasy Football Rivals</div>
      <div className="mt-2 text-sm font-semibold tracking-wide" style={{ color: "#cfd2d8" }}>{data.leagueName}</div>
    </div>
  );

  // Owner-selection grid: the viewer picks their own team. A receipt identifies the LEAGUE
  // only — it never preselects the receipt's subject as the viewer's identity.
  return (
    <Shell>
      {header}
      <div className="mt-5 rounded-2xl p-5" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
        <p className="text-center text-base font-black">Which team is yours?</p>
        <p className="mt-1 text-center text-sm" style={{ color: MUTED }}>Tap your team to claim your profile.</p>
        <div className="mt-4 space-y-2">
          {data.owners.map((o) => {
            const isPending = busy && pendingKey === o.ownerKey;
            const claimed = o.claimed;
            return (
              <button
                key={o.ownerKey}
                onClick={() => { if (!claimed) doClaim(o); }}
                disabled={busy || claimed}
                aria-disabled={claimed}
                className="flex w-full items-center justify-between rounded-[10px] px-4 py-3 text-left disabled:opacity-50"
                style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)", cursor: claimed ? "not-allowed" : undefined }}
              >
                <span>
                  <span className="block text-sm font-black">{o.ownerName}</span>
                  {o.franchiseName && <span className="block text-xs" style={{ color: MUTED }}>{o.franchiseName}</span>}
                </span>
                {claimed
                  ? <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Already claimed</span>
                  : isPending ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} /> : <ArrowRight className="h-4 w-4" style={{ color: MUTED }} />}
              </button>
            );
          })}
        </div>
        {errMsg && <p className="mt-3 text-center text-xs" style={{ color: "#f87171" }}>{errMsg}</p>}
      </div>
    </Shell>
  );
}
