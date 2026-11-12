"use client";

import * as React from "react";
import type { Chapter, ChapterStatus } from "@/lib/types";
import { readRecoveryDraft, removeMatchingRecoveryDraft, sameChapterDraft, writeRecoveryDraft } from "./draft-recovery";
import { createSaveQueue } from "./save-queue";
import type { ChapterPatch, SaveState } from "./types";

/** 当前章节的本地草稿（编辑器的唯一事实来源） */
export interface ChapterDraft {
  chapterId: string;
  title: string;
  content: string;
  summary: string;
  status: ChapterStatus;
  wordCount: number;
}

interface UseChapterDraftOptions {
  /** 当前选中章节；null 表示没有打开任何章节 */
  chapter: Chapter | null;
  /** 停止输入后多久自动保存（取 AppSettings.autoSaveDelayMs，默认 1200） */
  delayMs?: number;
  /** 是否自动保存（AppSettings.autoSave） */
  autoSave?: boolean;
  /** 真正落库的 PATCH，由调用方接 /api/chapters/[id] */
  onPersist: (chapterId: string, patch: ChapterPatch) => Promise<void>;
  /** 保存失败提示 */
  onError?: (message: string) => void;
  /** 浏览器临时草稿不可用时的提示 */
  onRecoveryError?: (message: string) => void;
}

export interface ChapterDraftApi {
  draft: ChapterDraft | null;
  saveState: SaveState;
  lastSavedAt: string | null;
  /** 是否存在尚未落库的改动（用于离开页面提示） */
  hasUnsaved: boolean;
  hasUnsavedNow: () => boolean;
  recoveryDraft: ChapterDraft | null;
  restoreRecovery: () => void;
  discardRecovery: () => void;
  setTitle: (title: string) => void;
  setContent: (html: string, wordCount: number) => void;
  setSummary: (summary: string) => void;
  setStatus: (status: ChapterStatus) => void;
  /** 立即保存（Ctrl/Cmd+S、切章前、离开页面时） */
  flush: () => Promise<void>;
  /** 取消待执行的自动保存（卸载时用） */
  cancel: () => void;
  adoptSaved: (chapter: Chapter) => void;
}

/**
 * 章节草稿与自动保存。
 * - 停输入 delayMs 后自动 PATCH；
 * - 保存期间继续输入不会丢：pending 标记保留，保存成功后再排一次；
 * - 切章时由调用方先 flush，本 hook 也会在 chapterId 变化时清空状态。
 */
export function useChapterDraft({
  chapter,
  delayMs = 1200,
  autoSave = true,
  onPersist,
  onError,
  onRecoveryError,
}: UseChapterDraftOptions): ChapterDraftApi {
  const [draft, setDraft] = React.useState<ChapterDraft | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [hasUnsaved, setHasUnsaved] = React.useState(false);
  const [recoveryDraft, setRecoveryDraft] = React.useState<ChapterDraft | null>(null);

  const draftRef = React.useRef<ChapterDraft | null>(null);
  const pendingRef = React.useRef(false);
  const unsavedRef = React.useRef(false);
  const recoveryRef = React.useRef<ChapterDraft | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const chapterRef = React.useRef<Chapter | null>(chapter);

  const onPersistRef = React.useRef(onPersist);
  const onErrorRef = React.useRef(onError);
  const onRecoveryErrorRef = React.useRef(onRecoveryError);
  React.useEffect(() => {
    onPersistRef.current = onPersist;
    onErrorRef.current = onError;
    onRecoveryErrorRef.current = onRecoveryError;
    chapterRef.current = chapter;
  });

  const reportRecoveryError = React.useCallback((message: string, error: unknown) => {
    console.error("[yanfield] 临时草稿:", error);
    onRecoveryErrorRef.current?.(message);
  }, []);

  const setRecovery = React.useCallback((value: ChapterDraft | null) => {
    recoveryRef.current = value;
    setRecoveryDraft(value);
  }, []);

  const hasUnsavedNow = React.useCallback(() =>
    unsavedRef.current || recoveryRef.current !== null, []);

  const stashUnsaved = React.useCallback(() => {
    const current = draftRef.current;
    if (!current || !unsavedRef.current) return;
    try {
      writeRecoveryDraft(window.sessionStorage, current);
    } catch (error) {
      reportRecoveryError("无法保存浏览器临时草稿，请留在写作台并复制正文后重试保存。", error);
    }
  }, [reportRecoveryError]);

  const clearTimer = React.useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveNext = React.useCallback(async (): Promise<void> => {
    const current = draftRef.current;
    if (!current) return;
    pendingRef.current = false;
    setSaveState("saving");
    try {
      await onPersistRef.current(current.chapterId, {
        title: current.title, content: current.content, summary: current.summary,
        status: current.status, wordCount: current.wordCount,
      });
      try {
        removeMatchingRecoveryDraft(window.sessionStorage, current);
      } catch (error) {
        reportRecoveryError("章节已保存，但无法清理浏览器临时草稿。", error);
      }
      if (draftRef.current?.chapterId === current.chapterId) {
        unsavedRef.current = pendingRef.current;
        setLastSavedAt(new Date().toISOString());
        setSaveState(pendingRef.current ? "dirty" : "saved");
        setHasUnsaved(pendingRef.current);
      }
    } catch (err) {
      if (draftRef.current?.chapterId === current.chapterId) {
        pendingRef.current = true;
        unsavedRef.current = true;
        setSaveState("error"); setHasUnsaved(true);
      }
      onErrorRef.current?.(err instanceof Error ? err.message : "保存失败");
      throw err;
    }
  }, [reportRecoveryError]);

  const [runSaveQueue] = React.useState(() =>
    createSaveQueue(() => pendingRef.current && draftRef.current !== null, saveNext),
  );

  const flush = React.useCallback(async (): Promise<void> => {
    clearTimer();
    if (recoveryRef.current) {
      const message = "请先恢复或丢弃当前章节的临时草稿。";
      onRecoveryErrorRef.current?.(message);
      throw new Error(message);
    }
    await runSaveQueue();
  }, [clearTimer, runSaveQueue]);

  /** 排自动保存定时器 */
  const schedule = React.useCallback((): void => {
    clearTimer();
    if (!autoSave) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush().catch(() => {});
    }, delayMs);
  }, [autoSave, delayMs, clearTimer, flush]);

  /** 切章：重置草稿与状态（先清 timer，调用方负责 flush 旧章） */
  const chapterId = chapter?.id ?? null;
  React.useEffect(() => {
    clearTimer();
    if (draftRef.current && draftRef.current.chapterId !== chapterId) stashUnsaved();
    pendingRef.current = false;
    unsavedRef.current = false;
    setRecovery(null);
    const next = chapterRef.current;
    if (!next) {
      draftRef.current = null;
      setDraft(null);
      setSaveState("idle");
      setLastSavedAt(null);
      setHasUnsaved(false);
      return;
    }
    const fresh: ChapterDraft = {
      chapterId: next.id,
      title: next.title,
      content: next.content,
      summary: next.summary,
      status: next.status,
      wordCount: next.wordCount,
    };
    draftRef.current = fresh;
    setDraft(fresh);
    setSaveState("idle");
    setLastSavedAt(next.updatedAt);
    setHasUnsaved(false);
    try {
      const recovered = readRecoveryDraft(window.sessionStorage, next.id);
      if (recovered && sameChapterDraft(recovered, fresh)) {
        removeMatchingRecoveryDraft(window.sessionStorage, recovered);
      } else {
        setRecovery(recovered);
      }
    } catch (error) {
      reportRecoveryError("无法读取浏览器临时草稿，请确认浏览器存储可用。", error);
    }
    // 只按 id 重置：同章内容更新（保存回写、AI 应用）不能重置草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  /** 统一修改草稿：标脏 + 重排自动保存 */
  const patchDraft = React.useCallback(
    (fields: Partial<Omit<ChapterDraft, "chapterId">>): void => {
      const previous = draftRef.current;
      if (!previous) return;
      const next: ChapterDraft = { ...previous, ...fields };
      draftRef.current = next;
      setDraft(next);
      pendingRef.current = true;
      unsavedRef.current = true;
      setHasUnsaved(true);
      setSaveState("dirty");
      schedule();
    },
    [schedule],
  );

  const setTitle = React.useCallback((title: string) => patchDraft({ title }), [patchDraft]);
  const setContent = React.useCallback(
    (content: string, wordCount: number) => patchDraft({ content, wordCount }),
    [patchDraft],
  );
  const setSummary = React.useCallback((summary: string) => patchDraft({ summary }), [patchDraft]);
  const setStatus = React.useCallback(
    (status: ChapterStatus) => patchDraft({ status }),
    [patchDraft],
  );

  React.useEffect(() => {
    window.addEventListener("pagehide", stashUnsaved);
    return () => {
      window.removeEventListener("pagehide", stashUnsaved);
      stashUnsaved();
      if (unsavedRef.current) {
        void flush().catch((error) => {
          console.error("[yanfield] 离开写作台时保存失败:", error);
        });
      }
    };
  }, [flush, stashUnsaved]);

  const restoreRecovery = React.useCallback(() => {
    if (!recoveryDraft || draftRef.current?.chapterId !== recoveryDraft.chapterId) return;
    draftRef.current = recoveryDraft;
    pendingRef.current = true;
    unsavedRef.current = true;
    setDraft(recoveryDraft);
    setHasUnsaved(true);
    setSaveState("dirty");
    setRecovery(null);
  }, [recoveryDraft, setRecovery]);

  const discardRecovery = React.useCallback(() => {
    if (!recoveryDraft) return;
    try {
      removeMatchingRecoveryDraft(window.sessionStorage, recoveryDraft);
      setRecovery(null);
    } catch (error) {
      reportRecoveryError("无法移除浏览器临时草稿，请检查浏览器存储后重试。", error);
    }
  }, [recoveryDraft, reportRecoveryError, setRecovery]);

  const adoptSaved = React.useCallback((saved: Chapter) => {
    if (draftRef.current?.chapterId !== saved.id) return;
    clearTimer();
    const next: ChapterDraft = {chapterId:saved.id,title:saved.title,content:saved.content,summary:saved.summary,status:saved.status,wordCount:saved.wordCount};
    draftRef.current=next; pendingRef.current=false; unsavedRef.current=false;
    setDraft(next); setHasUnsaved(false); setSaveState("saved"); setLastSavedAt(saved.updatedAt);
  },[clearTimer]);

  return {
    draft,
    saveState,
    lastSavedAt,
    hasUnsaved: hasUnsaved || recoveryDraft !== null,
    hasUnsavedNow,
    recoveryDraft,
    restoreRecovery,
    discardRecovery,
    setTitle,
    setContent,
    setSummary,
    setStatus,
    flush,
    cancel: clearTimer,
    adoptSaved,
  };
}
