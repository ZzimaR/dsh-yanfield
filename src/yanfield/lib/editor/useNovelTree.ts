"use client";

import * as React from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, useDataChanged } from "@/lib/client/api";
import type { Chapter, Volume } from "@/lib/types";
import type { MoveTarget, NovelTree, TreeActions, TreeVolume } from "./types";

interface UseNovelTreeOptions {
  novelId: string;
  initialChapterId?: string | null;
  /** 请求失败提示（通常直接接 toast） */
  onError?: (message: string) => void;
  /** 操作成功提示 */
  onSuccess?: (message: string) => void;
}

export interface UseNovelTreeResult {
  tree: NovelTree | null;
  initialChapter: Chapter | null;
  loading: boolean;
  error: string | null;
  /** 作品不存在（404）——页面展示专门的空状态 */
  notFound: boolean;
  actions: TreeActions;
}

/** 把 api 抛出的错误转成一句中文提示 */
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "请求失败，请稍后重试";
}

/**
 * 编辑器目录树：加载 + 卷/章增删改移。
 * 所有写操作串行执行（避免并发刷新互相覆盖），失败统一回调 onError。
 */
export function useNovelTree({ novelId, initialChapterId, onError, onSuccess }: UseNovelTreeOptions): UseNovelTreeResult {
  const [tree, setTree] = React.useState<NovelTree | null>(null);
  const [initialChapter, setInitialChapter] = React.useState<Chapter | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  // 回调放 ref，避免把不稳定函数塞进各个 useCallback 依赖
  const onErrorRef = React.useRef(onError);
  const onSuccessRef = React.useRef(onSuccess);
  React.useEffect(() => {
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;
  });

  const fail = React.useCallback((err: unknown): string => {
    const message = errorMessage(err);
    onErrorRef.current?.(message);
    return message;
  }, []);

  /** silent=true 时不显示整页骨架，用于增删改后的静默刷新 */
  const load = React.useCallback(
    async (silent = false): Promise<void> => {
      if (!silent) setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const chapterQuery = !silent && initialChapterId
          ? `&chapterId=${encodeURIComponent(initialChapterId)}`
          : "";
        const data = await apiGet<NovelTree & { selectedChapter?: Chapter | null }>(
          `/api/novels/${novelId}/tree?view=summary${chapterQuery}`,
        );
        if (!data || !data.novel) throw new Error("目录数据格式异常");
        const volumes: TreeVolume[] = (data.volumes ?? []).map((volume) => ({
          ...volume,
          chapters: volume.chapters ?? [],
        }));
        setTree({
          novel: data.novel,
          volumes,
          looseChapters: data.looseChapters ?? [],
        });
        if (!silent) setInitialChapter(data.selectedChapter ?? null);
      } catch (err) {
        setTree(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(fail(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [novelId, initialChapterId, fail],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  useDataChanged(()=>{void load(true);},["agent"]);

  /** 单章本地乐观更新（保存成功、重命名后同步树，避免整树刷新打断编辑） */
  const patchChapterLocal = React.useCallback((chapterId: string, patch: Partial<Chapter>): void => {
    setTree((prev) => {
      if (!prev) return prev;
      let changed = false;

      const volumes = prev.volumes.map((volume) => {
        const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
        if (index < 0) return volume;
        changed = true;
        const chapters = volume.chapters.slice();
        chapters[index] = { ...chapters[index], ...patch };
        return { ...volume, chapters };
      });

      let looseChapters = prev.looseChapters;
      const looseIndex = prev.looseChapters.findIndex((chapter) => chapter.id === chapterId);
      if (looseIndex >= 0) {
        changed = true;
        looseChapters = prev.looseChapters.slice();
        looseChapters[looseIndex] = { ...looseChapters[looseIndex], ...patch };
      }

      return changed ? { ...prev, volumes, looseChapters } : prev;
    });
  }, []);

  /** 为目录树重新计算某卷的章节 orderIndex（仅本地、用于上下移后即时反馈） */
  const actions = React.useMemo<TreeActions>(
    () => ({
      refresh: async () => {
        await load(true);
      },

      createVolume: async (title) => {
        try {
          await apiPost<Volume>("/api/volumes", { novelId, title });
          await load(true);
          onSuccessRef.current?.("已新建卷");
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      renameVolume: async (volumeId, title) => {
        try {
          await apiPatch<Volume>(`/api/volumes/${volumeId}`, { title });
          await load(true);
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      deleteVolume: async (volumeId) => {
        try {
          await apiDelete(`/api/volumes/${volumeId}`);
          await load(true);
          onSuccessRef.current?.("已删除卷");
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      moveVolume: async (volumeId, orderIndex) => {
        try {
          await apiPatch<Volume>(`/api/volumes/${volumeId}`, { orderIndex });
          await load(true);
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      createChapter: async ({ volumeId, title }) => {
        try {
          const chapter = await apiPost<Chapter>("/api/chapters", {
            novelId,
            volumeId,
            title,
          });
          await load(true);
          return chapter?.id ?? null;
        } catch (err) {
          fail(err);
          return null;
        }
      },

      renameChapter: async (chapterId, title) => {
        try {
          await apiPatch<Chapter>(`/api/chapters/${chapterId}`, { title });
          patchChapterLocal(chapterId, { title });
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      deleteChapter: async (chapterId) => {
        try {
          await apiDelete(`/api/chapters/${chapterId}`);
          await load(true);
          onSuccessRef.current?.("已删除章节");
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      moveChapter: async (chapterId, target: MoveTarget) => {
        try {
          await apiPost<Chapter>(`/api/chapters/${chapterId}/move`, {
            volumeId: target.volumeId,
            orderIndex: target.orderIndex,
          });
          await load(true);
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      patchChapterLocal,
    }),
    [novelId, load, patchChapterLocal, fail],
  );

  return { tree, initialChapter, loading, error, notFound, actions };
}
