import { Skeleton } from "@/components/ui/skeleton";

export function SofiaLoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading draft commentary">
      {[0, 1, 2].map((key) => (
        <div key={key} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="ml-auto h-9 w-20" />
        </div>
      ))}
    </div>
  );
}
