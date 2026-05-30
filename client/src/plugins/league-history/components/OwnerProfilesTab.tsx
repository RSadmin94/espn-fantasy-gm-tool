export function OwnerProfilesTab() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Owner draft profiles unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
        The draft history pipeline was removed because stored pick data had unresolved scrape/API conflicts,
        team mapping errors, and bad owner assignment. Profiles will return after draft data is rebuilt from a
        clean source.
      </p>
    </div>
  );
}
