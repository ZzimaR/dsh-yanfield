/**
 * 书架列表的汇总字段：在 Novel 之上追加卷/章/字数统计。
 * 全部通过 repo.getNovelTree 汇总，不直接写 SQL。
 */
import * as repo from "@/lib/repo";
import type { Novel } from "@/lib/types";

export type NovelSummary = Novel & {
  volumeCount: number;
  chapterCount: number;
  wordCount: number;
  doneChapters: number;
  lastChapterId: string | null;
};

export function listNovelSummaries(): NovelSummary[] {
  return repo.listNovels().map((novel) => {
    const tree = repo.getNovelTree(novel.id);
    const volumes = tree?.volumes ?? [];
    const chapters = [...volumes.flatMap((volume) => volume.chapters), ...(tree?.looseChapters ?? [])];
    return {
      ...novel,
      volumeCount: volumes.length,
      chapterCount: chapters.length,
      wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      doneChapters: chapters.filter((chapter) => chapter.status === "done").length,
      lastChapterId: chapters.length > 0 ? chapters[chapters.length - 1].id : null,
    };
  });
}
