import { Link } from "react-router";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import type { RfsnDestination } from "@/components/rfsn/RfsnDestinationNav";
import { ArrowLeft, Radio } from "lucide-react";

export function RfsnPlaceholder({ destination }: { destination: Exclude<RfsnDestination, "home" | "news" | "archive"> }) {
  const copy =
    destination === "live"
      ? {
          title: "Live Broadcast",
          lead: "RFSN live draft coverage and the broadcast booth are coming soon. News and wire reports are available now.",
        }
      : {
          title: "This Week",
          lead: "Weekly league programming — storylines, matchups, and league pulse — is on the RFSN roadmap.",
        };

  return (
    <RfsnMediaShell active={destination} subtitle="Programming in development">
      <div className="max-w-xl rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="h-4 w-4 text-red-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Coming Soon</span>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">{copy.title}</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5">{copy.lead}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/rfsn/news"
            className="inline-flex items-center gap-1.5 rounded-lg bg-lime-500/15 border border-lime-500/30 px-3 py-2 text-xs font-bold text-lime-300 hover:bg-lime-500/25"
          >
            Browse News
          </Link>
          <Link
            to="/rfsn"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            RFSN Home
          </Link>
        </div>
      </div>
    </RfsnMediaShell>
  );
}
