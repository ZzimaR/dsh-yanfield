"use client";

/**
 * 章纲覆盖率索引
 *
 * 契约里没有「章节列表 + 章纲」的聚合接口，因此按章并发拉取
 * `GET /api/chapters/[id]/blueprint` 来判断哪些章已经写过章纲。
 * - 并发上限 6，章节数超过上限时只统计前 N 章（partial = true）；
 * - 单章失败不影响整体统计；
 * - 传 version 用于保存章纲后强制重算。
 */
import * as React from "react";
import { apiGet } from "@/lib/client/api";
import type { Chapter, ChapterBlueprint, ID } from "@/lib/types";

const MAX_INDEX = 80;
const CONCURRENCY = 6;

export interface BlueprintIndex {
  /** 已填写过章纲的章节 id */
  filled: Set<ID>;
  /** 已拿到结果的章节数（进度） */
  loaded: number;
  /** 参与统计的章节数 */
  total: number;
  loading: boolean;
  /** 章节数超过 MAX_INDEX，只统计了一部分 */
  partial: boolean;
}

function hasBlueprint(blueprint: ChapterBlueprint): boolean {
  return Boolean(
    blueprint.goal?.trim() ||
      blueprint.conflict?.trim() ||
      blueprint.emotionalArc?.trim() ||
      blueprint.scenes?.length ||
      blueprint.plotPoints?.length ||
      blueprint.hooks?.length,
  );
}

export function useBlueprintIndex(chapters: Chapter[], version = 0): BlueprintIndex {
  const [filled, setFilled] = React.useState<Set<ID>>(() => new Set<ID>());
  const [loaded, setLoaded] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [partial, setPartial] = React.useState(false);
  const chapterKey = chapters.map((chapter) => chapter.id).join("|");

  React.useEffect(() => {
    if (chapters.length === 0) {
      setFilled(new Set<ID>());
      setLoaded(0);
      setLoading(false);
      setPartial(false);
      return;
    }

    let cancelled = false;
    const targets = chapters.slice(0, MAX_INDEX);
    setPartial(chapters.length > MAX_INDEX);
    setFilled(new Set<ID>());
    setLoaded(0);
    setLoading(true);

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const index = cursor++;
        if (index >= targets.length) return;
        const chapter = targets[index];
        try {
          const blueprint = await apiGet<ChapterBlueprint>(`/api/chapters/${chapter.id}/blueprint`);
          if (cancelled) return;
          if (hasBlueprint(blueprint)) {
            setFilled((prev) => {
              if (prev.has(chapter.id)) return prev;
              const next = new Set(prev);
              next.add(chapter.id);
              return next;
            });
          }
        } catch {
          // 单章读取失败只影响覆盖率统计，不打断页面
        }
        if (cancelled) return;
        setLoaded((prev) => prev + 1);
      }
    };

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker())).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // chapterKey 已经能代表章节集合；version 用于保存章纲后强制重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey, version]);

  return {
    filled,
    loaded,
    total: Math.min(chapters.length, MAX_INDEX),
    loading,
    partial,
  };
}
