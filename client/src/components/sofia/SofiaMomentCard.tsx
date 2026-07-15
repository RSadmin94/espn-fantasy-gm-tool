import { AlertCircle, BadgeCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMomentCardDisplay, type SofiaCommentary } from "@/lib/sofiaPresentation";
import { SofiaMomentBadge } from "./SofiaMomentBadge";
import { SofiaShareButton } from "./SofiaShareButton";

type SofiaMomentCardProps = {
  commentary: SofiaCommentary;
};

export function SofiaMomentCard({ commentary }: SofiaMomentCardProps) {
  const display = getMomentCardDisplay(commentary);

  if (!display.verified) {
    return (
      <Card className="border-border/60 bg-muted/20" aria-label="Commentary unavailable">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Commentary unavailable</p>
            <p className="text-sm text-muted-foreground">
              Sofia could not verify this pick with league evidence. Try refreshing after your next mock
              draft.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SofiaMomentBadge level={commentary.level} />
          <Badge
            variant="outline"
            className="gap-1 border-lime-500/35 bg-lime-500/10 text-lime-600 dark:text-lime-400"
          >
            <BadgeCheck className="h-3 w-3" aria-hidden />
            Verified
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground break-words">{display.ownerName}</p>
          <p className="text-sm text-muted-foreground break-words">{display.playerLine}</p>
          <p className="text-xs text-muted-foreground">{display.pickLine}</p>
        </div>

        {display.storyline ? (
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{display.storyline}</p>
        ) : null}

        <p className="text-sm leading-relaxed text-foreground break-words">{display.text}</p>

        <div className="flex justify-end pt-1">
          <SofiaShareButton commentary={commentary} />
        </div>
      </CardContent>
    </Card>
  );
}
