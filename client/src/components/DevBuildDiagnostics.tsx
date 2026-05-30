/**
 * Build / environment readout (Dashboard). Renders unconditionally for now.
 */
export function DevBuildDiagnostics() {
  const mode = import.meta.env.MODE;
  const envLabel = import.meta.env.PROD ? "production" : "development";
  const buildHash = __APP_GIT_HASH__;
  const buildTime = __APP_BUILD_TIME_ISO__;

  return (
    <section
      className="mt-3 rounded-lg border-2 border-amber-500/70 bg-zinc-950 px-3 py-3 text-left text-zinc-100 shadow-sm"
      aria-label="Build information"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-400">Build</h2>
      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-snug">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-zinc-400 shrink-0">Build hash</dt>
          <dd className="break-all text-zinc-50">{buildHash}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-zinc-400 shrink-0">Build time</dt>
          <dd className="break-all text-zinc-50">{buildTime}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-zinc-400 shrink-0">Environment</dt>
          <dd className="text-zinc-50">
            {envLabel} <span className="text-zinc-500">(mode: {mode})</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
