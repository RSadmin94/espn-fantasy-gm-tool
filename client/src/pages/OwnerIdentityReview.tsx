import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { Loader2, AlertTriangle, Check, X, SkipForward, ChevronDown, ChevronRight, ShieldCheck, Link2, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

const trpcA = () => (trpc as any);

type AutoOwner = {
  canonicalKey:    string;
  memberId:        string | null;
  ownerName:       string;
  seasons:         number[];
  guidSeasons:     number[];
  legacySeasons:   number[];
  teamNames:       string[];
  hasLegacyBridge: boolean;
  confidence:      number;
  reason:          string;
};

type ReviewItem = {
  canonicalKey:          string;
  legacyOwnerName:       string;
  seasons:               number[];
  teamNames:             string[];
  suggestedOwner:        string | null;
  suggestedCanonicalKey: string | null;
  confidence:            number;
  reason:                string;
  savedStatus:           string | null;
  savedOwner:            string | null;
};

const seasonSpan = (xs: number[]) =>
  !xs || xs.length === 0 ? "—" : xs.length === 1 ? `${xs[0]}` : `${xs[0]}–${xs[xs.length - 1]}`;

const CONF_BG = (c: number) =>
  c >= 88
    ? "border-lime-700 bg-lime-900/20 text-lime-300"
    : c >= 60
    ? "border-amber-700 bg-amber-900/20 text-amber-300"
    : "border-red-700 bg-red-900/20 text-red-300";

// ── Auto-matched owners (read-only / confirmed by GUID) ─────────────────────
function AutoMatchedRow({ owner }: { owner: AutoOwner }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-center gap-3 py-2.5 text-sm">
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <ShieldCheck className="h-4 w-4 text-lime-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-foreground truncate">{owner.ownerName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {seasonSpan(owner.seasons)} · {owner.seasons.length} season{owner.seasons.length !== 1 ? "s" : ""}
          </span>
        </div>
        {owner.hasLegacyBridge && (
          <span className="inline-flex items-center gap-1 rounded border border-teal-700 bg-teal-900/20 text-teal-300 px-1.5 py-0.5 text-[10px] font-semibold">
            <Link2 className="h-3 w-3" /> legacy {seasonSpan(owner.legacySeasons)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded border border-lime-700 bg-lime-900/20 text-lime-300 px-1.5 py-0.5 text-[10px] font-semibold">
          <Check className="h-3 w-3" /> GUID
        </span>
      </div>
      {expanded && (
        <div className="pb-3 pl-7 pr-4">
          <div className="rounded border border-border bg-muted/10 px-3 py-2 text-xs space-y-1">
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Member GUID:</span><span className="font-mono text-[11px] text-foreground break-all">{owner.memberId ?? "—"}</span></div>
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">GUID seasons:</span><span className="text-foreground">{owner.guidSeasons.join(", ") || "—"}</span></div>
            {owner.legacySeasons.length > 0 && (
              <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Bridged legacy:</span><span className="text-teal-300">{owner.legacySeasons.join(", ")}</span></div>
            )}
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Team names:</span><span className="text-foreground">{owner.teamNames.join(", ") || "—"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Needs-review row (ambiguous suggestion OR unresolved) ───────────────────
function ReviewRow({ item, knownOwners, onResolve }: {
  item: ReviewItem;
  knownOwners: string[];
  onResolve: (item: ReviewItem, owner: string | null, status: "approved" | "rejected" | "skipped", confidence: number, method: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(item.savedOwner ?? item.suggestedOwner ?? "");
  const saved = item.savedStatus;
  const isDone = saved === "approved" || saved === "rejected";

  return (
    <div className={cn("border-b border-border/40 last:border-0", isDone && "opacity-60")}>
      <div className="flex items-center gap-3 py-2.5 text-sm">
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-foreground truncate">{item.legacyOwnerName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {seasonSpan(item.seasons)} · {item.teamNames.length} team{item.teamNames.length !== 1 ? "s" : ""}
          </span>
        </div>

        {saved === "approved" ? (
          <div className="flex items-center gap-1.5 text-xs text-lime-400"><Check className="h-3.5 w-3.5" /><span>{item.savedOwner}</span></div>
        ) : saved === "rejected" ? (
          <div className="flex items-center gap-1.5 text-xs text-red-400"><X className="h-3.5 w-3.5" /><span>Distinct owner</span></div>
        ) : item.suggestedOwner ? (
          <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold", CONF_BG(item.confidence))}>
            <CircleHelp className="h-3 w-3" /> {item.suggestedOwner} · {item.confidence}%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-red-700 bg-red-900/20 text-red-300 px-1.5 py-0.5 text-[10px] font-semibold">
            <AlertTriangle className="h-3 w-3" /> no match
          </span>
        )}

        {!isDone && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <select value={selected} onChange={e => setSelected(e.target.value)} className="text-xs py-1 px-2 rounded border border-border bg-background text-foreground" style={{ maxWidth: "160px" }}>
              <option value="">— assign owner —</option>
              {knownOwners.map(o => (<option key={o} value={o}>{o}</option>))}
              <option value="__distinct__">Mark as distinct owner</option>
            </select>
            <button type="button"
              onClick={() => selected && selected !== "__distinct__"
                ? onResolve(item, selected, "approved", item.suggestedOwner === selected ? item.confidence : 100, item.suggestedOwner === selected ? "fuzzy" : "manual")
                : onResolve(item, null, "rejected", 0, "manual")}
              disabled={!selected}
              className="p-1.5 rounded border border-lime-700 bg-lime-900/20 text-lime-400 hover:bg-lime-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Confirm">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onResolve(item, null, "skipped", 0, "manual")} className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted/40" title="Skip for now">
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="pb-3 pl-7 pr-4">
          <div className="rounded border border-border bg-muted/10 px-3 py-2 text-xs space-y-1">
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Suggested match:</span><span className="font-medium text-foreground">{item.suggestedOwner ?? "None"}</span></div>
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Confidence:</span><span className="text-foreground">{item.confidence}%</span></div>
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Seasons:</span><span className="text-foreground">{item.seasons.join(", ")}</span></div>
            <div className="flex gap-4"><span className="text-muted-foreground w-32 flex-shrink-0">Team names:</span><span className="text-foreground">{item.teamNames.join(", ") || "—"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export function OwnerIdentityReview() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady =
    Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const q = trpcA().dataHealth.identityScan.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 30_000, enabled: leagueKeyReady },
  );
  const saveMut = trpcA().dataHealth.saveAlias.useMutation();
  const d = q.data as any;

  if (!leagueKeyReady) {
    return (<div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading league…</div>);
  }
  if (q.isLoading) {
    return (<div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Scanning owner identity…</div>);
  }
  if (!d) {
    return (<div className="flex items-center justify-center py-24 text-muted-foreground"><AlertTriangle className="mr-2 h-5 w-5" /> No data found. Run a Full Import first.</div>);
  }

  const autoMatched: AutoOwner[]  = d.autoMatchedOwners ?? [];
  const ambiguous:   ReviewItem[] = d.ambiguousOwners ?? [];
  const unresolved:  ReviewItem[] = d.unresolvedTeams ?? [];
  const idStats = d.identityStats ?? {
    autoMatched: autoMatched.length, autoMatchedWithLegacyBridge: 0,
    ambiguous: ambiguous.length, unresolved: unresolved.length,
  };
  const knownOwnerNames = autoMatched.map(o => o.ownerName);

  // Owner-level resolution: fan out to saveAlias for each of the cluster's team
  // names so legacy draft attribution (keyed by team name) maps to the owner.
  async function resolveLegacyOwner(
    item: ReviewItem, ownerName: string | null,
    status: "approved" | "rejected" | "skipped", confidence: number, method: string,
  ) {
    const names = item.teamNames.length ? item.teamNames : [item.legacyOwnerName];
    for (const tn of names) {
      await saveMut.mutateAsync(withLeagueSalt({
        legacyTeamName: tn,
        resolvedOwnerName: ownerName,
        status, confidence, resolutionMethod: method,
      }, leagueContextKey));
    }
    q.refetch();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Owner Identity Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GUID-matched owners are confirmed automatically. Only genuinely GUID-less legacy owners (pre-2018) need review.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Auto-matched (GUID)",  value: idStats.autoMatched ?? 0,                 color: "text-lime-400" },
          { label: "Incl. legacy bridge",  value: idStats.autoMatchedWithLegacyBridge ?? 0, color: "text-teal-300" },
          { label: "Ambiguous (review)",   value: idStats.ambiguous ?? 0,                   color: "text-amber-400" },
          { label: "Unresolved (action)",  value: idStats.unresolved ?? 0,                  color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.label}</div>
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Auto-matched owners (read-only) */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
          <ShieldCheck className="h-4 w-4 text-lime-400" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">
            Auto-matched owners — {autoMatched.length} confirmed by GUID
          </h2>
        </div>
        {autoMatched.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No owners found. Run a Full Import first.</div>
        ) : (
          <div className="px-4">{autoMatched.map(o => (<AutoMatchedRow key={o.canonicalKey} owner={o} />))}</div>
        )}
        <div className="px-4 py-2.5 border-t border-border bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Confirmed via ESPN member GUID — the authoritative identity. Owners tagged <span className="text-teal-300">legacy</span> also absorb their pre-2018 seasons by exact name match. Read-only; no action needed.
          </p>
        </div>
      </div>

      {/* Ambiguous — likely match, needs confirm */}
      {ambiguous.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
            <CircleHelp className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">
              Ambiguous — {ambiguous.length} likely match{ambiguous.length !== 1 ? "es" : ""}, confirm or reject
            </h2>
          </div>
          <div className="px-4">{ambiguous.map(it => (<ReviewRow key={it.canonicalKey} item={it} knownOwners={knownOwnerNames} onResolve={resolveLegacyOwner} />))}</div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">A close name match to a current owner (e.g. a typo or shortened name). Confirm to merge, or mark as a distinct owner.</p>
          </div>
        </div>
      )}

      {/* Unresolved — GUID-less legacy owners */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">
            Unresolved — {unresolved.length} GUID-less legacy owner{unresolved.length !== 1 ? "s" : ""}
          </h2>
        </div>
        {unresolved.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing unresolved — every legacy owner is matched.</div>
        ) : (
          <div className="px-4">{unresolved.map(it => (<ReviewRow key={it.canonicalKey} item={it} knownOwners={knownOwnerNames} onResolve={resolveLegacyOwner} />))}</div>
        )}
        <div className="px-4 py-2.5 border-t border-border bg-muted/10">
          <p className="text-xs text-muted-foreground">
            These legacy owners (pre-2018) never appear in a GUID season. Assign one to a current owner if they're the same person, or mark as distinct. Saved to <span className="font-medium text-foreground">owner_aliases</span> and applied to legacy draft attribution.
          </p>
        </div>
      </div>
    </div>
  );
}
