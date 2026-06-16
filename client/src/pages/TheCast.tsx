import { type CSSProperties, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { useState } from "react";
import { Crown, Loader2, Clapperboard, Share2 } from "lucide-react";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const VIOLET = "#c4b5fd";
const MUTED = "#8b97a8";
const LINE = "rgba(255,255,255,0.08)";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(139,92,246,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

type Badge = { label: string; receipt: string; tier: string };
type CastMember = {
  memberId: string;
  ownerName: string;
  archetype: string;
  archetypeReceipt: string;
  identityRank: { rank: number; of: number } | null;
  badges: Badge[];
  isYou: boolean;
};

type PastChampion = { memberId: string; ownerName: string; championships: number; championshipYears: number[] };

const PERSONALITY = new Set(["The Trade Shark", "The Chaos Agent", "The Hothead"]);
const BADGE_RANK: Record<string, number> = { villain: 0, dynasty: 1, champion: 2, gatekeeper: 3, playoff_fixture: 4 };
const topBadge = (m: CastMember) => Math.min(99, ...m.badges.map((b) => BADGE_RANK[b.tier] ?? 98));

function YouTag() {
  return <span className="ml-2 align-middle rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: LIME, color: "#0b0809" }}>YOU</span>;
}
function ChooseTeamCTA() {
  return (
    <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(163,230,53,.06)", border: `1px solid ${LIME}44` }}>
      <p className="text-sm font-black" style={{ color: "#f3f8ff" }}>Choose your team to pull your Cast card</p>
      <p className="mx-auto mt-1 max-w-sm text-xs" style={{ color: MUTED }}>We don't know which team is yours in this league yet - pick it to unlock your own card and Receipt.</p>
      <a href="/settings" className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] px-5 py-2.5 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>Select your team</a>
    </div>
  );
}
function SectionTitle({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: LINE }} />
      <div className="text-xs font-black uppercase tracking-[0.3em]" style={{ color }}>{children}</div>
      <div className="h-px flex-1" style={{ background: LINE }} />
    </div>
  );
}

function Headliner({ m }: { m: CastMember }) {
  const champ = m.badges.find((b) => b.tier === "champion");
  const others = m.badges.filter((b) => b.tier !== "champion");
  const fallback = !champ && others.length ? others[0] : null;
  return (
    <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: "linear-gradient(160deg,rgba(245,197,24,.12),rgba(245,197,24,.03))", border: `1px solid ${GOLD}55` }}>
      <Crown className="absolute right-3 top-3 h-7 w-7 opacity-30" style={{ color: GOLD }} />
      {others.length > 0 && (
        <div className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>{others.map((b) => b.label).join(" · ")}</div>
      )}
      <div className="mt-1 text-2xl font-black leading-tight">{m.ownerName}{m.isYou && <YouTag />}</div>
      {champ && (
        <>
          <div className="mt-1 text-lg font-black" style={{ color: GOLD }}>{champ.label}</div>
          <div className="text-xs leading-snug" style={{ color: MUTED }}>{champ.receipt}</div>
        </>
      )}
      {fallback && <div className="mt-1 text-xs leading-snug" style={{ color: MUTED }}>{fallback.receipt}</div>}
      <div className="mt-2 text-sm font-semibold" style={{ color: "#cfd2d8" }}>{m.archetype}{m.identityRank ? ` · #${m.identityRank.rank}/${m.identityRank.of}` : ""}</div>
    </div>
  );
}

function PersonaCard({ m }: { m: CastMember }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(163,230,53,.05)", border: `1px solid ${LIME}33` }}>
      <div className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: LIME }}>{m.archetype}{m.identityRank ? ` · #${m.identityRank.rank}/${m.identityRank.of}` : ""}</div>
      <div className="mt-1 text-lg font-black leading-tight">{m.ownerName}{m.isYou && <YouTag />}</div>
      <div className="mt-1 text-xs leading-snug" style={{ color: MUTED }}>{m.archetypeReceipt}</div>
    </div>
  );
}
function WildCard({ m }: { m: CastMember }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(196,181,253,.05)", border: `1px solid ${VIOLET}33` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: VIOLET }}>{m.archetype}</div>
      <div className="mt-0.5 text-base font-bold leading-tight">{m.ownerName}{m.isYou && <YouTag />}</div>
      <div className="mt-1 text-[11px] leading-snug" style={{ color: MUTED }}>{m.archetypeReceipt}</div>
    </div>
  );
}

export function TheCast() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = (trpc as any).dna.leagueCast.useQuery(withLeagueSalt({}, leagueContextKey), { staleTime: 60_000, enabled: ready });
  const data = q.data as { leagueName: string; season: number; cast: CastMember[]; pastChampions?: PastChampion[] } | null | undefined;
  const profileQ = (trpc as any).me.activeProfile.useQuery(withLeagueSalt({}, leagueContextKey), { staleTime: 600_000, retry: false, enabled: ready });
  const needsOwnerSelection = ready && !!profileQ.data && profileQ.data.isSetupComplete === false;
  const createReceipt = (trpc as any).dna.createReceipt.useMutation();
  const [copied, setCopied] = useState(false);
  const shareMyReceipt = async () => {
    try {
      const res = await createReceipt.mutateAsync({});
      const link = res.code
        ? `${window.location.origin}/r/${res.code}`
        : `${window.location.origin}/p/${res.token}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* error surfaced via createReceipt.isError */ }
  };

  if (!ready || q.isLoading) {
    return (
      <div style={PAGEBG} className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }
  if (!data || !data.cast?.length) {
    return (
      <div style={PAGEBG} className="flex min-h-screen items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          {needsOwnerSelection ? <ChooseTeamCTA /> : <>
          <Clapperboard className="mx-auto h-10 w-10" style={{ color: MUTED }} />
          <p className="mt-3 text-sm" style={{ color: MUTED }}>The Cast isn't ready yet - finish your league profile setup and sync your history.</p>
          </>}
        </div>
      </div>
    );
  }

  const cast = [...data.cast];
  const headliners = cast.filter((m) => m.badges.length > 0).sort((a, b) => topBadge(a) - topBadge(b));
  const rest = cast.filter((m) => m.badges.length === 0);
  const personalities = rest.filter((m) => PERSONALITY.has(m.archetype));
  const wildcards = rest.filter((m) => !PERSONALITY.has(m.archetype));
  const pastChampions = data.pastChampions ?? [];
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={PAGEBG} className="min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>Fantasy Football Rivals</div>
          <h2 className="mt-3 text-xl font-bold tracking-wide" style={{ color: "#cfd2d8" }}>{data.leagueName}</h2>
          <h1 className="mt-1 text-6xl font-black tracking-tight md:text-8xl" style={{ textShadow: "0 2px 30px rgba(245,197,24,.25)" }}>THE CAST</h1>
          <div className="mt-3 text-xs uppercase tracking-[0.3em]" style={{ color: MUTED }}>{data.season} Season &middot; {data.cast.length} Managers</div>
          <button onClick={shareMyReceipt} disabled={createReceipt.isPending} className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-extrabold transition hover:brightness-110 disabled:opacity-60" style={{ background: GOLD, color: "#0b0809" }}>
            <Share2 className="h-4 w-4" /> {createReceipt.isPending ? "Creating..." : copied ? "Link copied!" : "Share my Receipt"}
          </button>
          {createReceipt.isError && <div className="mt-2 text-[11px]" style={{ color: "#f87171" }}>{String(createReceipt.error?.message ?? "Couldn't create link")}</div>}
        </div>

        {needsOwnerSelection && <div className="mx-auto mt-6 max-w-md"><ChooseTeamCTA /></div>}

        {headliners.length > 0 && (
          <div className="mt-10">
            <SectionTitle color={GOLD}>Headliners</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">{headliners.map((m) => <Headliner key={m.memberId} m={m} />)}</div>
          </div>
        )}
        {personalities.length > 0 && (
          <div className="mt-10">
            <SectionTitle color={LIME}>Personalities</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{personalities.map((m) => <PersonaCard key={m.memberId} m={m} />)}</div>
          </div>
        )}
        {wildcards.length > 0 && (
          <div className="mt-10">
            <SectionTitle color={VIOLET}>Wildcards</SectionTitle>
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">{wildcards.map((m) => <WildCard key={m.memberId} m={m} />)}</div>
          </div>
        )}

        {pastChampions.length > 0 && (
          <div className="mt-10">
            <SectionTitle color={GOLD}>Past Champions</SectionTitle>
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
              {pastChampions.map((m) => (
                <div key={m.memberId} className="rounded-lg p-3" style={{ background: "rgba(245,197,24,.05)", border: `1px solid ${GOLD}33` }}>
                  <div className="flex items-center gap-1.5">
                    <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                    <span className="text-sm font-black leading-tight">{m.ownerName}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: GOLD }}>{m.championships > 1 ? `${m.championships}x Champion` : "Champion"}</div>
                  <div className="text-[11px]" style={{ color: MUTED }}>{m.championshipYears.join(", ")}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px]" style={{ color: MUTED }}>No longer in the league - their banners stay up.</p>
          </div>
        )}

        <div className="mt-12 text-center text-[11px]" style={{ color: MUTED }}>Generated {now} &middot; gmwarroom.online</div>
      </div>
    </div>
  );
}
