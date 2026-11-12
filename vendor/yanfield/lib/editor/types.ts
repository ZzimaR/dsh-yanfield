import type { Chapter, ChapterStatus, Novel, Volume } from "@/lib/types";

/** 带章节列表的卷（对应 GET /api/novels/[id]/tree 的 volumes 字段） */
export interface TreeVolume extends Volume {
  chapters: Chapter[];
}

/** 编辑器目录树数据：卷 → 章 + 未分卷章节 */
export interface NovelTree {
  novel: Novel;
  volumes: TreeVolume[];
  looseChapters: Chapter[];
}

/** 左栏标签页 */
export type EditorTab = "toc" | "outline" | "archives";

/**
 * 保存状态机：
 * - idle  当前没有改动（或刚切章）
 * - dirty 有改动、等待自动保存
 * - saving 正在请求 PATCH
 * - saved 最近一次保存成功
 * - error 保存失败，改动仍在本地
 */
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** 当前选区信息（同时广播给 AI 面板） */
export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
  empty: boolean;
}

/** PATCH /api/chapters/[id] 允许携带的字段 */
export interface ChapterPatch {
  title?: string;
  content?: string;
  summary?: string;
  status?: ChapterStatus;
  wordCount?: number;
  notes?: string;
}

/** 章节移动目标（上下移、跨卷移动共用） */
export interface MoveTarget {
  volumeId: string | null;
  orderIndex: number;
}

/**
 * 目录操作集：由 useNovelTree 提供并注入给左栏组件。
 * 返回 boolean 表示是否成功（失败已在 hook 内 toast 过），便于调用方决定是否关弹窗。
 */
export interface TreeActions {
  createVolume: (title: string) => Promise<boolean>;
  renameVolume: (volumeId: string, title: string) => Promise<boolean>;
  deleteVolume: (volumeId: string) => Promise<boolean>;
  moveVolume: (volumeId: string, orderIndex: number) => Promise<boolean>;
  createChapter: (input: { volumeId: string | null; title: string }) => Promise<string | null>;
  renameChapter: (chapterId: string, title: string) => Promise<boolean>;
  deleteChapter: (chapterId: string) => Promise<boolean>;
  moveChapter: (chapterId: string, target: MoveTarget) => Promise<boolean>;
  /** 本地乐观更新某个章节（保存成功后同步 tree，避免整树重新拉取） */
  patchChapterLocal: (chapterId: string, patch: Partial<Chapter>) => void;
  refresh: () => Promise<void>;
}

/** 树内全部章节（按卷序 + 卷内序展平） */
export function flattenChapters(tree: NovelTree | null): Chapter[] {
  if (!tree) return [];
  const result: Chapter[] = [];
  for (const volume of tree.volumes) result.push(...volume.chapters);
  result.push(...tree.looseChapters);
  return result;
}

/** 在树里找章节 */
export function findChapter(tree: NovelTree | null, chapterId: string | null): Chapter | null {
  if (!tree || !chapterId) return null;
  for (const volume of tree.volumes) {
    const found = volume.chapters.find((chapter) => chapter.id === chapterId);
    if (found) return found;
  }
  return tree.looseChapters.find((chapter) => chapter.id === chapterId) ?? null;
}

/** 章节所属卷（未分卷返回 null） */
export function findVolumeOfChapter(
  tree: NovelTree | null,
  chapterId: string | null,
): TreeVolume | null {
  if (!tree || !chapterId) return null;
  for (const volume of tree.volumes) {
    if (volume.chapters.some((chapter) => chapter.id === chapterId)) return volume;
  }
  return null;
}

/** 卷/未分卷分组的总字数 */
export function volumeWordCount(volume: TreeVolume): number {
  return volume.chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);
}
