import { useMemo } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { DashboardRecentLeagueEvents } from "@/components/dashboard/DashboardRecentLeagueEvents";
import { Shield, Trophy, Award, Hexagon, Crown, ChevronRight } from "lucide-react";

const BG="#0a0e14", CARD="#11161f", CARD2="#0e131c", LINE="rgba(255,255,255,.07)", SUBBG="rgba(255,255,255,.03)";
const RED="#ef4444", GREEN="#22c55e", GOLD="#f5c518", MUTED="#8b97a8", TEXT="#f3f8ff";
const PAGE: React.CSSProperties = { background:"radial-gradient(circle at 82% -8%,rgba(239,68,68,.10),transparent 42%),linear-gradient(180deg,#0b0f17,#080b11)", color:TEXT };
const PANEL: React.CSSProperties = { background:CARD, border:`1px solid ${LINE}`, borderRadius:14 };

const nn=(x:any)=>{ const v=Number(x); return Number.isFinite(v)?v:0; };
function normalize(raw:any){ if(!raw||typeof raw!=="object")return null; const teamId=nn(raw.teamId??raw.id); if(!teamId)return null;
  const teamName=String(raw.teamName??raw.name??("Team "+teamId)).trim()||("Team "+teamId);
  const ownerName=String(raw.owners??raw.ownerName??raw.owner??"").trim();
  let rankFinal:any=null; for(const k of ["rankFinal","rank","standing"]){ const v=raw[k]; if(v!=null&&Number.isFinite(Number(v))&&Number(v)>0){rankFinal=Number(v);break;} }
  return { teamId, teamName, ownerName, wins:nn(raw.wins), losses:nn(raw.losses), ties:nn(raw.ties), pointsFor:nn(raw.pointsFor??raw.PF), rankFinal, logoUrl:String(raw.logoUrl??raw.logo??"").trim()||undefined }; }
function winPct(t:any){ const w=nn(t.wins),l=nn(t.losses),ti=nn(t.ties),g=w+l+ti; return g>0?(w+0.5*ti)/g:0; }
function rankRows(rows:any[]){ const s=[...rows].sort((a,b)=>{ const d=winPct(b)-winPct(a); if(Math.abs(d)>1e-9)return d; return nn(b.pointsFor)-nn(a.pointsFor); }); return s.map((t,i)=>({...t,displayRank:i+1})); }
function ordinal(num:number){ const s=["th","st","nd","rd"], v=num%100; return num+(s[(v-20)%10]||s[v]||s[0]); }
function pct3(x:number){ return x.toFixed(3).replace(/^0/,""); }

export function CommandDashboard(){
  const lg:any = useLeagueContext();
  const season = lg?.season ?? new Date().getFullYear();
  const teamCount0 = lg?.teamCount ?? 0;
  const myTeamId:number|null = lg?.myTeamId ?? null;

  const pulseQ = trpc.weeklyAssessment.leaguePulse.useQuery({ season }, { retry:false, staleTime:60000, refetchOnWindowFocus:false } as any);
  const week = (pulseQ.data as any)?.week ?? 0;
  const standingsQ = trpc.espn.standings.useQuery({ season }, { staleTime:60000, refetchOnWindowFocus:false } as any);
  const scoreboardQ = trpc.espn.matchupsScoreboard.useQuery({ season, week: week>=1?week:1 }, { enabled: week>=1 && pulseQ.isSuccess, staleTime:60000, refetchOnWindowFocus:false } as any);
  const hofQ = trpc.espn.hallOfFame.useQuery(undefined, { staleTime:120000, refetchOnWindowFocus:false } as any);

  const pulseTeams:any[] = (pulseQ.data as any)?.teams ?? [];
  const ownerMap = useMemo(()=>{ const m=new Map<number,string>(); for(const t of pulseTeams){ if(t.teamId>0 && t.ownerName?.trim()) m.set(t.teamId, t.ownerName.trim()); } return m; }, [pulseTeams]);
  const ranked = useMemo(()=>{ const raw=(standingsQ.data as any); const arr=Array.isArray(raw)?raw:(raw?.teams ?? raw?.standings ?? []); const base=(arr as any[]).map(normalize).filter(Boolean) as any[]; return rankRows(base).map(t=>({ ...t, ownerName: ownerMap.get(t.teamId) || t.ownerName || t.teamName })); }, [standingsQ.data, ownerMap]);
  const teamCount = teamCount0 || ranked.length;

  const myRow = useMemo(()=> (myTeamId? ranked.find(t=>t.teamId===myTeamId):null) ?? ranked[0] ?? null, [ranked, myTeamId]);
  const champRecord = useMemo(()=>{ const recs=(hofQ.data as any)?.ownerRecords ?? []; if(!myRow) return null; return recs.find((r:any)=> (r.ownerName||"").trim().toLowerCase()===(myRow.ownerName||"").trim().toLowerCase()) ?? null; }, [hofQ.data, myRow]);
  const champs = champRecord?.championships ?? 0;
  const lastWon = useMemo(()=>{ const hist=(hofQ.data as any)?.championships?.history ?? []; if(!myRow) return null; const mine=hist.filter((h:any)=> (h.ownerName||"").trim().toLowerCase()===(myRow.ownerName||"").trim().toLowerCase()).map((h:any)=>nn(h.season||h.year)).filter(Boolean); return mine.length?Math.max(...mine):null; }, [hofQ.data, myRow]);

  const scoreRows:any[] = (scoreboardQ.data as any)?.matchups ?? [];
  const loading = standingsQ.isLoading || pulseQ.isLoading;

  return (
    <div style={PAGE} className="-m-4 md:-m-6 p-5 md:p-6 min-h-full">
      {/* Hero stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard icon={<Shield className="h-7 w-7" style={{color:GREEN}}/>} label="YOUR LEAGUE RECORD"
          value={myRow?`${myRow.wins}-${myRow.losses}`:"\u2014"} valueColor={GREEN}
          sub={myRow?`WIN PCT ${pct3(winPct(myRow))}`:""} />
        <StatCard icon={<Trophy className="h-7 w-7" style={{color:GOLD}}/>} label="CHAMPIONSHIPS"
          value={String(champs)} valueColor={TEXT}
          sub={lastWon?`LAST WON: ${lastWon}`:"\u2014"} subColor={GOLD} />
        <StatCard icon={<Award className="h-7 w-7" style={{color:GREEN}}/>} label="CURRENT RANK"
          value={myRow?ordinal(myRow.displayRank):"\u2014"} valueColor={GREEN}
          sub={`OUT OF ${teamCount||"?"} TEAMS`} />
        <StatCard icon={<Hexagon className="h-7 w-7" style={{color:GREEN}}/>} label="POINTS FOR"
          value={myRow?Math.round(myRow.pointsFor).toLocaleString():"\u2014"} valueColor={GREEN}
          sub="THIS SEASON" />
      </div>

      {/* Standings + Matchups */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3 mb-3">
        <div style={PANEL} className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-lg font-black tracking-tight">LEAGUE STANDINGS</h3>
            <Link to="/standings" className="text-xs font-bold flex items-center gap-1 no-underline" style={{color:RED}}>VIEW FULL STANDINGS <ChevronRight className="h-3.5 w-3.5"/></Link>
          </div>
          <div className="px-2 pb-2">
            <div className="grid items-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{gridTemplateColumns:"44px 1fr 48px 48px 96px 64px", color:MUTED}}>
              <span>Rank</span><span>Owner</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-right">Points For</span><span className="text-right">Win%</span>
            </div>
            {loading && <div className="px-3 py-8 text-center text-sm" style={{color:MUTED}}>Loading standings\u2026</div>}
            {!loading && ranked.length===0 && <div className="px-3 py-8 text-center text-sm" style={{color:MUTED}}>No standings yet \u2014 sync your league.</div>}
            {ranked.map((t:any)=>{ const mine=myTeamId && t.teamId===myTeamId; return (
              <div key={t.teamId} className="grid items-center px-3 py-2.5 rounded-lg" style={{gridTemplateColumns:"44px 1fr 48px 48px 96px 64px", background: mine?"rgba(239,68,68,.10)":"transparent", border: mine?"1px solid rgba(239,68,68,.30)":"1px solid transparent"}}>
                <span className="flex items-center gap-1.5 font-black">{t.displayRank}{t.displayRank<=3 && <Crown className="h-3.5 w-3.5" style={{color: t.displayRank===1?GOLD:(t.displayRank===2?"#c0c6d0":"#cd7f32")}}/>}</span>
                <span className="font-bold truncate" style={{color: mine?RED:TEXT}}>{t.ownerName}</span>
                <span className="text-center font-bold" style={{color:GREEN}}>{t.wins}</span>
                <span className="text-center font-bold" style={{color:"#c0566b"}}>{t.losses}</span>
                <span className="text-right tabular-nums">{Math.round(t.pointsFor).toLocaleString()}</span>
                <span className="text-right tabular-nums font-bold" style={{color:GREEN}}>{pct3(winPct(t))}</span>
              </div>
            );})}
          </div>
        </div>

        <div style={PANEL} className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-lg font-black tracking-tight">THIS WEEK'S MATCHUPS</h3>
            <span className="text-xs font-bold" style={{color:RED}}>{week>=1?`WEEK ${week}`:""}</span>
          </div>
          <div className="px-3 pb-3 space-y-2">
            {scoreRows.length===0 && <div className="px-3 py-8 text-center text-sm" style={{color:MUTED}}>No matchups available yet.</div>}
            {scoreRows.slice(0,6).map((m:any,i:number)=>(
              <div key={i} style={{background:SUBBG,border:`1px solid ${LINE}`,borderRadius:10}} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate flex-1">{ownerMap.get(m.homeTeamId)||m.home?.ownerName||m.home?.teamName||"\u2014"}</span>
                  <span className="font-black tabular-nums" style={{color:TEXT}}>{m.homeProjected!=null?Number(m.homeProjected).toFixed(1):"\u2013"}</span>
                  <span className="text-xs px-2" style={{color:MUTED}}>vs</span>
                  <span className="font-black tabular-nums" style={{color:TEXT}}>{m.awayProjected!=null?Number(m.awayProjected).toFixed(1):"\u2013"}</span>
                  <span className="font-bold truncate flex-1 text-right">{ownerMap.get(m.awayTeamId)||m.away?.ownerName||m.away?.teamName||"\u2014"}</span>
                </div>
                <div className="text-[10px] mt-1 text-center" style={{color:MUTED}}>PROJECTED</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div style={PANEL} className="overflow-hidden">
        <div className="px-5 py-4"><h3 className="text-lg font-black tracking-tight">RECENT ACTIVITY FEED</h3></div>
        <div className="px-3 pb-3">
          <DashboardRecentLeagueEvents seasons={[season]} enabled={!!season} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, valueColor, subColor }: any){
  return (
    <div style={PANEL} className="px-5 py-4 flex items-center gap-4">
      <div className="shrink-0 h-14 w-14 rounded-full flex items-center justify-center" style={{ border:`2px solid ${LINE}`, background:"rgba(255,255,255,.02)" }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{color:MUTED}}>{label}</div>
        <div className="text-3xl font-black leading-tight" style={{color: valueColor||TEXT}}>{value}</div>
        {sub && <div className="text-[11px] font-bold uppercase tracking-wide" style={{color: subColor||MUTED}}>{sub}</div>}
      </div>
    </div>
  );
}
