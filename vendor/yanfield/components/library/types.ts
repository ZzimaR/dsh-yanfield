import type { Novel } from "@/lib/types";

/** GET /api/novels 的列表项：契约保证附带汇总字段，这里仍设为可选以便容错。 */
export interface NovelListItem extends Novel {
  volumeCount?: number;
  chapterCount?: number;
  wordCount?: number;
  doneChapters?: number;
  lastChapterId?: string | null;
}

export interface NovelListResponse {
  items: NovelListItem[];
}

export interface NovelMeta {
  volumeCount: number;
  chapterCount: number;
  wordCount: number;
  doneChapters: number;
  lastChapterId: string | null;
}

export type SortKey = "recent" | "created" | "words" | "title";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "最近更新" },
  { value: "created", label: "创建时间" },
  { value: "words", label: "总字数" },
  { value: "title", label: "书名" },
];

export const GENRE_ALL = "all";

export function editorHref(id: string, lastChapterId?: string | null): string {
  return lastChapterId ? `/editor/${id}?chapterId=${lastChapterId}` : `/editor/${id}`;
}
