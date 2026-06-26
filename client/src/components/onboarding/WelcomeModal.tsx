import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProductTourStepId } from "@/lib/productOnboarding";

export function WelcomeModal({
  open,
  onOpenChange,
  onExplore,
  onSkipTour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExplore: (tourStep: ProductTourStepId) => void;
  onSkipTour: () => void;
}) {
  const navigate = useNavigate();

  const handleExplore = (path: string, tourStep: ProductTourStepId) => {
    onExplore(tourStep);
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Welcome to GM War Room</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            GM War Room transforms years of fantasy football history into intelligence, rivalries, and league legacy.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            className="w-full justify-center bg-lime-500 font-semibold text-black hover:bg-lime-400"
            onClick={() => handleExplore("/owner-profiles", "gm-intelligence")}
          >
            Explore My GM Profile
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center font-semibold"
            onClick={() => handleExplore("/rivalry-center", "rivalry-documentary")}
          >
            Explore My Biggest Rivalry
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center font-semibold"
            onClick={() => handleExplore("/hall-of-fame", "league-archives")}
          >
            Explore League Archives
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-center text-muted-foreground hover:text-foreground"
            onClick={() => {
              onSkipTour();
              onOpenChange(false);
            }}
          >
            Skip Tour
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
