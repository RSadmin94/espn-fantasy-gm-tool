import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSofiaShareText, type SofiaCommentary } from "@/lib/sofiaPresentation";

type SofiaShareButtonProps = {
  commentary: SofiaCommentary;
};

export function SofiaShareButton({ commentary }: SofiaShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const text = buildSofiaShareText(commentary);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-10 gap-1.5"
      onClick={() => void handleShare()}
      aria-label={copied ? "Commentary copied" : "Copy commentary to clipboard"}
    >
      <Share2 className="h-3.5 w-3.5" aria-hidden />
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
