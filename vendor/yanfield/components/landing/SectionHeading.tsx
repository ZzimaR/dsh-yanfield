import * as React from "react";
import { cn } from "@/lib/ui/cn";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}

/** 落地页统一的区块标题：小标签 + 衬线大标题 + 副文案。 */
export function SectionHeading({ eyebrow, title, description, align = "center", className }: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3.5",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-ink-3">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          {eyebrow}
        </span>
      ) : null}
      <h2 className="max-w-3xl font-serif text-[28px] leading-[1.25] tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className={cn("max-w-2xl text-[13.5px] leading-7 text-ink-2 sm:text-[15px]", align === "center" && "mx-auto")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
