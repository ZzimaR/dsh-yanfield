"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/kit";
import { GENRES } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { GENRE_ALL, SORT_OPTIONS, type SortKey } from "./types";

export interface LibraryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  genre: string;
  onGenreChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  count: number;
}

/** 书架工具栏：搜索、类型筛选、排序。 */
export function LibraryToolbar({
  search,
  onSearchChange,
  genre,
  onGenreChange,
  sort,
  onSortChange,
  count,
}: LibraryToolbarProps) {
  const tr = useT();
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={tr("搜索书名或简介…")}
          aria-label={tr("搜索作品")}
          prefix={<Search className="size-3.5" />}
        />
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        <div className="w-32 sm:w-36">
          <Select
            aria-label={tr("类型筛选")}
            value={genre}
            onChange={(event) => onGenreChange(event.target.value)}
            options={[{ value: GENRE_ALL, label: tr("全部类型") }, ...GENRES.map((item) => ({ value: item, label: tr(item) }))]}
          />
        </div>
        <div className="w-32 sm:w-36">
          <Select
            aria-label={tr("排序方式")}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            options={SORT_OPTIONS.map((option) => ({ ...option, label: tr(option.label) }))}
          />
        </div>
        <span className="ml-auto hidden shrink-0 text-[11.5px] text-ink-3 md:block">{tr("共 {count} 部", { count })}</span>
      </div>
    </div>
  );
}
