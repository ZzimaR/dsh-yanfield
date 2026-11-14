"use client";

/**
 * 写作台左栏「章纲」面板（左栏只有 240–320px 宽）。
 *
 * 结构：本章章纲摘要卡 / 总纲摘要 / 按卷分组的章节列表（章纲覆盖圆点）。
 * 所有编辑都放进 FloatWindow，复用大纲工作台的三个编辑器，不重写表单：
 *   - 总纲      → NovelOutlinePanel
 *   - 卷纲      → VolumePanel
 *   - 本章章纲  → BlueprintEditor
 * 同一时间只开一个浮窗；卷纲 / 章纲有未保存修改时，关闭或切换前先确认，避免丢失。
 */
import * as React from "react";
import { ArrowUpDown, ChevronDown, ChevronRight, FileText, Layers, PenLine } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Skeleton,
} from "@/components/ui/kit";
import { useApi, useDataChanged } from "@/lib/client/api";
import { toItems, toOne } from "@/lib/editor/normalize";
import { cn } from "@/lib/ui/cn";
import { useLocalStorageState } from "@/lib/ui/hooks";
import {
  BLUEPRINT_TENSION_LABEL,
  type BlueprintTension,
  type Chapter,
  type ChapterBlueprint,
  type Foreshadow,
  type NovelOutline,
  type Volume,
} from "@/lib/types";
import { useBlueprintIndex } from "@/components/outline/use-blueprint-index";
import {
  reindexChaptersByVolume,
  stripChapterNumber,
  useErrorToast,
} from "@/components/outline/form-kit";
import { BlueprintEditor } from "@/components/outline/BlueprintEditor";
import { NovelOutlinePanel } from "@/components/outline/NovelOutlinePanel";
import { VolumePanel } from "@/components/outline/VolumePanel";
import { FloatWindow } from "@/components/editor/FloatWindow";
import { useT, type Translate } from "@/lib/i18n";

export interface OutlineInlinePanelProps {
  novelId: string;
  chapterId: string | null;
  onSelectChapter: (chapterId: string) => Promise<boolean>;
}

type EditorKind = "novel" | "volume" | "blueprint";

/** 章节引用标签（form-kit 的 chapterRefLabel 固定输出中文，这里按当前语言渲染） */
function chapterRefText(chapter: Pick<Chapter, "orderIndex" | "title">, tr: Translate): string {
  return tr("第 {n} 章 · {title}", { n: chapter.orderIndex + 1, title: stripChapterNumber(chapter.title) });
}

/* ============================== 小组件 ============================== */

function PanelSection({
  title,
  hint,
  action,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="shrink-0 border-b border-line px-3.5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h3 className="shrink-0 text-[11.5px] font-semibold tracking-wide text-ink-3">{title}</h3>
          {hint ? <span className="min-w-0 truncate text-[10.5px] text-ink-4">{hint}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] leading-relaxed text-ink-4">{children}</p>;
}

function EditButton({
  onClick,
  disabled = false,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const tr = useT();
  const text = tr(label ?? "编辑");
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="h-6 shrink-0 px-1.5 text-[11.5px] text-accent hover:bg-accent-soft"
      aria-label={text}
    >
      {text}
    </Button>
  );
}

/** 章纲的一句话摘要：优先本章目标，其次冲突、情节节点、钩子。 */
function blueprintSummary(blueprint: ChapterBlueprint | undefined): string {
  if (!blueprint) return "";
  const candidate = blueprint.goal || blueprint.conflict || blueprint.plotPoints[0] || blueprint.hooks[0] || "";
  return candidate.trim();
}

function TensionTag({ label, value }: { label: string; value: BlueprintTension }) {
  const tr = useT();
  return (
    <span
      className="shrink-0 rounded-[3px] px-1 text-[10px] leading-4 text-ink-3 ring-1 ring-line"
      title={tr("{label}：{level}", { label: tr(label), level: tr(BLUEPRINT_TENSION_LABEL[value]) })}
    >
      {tr(label)} {tr(BLUEPRINT_TENSION_LABEL[value])}
    </span>
  );
}

function ChapterCard({
  chapter,
  active,
  blueprint,
  onSelect,
  onEdit,
  rowRef,
}: {
  chapter: Chapter;
  active: boolean;
  blueprint: ChapterBlueprint | undefined;
  onSelect: () => void;
  onEdit: () => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const tr = useT();
  const summary = blueprintSummary(blueprint);
  return (
    <div
      ref={rowRef}
      className={cn(
        "group flex items-start gap-0.5 rounded-md transition-colors",
        active ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        title={tr("切换到 {ref}", { ref: chapterRefText(chapter, tr) })}
        className="min-w-0 flex-1 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-4 shrink-0 text-right text-[10.5px] tabular-nums",
              active ? "text-accent" : "text-ink-4",
            )}
          >
            {chapter.orderIndex + 1}
          </span>
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", blueprint ? "bg-jade" : "bg-ink-4/50")}
            title={blueprint ? tr("已有章纲") : tr("还没有章纲")}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px]",
              active ? "font-medium text-ink" : "text-ink-2",
            )}
          >
            {stripChapterNumber(chapter.title)}
          </span>
        </span>
        {blueprint ? (
          <span className="mt-1 flex min-w-0 items-center gap-1 pl-[22px]">
            <TensionTag label="悬念" value={blueprint.suspense} />
            <TensionTag label="转折" value={blueprint.twist} />
            {summary ? (
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-4">{summary}</span>
            ) : null}
          </span>
        ) : null}
      </button>
      <IconButton
        label={tr("编辑本章章纲")}
        size="sm"
        onClick={onEdit}
        className={cn(
          "mr-1 mt-1 size-6 shrink-0 transition-opacity",
          active
            ? "text-accent hover:text-accent"
            : "text-ink-4 opacity-0 hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <PenLine className="size-3" />
      </IconButton>
    </div>
  );
}

/* ============================== 主组件 ============================== */

export function OutlineInlinePanel({ novelId, chapterId, onSelectChapter }: OutlineInlinePanelProps) {
  const tr = useT();
  const encodedNovelId = encodeURIComponent(novelId);

  const outlineApi = useApi<unknown>(`/api/outlines/novel/${encodedNovelId}`);
  const volumesApi = useApi<unknown>(`/api/volumes?novelId=${encodedNovelId}`);
  const chaptersApi = useApi<unknown>(`/api/chapters?view=summary&novelId=${encodedNovelId}`);
  const foreshadowsApi = useApi<unknown>(`/api/foreshadows?novelId=${encodedNovelId}`);

  const outline = toOne<NovelOutline>(outlineApi.data);
  const volumes = React.useMemo(() => toItems<Volume>(volumesApi.data), [volumesApi.data]);
  const chapters = React.useMemo(
    () => reindexChaptersByVolume(toItems<Chapter>(chaptersApi.data), volumes),
    [chaptersApi.data, volumes],
  );
  const foreshadows = React.useMemo(
    () => toItems<Foreshadow>(foreshadowsApi.data),
    [foreshadowsApi.data],
  );

  const [blueprintVersion, setBlueprintVersion] = React.useState(0);
  /** 章纲列表倒序：最新一卷/一章排在最前；只影响显示，不改库里的顺序 */
  const [descending, setDescending] = useLocalStorageState<boolean>(`yanfield:editor:outline-desc:${novelId}`, false);
  const blueprintIndex = useBlueprintIndex(novelId, chapters, blueprintVersion);

  const [editor, setEditor] = React.useState<EditorKind | null>(null);
  const [minimized, setMinimized] = React.useState(false);
  const [editingVolumeId, setEditingVolumeId] = React.useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = React.useState<string | null>(null);
  const [collapsedVolumes, setCollapsedVolumes] = React.useState<Set<string>>(() => new Set<string>());

  const dirtyRef = React.useRef(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const activeRowRef = React.useRef<HTMLDivElement | null>(null);

  const refreshAll = React.useCallback(() => {
    void outlineApi.refresh();
    void volumesApi.refresh();
    void chaptersApi.refresh();
    void foreshadowsApi.refresh();
  }, [outlineApi.refresh, volumesApi.refresh, chaptersApi.refresh, foreshadowsApi.refresh]);

  useDataChanged(refreshAll);
  useErrorToast(outlineApi.error ?? volumesApi.error ?? chaptersApi.error ?? foreshadowsApi.error);

  /* ---------- 派生数据 ---------- */

  const currentChapter = React.useMemo(
    () => (chapterId ? chapters.find((chapter) => chapter.id === chapterId) ?? null : null),
    [chapters, chapterId],
  );
  const editingChapter = React.useMemo(
    () => (editingChapterId ? chapters.find((chapter) => chapter.id === editingChapterId) ?? null : null),
    [chapters, editingChapterId],
  );
  const editingVolume = React.useMemo(
    () => (editingVolumeId ? volumes.find((volume) => volume.id === editingVolumeId) ?? null : null),
    [volumes, editingVolumeId],
  );
  const currentBlueprint = React.useMemo(
    () => (chapterId ? blueprintIndex.byChapter.get(chapterId) : undefined),
    [chapterId, blueprintIndex.byChapter],
  );

  const outlinePreview = React.useMemo(() => {
    if (!outline) return "";
    const candidates = [outline.premise, outline.theme, outline.mainPlot, outline.tone, outline.ending];
    const first = candidates.find((value) => Boolean(value && value.trim()));
    return first ? first.trim() : "";
  }, [outline]);

  const groups = React.useMemo(() => {
    const known = new Set(volumes.map((volume) => volume.id));
    const byVolume = new Map<string, Chapter[]>();
    const loose: Chapter[] = [];
    for (const chapter of chapters) {
      if (chapter.volumeId && known.has(chapter.volumeId)) {
        const list = byVolume.get(chapter.volumeId);
        if (list) list.push(chapter);
        else byVolume.set(chapter.volumeId, [chapter]);
      } else {
        loose.push(chapter);
      }
    }
    return { byVolume, loose };
  }, [chapters, volumes]);

  const looseFilled = React.useMemo(
    () => groups.loose.reduce((count, chapter) => count + (blueprintIndex.filled.has(chapter.id) ? 1 : 0), 0),
    [groups.loose, blueprintIndex.filled],
  );

  const initialLoading =
    (chaptersApi.loading && chapters.length === 0) || (volumesApi.loading && volumes.length === 0);

  const coverageHint =
    blueprintIndex.total === 0
      ? undefined
      : blueprintIndex.loading
        ? tr("统计中…")
        : tr("{filled}/{total} 章纲", { filled: blueprintIndex.filled.size, total: blueprintIndex.total });

  /* ---------- 效果 ---------- */

  // 当前章所在卷被收起时自动展开，方便在长列表里看到选中章
  React.useEffect(() => {
    const volumeId = currentChapter?.volumeId;
    if (!volumeId) return;
    setCollapsedVolumes((prev) => {
      if (!prev.has(volumeId)) return prev;
      const next = new Set(prev);
      next.delete(volumeId);
      return next;
    });
  }, [currentChapter]);

  // 外部切章或数据到位后，把当前章滚到可视区域
  React.useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [chapterId, chapters.length]);

  // 分卷被删除时回退到第一卷，避免浮窗停在已删除的卷上
  React.useEffect(() => {
    if (editor !== "volume" || volumesApi.loading) return;
    if (editingVolumeId && volumes.some((volume) => volume.id === editingVolumeId)) return;
    setEditingVolumeId(volumes[0]?.id ?? null);
  }, [editor, editingVolumeId, volumes, volumesApi.loading]);

  /* ---------- 浮窗开关（同一时间只开一个） ---------- */

  const guardUnsaved = React.useCallback((action: () => void) => {
    if (dirtyRef.current) {
      pendingActionRef.current = action;
      setDiscardOpen(true);
      return;
    }
    action();
  }, []);

  const handleDirtyChange = React.useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const closeEditor = React.useCallback(() => {
    guardUnsaved(() => {
      dirtyRef.current = false;
      setMinimized(false);
      setEditor(null);
    });
  }, [guardUnsaved]);

  const openNovelEditor = () => {
    if (editor === "novel") {
      setMinimized(false);
      return;
    }
    guardUnsaved(() => {
      dirtyRef.current = false;
      setMinimized(false);
      setEditor("novel");
    });
  };

  const openVolumeEditor = (targetVolumeId: string | null) => {
    if (editor === "volume" && editingVolumeId === targetVolumeId) {
      setMinimized(false);
      return;
    }
    guardUnsaved(() => {
      dirtyRef.current = false;
      setMinimized(false);
      setEditingVolumeId(targetVolumeId ?? volumes[0]?.id ?? null);
      setEditor("volume");
    });
  };

  const openBlueprintEditor = (targetChapterId: string) => {
    if (editor === "blueprint" && editingChapterId === targetChapterId) {
      setMinimized(false);
      return;
    }
    guardUnsaved(() => {
      dirtyRef.current = false;
      setMinimized(false);
      setEditingChapterId(targetChapterId);
      setEditor("blueprint");
    });
  };

  // VolumePanel 的卷列表也走这里，切卷前同样保护未保存的卷纲
  const handleSelectVolume = React.useCallback(
    (nextVolumeId: string) => {
      guardUnsaved(() => {
        dirtyRef.current = false;
        setEditingVolumeId(nextVolumeId);
      });
    },
    [guardUnsaved],
  );

  const handleBlueprintSaved = React.useCallback(() => {
    setBlueprintVersion((version) => version + 1);
    void chaptersApi.refresh();
  }, [chaptersApi.refresh]);

  const confirmDiscard = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setDiscardOpen(false);
    action?.();
  };

  const cancelDiscard = () => {
    pendingActionRef.current = null;
    setDiscardOpen(false);
  };

  const toggleVolume = (volumeId: string) => {
    setCollapsedVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(volumeId)) next.delete(volumeId);
      else next.add(volumeId);
      return next;
    });
  };

  /* ---------- 渲染 ---------- */

  const floatOpen = editor !== null && (editor !== "blueprint" || editingChapter !== null);
  const floatTitle =
    editor === "novel"
      ? tr("总纲")
      : editor === "volume"
        ? editingVolume
          ? tr("卷纲 · {title}", { title: editingVolume.title })
          : tr("卷纲")
        : editingChapter
          ? tr("章纲 · {ref}", { ref: chapterRefText(editingChapter, tr) })
          : tr("章纲");

  const volumeChapterRefs = React.useMemo(
    () => chapters.map((chapter) => ({ id: chapter.id, volumeId: chapter.volumeId })),
    [chapters],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* 1. 本章章纲摘要卡 */}
      <Card padded={false} className="mx-3 mt-3 shrink-0 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{tr("本章章纲")}</h3>
          <EditButton
            label="编辑"
            disabled={!currentChapter}
            onClick={() => {
              if (currentChapter) openBlueprintEditor(currentChapter.id);
            }}
          />
        </div>
        <div className="mt-1 min-w-0">
          {chapterId === null ? (
            <Muted>{tr("先选一个章节，再写这一章的章纲。")}</Muted>
          ) : !currentChapter ? (
            chaptersApi.loading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <Muted>{tr("当前章节不在列表里，可能已被删除。")}</Muted>
            )
          ) : (
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full", currentBlueprint ? "bg-jade" : "bg-ink-4/50")}
                />
                <span
                  className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-2"
                  title={chapterRefText(currentChapter, tr)}
                >
                  {stripChapterNumber(currentChapter.title)}
                </span>
                {!currentBlueprint ? (
                  <span className="shrink-0 text-[10.5px] text-ink-4">{tr("待写")}</span>
                ) : null}
              </div>
              {currentBlueprint ? (
                <span className="mt-1 flex flex-wrap gap-1 pl-3">
                  <TensionTag label="悬念" value={currentBlueprint.suspense} />
                  <TensionTag label="转折" value={currentBlueprint.twist} />
                </span>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      {/* 2. 总纲一行摘要 */}
      <PanelSection title={tr("总纲")} action={<EditButton onClick={openNovelEditor} />}>
        {outlineApi.loading && !outline ? (
          <Skeleton className="h-3.5 w-full" />
        ) : outlinePreview ? (
          <p className="truncate text-[12px] leading-relaxed text-ink-2" title={outlinePreview}>
            {outlinePreview}
          </p>
        ) : (
          <Muted>{tr("还没有总纲，先定下这本书的一句话故事。")}</Muted>
        )}
      </PanelSection>

      {/* 3. 分卷 + 章节列表 */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-3.5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{tr("分卷与章节")}</h3>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-6 shrink-0 px-1.5 text-[11px]", descending ? "text-accent" : "text-ink-3")}
              icon={<ArrowUpDown className="size-3" />}
              title={tr("切换正序/倒序")}
              onClick={() => setDescending((value) => !value)}
            >
              {tr(descending ? "正序" : "倒序")}
            </Button>
          </div>
          {coverageHint ? (
            <p className="mb-2 text-[10.5px] tabular-nums text-ink-4">{coverageHint}</p>
          ) : null}
          {initialLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className={index % 3 === 0 ? "h-8 w-full" : "h-7 w-[85%]"} />
              ))}
            </div>
          ) : chapters.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title={tr("这本书还没有章节")}
              description={tr("先在目录里新建章节，再来这里写章纲。")}
              className="px-2 py-8"
            />
          ) : (
            <div className="space-y-4">
              {(descending ? [...volumes].reverse() : volumes).map((volume) => {
                const list = groups.byVolume.get(volume.id) ?? [];
                const ordered = descending ? [...list].reverse() : list;
                const expanded = !collapsedVolumes.has(volume.id);
                const volumeFilled = list.reduce(
                  (count, chapter) => count + (blueprintIndex.filled.has(chapter.id) ? 1 : 0),
                  0,
                );
                return (
                  <section key={volume.id}>
                    <div className="flex items-center gap-0.5 rounded-md pl-0.5 transition-colors hover:bg-surface-2">
                      <button
                        type="button"
                        onClick={() => toggleVolume(volume.id)}
                        aria-expanded={expanded}
                        title={expanded ? tr("收起本卷章节") : tr("展开本卷章节")}
                        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {expanded ? (
                          <ChevronDown className="size-3 shrink-0 text-ink-4" />
                        ) : (
                          <ChevronRight className="size-3 shrink-0 text-ink-4" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
                          {volume.title}
                        </span>
                        <span
                          className="shrink-0 text-[10.5px] tabular-nums text-ink-4"
                          title={tr("本卷 {n} 章，其中 {filled} 章已有章纲", { n: list.length, filled: volumeFilled })}
                        >
                          {tr("{n} 章", { n: list.length, count: list.length })}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-1.5 text-[11px] text-ink-3 hover:text-accent"
                        onClick={() => openVolumeEditor(volume.id)}
                      >
                        {tr("卷纲")}
                      </Button>
                    </div>
                    {volume.summary.trim() ? (
                      <p
                        className="mb-1 ml-[18px] mr-1 truncate text-[10.5px] leading-4 text-ink-4"
                        title={volume.summary}
                      >
                        {volume.summary}
                      </p>
                    ) : null}
                    {expanded ? (
                      list.length === 0 ? (
                        <p className="px-3 py-1 text-[11px] text-ink-4">{tr("本卷还没有章节。")}</p>
                      ) : (
                        <div className="mt-1 space-y-0.5">
                          {ordered.map((chapter) => (
                            <ChapterCard
                              key={chapter.id}
                              chapter={chapter}
                              active={chapter.id === chapterId}
                              blueprint={blueprintIndex.byChapter.get(chapter.id)}
                              onSelect={() => onSelectChapter(chapter.id)}
                              onEdit={() => openBlueprintEditor(chapter.id)}
                              rowRef={chapter.id === chapterId ? activeRowRef : undefined}
                            />
                          ))}
                        </div>
                      )
                    ) : null}
                  </section>
                );
              })}

              {groups.loose.length > 0 ? (
                <section>
                  <div className="flex items-center gap-1.5 rounded-md pl-1 pr-0.5 py-1 transition-colors hover:bg-surface-2">
                    <Layers className="size-3 shrink-0 text-ink-4" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">{tr("未分卷")}</span>
                    <span
                      className="shrink-0 text-[10.5px] tabular-nums text-ink-4"
                      title={tr("未分卷 {n} 章，其中 {filled} 章已有章纲", { n: groups.loose.length, filled: looseFilled })}
                    >
                      {tr("{n} 章", { n: groups.loose.length, count: groups.loose.length })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-1.5 text-[11px] text-ink-3 hover:text-accent"
                      onClick={() => openVolumeEditor(null)}
                    >
                      {tr("分卷")}
                    </Button>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {(descending ? [...groups.loose].reverse() : groups.loose).map((chapter) => (
                      <ChapterCard
                        key={chapter.id}
                        chapter={chapter}
                        active={chapter.id === chapterId}
                        blueprint={blueprintIndex.byChapter.get(chapter.id)}
                        onSelect={() => onSelectChapter(chapter.id)}
                        onEdit={() => openBlueprintEditor(chapter.id)}
                        rowRef={chapter.id === chapterId ? activeRowRef : undefined}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {volumes.length === 0 && groups.loose.length > 0 ? (
                <p className="px-1 text-[10.5px] leading-relaxed text-ink-4">
                  {tr("还没有分卷；可以在“分卷”里新建卷，把章节归到卷下。")}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* 4. 编辑浮窗：一次只开一个，三选一复用现有编辑器 */}
      <FloatWindow
        open={floatOpen}
        title={floatTitle}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={closeEditor}
      >
        {editor === "novel" ? (
          <div className="px-5 py-4">
            <NovelOutlinePanel
              novelId={novelId}
              outline={outline ?? undefined}
              loading={outlineApi.loading}
              error={outlineApi.error}
              onSaved={(saved) => outlineApi.setData(saved)}
              onRetry={() => void outlineApi.refresh()}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        ) : null}

        {editor === "volume" ? (
          <div className="px-5 py-4">
            <VolumePanel
              novelId={novelId}
              volumes={volumes}
              chapters={volumeChapterRefs}
              selectedVolumeId={editingVolumeId}
              onSelectVolume={handleSelectVolume}
              onVolumesChanged={() => {
                void volumesApi.refresh();
                void chaptersApi.refresh();
              }}
              onDirtyChange={handleDirtyChange}
              loading={volumesApi.loading}
            />
          </div>
        ) : null}

        {editor === "blueprint" && editingChapter ? (
          <div className="px-5 py-4">
            <BlueprintEditor
              key={editingChapter.id}
              novelId={novelId}
              chapter={editingChapter}
              chapters={chapters}
              foreshadows={foreshadows}
              onWrite={() => { void onSelectChapter(editingChapter.id); }}
              onSaved={handleBlueprintSaved}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        ) : null}
      </FloatWindow>

      <ConfirmDialog
        open={discardOpen}
        title={tr("放弃未保存的修改？")}
        description={tr("当前编辑器里还有没保存的内容，继续操作会丢失这些修改。")}
        confirmText={tr("放弃修改")}
        cancelText={tr("继续编辑")}
        danger
        onConfirm={confirmDiscard}
        onClose={cancelDiscard}
      />
    </div>
  );
}
