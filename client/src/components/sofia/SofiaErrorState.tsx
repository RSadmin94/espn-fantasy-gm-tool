import { Link } from "react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SofiaErrorStateProps = {
  title: string;
  body: string;
  showLeagueSwitch?: boolean;
  showDraftWarRoom?: boolean;
  onRetry: () => void;
};

export function SofiaErrorState({
  title,
  body,
  showLeagueSwitch,
  showDraftWarRoom,
  onRetry,
}: SofiaErrorStateProps) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="space-y-4 py-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
          {showLeagueSwitch ? (
            <Button asChild variant="outline">
              <Link to="/connected-leagues">Connected Leagues</Link>
            </Button>
          ) : null}
          {showDraftWarRoom ? (
            <Button asChild variant="outline">
              <Link to="/draft-war-room">Draft War Room</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
