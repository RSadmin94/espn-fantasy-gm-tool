import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2, Link2, FileText, ImageDown, Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * RivalryShareButton — one reusable Share control for every rivalry surface.
 *
 * Mints a stateless, signed share code on first open (server recomputes the record
 * from canonical authorities — nothing here is trusted from the browser), then offers:
 *   • Web Share API (when the device supports it)
 *   • Copy link           → /rivalry/:shareCode
 *   • Copy summary         → server-composed one-liner + link
 *   • Download image       → 1200x630 OG card PNG
 *
 * Renders nothing unless both owner identities + a leagueId are present (never a
 * broken/empty share). heatLabel is a display-only hint carried to the card.
 */
export type RivalryShareButtonProps = {
  leagueId: string;
  focalOwnerKey: string;
  rivalOwnerKey: string;
  ownerAName?: string;
  ownerBName?: string;
  heatLabel?: string;
  /** "icon" = compact icon-only; "button" = labeled pill. */
  variant?: "icon" | "button";
  className?: string;
};

const canWebShare = (): boolean =>
  typeof navigator !== "undefined" && typeof (navigator as Navigator).share === "function";

export function RivalryShareButton({
  leagueId,
  focalOwnerKey,
  rivalOwnerKey,
  ownerAName,
  ownerBName,
  heatLabel,
  variant = "icon",
  className,
}: RivalryShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [minted, setMinted] = useState<{ shareCode: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const mint = trpc.rivalryShare.mint.useMutation();

  // Close on outside click / Escape.
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

  if (!leagueId || !focalOwnerKey || !rivalOwnerKey || focalOwnerKey === rivalOwnerKey) return null;

  const shareUrl = (code: string) => `${window.location.origin}/rivalry/${encodeURIComponent(code)}`;
  const shareTitle =
    ownerAName && ownerBName ? `${ownerAName} vs ${ownerBName}` : "Fantasy Football Rivals";

  // Ensure a code exists; mint once and cache. Returns null on failure (toast shown).
  async function ensureMinted(): Promise<{ shareCode: string; text: string } | null> {
    if (minted) return minted;
    try {
      const res = await mint.mutateAsync({ leagueId, focalOwnerKey, rivalOwnerKey, heatLabel });
      const next = { shareCode: res.shareCode, text: res.text };
      setMinted(next);
      return next;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a share link.");
      return null;
    }
  }

  function flashCopied(which: string) {
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to legacy path */
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

  async function handleWebShare() {
    const m = await ensureMinted();
    if (!m) return;
    setOpen(false);
    try {
      await (navigator as Navigator).share({ title: shareTitle, text: m.text, url: shareUrl(m.shareCode) });
    } catch {
      /* user cancelled — no error toast */
    }
  }

  async function handleCopyLink() {
    const m = await ensureMinted();
    if (!m) return;
    const ok = await copyText(shareUrl(m.shareCode));
    ok ? (flashCopied("link"), toast.success("Link copied")) : toast.error("Couldn't copy link");
  }

  async function handleCopySummary() {
    const m = await ensureMinted();
    if (!m) return;
    const ok = await copyText(`${m.text} ${shareUrl(m.shareCode)}`);
    ok ? (flashCopied("summary"), toast.success("Summary copied")) : toast.error("Couldn't copy summary");
  }

  async function handleDownload() {
    const m = await ensureMinted();
    if (!m) return;
    setOpen(false);
    const a = document.createElement("a");
    a.href = `${window.location.origin}/api/share/rivalry/${encodeURIComponent(m.shareCode)}/image`;
    a.download = `${shareTitle.replace(/[^\w]+/g, "-").toLowerCase()}-rivalry.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const itemCls =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/10";

  return (
    <div ref={wrapRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Share rivalry"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/10",
          variant === "icon" ? "h-8 w-8 justify-center p-0" : "px-3 py-1.5 text-sm",
        )}
      >
        {mint.isPending && !minted ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {variant === "button" && <span>Share</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/12 bg-[#14101a] py-1 shadow-2xl shadow-black/50"
        >
          {canWebShare() && (
            <button type="button" role="menuitem" className={itemCls} onClick={handleWebShare}>
              <Share2 className="h-4 w-4 text-lime-300" /> Share…
            </button>
          )}
          <button type="button" role="menuitem" className={itemCls} onClick={handleCopyLink}>
            {copied === "link" ? <Check className="h-4 w-4 text-lime-300" /> : <Link2 className="h-4 w-4 text-white/60" />}
            Copy link
          </button>
          <button type="button" role="menuitem" className={itemCls} onClick={handleCopySummary}>
            {copied === "summary" ? <Check className="h-4 w-4 text-lime-300" /> : <FileText className="h-4 w-4 text-white/60" />}
            Copy summary
          </button>
          <button type="button" role="menuitem" className={itemCls} onClick={handleDownload}>
            <ImageDown className="h-4 w-4 text-white/60" /> Download image
          </button>
        </div>
      )}
    </div>
  );
}

export default RivalryShareButton;
