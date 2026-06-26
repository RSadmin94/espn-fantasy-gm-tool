import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useLeagueRevealData, type LeagueRevealCard } from "@/hooks/useLeagueRevealData";

function RevealCard({ card }: { card: LeagueRevealCard }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        card.empty ? "border-dashed border-border/80 bg-muted/20" : "border-border/80 bg-muted/30",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{card.label}</p>
      <p className="mt-1 text-base font-bold leading-snug text-foreground">{card.value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
    </div>
  );
}

export function LeagueRevealModal({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}) {
  const navigate = useNavigate();
  const { isLoading, cards } = useLeagueRevealData(open);

  const finish = (path?: string) => {
    onComplete();
    onOpenChange(false);
    if (path) navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Welcome to Fantasy Football Rivals</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            We analyzed your league history. Here&apos;s what we found.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Spinner className="h-5 w-5" />
            Reading your league…
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {cards.map((card) => (
              <RevealCard key={card.id} card={card} />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            className="w-full justify-center bg-lime-500 font-semibold text-black hover:bg-lime-400"
            disabled={isLoading}
            onClick={() => finish("/dashboard")}
          >
            Enter My League
          </Button>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="font-semibold"
              disabled={isLoading}
              onClick={() => finish("/owner-profiles")}
            >
              View My GM Profile
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="font-semibold"
              disabled={isLoading}
              onClick={() => finish("/rivalry-center")}
            >
              See My Rivalries
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="font-semibold"
              disabled={isLoading}
              onClick={() => finish("/hall-of-fame")}
            >
              Explore League History
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
