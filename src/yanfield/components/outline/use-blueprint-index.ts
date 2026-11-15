"use client";

/**
 * 章纲索引
 *
 * 写作台要按卷扫读每一章的章纲摘要与节奏标记（悬念 / 转折）。
 * 逐章拉 `GET /api/chapters/[id]/blueprint` 会打成几十个并发请求，所以改成一次
 * `GET /api/blueprints?novelId=`，前端按 chapterId 建索引。
 * 只收「真的写过内容」的章纲：仓库层会给每章兜底一行空章纲，不能算作已填写。
 */
import * as React from "react";
import { useApi, useDataChanged } from "@/lib/client/api";
import type { Chapter, ChapterBlueprint, ID } from "@/lib/types";

export interface BlueprintIndex {
  /** 已填写过章纲的章节 id */
  filled: Set<ID>;
  /** chapterId → 章纲，用于列表里显示一句话摘要与节奏标记 */
  byChapter: Map<ID, ChapterBlueprint>;
  pending: Set<ID>;
  /** 参与统计的章节数 */
  total: number;
  loading: boolean;
}

export function hasBlueprintContent(blueprint: ChapterBlueprint): boolean {
  return Boolean(
    blueprint.goal?.trim() ||
      blueprint.conflict?.trim() ||
      blueprint.emotionalArc?.trim() ||
      blueprint.scenes?.length ||
      blueprint.plotPoints?.length ||
      blueprint.hooks?.length ||
      blueprint.pov?.trim() ||
      blueprint.notes?.trim() ||
      blueprint.targetWords !== 2500 ||
      blueprint.suspense !== "medium" ||
      blueprint.twist !== "medium",
  );
}

const refreshTopics = ["agent", "blueprint", "blueprint-review"]

export function useBlueprintIndex(novelId: string, chapters: Chapter[]): BlueprintIndex {
  const chapterKey = chapters.map((chapter) => chapter.id).join("|");
  const { data, loading, refresh } = useApi<{ items: ChapterBlueprint[]; pendingChapterIds?: ID[] }>(
    novelId ? `/api/blueprints?novelId=${encodeURIComponent(novelId)}` : null,
    [chapterKey],
  );
  useDataChanged(refresh, refreshTopics);
  const byChapter = React.useMemo(() => new Map(
    (data?.items ?? []).filter(item => item.novelId === novelId && hasBlueprintContent(item))
      .map(item => [item.chapterId, item]),
  ), [data, novelId]);
  const pending = React.useMemo(() => new Set(data?.pendingChapterIds), [data]);

  const filled = React.useMemo(() => new Set(byChapter.keys()), [byChapter]);

  return { filled, byChapter, pending, total: chapters.length, loading: loading && !data };
}
