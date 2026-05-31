/// <reference types="vite/client" />

/** Injected by `vite.config.ts` `define` at build/dev time. */
declare const __APP_GIT_HASH__: string;
declare const __APP_BUILD_TIME_ISO__: string;

interface ImportMetaEnv {
  /** When `"true"`, show dev diagnostics on the Dashboard in production builds. */
  readonly VITE_SHOW_DEV_DIAGNOSTICS?: string;
  /** Optional deploy time (ISO string); overrides bundled build time in diagnostics. */
  readonly VITE_DEPLOY_TIMESTAMP?: string;
}
