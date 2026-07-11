import { cn } from "@/lib/utils";
import type { RfsnTickerItem } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import { Menu, Radio } from "lucide-react";

export type RfsnTickerProps = {
  items: RfsnTickerItem[];
  upNextTeam?: string;
  className?: string;
};

export function RfsnTicker({ items, upNextTeam, className }: RfsnTickerProps) {
  const line =
    items.length > 0
      ? items
          .map((item) => {
            const name = COMMENTATOR_META[item.commentator].displayName;
            return `${name}: "${item.text}"`;
          })
          .join(" · ")
      : "RFSN Draft Night — coverage continues";

  return (
    <footer
      className={cn(
        "flex items-center gap-2 border-t border-white/10 bg-black px-2 py-2 text-xs",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-black text-white">
          RFS<span className="text-red-500">N</span>
        </span>
        <span className="hidden items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white sm:inline-flex">
          <Radio className="h-2.5 w-2.5" aria-hidden />
          On air
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-muted-foreground">{line}</p>
      </div>
      {upNextTeam && (
        <p className="hidden shrink-0 text-[10px] text-muted-foreground md:block">
          Up next: <span className="font-semibold text-white/80">{upNextTeam}</span>
        </p>
      )}
      <button
        type="button"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-white/10 md:hidden"
        aria-label="Menu"
      >
        <Menu className="h-4 w-4" />
      </button>
    </footer>
  );
}
