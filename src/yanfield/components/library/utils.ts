import type { NovelListItem } from "./types";
import { apiUrl } from "@/lib/client/api";

/** 触发浏览器下载导出文件（GET /api/export/[novelId] 返回 attachment）。 */
export function downloadNovelExport(
  novelId: string,
  options: { format?: "md" | "txt"; scope?: "book" | "chapter" | "volume" } = {},
): void {
  const params = new URLSearchParams({ format: options.format ?? "md", scope: options.scope ?? "book" });
  const href = apiUrl(`/api/export/${novelId}?${params.toString()}`);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** 从 novels 列表过滤 + 排序（前端本地处理）。 */
export function filterAndSortNovels(
  items: NovelListItem[],
  options: { search: string; genre: string; sort: string },
): NovelListItem[] {
  const keyword = options.search.trim().toLowerCase();
  const filtered = items.filter((novel) => {
    if (options.genre !== "all" && novel.genre !== options.genre) return false;
    if (!keyword) return true;
    const haystack = `${novel.title} ${novel.subtitle} ${novel.synopsis} ${novel.genre}`.toLowerCase();
    return haystack.includes(keyword);
  });

  const byRecent = (novel: NovelListItem) => novel.lastOpenedAt ?? novel.updatedAt;
  return [...filtered].sort((a, b) => {
    switch (options.sort) {
      case "created":
        return b.createdAt.localeCompare(a.createdAt);
      case "words":
        return (b.wordCount ?? 0) - (a.wordCount ?? 0);
      case "title":
        return a.title.localeCompare(b.title, "zh-CN");
      case "recent":
      default:
        return byRecent(b).localeCompare(byRecent(a));
    }
  });
}
