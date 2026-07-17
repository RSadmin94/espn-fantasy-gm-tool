import type { LucideIcon } from "lucide-react";
import { V2 } from "@/lib/v2Copy";

export type V2PlaceholderPageProps = {
  title: string;
  icon?: LucideIcon;
  domain: string;
};

export function V2PlaceholderPage({ title, icon: Icon, domain }: V2PlaceholderPageProps) {
  return (
    <div
      className="flex h-full min-h-[50vh] flex-col items-center justify-center px-6 py-12 text-center"
      data-v2-placeholder
      data-v2-domain={domain}
    >
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <p className="text-2xs font-bold uppercase tracking-[0.2em] text-lime-400/80">
        {V2.placeholder.eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{V2.placeholder.body}</p>
    </div>
  );
}
