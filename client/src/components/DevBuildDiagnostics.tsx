/**
 * Consolidated development / build indicators (Dashboard).
 * Hidden in production unless `VITE_SHOW_DEV_DIAGNOSTICS=true`.
 */
export function DevBuildDiagnostics() {
  const forceShow = import.meta.env.VITE_SHOW_DEV_DIAGNOSTICS === "true";
  if (!import.meta.env.DEV && !forceShow) return null;

  const mode = import.meta.env.MODE;
  const envLabel = import.meta.env.PROD ? "production" : "development";
  const buildHash = __APP_GIT_HASH__;
  const buildTime = __APP_BUILD_TIME_ISO__;
  const deployTs = (import.meta.env.VITE_DEPLOY_TIMESTAMP?.trim() || buildTime).trim();

  return (
    <section
      className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-4 py-3 text-left"
      aria-label="Development build diagnostics"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/95">
        Development · build
      </h2>
      <dl className="mt-2 space-y-1 font-mono text-[11px] leading-snug text-emerald-100/90">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-emerald-500/80 shrink-0">League History plugin</dt>
          <dd className="text-foreground/90">bundled · active</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-emerald-500/80 shrink-0">Build hash</dt>
          <dd className="break-all text-foreground/90">{buildHash}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-emerald-500/80 shrink-0">Deployment / build time</dt>
          <dd className="break-all text-foreground/90">{deployTs}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-emerald-500/80 shrink-0">Environment</dt>
          <dd className="text-foreground/90">
            {envLabel} <span className="text-emerald-600/80">(mode: {mode})</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
