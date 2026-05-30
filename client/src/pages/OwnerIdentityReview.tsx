import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle, Check, X, SkipForward, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const trpcA = () => (trpc as any);

type LegacyItem = {
  legacyTeamName:  string;
  seasons:         number[];
  pickCount:       number;
  resolvedOwner:   string | null;
  confidence:      number;
  method:          string;
  savedStatus:     string | null;
  savedOwner:      string | null;
};

const METHOD_LABELS: Record<string, string> = {
  season_name:   "Season name match",
  cross_season:  "Cross-season match",
  fuzzy:         "Fuzzy match",
  manual:        "Commissioner approved",
  unresolved:    "No match found",
};

const CONF_COLOR = (c: number) =>
  c >= 88 ? "text-emerald-400" : c >= 60 ? "text-amber-400" : "text-red-400";

const CONF_BG = (c: number) =>
  c >= 88
    ? "border-emerald-700 bg-emerald-900/20 text-emerald-300"
    : c >= 60
    ? "border-amber-700 bg-amber-900/20 text-amber-300"
    : "border-red-700 bg-red-900/20 text-red-300";

function ConfBadge({ confidence, method }: { confidence: number; method: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold", CONF_BG(confidence))}>
      {confidence}% · {METHOD_LABELS[method] ?? method}
    </span>
  );
}

function AliasRow({ item, knownOwners, onSave }: {
  item: LegacyItem;
  knownOwners: string[];
  onSave: (teamName: string, owner: string | null, status: "approved" | "rejected" | "skipped", confidence: number, method: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(item.savedOwner ?? item.resolvedOwner ?? "");
  const saved = item.savedStatus;
  const isDone = saved === "approved" || saved === "rejected";

  return (
    <div className={cn("border-b border-border/40 last:border-0", isDone && "opacity-60")}>
      <div className="flex items-center gap-3 py-2.5 text-sm">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-foreground truncate">{item.legacyTeamName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {item.seasons.join(", ")} · {item.pickCount} pick{item.pickCount !== 1 ? "s" : ""}
          </span>
        </div>

        {saved === "approved" ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            <span>{item.savedOwner}</span>
          </div>
        ) : saved === "rejected" ? (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <X className="h-3.5 w-3.5" />
            <span>Rejected</span>
          </div>
        ) : (
          <ConfBadge confidence={item.confidence} method={item.method} />
        )}

        {!isDone && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <select
              value={selectedOwner}
              onChange={e => setSelectedOwner(e.target.value)}
              className="text-xs py-1 px-2 rounded border border-border bg-background text-foreground"
              style={{ maxWidth: "160px" }}
            >
              <option value="">— assign owner —</option>
              {knownOwners.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
              <option value="__unknown__">Mark as unknown</option>
            </select>
            <button
              type="button"
              onClick={() => selectedOwner && selectedOwner !== "__unknown__"
                ? onSave(item.legacyTeamName, selectedOwner, "approved", item.confidence, item.method)
                : onSave(item.legacyTeamName, null, "rejected", 0, "manual")}
              disabled={!selectedOwner}
              className="p-1.5 rounded border border-emerald-700 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Approve"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSave(item.legacyTeamName, null, "skipped", 0, "manual")}
              className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted/40"
              title="Skip for now"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="pb-3 pl-7 pr-4">
          <div className="rounded border border-border bg-muted/10 px-3 py-2 text-xs space-y-1">
            <div className="flex gap-4">
              <span className="text-muted-foreground">Suggested match:</span>
              <span className="font-medium text-foreground">{item.resolvedOwner ?? "None"}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted-foreground">Method:</span>
              <span className="text-foreground">{METHOD_LABELS[item.method] ?? item.method}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted-foreground">Confidence:</span>
              <span className={cn("font-medium", CONF_COLOR(item.confidence))}>{item.confidence}%</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted-foreground">Seasons with this name:</span>
              <span className="text-foreground">{item.seasons.join(", ")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OwnerIdentityReview() {
  const [filter, setFilter] = useState<"all" | "auto" | "review" | "unresolved">("all");

  const q = trpcA().dataHealth.identityScan.useQuery(undefined, { staleTime: 30_000 });
  const saveMut = trpcA().dataHealth.saveAlias.useMutation({
    onSuccess: () => q.refetch(),
  });

  const d = q.data as any;

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Scanning owner identity…
      </div>
    );
  }
  if (!d) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="mr-2 h-5 w-5" /> No data found. Run a Full Import first.
      </div>
    );
  }

  const knownOwners: any[]   = d.knownOwners ?? [];
  const legacyItems: LegacyItem[] = d.legacyItems ?? [];
  const stats: any           = d.stats ?? {};
  const knownOwnerNames      = knownOwners.map((o: any) => o.ownerName);

  const filtered = legacyItems.filter((item: LegacyItem) => {
    if (filter === "auto")       return item.confidence >= 88;
    if (filter === "review")     return item.confidence >= 50 && item.confidence < 88;
    if (filter === "unresolved") return item.confidence < 50;
    return true;
  });

  function handleSave(
    legacyTeamName: string,
    resolvedOwnerName: string | null,
    status: "approved" | "rejected" | "skipped",
    confidence: number,
    resolutionMethod: string
  ) {
    saveMut.mutate({ legacyTeamName, resolvedOwnerName, status, confidence, resolutionMethod });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Owner Identity Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resolve legacy team names from 2010–2017 to current owner records.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Known owners (2018+)",  value: stats.known        ?? 0, color: "text-foreground" },
          { label: "Auto-resolved (≥88%)",  value: stats.autoResolved ?? 0, color: "text-emerald-400" },
          { label: "Needs review (50–87%)", value: stats.needsReview  ?? 0, color: "text-amber-400" },
          { label: "Unresolved (<50%)",     value: stats.unresolved   ?? 0, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.label}</div>
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Known owners quick list */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/20 transition-colors"
          onClick={e => {
            const el = (e.currentTarget.nextSibling as HTMLElement);
            if (el) el.style.display = el.style.display === "none" ? "block" : "none";
          }}
        >
          <Users className="h-4 w-4" />
          Known owners — {knownOwners.length} active owners (2018–2025)
        </button>
        <div style={{ display: "none" }}>
          <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {knownOwners.map((o: any) => (
              <div key={o.ownerName} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-sm">
                <span className="font-medium text-foreground">{o.ownerName}</span>
                <span className="text-xs text-muted-foreground">
                  {o.seasons[0]}–{o.seasons[o.seasons.length - 1]} · {o.teamNames.slice(0, 2).join(", ")}
                  {o.teamNames.length > 2 && "…"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legacy alias list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 flex-wrap">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">
            Legacy Team Names — {legacyItems.length} unique names from 2010–2017
          </h2>
          <div className="flex gap-1">
            {(["all", "auto", "review", "unresolved"] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2 py-1 rounded text-xs border transition-colors",
                  filter === f
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "border-border text-muted-foreground hover:bg-muted/30"
                )}
              >
                {f === "all" ? "All" : f === "auto" ? "Auto (≥88%)" : f === "review" ? "Review" : "Unresolved"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {legacyItems.length === 0
              ? "No legacy draft picks found. Import 2010–2017 draft data via the extension popup."
              : "No items match this filter."}
          </div>
        ) : (
          <div className="px-4">
            {filtered.map((item: LegacyItem) => (
              <AliasRow
                key={item.legacyTeamName}
                item={item}
                knownOwners={knownOwnerNames}
                onSave={handleSave}
              />
            ))}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-border bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Approved mappings are saved to <span className="font-medium text-foreground">owner_aliases</span> and used to attribute legacy draft picks to known owners in all analytics. Confidence ≥ 88% = structural name match · 50–87% = fuzzy match · &lt;50% = no match found.
          </p>
        </div>
      </div>
    </div>
  );
}
