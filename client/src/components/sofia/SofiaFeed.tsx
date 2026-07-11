import { SOFIA_FEED_CONTAINER_CLASS, sortCommentaryNewestFirst, type SofiaCommentary } from "@/lib/sofiaPresentation";
import { SofiaMomentCard } from "./SofiaMomentCard";

type SofiaFeedProps = {
  items: SofiaCommentary[];
};

export function SofiaFeed({ items }: SofiaFeedProps) {
  const ordered = sortCommentaryNewestFirst(items);

  return (
    <div className={SOFIA_FEED_CONTAINER_CLASS}>
      {ordered.map((item) => (
        <SofiaMomentCard key={item.momentId} commentary={item} />
      ))}
    </div>
  );
}
