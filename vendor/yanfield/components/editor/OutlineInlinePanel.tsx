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
import { ChevronDown, ChevronRight, FileText, Layers, PenLine } from "lucide-react";
import {
  Badge,
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
import type { Chapter, Foreshadow, NovelOutline, Volume } from "@/lib/types";
import { useBlueprintIndex } from "@/components/outline/use-blueprint-index";
import {
  chapterRefLabel,
  reindexChaptersByVolume,
  stripChapterNumber,
  useErrorToast,
} from "@/components/outline/form-kit";
import { BlueprintEditor } from "@/components/outline/BlueprintEditor";
import { NovelOutlinePanel } from "@/components/outline/NovelOutlinePanel";
import { VolumePanel } from "@/components/outline/VolumePanel";
import { FloatWindow } from "@/components/editor/FloatWindow";

export interface OutlineInlinePanelProps {
  novelId: string;
  chapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

type EditorKind = "novel" | "volume" | "blueprint";

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
    <section className="shrink-0 border-b border-line px-2.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
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
  label = "编辑",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="h-6 shrink-0 px-1.5 text-[11.5px] text-accent hover:bg-accent-soft"
      aria-label={label}
    >
      {label}
    </Button>
  );
}

function ChapterRow({
  chapter,
  active,
  filled,
  onSelect,
  onEdit,
  rowRef,
}: {
  chapter: Chapter;
  active: boolean;
  filled: boolean;
  onSelect: () => void;
  onEdit: () => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      className={cn(
        "group flex items-center gap-0.5 rounded-md transition-colors",
        active ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        title={`切换到${chapterRefLabel(chapter)}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
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
          className={cn("size-1.5 shrink-0 rounded-full", filled ? "bg-jade" : "bg-ink-4/50")}
          title={filled ? "已有章纲" : "还没有章纲"}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px]",
            active ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {stripChapterNumber(chapter.title)}
        </span>
      </button>
      <IconButton
        label="编辑本章章纲"
        size="sm"
        onClick={onEdit}
        className={cn(
          "mr-0.5 size-6 shrink-0",
          active ? "text-accent hover:text-accent" : "text-ink-4 hover:text-accent",
        )}
      >
        <PenLine className="size-3" />
      </IconButton>
    </div>
  );
}

/* ============================== 主组件 ============================== */

export function OutlineInlinePanel({ novelId, chapterId, onSelectChapter }: OutlineInlinePanelProps) {
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
  const blueprintIndex = useBlueprintIndex(chapters, blueprintVersion);

  const [editor, setEditor] = React.useState<EditorKind | null>(null);
  const [minimized, setMinimized] = React.useState(false);
  const [editingVolumeId, setEditingVolumeId] = React.useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = React.useState<string | null>(null);
  const [collapsedVolumes, setCollapsedVolumes] = React.useState<Set<string>>(() => new Set<string>());

  const dirtyRef = React.useRef(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const activeRowRef = React.useRef<HTMLDivElement | null>(null);
  /** 面板被左栏 hidden 保活隐藏时，portal 出去的浮窗也要一起藏起来 */
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(true);

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
  const currentBlueprintFilled = Boolean(chapterId && blueprintIndex.filled.has(chapterId));

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
        ? `统计中 ${blueprintIndex.loaded}/${blueprintIndex.total}`
        : `${blueprintIndex.filled.size}/${blueprintIndex.total} 章纲${blueprintIndex.partial ? "（长书只统计前 80 章）" : ""}`;

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
    dirtyRef.current = false;
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
      ? "总纲"
      : editor === "volume"
        ? editingVolume
          ? `卷纲 · ${editingVolume.title}`
          : "卷纲"
        : editingChapter
          ? `章纲 · ${chapterRefLabel(editingChapter)}`
          : "章纲";

  const volumeChapterRefs = React.useMemo(
    () => chapters.map((chapter) => ({ id: chapter.id, volumeId: chapter.volumeId })),
    [chapters],
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* 1. 本章章纲摘要卡 */}
      <Card padded={false} className="mx-2.5 mt-2.5 shrink-0 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">本章章纲</h3>
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
            <Muted>先选一个章节，再写这一章的章纲。</Muted>
          ) : !currentChapter ? (
            chaptersApi.loading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <Muted>当前章节不在列表里，可能已被删除。</Muted>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("size-1.5 shrink-0 rounded-full", currentBlueprintFilled ? "bg-jade" : "bg-ink-4/50")}
              />
              <span
                className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-2"
                title={chapterRefLabel(currentChapter)}
              >
                {stripChapterNumber(currentChapter.title)}
              </span>
              {currentBlueprintFilled ? (
                <Badge tone="jade">已有章纲</Badge>
              ) : (
                <span className="shrink-0 text-[10.5px] text-ink-4">待写</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 2. 总纲一行摘要 */}
      <PanelSection title="总纲" action={<EditButton onClick={openNovelEditor} />}>
        {outlineApi.loading && !outline ? (
          <Skeleton className="h-3.5 w-full" />
        ) : outlinePreview ? (
          <p className="truncate text-[12px] leading-relaxed text-ink-2" title={outlinePreview}>
            {outlinePreview}
          </p>
        ) : (
          <Muted>还没有总纲，先定下这本书的一句话故事。</Muted>
        )}
      </PanelSection>

      {/* 3. 分卷 + 章节列表 */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-2.5 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">分卷与章节</h3>
            {coverageHint ? (
              <span
                className="min-w-0 truncate text-[10.5px] tabular-nums text-ink-4"
                title="已有章纲的章节数 / 全书章节数"
              >
                {coverageHint}
              </span>
            ) : null}
          </div>

          {initialLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className={index % 3 === 0 ? "h-8 w-full" : "h-7 w-[85%]"} />
              ))}
            </div>
          ) : chapters.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="这本书还没有章节"
              description="先在目录里新建章节，再来这里写章纲。"
              className="px-2 py-8"
            />
          ) : (
            <div className="space-y-2.5">
              {volumes.map((volume) => {
                const list = groups.byVolume.get(volume.id) ?? [];
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
                        title={expanded ? "收起本卷章节" : "展开本卷章节"}
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
                          title={`本卷 ${list.length} 章，其中 ${volumeFilled} 章已有章纲`}
                        >
                          {list.length} 章
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-1.5 text-[11px] text-ink-3 hover:text-accent"
                        onClick={() => openVolumeEditor(volume.id)}
                      >
                        卷纲
                      </Button>
                    </div>
                    {expanded ? (
                      list.length === 0 ? (
                        <p className="px-3 py-1 text-[11px] text-ink-4">本卷还没有章节。</p>
                      ) : (
                        <div className="mt-0.5 space-y-px">
                          {list.map((chapter) => (
                            <ChapterRow
                              key={chapter.id}
                              chapter={chapter}
                              active={chapter.id === chapterId}
                              filled={blueprintIndex.filled.has(chapter.id)}
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
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">未分卷</span>
                    <span
                      className="shrink-0 text-[10.5px] tabular-nums text-ink-4"
                      title={`未分卷 ${groups.loose.length} 章，其中 ${looseFilled} 章已有章纲`}
                    >
                      {groups.loose.length} 章
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-1.5 text-[11px] text-ink-3 hover:text-accent"
                      onClick={() => openVolumeEditor(null)}
                    >
                      分卷
                    </Button>
                  </div>
                  <div className="mt-0.5 space-y-px">
                    {groups.loose.map((chapter) => (
                      <ChapterRow
                        key={chapter.id}
                        chapter={chapter}
                        active={chapter.id === chapterId}
                        filled={blueprintIndex.filled.has(chapter.id)}
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
                  还没有分卷；可以在「分卷」里新建卷，把章节归到卷下。
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* 4. 编辑浮窗：一次只开一个，三选一复用现有编辑器 */}
      <FloatWindow
        open={floatOpen && visible}
        // 页签切走（visible=false）时保留挂载，草稿不丢；关闭编辑器（floatOpen=false）时卸载重置
        keepMounted={floatOpen}
        title={floatTitle}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={closeEditor}
        /* 放弃修改确认框是 z-50 的 Overlay：窄屏浮窗默认 z-60，确认期间把浮窗压到弹窗之下 */
        className={discardOpen ? "z-40" : undefined}
      >
        {editor === "novel" ? (
          <div className="p-3">
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
          <div className="p-3">
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
          <div className="p-3">
            <BlueprintEditor
              key={editingChapter.id}
              novelId={novelId}
              chapter={editingChapter}
              chapters={chapters}
              foreshadows={foreshadows}
              onSaved={handleBlueprintSaved}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        ) : null}
      </FloatWindow>

      <ConfirmDialog
        open={discardOpen}
        title="放弃未保存的修改？"
        description="当前编辑器里还有没保存的内容，继续操作会丢失这些修改。"
        confirmText="放弃修改"
        cancelText="继续编辑"
        danger
        onConfirm={confirmDiscard}
        onClose={cancelDiscard}
      />
    </div>
  );
}
