"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/kit";
import { NovelCard } from "./NovelCard";
import type { NovelListItem } from "./types";

export interface NovelGridProps {
  items: NovelListItem[];
  onDelete: (novel: NovelListItem) => void;
  onEdit?: (novel: NovelListItem) => void;
}

/** 作品卡片栅格。 */
export function NovelGrid({ items, onDelete, onEdit }: NovelGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((novel) => (
        <NovelCard key={novel.id} novel={novel} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}

/** 栅格加载态。 */
export function NovelGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface p-2.5">
          <Skeleton className="aspect-[4/5] w-full rounded-md" />
          <Skeleton className="mt-3 h-3.5 w-2/3" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
