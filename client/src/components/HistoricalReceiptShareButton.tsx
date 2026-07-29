import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2, Link2, ImageDown, Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { HistoricalReceiptKind } from "../../../shared/historicalReceipts";

export type HistoricalReceiptShareButtonProps = {
  leagueId: string;
  rivalId: string;
  kind: HistoricalReceiptKind;
  focalDisplayName?: string;
  className?: string;
};

const canWebShare = (): boolean =>
  typeof navigator !== "undefined" && typeof (navigator as Navigator).share === "function";

export function HistoricalReceiptShareButton({
  leagueId,
  rivalId,
  kind,
  focalDisplayName,
  className,
}: HistoricalReceiptShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [minted, setMinted] = useState<{ shareCode: string; text: string; urlPath: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mint = (trpc as any).historicalReceiptShare.mint.useMutation();

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

  if (!leagueId || !rivalId) return null;

  const shareUrl = (code: string) =>
    `${window.location.origin}/historical-receipt/${encodeURIComponent(code)}`;

  async function ensureMinted() {
    if (minted) return minted;
    try {
      const res = await mint.mutateAsync({
        leagueId,
        rivalId,
        kind,
        focalDisplayName,
      });
      const next = { shareCode: res.shareCode, text: res.text, urlPath: res.urlPath };
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

  async function handleSaveImage(format: "og" | "square" | "portrait" | "story") {
    const m = await ensureMinted();
    if (!m) return;
    setSaving(true);
    try {
      const url = `${window.location.origin}/api/share/historical-receipt/${encodeURIComponent(m.shareCode)}/image?format=${format}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Image request failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ffr-receipt-${kind}-${format}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Image ready");
      setOpen(false);
    } catch {
      toast.error("Share failed — could not save image");
    } finally {
      setSaving(false);
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
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#110c14] shadow-xl">
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
          <div className="border-t border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Save image
          </div>
          {(["og", "square", "portrait", "story"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled={saving}
              onClick={() => void handleSaveImage(fmt)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50"
            >
              <ImageDown className="h-3.5 w-3.5" />
              {fmt === "og" ? "1200×630 link preview" : fmt === "square" ? "1080×1080 square" : fmt === "portrait" ? "1080×1350 portrait" : "1080×1920 story"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
