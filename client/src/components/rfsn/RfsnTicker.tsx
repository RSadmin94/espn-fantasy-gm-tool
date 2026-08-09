import { cn } from "@/lib/utils";
import type { RfsnTickerItem } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import { Menu, Radio } from "lucide-react";

export type RfsnTickerProps = {
  items: RfsnTickerItem[];
  upNextTeam?: string;
  className?: string;
};

function formatTickerLine(items: RfsnTickerItem[]): string {
  if (items.length === 0) {
    return "RFSN Draft Night — coverage continues";
  }
  return items
    .map((item) => {
      const name = COMMENTATOR_META[item.commentator].displayName;
      return `${name}: "${item.text}"`;
    })
    .join("   •   ");
}

export function RfsnTicker({ items, upNextTeam, className }: RfsnTickerProps) {
  const line = formatTickerLine(items);
  const crawl = items.length > 0 ? `${line}   •   ${line}` : line;

  return (
    <footer
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 border-t border-white/10 bg-black px-2",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 pr-2">
        <span className="text-sm font-black tracking-tighter text-white">
          RFS<span className="text-red-500">N</span>
        </span>
        <span className="hidden items-center gap-1 rounded-sm bg-red-600/90 px-1.5 py-0.5 text-2xs font-black uppercase text-white sm:inline-flex">
          <Radio className="h-2.5 w-2.5" aria-hidden />
          On air
        </span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <p
          className={cn(
            "whitespace-nowrap text-label text-white/55",
            items.length > 0 && "rfsn-ticker-crawl",
          )}
        >
          {crawl}
        </p>
      </div>
      {upNextTeam && (
        <p className="hidden shrink-0 border-l border-white/10 pl-3 text-label uppercase tracking-wide text-white/40 md:block">
          Up next{" "}
          <span className="font-bold text-emerald-400/90">{upNextTeam}</span>
        </p>
      )}
      <button
        type="button"
        className="shrink-0 rounded p-1 text-white/35 hover:bg-white/10 md:hidden"
        aria-label="Menu"
      >
        <Menu className="h-4 w-4" />
      </button>
    </footer>
  );
}
