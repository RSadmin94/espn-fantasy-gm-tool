import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { COMMERCIAL } from "@/lib/commercialCopy";
import type { RouteFeatureEntry } from "@/lib/featureRegistry";
import { UpgradeDialog } from "@/components/commercial/UpgradeDialog";
import {
  CinematicPageHeader,
  IntelPageShell,
  IntelPanel,
} from "@/components/layout";
import { Button } from "@/components/ui/button";

/** Static placeholder visuals — never live user data. */
function StaticSampleVisual({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <IntelPanel variant="elevated" className="relative overflow-hidden p-6" aria-hidden>
      <div className="pointer-events-none select-none space-y-4 blur-[6px]">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground/60" />
          <div className="h-3 w-40 rounded bg-muted-foreground/20" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-border/40 bg-muted/30 p-4">
            <div className="h-2.5 w-24 rounded bg-muted-foreground/25" />
            <div className="h-8 w-full rounded bg-muted-foreground/15" />
            <div className="h-2 w-3/4 rounded bg-muted-foreground/10" />
          </div>
          <div className="space-y-2 rounded-lg border border-border/40 bg-muted/30 p-4">
            <div className="h-2.5 w-28 rounded bg-muted-foreground/25" />
            <div className="h-8 w-full rounded bg-muted-foreground/15" />
            <div className="h-2 w-2/3 rounded bg-muted-foreground/10" />
          </div>
        </div>
        <div className="space-y-2">
          {[72, 88, 54, 96].map((w) => (
            <div key={w} className="flex items-center gap-3">
              <div className="h-2 w-16 shrink-0 rounded bg-muted-foreground/20" />
              <div className="h-2 flex-1 rounded bg-muted-foreground/10" style={{ maxWidth: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background/90" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-border/60 bg-background/80 p-3 shadow-lg backdrop-blur-sm">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
      </div>
    </IntelPanel>
  );
}

type FeatureLockedPageProps = {
  feature: RouteFeatureEntry;
};

export function FeatureLockedPage({ feature }: FeatureLockedPageProps) {
  const Icon = feature.icon;

  return (
    <IntelPageShell minHeight="screen" width="standard" background="cinematic" padding="default">
      <CinematicPageHeader
        title={feature.label}
        subtitle={COMMERCIAL.subscriptionRequiredMessage}
        titleSize="large"
        badge={{ label: "🔒 Rivals Pro", icon: Lock, tone: "default" }}
        className="mb-6"
      />

      <div className="mx-auto max-w-2xl space-y-6">
        <IntelPanel variant="elevated" className="p-6 text-center sm:p-8">
          <Icon className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="text-lg font-bold text-foreground">{feature.label}</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {feature.marketingDescription}
          </p>
          <UpgradeDialog
            title={`Unlock ${feature.label}`}
            description={feature.marketingDescription}
            trigger={
              <Button type="button" className="mt-5 font-extrabold">
                Unlock Rivals Pro
              </Button>
            }
          />
        </IntelPanel>

        <StaticSampleVisual icon={Icon} />
      </div>
    </IntelPageShell>
  );
}
