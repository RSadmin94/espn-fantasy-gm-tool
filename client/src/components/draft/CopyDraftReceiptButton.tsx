import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TYPE_READABLE_LABEL } from "@/lib/typeScale";
import { formatDraftReceipt, type DraftReceiptInput } from "@shared/draftReceipt";

async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function CopyDraftReceiptButton({
  input,
  disabled,
}: {
  input: DraftReceiptInput | null;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!input) return;
    const text = formatDraftReceipt(input);
    const ok = await copyPlainText(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      disabled={disabled || !input}
      onClick={() => void onCopy()}
      data-testid="copy-draft-receipt"
      aria-label={copied ? "Receipt copied" : "Copy receipt"}
      className={cn(
        "h-10 min-h-10 w-full shrink-0 px-4 sm:w-auto",
        TYPE_READABLE_LABEL,
        "border-primary/40 text-foreground hover:bg-primary/10",
      )}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? "Copied!" : "Copy Receipt"}
    </Button>
  );
}
