import { useMemo } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { Zap, Repeat2, Trophy, Newspaper, Users, Flame, Star, Activity, ChevronRight, RefreshCw } from "lucide-react";

const GOLD="#f5c518", TEAL="#a3e635", MUTED="#8b97a8", RED="#ef4444", ORANGE="#f7902f", GREEN="#a3e635", BLUE="#8b5cf6", TEXT="#f3f8ff", ACCENT="#a3e635";
const PANEL: React.CSSProperties = { background:"linear-gradient(180deg,#16131f,#0f0c17)", border:"1px solid rgba(255,255,255,.07)", borderRadius:15 };
const SUB: React.CSSProperties = { background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:10 };
const PAGEBG: React.CSSProperties = { background:"radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0b0910,#060509)", color:TEXT };

function firstName(s: any){ return String(s||"").trim().split(" ")[0] || "Owner"; }
function archetype(m: any){ const pred=Number(m?.predictabilityScore??0), surp=Number(m?.surpriseProbability??0);
  if(surp>=55) return {label:"Panic Pivot", color:RED};
  if(pred>=72) return {label:"By-the-Book", color:GREEN};
  if(pred>=55) return {label:"Steady Hand", color:BLUE};
  return {label:"Wildcard", color:ORANGE}; }
function sev(c: number){ return c>=60?{t:"High",color:RED}:c>=40?{t:"Med",color:ORANGE}:{t:"Low",color:GREEN}; }

export function CommandDashboard(){
  const lg: any = useLeagueContext();
  const season = lg?.season ?? new Date().getFullYear();
  const scoring: string = lg?.scoringType ?? "";
  const draftQ = (trpc as any).draftWarRoom.getDraftWarRoomData.useQuery({ season }, { staleTime:300000, refetchOnWindowFocus:false, enabled: !!season });
  const d: any = draftQ.data ?? {};
  const meters: any[] = d.shockMeters ?? [];
  const runs: any[] = d.positionRunAlerts ?? [];
  const scarce: any[] = d.scarcityAlerts ?? [];
  const teamCount: number = d.teamCount ?? lg?.teamCount ?? 0;
  const loading = draftQ.isLoading;

  const bySurprise = useMemo(()=>[...meters].sort((a,b)=>(b.surpriseProbability??0)-(a.surpriseProbability??0)),[meters]);
  const byPredict = useMemo(()=>[...meters].sort((a,b)=>(b.predictabilityScore??0)-(a.predictabilityScore??0)),[meters]);
  const topRuns = useMemo(()=>[...runs].sort((a,b)=>(b.confidence??0)-(a.confidence??0)),[runs]);
  const dnaOwners = byPredict.slice(0,4);
  const avgPredict = meters.length ? Math.round(meters.reduce((s,m)=>s+(m.predictabilityScore??0),0)/meters.length) : 0;
  const ownerCoverage = teamCount ? Math.min(100, Math.round((meters.length/teamCount)*100)) : 0;
  const topSurprise = bySurprise[0];
  const topRun = topRuns[0];

  const memo = loading ? "Loading league intelligence\u2026"
    : meters.length===0 ? "Sync your league to generate today's GM briefing."
    : `Draft prep is live. ${topSurprise ? firstName(topSurprise.ownerName)+" is your least predictable rival ("+(topSurprise.mostLikelyPosition||"flex")+" lean). " : ""}${topRun ? topRun.position+" run risk is the strongest board signal. " : ""}Protect leverage where value is thin.`;

  const pulse: any[] = [
    ...topRuns.slice(0,2).map((r:any)=>({ icon:"\u2316", text:`${r.position} scarcity run forming`, s:sev(r.confidence??0) })),
    ...(scarce[0] ? [{ icon:"\u25CC", text:`${scarce[0].position||"Value"} value window open`, s:sev(45) }] : []),
    ...(topSurprise ? [{ icon:"\u273A", text:`${firstName(topSurprise.ownerName)} surprise risk ${Math.round(topSurprise.surpriseProbability??0)}%`, s:sev(topSurprise.surpriseProbability??0) }] : []),
  ];

  const receipts = meters.flatMap((m:any)=> (m.evidence??[]).slice(0,1).map((e:any)=>({ owner:firstName(m.ownerName), text: typeof e==="string"?e:(e?.text||e?.label||""), arch: archetype(m).label }))).filter((r:any)=>r.text).slice(0,4);

  const metrics = [
    topSurprise && { b:`${Math.round(topSurprise.surpriseProbability??0)}%`, s:`${firstName(topSurprise.ownerName)} surprise` },
    bySurprise[1] && { b:`${Math.round(bySurprise[1].surpriseProbability??0)}%`, s:`${firstName(bySurprise[1].ownerName)} surprise` },
    topRun && { b:`${Math.round(topRun.confidence??0)}%`, s:`${topRun.position} run risk` },
    { b:`${pulse.length}`, s:"Live signals" },
  ].filter(Boolean) as any[];
  const shortcuts = [
    { t:"Draft War Room", to:"/draft-war-room", d:"Live pick board, rival threat windows, and decision memo." },
    { t:"Rivalry Center", to:"/matchups", d:"Head-to-head records, heat, and matchup history." },
    { t:"League Wire", to:"/league-wire", d:"Newsfeed, transactions, and league movement." },
    { t:"Owner Profiles", to:"/owner-profiles", d:"Owner DNA, historical behavior, and dossiers." },
  ];
  const actions = [
    { t:"Open Draft War Room", to:"/draft-war-room", d: topRun?`${topRun.position} run risk building \u2014 get owner-risk context.`:"Next pick needs owner-risk context.", cta:"Review" },
    { t:"Scan Owner DNA", to:"/owner-profiles", d: topSurprise?`${firstName(topSurprise.ownerName)} is trending unpredictable.`:"Review owner tendencies.", cta:"Analyze" },
    { t:"Check Keeper Lab", to:"/keeper-advisor", d:"Confirm your value holds before the draft.", cta:"Compare" },
  ];
  const rings = [
    { v: ownerCoverage, label:"Owner Read", sub:`${meters.length}/${teamCount||"?"} profiled`, color:TEAL },
    { v: avgPredict, label:"Predictability", sub:"League avg", color:GOLD },
    { v: topRun?Math.round(topRun.confidence??0):0, label:"Top Signal", sub: topRun?`${topRun.position} run`:"\u2014", color:BLUE },
  ];
  const readinessTable = [
    { k:"Owners profiled", v:`${meters.length}/${teamCount||"?"}` },
    { k:"Position run windows", v:`${runs.length}` },
    { k:"Value windows", v:`${scarce.length}` },
  ];

  return (
    <div style={PAGEBG} className="-m-4 md:-m-6 p-5 md:p-7 min-h-full">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none">Command Dashboard</h2>
          <p className="mt-2 text-sm" style={{color:MUTED}}>Your private league-intelligence briefing across draft, trade, waiver, and rivalry signals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill gold>{season} Season</Pill>
          <Pill>{teamCount?`${teamCount}-Team`:"League"}{scoring?` ${scoring}`:""}</Pill>
          <Pill><span style={{display:"inline-block",width:8,height:8,background:TEAL,borderRadius:999,marginRight:8}}/>ESPN Synced</Pill>
          <button onClick={()=>draftQ.refetch?.()} className="px-3 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center gap-2" style={{border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.04)",color:MUTED}}><RefreshCw className="h-3.5 w-3.5"/>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1fr] gap-3 mb-3">
        <div style={PANEL} className="overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Star className="h-5 w-5" style={{color:ACCENT}}/> Today's GM Briefing</h3>
              <span className="px-2 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap" style={{background:"rgba(34,197,94,.10)",border:"1px solid rgba(34,197,94,.33)",color:TEAL}}>{pulse.length} signals</span>
            </div>
            <div className="mt-3 text-[19px] leading-snug font-black" style={{color:GOLD}}>{memo}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
              {metrics.map((m:any,i:number)=>(
                <div key={i} style={SUB} className="p-2.5">
                  <b className="block text-xl">{m.b}</b>
                  <span className="text-xs" style={{color:MUTED}}>{m.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Activity className="h-5 w-5" style={{color:ACCENT}}/> League Intelligence Pulse</h3>
          <div className="mt-3">
            {pulse.length===0 && <div className="text-sm py-6 text-center" style={{color:MUTED}}>No live signals yet.</div>}
            {pulse.map((p:any,i:number)=>(
              <div key={i} className="grid items-center gap-2 h-9 text-sm" style={{gridTemplateColumns:"26px 1fr 58px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:MUTED}}>{p.icon}</span><span>{p.text}</span><b className="text-right font-black" style={{color:p.s.color}}>{p.s.t}</b>
              </div>
            ))}
          </div>
        </div></div>

        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Zap className="h-5 w-5" style={{color:ACCENT}}/> Data Health</h3>
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            {[{b:"League",s:d.ok?"Synced":"\u2014"},{b:"Draft",s:(d.totalPicks??0)>0?"Live":"Indexed"},{b:"Owners",s:meters.length?`${meters.length} read`:"\u2014"},{b:"AI Memo",s:d.confidenceDashboard?"Ready":"\u2014"}].map((x:any,i:number)=>(
              <div key={i} style={SUB} className="p-3"><b className="block mb-1">{x.b}</b><span className="inline-block px-2 py-1 rounded-lg text-xs font-extrabold" style={{background:"rgba(34,197,94,.10)",border:"1px solid rgba(34,197,94,.33)",color:TEAL}}>{x.s}</span></div>
            ))}
          </div>
        </div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1fr] gap-3 mb-3">
        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2" style={{color:TEXT}}><span style={{color:ACCENT}}>&rarr;</span> Action Queue</h3>
          <div className="mt-3 space-y-2.5">
            {actions.map((a:any,i:number)=>(
              <Link key={i} to={a.to} className="grid items-center gap-2.5 no-underline" style={{gridTemplateColumns:"34px 1fr 78px",...SUB,padding:"8px 10px",minHeight:60,color:TEXT}}>
                <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-black" style={{background:"rgba(45,212,191,.14)",border:"1px solid rgba(45,212,191,.45)",color:ACCENT}}>{i+1}</span>
                <span><b className="block text-sm">{a.t}</b><span className="text-xs" style={{color:MUTED}}>{a.d}</span></span>
                <span className="text-center text-xs font-extrabold rounded-md px-2 py-1.5" style={{border:"1px solid rgba(34,197,94,.35)",background:"rgba(34,197,94,.08)",color:TEAL}}>{a.cta}</span>
              </Link>
            ))}
          </div>
        </div></div>

        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><span style={{color:ACCENT}}>&#9638;</span> War Room Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {shortcuts.map((s:any,i:number)=>(
              <Link key={i} to={s.to} className="no-underline p-3.5 block" style={{...SUB,borderRadius:12,minHeight:94,color:TEXT}}>
                <b className="block text-[15px]">{s.t}</b>
                <p className="mt-2 text-xs leading-snug" style={{color:MUTED}}>{s.d}</p>
              </Link>
            ))}
          </div>
        </div></div>

        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Users className="h-5 w-5" style={{color:ACCENT}}/> Owner DNA Snapshot</h3>
          <div className="mt-2">
            {dnaOwners.length===0 && <div className="text-sm py-6 text-center" style={{color:MUTED}}>No owner reads yet.</div>}
            {dnaOwners.map((m:any,i:number)=>{ const a=archetype(m); return (
              <div key={i} className="grid items-center gap-2.5 h-[50px]" style={{gridTemplateColumns:"36px 1fr 70px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white" style={{background:a.color}}>{firstName(m.ownerName).charAt(0).toUpperCase()}</span>
                <span><b className="block text-sm">{firstName(m.ownerName)}</b><span className="text-xs" style={{color:MUTED}}>{a.label}</span></span>
                <span className="text-right font-black" style={{color:TEAL}}>{Math.round(m.predictabilityScore??0)}%</span>
              </div>
            );})}
          </div>
        </div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.18fr_1fr] gap-3">
        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Newspaper className="h-5 w-5" style={{color:ACCENT}}/> League Receipts</h3>
          <p className="text-xs mt-1" style={{color:MUTED}}>Behavioral evidence pulled from your league's draft signals.</p>
          <div className="mt-3">
            {receipts.length===0 && <div className="text-sm py-6 text-center" style={{color:MUTED}}>No receipts generated yet \u2014 sync draft history to populate.</div>}
            {receipts.map((r:any,i:number)=>(
              <div key={i} className="grid items-center gap-3 h-[55px] text-sm" style={{gridTemplateColumns:"96px 1fr 74px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                <b style={{color:TEAL}}>{r.owner}</b><span className="truncate" title={r.text}>{r.text}</span>
                <span className="text-center text-xs font-extrabold rounded-md px-1.5 py-1.5" style={{border:"1px solid rgba(245,198,90,.35)",background:"rgba(245,198,90,.08)",color:GOLD}}>{r.arch}</span>
              </div>
            ))}
          </div>
        </div></div>

        <div style={PANEL} className="overflow-hidden"><div className="p-[18px]">
          <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2"><Trophy className="h-5 w-5" style={{color:ACCENT}}/> GM Readiness</h3>
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {rings.map((r:any,i:number)=>(
              <div key={i} style={SUB} className="flex flex-col items-center justify-center py-4" >
                <div className="w-[62px] h-[62px] rounded-full flex items-center justify-center text-xl font-black mb-2" style={{border:`5px solid ${r.color}`}}>{r.v}{typeof r.v==="number"&&r.v<=100?"":""}</div>
                <b className="text-sm">{r.label}</b><span className="text-xs" style={{color:MUTED}}>{r.sub}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            {readinessTable.map((t:any,i:number)=>(
              <div key={i} className="grid items-center h-7 text-sm" style={{gridTemplateColumns:"1fr 80px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:MUTED}}>{t.k}</span><b className="text-right" style={{color:TEAL}}>{t.v}</b>
              </div>
            ))}
          </div>
        </div></div>
      </div>
    </div>
  );
}

function Pill({ children, gold }: any){
  return <span className="px-4 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center" style={ gold ? {color:GOLD,border:"1px solid rgba(245,198,90,.46)",background:"rgba(245,198,90,.10)"} : {border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.04)",color:TEXT} }>{children}</span>;
}
