import { Link } from "react-router";
import type { ReactNode } from "react";

export function LegalPublicLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#070509] text-[#f4f8ff]">
      <div className="mx-auto w-full max-w-2xl min-w-0 px-5 py-10">
        <p className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          <img src="/logo.png" alt="" className="h-5 w-auto opacity-70" />
          <Link to="/" className="hover:text-white">
            Fantasy Football Rivals
          </Link>
        </p>
        <h1 className="mt-3 break-words text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-white/50">Last updated {updated}</p>
        <div className="mt-8 min-w-0 space-y-6 break-words text-[15px] leading-relaxed text-white/75">
          {children}
        </div>
        <p className="mt-10 flex flex-wrap gap-x-2 gap-y-1 text-sm text-white/40">
          <Link to="/" className="text-lime-400 hover:text-lime-300">
            Home
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/support" className="hover:text-white">
            Support
          </Link>
        </p>
      </div>
    </div>
  );
}
