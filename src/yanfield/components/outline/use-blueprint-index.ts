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
import { apiGet } from "@/lib/client/api";
import { toItems } from "@/lib/editor/normalize";
import type { Chapter, ChapterBlueprint, ID } from "@/lib/types";

export interface BlueprintIndex {
  /** 已填写过章纲的章节 id */
  filled: Set<ID>;
  /** chapterId → 章纲，用于列表里显示一句话摘要与节奏标记 */
  byChapter: Map<ID, ChapterBlueprint>;
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

export function useBlueprintIndex(novelId: string, chapters: Chapter[], version = 0): BlueprintIndex {
  const [byChapter, setByChapter] = React.useState<Map<ID, ChapterBlueprint>>(() => new Map());
  const [loading, setLoading] = React.useState(false);
  const chapterKey = chapters.map((chapter) => chapter.id).join("|");

  React.useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    setLoading(true);
    apiGet<unknown>(`/api/blueprints?novelId=${encodeURIComponent(novelId)}`)
      .then((data) => {
        if (cancelled) return;
        const next = new Map<ID, ChapterBlueprint>();
        for (const item of toItems<ChapterBlueprint>(data)) {
          if (item.chapterId && hasBlueprintContent(item)) next.set(item.chapterId, item);
        }
        setByChapter(next);
      })
      .catch(() => {
        // 读取失败只影响覆盖率与摘要显示，不打断写作台
        if (!cancelled) setByChapter(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // chapterKey 代表章节集合；version 用于保存章纲后强制刷新
  }, [novelId, chapterKey, version]);

  const filled = React.useMemo(() => new Set(byChapter.keys()), [byChapter]);

  return { filled, byChapter, total: chapters.length, loading };
}
