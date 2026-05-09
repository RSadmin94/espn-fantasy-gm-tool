// SavedDrafts.tsx — Review and compare saved mock draft results
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, ChevronDown, ChevronUp, Trophy, Calendar, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-yellow-300", A: "text-yellow-400", "A-": "text-yellow-500",
  "B+": "text-green-300", B: "text-green-400", "B-": "text-green-500",
  "C+": "text-blue-300", C: "text-blue-400", "C-": "text-blue-500",
  "D+": "text-orange-300", D: "text-orange-400",
  F: "text-red-400",
};

type SavedDraft = {
  id: number;
  label: string;
  draftSlot: number;
  totalTeams: number;
  totalRounds: number;
  grade: string;
  avgEcr: number;
  totalVbd: number;
  createdAt: Date;
};

type PickEntry = {
  round: number;
  pick: number;
  overall: number;
  owner: string;
  player: { name: string; position: string; team: string; ecrRank: number; adp?: number };
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function GradeBar({ grade }: { grade: string }) {
  return (
    <span className={cn("text-4xl font-black", GRADE_COLORS[grade] ?? "text-foreground")}>{grade}</span>
  );
}

function DraftDetailView({ draftId, onClose }: { draftId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.draftBoard.getDraft.useQuery({ id: draftId });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading draft details…</div>;
  if (!data) return <div className="p-6 text-muted-foreground text-sm">Draft not found.</div>;

  const rodPicks = (data.rodPicksJson as PickEntry[]) ?? [];
  const allPicks = (data.allPicksJson as PickEntry[]) ?? [];

  // Build team rosters from allPicks
  const teamMap: Record<string, PickEntry[]> = {};
  for (const p of allPicks) {
    if (!teamMap[p.owner]) teamMap[p.owner] = [];
    teamMap[p.owner].push(p);
  }

  // Positional breakdown of Rod's picks
  const posCounts: Record<string, number> = {};
  for (const p of rodPicks) {
    posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{data.label}</h2>
          <p className="text-sm text-muted-foreground">{formatDate(data.createdAt)} · Slot {data.draftSlot} · {data.totalRounds} rounds</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>← Back to List</Button>
      </div>

      {/* Rod's summary */}
      <Card className="border-emerald-500/30 bg-emerald-500/10">
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Grade</p>
            <GradeBar grade={data.grade} />
          </div>
          <div className="space-y-1">
            <p className="text-emerald-300 font-semibold">Your Draft Results</p>
            <p className="text-sm text-muted-foreground">Avg ECR: <span className="text-foreground font-medium">{data.avgEcr.toFixed(1)}</span></p>
            <p className="text-sm text-muted-foreground">Total VBD: <span className="text-foreground font-medium">{data.totalVbd}</span></p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(posCounts).map(([pos, cnt]) => (
              <span key={pos} className={cn("text-xs px-2 py-1 rounded border", POS_COLORS[pos] ?? "")}>
                {pos} ×{cnt}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rod's picks table */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Your Picks</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Rd</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pick</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Overall</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pos</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Player</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Team</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">ECR</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">ADP</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {rodPicks.map((p) => {
                const gap = p.player.adp != null ? Math.round(p.player.adp - p.overall) : null;
                return (
                  <tr key={p.overall} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">{p.round}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.pick}</td>
                    <td className="px-3 py-2 text-muted-foreground">#{p.overall}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-5", POS_COLORS[p.player.position] ?? "")}>
                        {p.player.position}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-foreground font-medium">{p.player.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.player.team}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">#{p.player.ecrRank}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {p.player.adp != null ? p.player.adp.toFixed(1) : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium", gap == null ? "text-muted-foreground" : gap > 0 ? "text-emerald-400" : gap < 0 ? "text-red-400" : "text-muted-foreground")}>
                      {gap == null ? "—" : gap > 0 ? `+${gap}` : `${gap}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Gap = ADP − Overall pick. Positive = value (went later than expected), negative = reach.</p>
      </div>

      {/* All teams summary */}
      {Object.keys(teamMap).length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> All Teams
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(teamMap).map(([owner, picks]) => {
              const posCnt: Record<string, number> = {};
              for (const p of picks) posCnt[p.player.position] = (posCnt[p.player.position] ?? 0) + 1;
              const isRod = owner === (rodPicks[0]?.owner ?? "");
              return (
                <Card key={owner} className={cn("border", isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30")}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground truncate">{owner}</span>
                      {isRod && <span className="text-xs text-primary font-semibold shrink-0 ml-2">YOU</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(posCnt).map(([pos, cnt]) => (
                        <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos] ?? "")}>
                          {pos}×{cnt}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavedDrafts() {
  const utils = trpc.useUtils();
  const { data: drafts = [], isLoading } = trpc.draftBoard.listDrafts.useQuery();
  const deleteMutation = trpc.draftBoard.deleteDraft.useMutation({
    onSuccess: () => {
      utils.draftBoard.listDrafts.invalidate();
      toast.success("Draft deleted.");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (expandedId !== null) {
    return <DraftDetailView draftId={expandedId} onClose={() => setExpandedId(null)} />;
  }

  const bestGrade = drafts.reduce<SavedDraft | null>((best, d) => {
    if (!best) return d;
    const gradeOrder = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","F"];
    return gradeOrder.indexOf(d.grade) < gradeOrder.indexOf(best.grade) ? d : best;
  }, null);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Saved Mock Drafts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review and compare your completed mock draft simulations.
        </p>
      </div>

      {/* Summary stats */}
      {drafts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Total Mocks</p>
                <p className="text-2xl font-bold text-foreground">{drafts.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Target className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Best Grade</p>
                <p className={cn("text-2xl font-bold", GRADE_COLORS[bestGrade?.grade ?? ""] ?? "text-foreground")}>
                  {bestGrade?.grade ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Avg ECR (best)</p>
                <p className="text-2xl font-bold text-foreground">
                  {bestGrade ? bestGrade.avgEcr.toFixed(1) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-purple-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Latest</p>
                <p className="text-sm font-semibold text-foreground">
                  {drafts[0] ? new Date(drafts[0].createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Draft list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading saved drafts…</div>
      ) : drafts.length === 0 ? (
        <Card className="border-slate-700/50 bg-slate-800/30">
          <CardContent className="p-12 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-foreground font-medium mb-1">No saved drafts yet</p>
            <p className="text-muted-foreground text-sm">
              Complete a mock draft in the Mock Draft Simulator tab and click "Save Draft Results" to save it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Card
              key={d.id}
              className={cn(
                "border transition-colors",
                bestGrade?.id === d.id ? "border-amber-500/40 bg-amber-500/5" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Grade */}
                  <div className="text-center w-12 shrink-0">
                    <span className={cn("text-3xl font-black", GRADE_COLORS[d.grade] ?? "text-foreground")}>{d.grade}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{d.label}</p>
                      {bestGrade?.id === d.id && (
                        <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">Best</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>Slot {d.draftSlot}</span>
                      <span>·</span>
                      <span>Avg ECR {d.avgEcr.toFixed(1)}</span>
                      <span>·</span>
                      <span>VBD {d.totalVbd}</span>
                      <span>·</span>
                      <span>{formatDate(d.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedId(d.id)}
                      className="gap-1.5 text-xs"
                    >
                      View Details <ChevronDown className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === d.id || deleteMutation.isPending}
                      onClick={() => {
                        setDeletingId(d.id);
                        deleteMutation.mutate({ id: d.id }, { onSettled: () => setDeletingId(null) });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
