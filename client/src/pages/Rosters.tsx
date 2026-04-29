import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";

const SLOT_MAP: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K",
  20: "Bench", 21: "IR", 23: "Flex", 5: "Flex",
};
const POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST",
};
const SLOT_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  Flex: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  Bench: "text-muted-foreground border-border bg-muted/20",
  IR: "text-slate-400 border-slate-500/30 bg-slate-500/10",
};

export default function Rosters() {
  const [season, setSeason] = useState(2025);
  const [teamId, setTeamId] = useState<number | undefined>(undefined);

  const { data: teams } = trpc.espn.teams.useQuery({ season });
  const { data: rosters, isLoading } = trpc.espn.rosters.useQuery({ season, teamId });

  // Group rosters by team
  const rostersByTeam: Record<number, Record<string, unknown>[]> = {};
  if (rosters) {
    for (const entry of rosters as Record<string, unknown>[]) {
      const tid = entry.teamId as number;
      if (!rostersByTeam[tid]) rostersByTeam[tid] = [];
      rostersByTeam[tid].push(entry);
    }
  }

  const teamList = (teams as Record<string, unknown>[]) || [];
  const displayTeams = teamId ? teamList.filter((t) => t.teamId === teamId) : teamList;

  return (
    <AppLayout title="Team Rosters" subtitle="Player rosters by team and season">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <SeasonSelector value={season} onChange={(s) => { setSeason(s); setTeamId(undefined); }} />
          <Select value={teamId ? String(teamId) : "all"} onValueChange={(v) => setTeamId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teamList.map((t) => (
                <SelectItem key={String(t.teamId)} value={String(t.teamId)}>
                  {String(t.teamName || "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
          </div>
        ) : Object.keys(rostersByTeam).length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No roster data for {season}. Use Data Refresh to load this season.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {displayTeams.map((team) => {
              const tid = team.teamId as number;
              const players = rostersByTeam[tid] || [];
              const starters = players.filter((p) => {
                const slot = p.lineupSlotId as number;
                return slot !== 20 && slot !== 21;
              });
              const bench = players.filter((p) => (p.lineupSlotId as number) === 20 || (p.lineupSlotId as number) === 21);

              return (
                <Card key={tid} className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="truncate">{String(team.teamName || "")}</span>
                      <span className="text-xs text-muted-foreground font-normal ml-auto flex-shrink-0">{String(team.owners || "")}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {starters.map((player, i) => <PlayerRow key={i} player={player} />)}
                      {bench.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 bg-muted/20">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Bench / IR</p>
                          </div>
                          {bench.map((player, i) => <PlayerRow key={`b${i}`} player={player} />)}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PlayerRow({ player }: { player: Record<string, unknown> }) {
  const slotId = player.lineupSlotId as number;
  const posId = player.defaultPositionId as number;
  const slotLabel = SLOT_MAP[slotId] || `Slot ${slotId}`;
  const posLabel = POS_MAP[posId] || "—";
  const colorClass = SLOT_COLORS[slotLabel] || SLOT_COLORS.Bench;
  const acqType = String(player.acquisitionType || "");

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-accent/30 transition-colors">
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 flex-shrink-0 ${colorClass}`}>
        {slotLabel}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{String(player.playerName || "Unknown Player")}</p>
        <p className="text-xs text-muted-foreground">{posLabel} · {String(player.proTeam || "")}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {Boolean(player.injured) && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-red-500/40 text-red-400">INJ</Badge>}
        {acqType && <span className="text-[10px] text-muted-foreground">{acqType.slice(0, 4)}</span>}
        {player.projectedPoints != null && (
          <span className="text-xs font-mono text-emerald-400">{Number(player.projectedPoints).toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}
