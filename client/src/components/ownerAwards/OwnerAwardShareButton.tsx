import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2, Link2, Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { formatOwnerAwardStat, getOwnerAwardMetaById } from "@/lib/ownerAwardsDisplay";
import { cn } from "@/lib/utils";

export type OwnerAwardShareButtonProps = {
  awardId: string;
  leagueName?: string;
  currentHolderName?: string | null;
  currentValue?: string | number | null;
  className?: string;
};

const canWebShare = (): boolean =>
  typeof navigator !== "undefined" && typeof (navigator as Navigator).share === "function";

export function OwnerAwardShareButton({
  awardId,
  currentHolderName,
  currentValue,
  className,
}: OwnerAwardShareButtonProps) {
  const { leagueContextKey } = useLeagueActiveGate();
  const [open, setOpen] = useState(false);
  const [minted, setMinted] = useState<{ shareCode: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mint = (trpc as any).ownerAwardShare.mint.useMutation();
  const meta = getOwnerAwardMetaById(awardId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!awardId || !meta || leagueContextKey.startsWith("__")) return null;

  const shareUrl = (code: string) =>
    `${window.location.origin}/owner-award/${encodeURIComponent(code)}`;

  async function ensureMinted() {
    if (minted) return minted;
    try {
      const res = await mint.mutateAsync({
        leagueId: leagueContextKey,
        awardId,
        currentHolderName: currentHolderName ?? null,
        statLabel: meta ? formatOwnerAwardStat(meta.awardName, currentValue) : null,
      });
      const next = { shareCode: res.shareCode, text: res.text };
      setMinted(next);
      return next;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a share link.");
      return null;
    }
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function handleCopyLink() {
    const m = await ensureMinted();
    if (!m) return;
    const ok = await copyText(shareUrl(m.shareCode));
    if (ok) {
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Share failed — could not copy link");
    }
  }

  async function handleWebShare() {
    const m = await ensureMinted();
    if (!m) return;
    setOpen(false);
    try {
      await navigator.share({
        title: "Fantasy Football Rivals",
        text: m.text,
        url: shareUrl(m.shareCode),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") toast.message("Share canceled");
      else toast.error("Share failed");
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-200 transition hover:bg-white/[0.08]"
      >
        {mint.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        Share
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#110c14] shadow-xl">
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-lime-400" /> : <Link2 className="h-3.5 w-3.5" />}
            Copy link
          </button>
          {canWebShare() ? (
            <button
              type="button"
              onClick={() => void handleWebShare()}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
