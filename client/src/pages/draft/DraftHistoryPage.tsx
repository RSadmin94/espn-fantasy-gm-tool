/**
 * Canonical `/draft/history` — mounts existing Draft History authority.
 */
import { DraftHistory } from "@/pages/DraftHistory";

export function DraftHistoryPage() {
  return (
    <div data-v2-draft-history>
      <DraftHistory />
    </div>
  );
}
