import type { ReactNode } from "react";
import { cn } from "@/ui/lib/utils";

export const PAGE_COUNT = 10;

/** One landing "page" (spec 18.3). The page counter and the anchor glide read data-page. */
export function Page({
  n,
  id,
  titleId,
  className,
  children,
}: {
  n: number;
  id: string;
  titleId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-page={String(n).padStart(2, "0")}
      aria-labelledby={titleId}
      className={cn("relative px-4 py-24 sm:px-8 sm:py-32", className)}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="mb-6 flex items-center gap-3 font-mono text-xs tracking-widest text-muted uppercase">
      <span className="text-accent-text">p. {String(n).padStart(2, "0")}</span>
      <span aria-hidden="true" className="h-px w-8 bg-rule" />
      {children}
    </p>
  );
}
