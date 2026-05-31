__PULSE_START__
      {/* League Pulse Strip */}
      {(draftIntelQ as any)?.data?.ok && (
        <div className="flex items-center gap-3 overflow-x-auto rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs mb-4 scrollbar-none">
          <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="font-black text-emerald-400 uppercase tracking-widest text-[9px] shrink-0">League Pulse</span>
          <span className="text-zinc-700 mx-1 shrink-0">|</span>
          <span className="text-zinc-600 shrink-0">Keepers:</span>
          <span className="text-zinc-300 font-semibold shrink-0 mr-2">{(draftIntelQ as any).data.keeperPredictions?.length ?? 0} predicted</span>
          <span className="text-zinc-700 shrink-0">·</span>
          <span className="text-zinc-600 mx-1 shrink-0">Top KVS:</span>
          <span className="text-amber-300 font-semibold shrink-0 mr-2">
            {((draftIntelQ as any).data.keeperPredictions ?? []).sort((a: any, b: any) => (b.kvs ?? 0) - (a.kvs ?? 0))[0]?.predictedPlayer ?? "—"}
            {" "}KVS {((draftIntelQ as any).data.keeperPredictions ?? []).sort((a: any, b: any) => (b.kvs ?? 0) - (a.kvs ?? 0))[0]?.kvs ?? ""}
          </span>
          <span className="text-zinc-700 shrink-0">·</span>
          <span className="text-zinc-600 mx-1 shrink-0">Scarcity:</span>
          <span className="text-red-400 font-semibold shrink-0 mr-2">
            {((draftIntelQ as any).data.scarcityAlerts ?? []).find((a: any) => a.urgency === "CRITICAL" || a.urgency === "HIGH")
              ? [((draftIntelQ as any).data.scarcityAlerts ?? []).find((a: any) => a.urgency === "CRITICAL" || a.urgency === "HIGH")].map((s: any) => s.position + ": " + s.urgency)[0]
              : "All clear"}
          </span>
          <span className="text-zinc-700 shrink-0">·</span>
          <span className="text-zinc-600 mx-1 shrink-0">Capital:</span>
          <span className="text-sky-400 font-semibold shrink-0">
            {((draftIntelQ as any).data.tradedPicks ?? []).filter((p: any) => p.type === "ACQUIRED").length > 0
              ? ((draftIntelQ as any).data.tradedPicks ?? []).filter((p: any) => p.type === "ACQUIRED")[0].ownerName?.split(" ")[0] + " +1 Rd" + ((draftIntelQ as any).data.tradedPicks ?? []).filter((p: any) => p.type === "ACQUIRED")[0].round
              : "Standard"}
          </span>
        </div>
      )}

      {/* Intelligence Hero */}
      {((draftIntelQ as any)?.data?.ok || (draftIntelQ as any)?.isLoading) && (() => {
        const di = (draftIntelQ as any);
        const kps: any[] = di.data?.keeperPredictions ?? [];
        const topKeeper = kps.slice().sort((a: any, b: any) => (b.kvs ?? 0) - (a.kvs ?? 0))[0];
        const sas: any[] = di.data?.scarcityAlerts ?? [];
        const critScarcity = sas.find((a: any) => a.urgency === "CRITICAL");
        const highScarcity = sas.find((a: any) => a.urgency === "HIGH");
        const urgentScarcity = critScarcity ?? highScarcity;
        const runs: any[] = di.data?.positionRunAlerts ?? [];
        const topRun = runs[0];
        const picks: any[] = di.data?.tradedPicks ?? [];
        const tradedPick = picks.find((p: any) => p.type === "ACQUIRED");
        const headline = critScarcity
          ? "Protect " + critScarcity.position + " depth — scarcity window is open"
          : topRun
          ? topRun.position + " run expected " + topRun.roundWindow + " — move early"
          : topKeeper
          ? topKeeper.predictedPlayer + " is the best keeper value in the league"
          : "Draft intelligence ready — " + CURRENT_YEAR + " season";
        const conf = topKeeper?.confidence ?? 0;
        const evidence: string[] = [
          topKeeper ? topKeeper.teamName + ": " + topKeeper.predictedPlayer + " KVS " + topKeeper.kvs + " — " + (topKeeper.surplusLabel ?? "value") + " at Round " + topKeeper.keeperRound : "",
          urgentScarcity ? urgentScarcity.position + " scarcity: " + urgentScarcity.eliteSupply + " elite available, demand " + (urgentScarcity.demandScore?.toFixed(2) ?? "0") : "",
          topRun ? topRun.teamCount + " owners project " + topRun.position + " as top need — " + topRun.roundWindow : "",
          tradedPick ? tradedPick.ownerName + " holds extra Round " + tradedPick.round + " pick — capital advantage" : "",
        ].filter(Boolean).slice(0, 3);
        return (
          <section className="grid gap-4 lg:grid-cols-12 mb-6" aria-label="Draft intelligence brief">
            {/* Main hero card */}
            <div className="lg:col-span-8 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0d1812] via-[#0b1015] to-[#09090e] p-6 shadow-[0_0_60px_-20px_rgba(16,185,129,0.3)]">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Target className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80">Best Move Now</p>
                    <p className="text-[10px] text-zinc-500">{CURRENT_YEAR} Draft Intelligence</p>
                  </div>
                </div>
                {conf > 0 && (
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-black text-emerald-400 tabular-nums">{conf}%</div>
                    <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Confidence</div>
                  </div>
                )}
              </div>
              {di.isLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Loading draft intelligence…
                </div>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-xl font-black text-zinc-50 leading-snug">{headline}</h2>
                  <ul className="space-y-1.5">
                    {evidence.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                        <span className="text-emerald-500 shrink-0 mt-0.5">→</span>{e}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/40 mt-4">
                    <Link to="/draft-war-room" className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                      Full Draft War Room <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                    <span className="text-zinc-700">·</span>
                    <Link to="/league-wire" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                      League Wire <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Signal cards */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              {/* Keeper value */}
              <div className="flex-1 rounded-xl border border-amber-500/20 bg-zinc-900/50 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/80 mb-0.5">Best Keeper Value</p>
                  {di.isLoading ? (
                    <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
                  ) : topKeeper ? (
                    <>
                      <p className="text-sm font-bold text-zinc-100 truncate">{topKeeper.predictedPlayer}</p>
                      <p className="text-[10px] text-zinc-500">{topKeeper.teamName} · KVS {topKeeper.kvs} · Rd {topKeeper.keeperRound}</p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600">No keepers found</p>
                  )}
                </div>
              </div>

              {/* Scarcity */}
              <div className="flex-1 rounded-xl border border-red-500/20 bg-zinc-900/50 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400/80 mb-0.5">Position Scarcity</p>
                  {di.isLoading ? (
                    <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
                  ) : urgentScarcity ? (
                    <>
                      <p className="text-sm font-bold text-zinc-100">{urgentScarcity.position} — {urgentScarcity.urgency}</p>
                      <p className="text-[10px] text-zinc-500">{urgentScarcity.eliteSupply} elite available</p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600">No critical scarcity</p>
                  )}
                </div>
              </div>

              {/* Draft capital */}
              <div className="flex-1 rounded-xl border border-sky-500/20 bg-zinc-900/50 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                  <Activity className="h-3.5 w-3.5 text-sky-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-sky-400/80 mb-0.5">Draft Capital</p>
                  {di.isLoading ? (
                    <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
                  ) : tradedPick ? (
                    <>
                      <p className="text-sm font-bold text-zinc-100 truncate">
                        {tradedPick.ownerName?.split(" ")[0]} +{picks.filter((p: any) => p.type === "ACQUIRED").length} extra pick
                      </p>
                      <p className="text-[10px] text-zinc-500">Extra Rd {tradedPick.round} via trade</p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600">Standard distribution</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

__PULSE_END__
