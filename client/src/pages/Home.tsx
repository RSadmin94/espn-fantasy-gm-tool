/**
 * Canonical V2 Home — curated intelligence feed at `/home`.
 * Reuses Dashboard data orchestration; Briefing remains on `/dashboard`.
 */
import { Dashboard } from "@/pages/Dashboard";

export function Home() {
  return <Dashboard variant="curated" />;
}
