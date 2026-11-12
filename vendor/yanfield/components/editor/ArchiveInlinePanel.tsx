"use client";

/**
 * 写作台左栏「档案」面板
 * - 顶部：已建档 / 待提取统计 +「补齐缺失」，按章节顺序串行流式提取，可中止并显示进度
 * - 列表：按分卷分组列章节，圆点表示档案状态（最新 / 已过期 / 待确认 / 有冲突 / 未建档）
 * - 点击章节：在 FloatWindow 里查看 ArchiveDetail；未建档时可在浮窗内现场提取
 * 同一时间只开一个浮窗；左栏页签切走后浮窗随面板一起隐藏，切回时恢复。
 */
import * as React from "react";
import { Archive, AlertTriangle, FolderOpen, Sparkles, Square } from "lucide-react";
import { Button, EmptyState, Progress, Skeleton, useToast } from "@/components/ui/kit";
import { notifyDataChanged, useApi, useDataChanged } from "@/lib/client/api";
import { toItems } from "@/lib/editor/normalize";
import {
  ARCHIVE_STATUS_LABEL,
  CHAPTER_STATUS_LABEL,
  type Chapter,
  type StoryArchive,
  type Volume,
} from "@/lib/types";
import { cn, formatWords, stripHtml } from "@/lib/ui/cn";
import { InlineError, reindexChaptersByVolume, stripChapterNumber } from "@/components/outline/form-kit";
import { ArchiveDetail } from "@/components/archives/ArchiveDetail";
import { extractChapterArchive } from "@/components/archives/extract";
import { FloatWindow } from "./FloatWindow";

/* ============================== 状态圆点 ============================== */

type ArchiveDot = "fresh" | "stale" | "pending" | "conflict" | "none";

const DOT_CLASS: Record<ArchiveDot, string> = {
  fresh: "border-transparent bg-jade",
  stale: "border-transparent bg-gold",
  pending: "border-transparent bg-accent",
  conflict: "border-transparent bg-danger",
  none: "border-ink-4 bg-transparent",
};

const DOT_TEXT: Record<ArchiveDot, string> = {
  fresh: "档案最新",
  stale: "档案已过期",
  pending: "档案待确认",
  conflict: "档案有冲突待确认",
  none: "还没有档案",
};

function archiveDot(archive: StoryArchive | undefined): ArchiveDot {
  if (!archive) return "none";
  if (archive.conflicts.length > 0) return "conflict";
  if (archive.status === "stale") return "stale";
  if (archive.status === "pending") return "pending";
  return "fresh";
}

interface VolumeGroup {
  key: string;
  title: string;
  chapters: Chapter[];
}

interface BuildProgress {
  processed: number;
  total: number;
  done: number;
  failed: number;
  currentTitle: string;
}

/* ============================== 面板 ============================== */

export interface ArchiveInlinePanelProps {
  novelId: string;
}

export function ArchiveInlinePanel({ novelId }: ArchiveInlinePanelProps) {
  const { toast } = useToast();
  const query = React.useMemo(() => `?novelId=${encodeURIComponent(novelId)}`, [novelId]);

  const chaptersApi = useApi<unknown>(`/api/chapters${query}`);
  const volumesApi = useApi<unknown>(`/api/volumes${query}`);
  const archivesApi = useApi<unknown>(`/api/archives${query}`);

  /* 左栏是页签保活的：切到别的页签时父级用 hidden 隐藏本面板，
     但 FloatWindow 是 portal 到 body 的，必须随页签一起隐藏。 */
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(true);

  const [selectedChapterId, setSelectedChapterId] = React.useState<string | null>(null);
  const [minimized, setMinimized] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [buildProgress, setBuildProgress] = React.useState<BuildProgress | null>(null);
  const [extractingOneId, setExtractingOneId] = React.useState<string | null>(null);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const buildAbortRef = React.useRef<AbortController | null>(null);
  const oneAbortRef = React.useRef<AbortController | null>(null);
  const aliveRef = React.useRef(true);

  /* ---------- 数据 ---------- */

  const rawChapters = React.useMemo(() => toItems<Chapter>(chaptersApi.data), [chaptersApi.data]);
  const volumes = React.useMemo(() => toItems<Volume>(volumesApi.data), [volumesApi.data]);
  const chapters = React.useMemo(() => reindexChaptersByVolume(rawChapters, volumes), [rawChapters, volumes]);
  const archives = React.useMemo(() => toItems<StoryArchive>(archivesApi.data), [archivesApi.data]);
  const archivesReady = archivesApi.data !== undefined;

  const archivesByChapter = React.useMemo(() => {
    const map = new Map<string, StoryArchive>();
    for (const archive of archives) {
      if (archive.chapterId) map.set(archive.chapterId, archive);
    }
    return map;
  }, [archives]);

  /** 有正文的章节（空段落不算），补建只处理这些章 */
  const chaptersWithContent = React.useMemo(
    () => new Set(chapters.filter((chapter) => stripHtml(chapter.content).length > 0).map((chapter) => chapter.id)),
    [chapters],
  );

  const archivedCount = React.useMemo(
    () => chapters.filter((chapter) => archivesByChapter.has(chapter.id)).length,
    [chapters, archivesByChapter],
  );
  const missingChapters = React.useMemo(
    () => chapters.filter((chapter) => !archivesByChapter.has(chapter.id)),
    [chapters, archivesByChapter],
  );
  const missingWithContent = React.useMemo(
    () => missingChapters.filter((chapter) => chaptersWithContent.has(chapter.id)),
    [missingChapters, chaptersWithContent],
  );

  const chapterIds = React.useMemo(() => new Set(chapters.map((chapter) => chapter.id)), [chapters]);
  const relevantArchives = React.useMemo(
    () => archives.filter((archive) => archive.chapterId !== null && chapterIds.has(archive.chapterId)),
    [archives, chapterIds],
  );
  const staleCount = relevantArchives.filter((archive) => archive.status === "stale").length;
  const pendingCount = relevantArchives.filter((archive) => archive.status === "pending").length;
  const conflictCount = relevantArchives.filter((archive) => archive.conflicts.length > 0).length;
  const statCount = staleCount + pendingCount + conflictCount;

  const volumeGroups = React.useMemo<VolumeGroup[]>(() => {
    if (volumes.length === 0) {
      return chapters.length > 0 ? [{ key: "__all", title: "", chapters }] : [];
    }
    const ordered = [...volumes].sort((a, b) => a.orderIndex - b.orderIndex);
    const groups = ordered.map<VolumeGroup>((volume) => ({
      key: volume.id,
      title: volume.title || "未命名卷",
      chapters: [],
    }));
    const byId = new Map(groups.map((group) => [group.key, group]));
    const loose: Chapter[] = [];
    for (const chapter of chapters) {
      const group = chapter.volumeId ? byId.get(chapter.volumeId) : undefined;
      if (group) group.chapters.push(chapter);
      else loose.push(chapter);
    }
    const result = groups.filter((group) => group.chapters.length > 0);
    if (loose.length > 0) result.push({ key: "__loose", title: "未分卷", chapters: loose });
    return result;
  }, [chapters, volumes]);

  const chaptersLoading = chaptersApi.loading && chaptersApi.data === undefined;
  const chaptersError = chaptersApi.error && chaptersApi.data === undefined ? chaptersApi.error : null;
  const archivesWarning = archivesApi.error && archivesApi.data === undefined ? archivesApi.error : null;
  const canBuild = !chaptersLoading && archivesReady && missingChapters.length > 0;

  const selectedChapter = React.useMemo(
    () => (selectedChapterId ? chapters.find((chapter) => chapter.id === selectedChapterId) ?? null : null),
    [chapters, selectedChapterId],
  );
  const selectedArchive = selectedChapter ? archivesByChapter.get(selectedChapter.id) : undefined;
  const selectedHasContent = selectedChapter ? chaptersWithContent.has(selectedChapter.id) : false;
  const selectedExtracting = selectedChapter !== null && extractingOneId === selectedChapter.id;

  /* ---------- 订阅数据变更（其它面板/浮窗里改档案、改章节后刷新） ---------- */

  const refreshArchives = React.useCallback(() => {
    void archivesApi.refresh();
  }, [archivesApi.refresh]);

  const refreshAll = React.useCallback(() => {
    void chaptersApi.refresh();
    void volumesApi.refresh();
    void archivesApi.refresh();
  }, [chaptersApi.refresh, volumesApi.refresh, archivesApi.refresh]);

  useDataChanged(refreshAll);

  /* ---------- 生命周期：卸载中止 & 换书重置 ---------- */

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setVisible(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    setSelectedChapterId(null);
    setMinimized(false);
    setExtractingOneId(null);
    setExtractError(null);
    return () => {
      buildAbortRef.current?.abort();
      buildAbortRef.current = null;
      oneAbortRef.current?.abort();
      oneAbortRef.current = null;
    };
  }, [novelId]);

  /* ---------- 浮窗开关 ---------- */

  const openChapter = (chapter: Chapter) => {
    if (oneAbortRef.current) {
      oneAbortRef.current.abort();
      oneAbortRef.current = null;
    }
    setExtractingOneId(null);
    setExtractError(null);
    setSelectedChapterId(chapter.id);
    setMinimized(false);
  };

  const closeWindow = () => {
    if (oneAbortRef.current) {
      oneAbortRef.current.abort();
      oneAbortRef.current = null;
    }
    setSelectedChapterId(null);
    setExtractingOneId(null);
    setExtractError(null);
  };

  /* ---------- 单章提取（浮窗内现场提取） ---------- */

  const extractOne = async () => {
    if (!selectedChapter || selectedExtracting || oneAbortRef.current) return;
    if (!selectedHasContent) {
      toast({ title: "本章还没有正文", description: "先写一点正文，再提取档案。", tone: "error" });
      return;
    }
    if (building) {
      toast({ title: "正在补齐缺失档案", description: "等补齐结束或先中止，再单独提取本章。", tone: "default" });
      return;
    }
    const controller = new AbortController();
    oneAbortRef.current = controller;
    setExtractingOneId(selectedChapter.id);
    setExtractError(null);
    try {
      const result = await extractChapterArchive({ novelId, chapterId: selectedChapter.id, signal: controller.signal });
      if (result.ok) {
        if (aliveRef.current) {
          const conflicts = result.newConflicts ?? 0;
          toast({
            title: result.preservedManual ? "档案已更新，保留了你的手动修改" : "档案已提取",
            description: result.preservedManual
              ? conflicts > 0
                ? `发现 ${conflicts} 处档案与正文不一致。若档案校订正确，请同步修改正文。`
                : "只补充了正文里的新事实。若校订了事实，请同步修改正文。"
              : selectedChapter.title,
            tone: conflicts > 0 ? "default" : "success",
          });
        }
        await archivesApi.refresh();
        notifyDataChanged("archives");
      } else if (result.error !== "已中止") {
        if (aliveRef.current) setExtractError(result.error ?? "提取失败");
      }
    } catch (error) {
      if (aliveRef.current) {
        const message = error instanceof Error ? error.message : "提取档案时发生错误";
        setExtractError(message);
        toast({ title: "提取档案失败", description: message, tone: "error" });
      }
    } finally {
      if (oneAbortRef.current === controller) {
        oneAbortRef.current = null;
        setExtractingOneId(null);
      }
    }
  };

  /* ---------- 补齐缺失（串行，可中止） ---------- */

  const buildMissing = async () => {
    if (building || buildAbortRef.current) return;
    if (missingChapters.length === 0) {
      toast({ title: "全书档案都已建好", tone: "success" });
      return;
    }
    if (missingWithContent.length === 0) {
      toast({ title: "没有可补建的正文", description: "剩余缺失章节都还没有正文，写完再补齐。", tone: "default" });
      return;
    }
    const controller = new AbortController();
    buildAbortRef.current = controller;
    setBuilding(true);
    setExtractError(null);
    const targets = missingWithContent;
    let done = 0;
    let failed = 0;
    let preservedManual = 0;
    let newConflicts = 0;
    let processed = 0;
    try {
      for (const chapter of targets) {
        if (controller.signal.aborted) break;
        processed += 1;
        setBuildProgress({
          processed,
          total: targets.length,
          done,
          failed,
          currentTitle: chapter.title || "未命名章节",
        });
        const result = await extractChapterArchive({ novelId, chapterId: chapter.id, signal: controller.signal });
        if (result.ok) {
          done += 1;
          if (result.preservedManual) preservedManual += 1;
          newConflicts += result.newConflicts ?? 0;
        } else if (result.error !== "已中止") {
          failed += 1;
        }
        await archivesApi.refresh();
      }
    } catch (error) {
      failed += 1;
      if (aliveRef.current) {
        const message = error instanceof Error ? error.message : "补齐档案时发生错误";
        setExtractError(message);
      }
    } finally {
      const aborted = controller.signal.aborted;
      if (buildAbortRef.current === controller) buildAbortRef.current = null;
      setBuilding(false);
      setBuildProgress(null);
      if (done > 0) {
        notifyDataChanged("archives");
        await archivesApi.refresh();
      }
      if (!aliveRef.current) return;
      if (aborted) {
        toast({ title: "已中止补齐", description: `本次完成 ${done} 章，失败 ${failed} 章。`, tone: "default" });
      } else if (done === 0 && failed === 0) {
        toast({ title: "没有需要补建的档案", tone: "default" });
      } else {
        toast({
          title: "补齐完成",
          description: [
            `成功 ${done} 章${failed > 0 ? `，失败 ${failed} 章` : ""}。`,
            preservedManual > 0 ? `其中 ${preservedManual} 章保留了手动校订。` : "",
            newConflicts > 0 ? `发现 ${newConflicts} 处档案与正文不一致，请同步修改正文。` : "",
          ].filter(Boolean).join(" "),
          tone: failed > 0 ? "error" : newConflicts > 0 ? "default" : "success",
        });
      }
    }
  };

  const stopBuild = () => {
    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
  };

  /* ---------- 浮窗 footer ---------- */

  const windowFooter = selectedChapter ? (
    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
      <span className="min-w-0 truncate">
        {formatWords(selectedChapter.wordCount)} 字 · {CHAPTER_STATUS_LABEL[selectedChapter.status] ?? "草稿"}
      </span>
      {selectedArchive ? (
        <span
          className={cn(
            "shrink-0",
            selectedArchive.conflicts.length > 0
              ? "text-danger"
              : selectedArchive.status === "stale"
                ? "text-gold"
                : selectedArchive.status === "pending"
                  ? "text-accent"
                  : "text-jade",
          )}
        >
          {ARCHIVE_STATUS_LABEL[selectedArchive.status] ?? "最新"}
          {selectedArchive.conflicts.length > 0 ? ` · 冲突 ${selectedArchive.conflicts.length}` : ""}
        </span>
      ) : (
        <span className="shrink-0 text-ink-4">未建档</span>
      )}
    </div>
  ) : null;

  /* ---------- 渲染 ---------- */

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* 顶部统计 + 补齐 */}
      <div className="shrink-0 space-y-1.5 border-b border-line px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-2">
            <Archive className="mr-1 inline size-3.5 -translate-y-px text-ink-3" aria-hidden />
            {chaptersLoading || (archivesApi.loading && !archivesReady) ? (
              "加载档案中…"
            ) : !archivesReady ? (
              <>已建档 — 章 · 待提取 — 章</>
            ) : (
              <>
                已建档 <span className="font-medium tabular-nums text-ink">{archivedCount}</span> 章 · 待提取{" "}
                <span className="font-medium tabular-nums text-ink">{missingChapters.length}</span> 章
              </>
            )}
          </p>
          {building ? (
            <Button
              variant="danger"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-[12px]"
              icon={<Square className="size-3" />}
              onClick={stopBuild}
            >
              中止
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-[12px]"
              icon={<Sparkles className="size-3.5" />}
              disabled={!canBuild}
              onClick={() => void buildMissing()}
            >
              补齐缺失
            </Button>
          )}
        </div>
        <Progress value={archivedCount} max={Math.max(chapters.length, 1)} tone="jade" className="h-1" />
        {archivesReady && statCount > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
            {staleCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-gold" aria-hidden />
                已过期 {staleCount}
              </span>
            ) : null}
            {pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                待确认 {pendingCount}
              </span>
            ) : null}
            {conflictCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3 text-danger" aria-hidden />
                冲突 {conflictCount}
              </span>
            ) : null}
          </p>
        ) : null}
        {building && buildProgress ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                提取中 {buildProgress.processed}/{buildProgress.total} · {buildProgress.currentTitle}
              </span>
              {buildProgress.done > 0 ? (
                <span className="shrink-0 tabular-nums text-jade">成功 {buildProgress.done}</span>
              ) : null}
              {buildProgress.failed > 0 ? (
                <span className="shrink-0 tabular-nums text-danger">失败 {buildProgress.failed}</span>
              ) : null}
            </p>
            <Progress value={buildProgress.processed} max={Math.max(buildProgress.total, 1)} tone="accent" className="h-1" />
          </div>
        ) : null}
      </div>

      {/* 按卷分组的章节列表 */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {chaptersError ? (
          <InlineError message={`章节加载失败：${chaptersError}`} onRetry={() => void chaptersApi.refresh()} />
        ) : chaptersLoading ? (
          <div className="space-y-1.5 px-0.5 py-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className={cn("h-8", index % 3 === 2 ? "w-4/5" : "w-full")} />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <EmptyState
            className="px-2 py-8"
            icon={<Archive className="size-5" />}
            title="还没有章节"
            description="先在目录里建章节并写正文，这里会按卷列出每章的档案状态。"
          />
        ) : (
          <div className="space-y-2">
            {archivesWarning ? (
              <InlineError message={`档案列表加载失败：${archivesWarning}`} onRetry={() => void archivesApi.refresh()} />
            ) : null}
            {volumeGroups.map((group) => (
              <section key={group.key}>
                {group.title ? (
                  <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-1 text-[11px] font-medium text-ink-3">
                    <FolderOpen className="size-3 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{group.title}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-ink-4">{group.chapters.length}</span>
                  </div>
                ) : null}
                <ul>
                  {group.chapters.map((chapter) => {
                    const archive = archivesByChapter.get(chapter.id);
                    const dot = archiveDot(archive);
                    const hasContent = chaptersWithContent.has(chapter.id);
                    return (
                      <li key={chapter.id}>
                        <button
                          type="button"
                          title={`${DOT_TEXT[dot]} · 点击查看档案`}
                          aria-label={`第 ${chapter.orderIndex + 1} 章 ${stripChapterNumber(chapter.title)}，${DOT_TEXT[dot]}`}
                          onClick={() => openChapter(chapter)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left transition-colors",
                            "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                            selectedChapterId === chapter.id && "bg-accent-soft/60",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full border",
                              archivesReady ? DOT_CLASS[dot] : "animate-pulse border-transparent bg-surface-3",
                            )}
                            aria-hidden
                          />
                          <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-ink-4">
                            {chapter.orderIndex + 1}
                          </span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[12.5px]",
                              archive ? "text-ink" : "text-ink-2",
                            )}
                          >
                            {stripChapterNumber(chapter.title)}
                          </span>
                          {archive && archive.conflicts.length > 0 ? (
                            <AlertTriangle className="size-3 shrink-0 text-danger" aria-hidden />
                          ) : null}
                          {!hasContent ? <span className="shrink-0 text-[10.5px] text-ink-4">空</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* 章节档案浮窗：同一时间只开一个 */}
      <FloatWindow
        open={selectedChapter !== null && visible}
        // 页签切走（visible=false）时保留挂载，档案详情里未保存的输入不丢；关闭浮窗时卸载重置
        keepMounted={selectedChapter !== null}
        title={
          selectedChapter
            ? `第 ${selectedChapter.orderIndex + 1} 章 · ${stripChapterNumber(selectedChapter.title)}`
            : "档案"
        }
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={closeWindow}
        footer={windowFooter}
      >
        {selectedChapter ? (
          selectedArchive ? (
            <div className="p-3">
              <ArchiveDetail
                novelId={novelId}
                archive={selectedArchive}
                chapter={selectedChapter}
                chapterNo={selectedChapter.orderIndex + 1}
                onChanged={refreshArchives}
              />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                className="px-0 py-4"
                icon={<Archive className="size-5" />}
                title="这一章还没有档案"
                description={
                  selectedHasContent
                    ? "从本章正文提取事实档案，供后续章节保持前后一致。"
                    : "本章还没有正文，先写一点内容再提取档案。"
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles className="size-3.5" />}
                    loading={selectedExtracting}
                    disabled={!selectedHasContent || building}
                    onClick={() => void extractOne()}
                  >
                    {selectedExtracting ? "提取中…" : "提取本章档案"}
                  </Button>
                }
              />
              {selectedExtracting ? (
                <p className="mt-1 text-center text-[11px] text-ink-3">AI 正在按本章正文提取，可能需要几十秒。</p>
              ) : null}
              {extractError ? <InlineError message={extractError} onRetry={() => void extractOne()} /> : null}
              {building ? <p className="mt-2 text-[11px] text-ink-3">正在补齐缺失档案，可等结束或先中止，再单独提取本章。</p> : null}
            </div>
          )
        ) : null}
      </FloatWindow>
    </div>
  );
}
