import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SPACE_CHIP, SPACE_CHIP_GAP } from "@/lib/density";
import {
  SHARE_CARD_LAYOUTS,
  SHARE_CARD_THEME_IDS,
  SHARE_CARD_THEMES,
  withShareCardPresentation,
  type ShareCardLayout,
  type ShareCardModel,
  type ShareCardTheme,
} from "@shared/historicalShareCard";
import {
  SHARE_CARD_EXPORT_ERROR,
  SHARE_CARD_SCALES,
  shareCardExportFilename,
  type ShareCardScale,
} from "@shared/shareCardExport";
import { ShareCardRenderer } from "./HistoricalShareCard";

export function HistoricalShareCardModal({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ShareCardModel | null;
}) {
  const [theme, setTheme] = useState<ShareCardTheme>(model?.theme ?? "neutral");
  const [layout, setLayout] = useState<ShareCardLayout>(model?.layout ?? "landscape");
  const [scale, setScale] = useState<ShareCardScale>(2);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !model) return;
    setTheme(model.theme);
    setLayout(model.layout);
    setScale(2);
    setDownloading(false);
  }, [open, model]);

  const preview = useMemo(
    () => (model ? withShareCardPresentation(model, { theme, layout }) : null),
    [model, theme, layout],
  );

  if (!model || !preview) return null;

  const onCopy = async () => {
    const href = model.href.startsWith("/") ? model.href : `/${model.href}`;
    const url = `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link yet.");
    }
  };

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/share-card/png", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: preview, scale }),
      });
      if (!res.ok) throw new Error(SHARE_CARD_EXPORT_ERROR);
      const blob = await res.blob();
      if (!blob.size) throw new Error(SHARE_CARD_EXPORT_ERROR);
      const headerName = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
      const filename = headerName || shareCardExportFilename(preview);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(SHARE_CARD_EXPORT_ERROR);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-rfsn-053f-modal
        data-rfsn-053g-modal
        data-share-card-modal
        className="max-h-[92vh] w-[min(96vw,960px)] max-w-[960px] overflow-y-auto sm:max-w-[960px]"
      >
        <DialogHeader>
          <DialogTitle>Share Card</DialogTitle>
          <DialogDescription>
            Premium historical card. Download exports the same HTML card as PNG. No AI narration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section aria-label="Theme selector">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Theme</h3>
            <div className={cn("flex flex-wrap", SPACE_CHIP_GAP)}>
              {SHARE_CARD_THEME_IDS.map((id) => {
                const t = SHARE_CARD_THEMES[id];
                const pressed = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-share-theme={id}
                    aria-pressed={pressed}
                    onClick={() => setTheme(id)}
                    className={cn(
                      "inline-flex h-9 items-center rounded-md text-xs font-semibold",
                      SPACE_CHIP,
                      pressed ? "ring-2 ring-primary" : "border border-border text-foreground hover:bg-muted/40",
                    )}
                    style={pressed ? { background: `${t.accent}22`, color: t.accent } : undefined}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Layout selector">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Layout</h3>
            <div className={cn("flex flex-wrap", SPACE_CHIP_GAP)}>
              {SHARE_CARD_LAYOUTS.map((id) => {
                const pressed = layout === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-share-layout={id}
                    aria-pressed={pressed}
                    onClick={() => setLayout(id)}
                    className={cn(
                      "inline-flex h-9 items-center rounded-md text-xs font-semibold capitalize",
                      SPACE_CHIP,
                      pressed
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                        : "border border-border text-foreground hover:bg-muted/40",
                    )}
                  >
                    {id}
                  </button>
                );
              })}
            </div>
          </section>

          <div
            data-share-card-preview
            className="flex justify-center overflow-x-auto rounded-xl border border-border bg-black/40 p-4"
          >
            <ShareCardRenderer model={preview} />
          </div>

          <div className={cn("flex flex-wrap items-center", SPACE_CHIP_GAP)}>
            <button
              type="button"
              data-share-copy-link
              onClick={() => void onCopy()}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted/40"
            >
              Copy Link
            </button>
            <div className={cn("inline-flex", SPACE_CHIP_GAP)} aria-label="Export scale">
              {SHARE_CARD_SCALES.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-share-scale={id}
                  aria-pressed={scale === id}
                  onClick={() => setScale(id)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md text-xs font-semibold",
                    SPACE_CHIP,
                    scale === id
                      ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                      : "border border-border text-foreground hover:bg-muted/40",
                  )}
                >
                  {id}x
                </button>
              ))}
            </div>
            <button
              type="button"
              data-share-download
              disabled={downloading}
              aria-busy={downloading}
              onClick={() => void onDownload()}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
