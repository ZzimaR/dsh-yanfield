"use client";

/**
 * 写作台左栏「档案」面板
 * - 顶部：已建档 / 待提取统计 +「补齐缺失」，按章节顺序串行流式提取，可中止并显示进度
 * - 列表：按分卷分组列章节，圆点表示档案状态（最新 / 已过期 / 待确认 / 有冲突 / 未建档）
 * - 点击章节：在 FloatWindow 里查看 ArchiveDetail；未建档时可在浮窗内现场提取
 * 同一时间只开一个浮窗；左栏页签切走后浮窗随面板一起隐藏，切回时恢复。
 */
import * as React from "react";
import { Archive, AlertTriangle, FolderOpen, Info, Sparkles, Square } from "lucide-react";
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
import { useT } from "@/lib/i18n";
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
  const tr = useT();
  const { toast } = useToast();
  const query = React.useMemo(() => `?novelId=${encodeURIComponent(novelId)}`, [novelId]);

  const chaptersApi = useApi<unknown>(`/api/chapters${query}`);
  const volumesApi = useApi<unknown>(`/api/volumes${query}`);
  const archivesApi = useApi<unknown>(`/api/archives${query}`);

  // 页签隐藏时也隐藏渲染在插件 portal 中的档案浮窗。

  const [selectedChapterId, setSelectedChapterId] = React.useState<string | null>(null);
  const [minimized, setMinimized] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [buildProgress, setBuildProgress] = React.useState<BuildProgress | null>(null);
  const [extractingOneId, setExtractingOneId] = React.useState<string | null>(null);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = React.useState(false);
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
      title: volume.title || tr("未命名卷"),
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
    if (loose.length > 0) result.push({ key: "__loose", title: tr("未分卷"), chapters: loose });
    return result;
  }, [chapters, volumes, tr]);

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
      toast({ title: tr("本章还没有正文"), description: tr("先写一点正文，再提取档案。"), tone: "error" });
      return;
    }
    if (building) {
      toast({ title: tr("正在补齐缺失档案"), description: tr("等补齐结束或先中止，再单独提取本章。"), tone: "default" });
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
            title: result.preservedManual ? tr("档案已更新，保留了你的手动修改") : tr("档案已提取"),
            description: result.preservedManual
              ? conflicts > 0
                ? tr("发现 {n} 处档案与正文不一致。若档案校订正确，请同步修改正文。", { n: conflicts, count: conflicts })
                : tr("只补充了正文里的新事实。若校订了事实，请同步修改正文。")
              : selectedChapter.title,
            tone: conflicts > 0 ? "default" : "success",
          });
        }
        await archivesApi.refresh();
        notifyDataChanged("archives");
      } else if (result.error !== "已中止") {
        if (aliveRef.current) setExtractError(result.error ?? tr("提取失败"));
      }
    } catch (error) {
      if (aliveRef.current) {
        const message = error instanceof Error ? error.message : tr("提取档案时发生错误");
        setExtractError(message);
        toast({ title: tr("提取档案失败"), description: message, tone: "error" });
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
      toast({ title: tr("全书档案都已建好"), tone: "success" });
      return;
    }
    if (missingWithContent.length === 0) {
      toast({ title: tr("没有可补建的正文"), description: tr("剩余缺失章节都还没有正文，写完再补齐。"), tone: "default" });
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
          currentTitle: chapter.title || tr("未命名章节"),
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
        const message = error instanceof Error ? error.message : tr("补齐档案时发生错误");
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
        toast({ title: tr("已中止补齐"), description: tr("本次完成 {done} 章，失败 {failed} 章。", { done, failed }), tone: "default" });
      } else if (done === 0 && failed === 0) {
        toast({ title: tr("没有需要补建的档案"), tone: "default" });
      } else {
        toast({
          title: tr("补齐完成"),
          description: [
            failed > 0
              ? tr("成功 {done} 章，失败 {failed} 章。", { done, failed })
              : tr("成功 {done} 章。", { done, count: done }),
            preservedManual > 0 ? tr("其中 {n} 章保留了手动校订。", { n: preservedManual, count: preservedManual }) : "",
            newConflicts > 0 ? tr("发现 {n} 处档案与正文不一致，请同步修改正文。", { n: newConflicts, count: newConflicts }) : "",
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
        {tr("{words} 字", { words: formatWords(selectedChapter.wordCount) })} · {tr(CHAPTER_STATUS_LABEL[selectedChapter.status] ?? "草稿")}
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
          {tr(ARCHIVE_STATUS_LABEL[selectedArchive.status] ?? "最新")}
          {selectedArchive.conflicts.length > 0
            ? ` · ${tr("冲突 {n}", { n: selectedArchive.conflicts.length, count: selectedArchive.conflicts.length })}`
            : ""}
        </span>
      ) : (
        <span className="shrink-0 text-ink-4">{tr("未建档")}</span>
      )}
    </div>
  ) : null;

  /* ---------- 档案详情 ---------- */

  const detailTitle = selectedChapter
    ? tr("第 {n} 章 · {title}", { n: selectedChapter.orderIndex + 1, title: stripChapterNumber(selectedChapter.title) })
    : tr("档案");

  const detailBody = selectedChapter ? (
      selectedArchive ? (
        <div className="px-5 py-4">
          <ArchiveDetail
            inFloat
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
            title={tr("这一章还没有档案")}
            description={
              selectedHasContent
                ? tr("从本章正文提取事实档案，供后续章节保持前后一致。")
                : tr("本章还没有正文，先写一点内容再提取档案。")
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
                {selectedExtracting ? tr("提取中…") : tr("提取本章档案")}
              </Button>
            }
          />
          {selectedExtracting ? (
            <p className="mt-1 text-center text-[11px] text-ink-3">{tr("AI 正在按本章正文提取，可能需要几十秒。")}</p>
          ) : null}
          {extractError ? <InlineError message={extractError} onRetry={() => void extractOne()} /> : null}
          {building ? <p className="mt-2 text-[11px] text-ink-3">{tr("正在补齐缺失档案，可等结束或先中止，再单独提取本章。")}</p> : null}
        </div>
      )
    ) : null;

  /* ---------- 渲染 ---------- */

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* 顶部状态 + 补齐 */}
      <div className="shrink-0 border-b border-line">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pb-1.5 pt-2">
          <p className="min-w-0 text-[11.5px] leading-5 text-ink-3">
            <Archive className="mr-1 inline size-3.5 -translate-y-px text-ink-4" aria-hidden />
            {chaptersLoading || (archivesApi.loading && !archivesReady) ? (
              tr("加载档案中…")
            ) : !archivesReady ? (
              <>{tr("已建档 — 章 · 待提取 — 章")}</>
            ) : (
              <>
                <span className="font-medium tabular-nums text-ink">{archivedCount}</span>{" "}
                {tr("章已建档", { count: archivedCount })}
                <span className="px-1 text-ink-4">·</span>
                <span className="font-medium tabular-nums text-ink">{missingChapters.length}</span>{" "}
                {tr("章待提取", { count: missingChapters.length })}
              </>
            )}
          </p>
          {building ? (
            <button
              type="button"
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] text-danger transition-colors hover:bg-danger/10"
              onClick={stopBuild}
            >
              <Square className="size-2.5" aria-hidden />
              {tr("中止")}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              title={tr("为所有还没建档的章节提取档案")}
              disabled={!canBuild}
              onClick={() => void buildMissing()}
            >
              <Sparkles className="size-3" aria-hidden />
              {tr("补齐缺失")}
            </button>
          )}
        </div>
        {archivesReady && statCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5">
            {staleCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">
                <span className="size-1 rounded-full bg-gold" aria-hidden />
                {tr("已过期 {n}", { n: staleCount })}
              </span>
            ) : null}
            {pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">
                <span className="size-1 rounded-full bg-accent" aria-hidden />
                {tr("待确认 {n}", { n: pendingCount })}
              </span>
            ) : null}
            {conflictCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">
                <span className="size-1 rounded-full bg-danger" aria-hidden />
                {tr("冲突 {n}", { n: conflictCount, count: conflictCount })}
              </span>
            ) : null}
          </div>
        ) : null}
        {building && buildProgress ? (
          <div className="px-3 pb-2">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {tr("提取中 {n}/{total} · {title}", { n: buildProgress.processed, total: buildProgress.total, title: buildProgress.currentTitle })}
              </span>
              {buildProgress.done > 0 ? (
                <span className="shrink-0 tabular-nums text-jade">{tr("成功 {n}", { n: buildProgress.done })}</span>
              ) : null}
              {buildProgress.failed > 0 ? (
                <span className="shrink-0 tabular-nums text-danger">{tr("失败 {n}", { n: buildProgress.failed })}</span>
              ) : null}
            </p>
            <Progress value={buildProgress.processed} max={Math.max(buildProgress.total, 1)} tone="accent" className="mt-1 h-0.5" />
          </div>
        ) : null}
        {archivedCount > 0 || building ? (
          <div className="h-0.5 w-full bg-surface-2" aria-hidden>
            <div
              className="h-full bg-jade transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.round((archivedCount / Math.max(chapters.length, 1)) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* 按卷分组的章节列表 */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 py-3">
        {chaptersError ? (
          <InlineError message={tr("章节加载失败：{error}", { error: chaptersError })} onRetry={() => void chaptersApi.refresh()} />
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
            title={tr("还没有章节")}
            description={tr("先在目录里建章节并写正文，这里会按卷列出每章的档案状态。")}
          />
        ) : (
          <div className="space-y-3">
            {archives.length === 0 && !hintDismissed ? (
              <div className="mx-0.5 rounded-md border border-line bg-surface-2/50 px-3 py-2.5 text-[11px] leading-relaxed text-ink-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
                  <Info className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                  {tr("档案是什么")}
                </p>
                <p>{tr("每章留一份事实底稿：摘要、人物与地点状态、设定变动。AI 续写前先读它，正文改动后会标「已过期」。")}</p>
                <button
                  type="button"
                  className="mt-1.5 text-[11px] text-accent transition-colors hover:text-ink"
                  onClick={() => setHintDismissed(true)}
                >
                  {tr("知道了")}
                </button>
              </div>
            ) : null}
            {archivesWarning ? (
              <InlineError message={tr("档案列表加载失败：{error}", { error: archivesWarning })} onRetry={() => void archivesApi.refresh()} />
            ) : null}
            {volumeGroups.map((group) => (
              <section key={group.key}>
                {group.title ? (
                  <div className="flex items-center gap-1.5 px-1.5 pb-1.5 pt-3 text-[11.5px] font-medium text-ink-3">
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
                          title={tr("{status} · 点击查看档案", { status: tr(DOT_TEXT[dot]) })}
                          aria-label={tr("第 {n} 章 {title}，{status}", { n: chapter.orderIndex + 1, title: stripChapterNumber(chapter.title), status: tr(DOT_TEXT[dot]) })}
                          onClick={() => openChapter(chapter)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-left transition-colors",
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
                              "min-w-0 flex-1 truncate text-[13px]",
                              archive ? "text-ink" : "text-ink-2",
                            )}
                          >
                            {stripChapterNumber(chapter.title)}
                          </span>
                          {archive && archive.conflicts.length > 0 ? (
                            <AlertTriangle className="size-3 shrink-0 text-danger" aria-hidden />
                          ) : null}
                          {!hasContent ? <span className="shrink-0 text-[10.5px] text-ink-4">{tr("空")}</span> : null}
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

      <FloatWindow
        open={selectedChapter !== null}
        title={detailTitle}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={closeWindow}
        footer={windowFooter}
      >
        {detailBody}
      </FloatWindow>
    </div>
  );
}
