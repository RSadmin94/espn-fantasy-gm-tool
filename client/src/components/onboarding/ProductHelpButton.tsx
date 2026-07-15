import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRODUCT_HELP_ITEMS } from "@/lib/productOnboarding";

export function ProductHelpButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          aria-label="Product help"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Fantasy Football Rivals</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Quick guide — what am I looking at?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {PRODUCT_HELP_ITEMS.map((item) => (
            <div key={item.title} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
