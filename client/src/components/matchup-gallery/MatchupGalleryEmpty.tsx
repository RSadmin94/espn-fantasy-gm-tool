import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/layout";
import { galleryEmptyCopy } from "@/lib/matchupGalleryUi";
import type { GalleryEmptyReason } from "../../../../server/matchupGalleryQuery";

export function MatchupGalleryEmpty({
  reason,
  summary,
}: {
  reason: GalleryEmptyReason | null | undefined;
  summary?: string | null;
}) {
  const copy = galleryEmptyCopy(reason, summary);
  return (
    <div data-gallery-empty={copy.reason}>
      <EmptyState
        icon={Inbox}
        title={copy.title}
        description={copy.description}
        panelVariant="card"
      />
    </div>
  );
}
