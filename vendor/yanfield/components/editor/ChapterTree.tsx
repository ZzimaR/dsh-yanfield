"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  IconButton,
  Skeleton,
  type DropdownItem,
} from "@/components/ui/kit";
import { cn, formatWords } from "@/lib/ui/cn";
import { useLocalStorageState } from "@/lib/ui/hooks";
import { CHAPTER_STATUS_LABEL, type Chapter } from "@/lib/types";
import { sameListOrderIndex } from "@/lib/editor/reorder";
import { volumeWordCount, type NovelTree, type TreeActions, type TreeVolume } from "@/lib/editor/types";
import { STATUS_DOT_CLASS } from "./StatusMenu";
import { PromptDialog } from "./PromptDialog";

interface ChapterTreeProps {
  novelId: string;
  tree: NovelTree | null;
  loading: boolean;
  currentChapterId: string | null;
  /** 当前章节所属的卷：卷行高亮用 */
  currentVolumeId?: string | null;
  actions: TreeActions;
  onSelectChapter: (chapterId: string) => void;
}

type PromptState =
  | { kind: "create-volume" }
  | { kind: "rename-volume"; volume: TreeVolume }
  | { kind: "create-chapter"; volume: TreeVolume | null }
  | { kind: "rename-chapter"; chapter: Chapter };

type ConfirmState =
  | { kind: "delete-volume"; volume: TreeVolume }
  | { kind: "delete-chapter"; chapter: Chapter };

type DragPayload =
  | { kind: "volume"; id: string }
  | { kind: "chapter"; id: string; volumeId: string | null };

type DropTarget =
  | { kind: "volume"; insertAt: number }
  | { kind: "chapter"; volumeId: string | null; insertAt: number };

/** 触屏没有 HTML5 拖拽，用指针下的 data-drop 行计算插入点。 */
function dropFromPoint(x: number, y: number, drag: DragPayload | null): DropTarget | null {
  if (!drag || typeof document === "undefined") return null;
  const hit = document.elementFromPoint(x, y);
  const row = hit?.closest("[data-drop]");
  if (!(row instanceof HTMLElement)) return null;
  const index = Number(row.dataset.index ?? "0");
  const rect = row.getBoundingClientRect();
  const after = y > rect.top + rect.height / 2;
  const volumeId = row.dataset.volumeId ? row.dataset.volumeId : null;
  if (drag.kind === "volume") {
    if (row.dataset.drop !== "volume") return null;
    return { kind: "volume", insertAt: index + (after ? 1 : 0) };
  }
  if (row.dataset.append === "1") {
    return { kind: "chapter", volumeId, insertAt: index };
  }
  if (row.dataset.drop === "volume") {
    return { kind: "chapter", volumeId, insertAt: Number(row.dataset.count ?? "0") };
  }
  if (row.dataset.drop === "chapter") {
    return { kind: "chapter", volumeId, insertAt: index + (after ? 1 : 0) };
  }
  return null;
}

/** 左栏「目录」：卷/章树 + 增删改移 + 折叠 + 状态点 */
export function ChapterTree({
  novelId,
  tree,
  loading,
  currentChapterId,
  currentVolumeId = null,
  actions,
  onSelectChapter,
}: ChapterTreeProps) {
  const [collapsed, setCollapsed] = useLocalStorageState<Record<string, boolean>>(
    `yanfield:editor:collapsed:${novelId}`,
    {},
  );
  const [prompt, setPrompt] = React.useState<PromptState | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [drop, setDrop] = React.useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  const dragRef = React.useRef<DragPayload | null>(null);
  const dropRef = React.useRef<DropTarget | null>(null);

  const rememberDrop = (next: DropTarget): void => {
    dropRef.current = next;
    setDrop((prev) => {
      if (!prev) return next;
      if (prev.kind !== next.kind || prev.insertAt !== next.insertAt) return next;
      if (prev.kind === "chapter" && next.kind === "chapter" && prev.volumeId !== next.volumeId) return next;
      return prev;
    });
  };

  const beginDrag = (event: React.DragEvent, payload: DragPayload, label: string): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", label);
    dragRef.current = payload;
    setDraggingId(payload.id);
  };

  const endDrag = (): void => {
    dragRef.current = null;
    dropRef.current = null;
    setDraggingId(null);
    setDrop(null);
  };

  const dropVolumeAt = (insertAt: number): void => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== "volume") return;
    const from = volumes.findIndex((volume) => volume.id === drag.id);
    const orderIndex = sameListOrderIndex(from, insertAt);
    endDrag();
    if (orderIndex === null) return;
    void actions.moveVolume(drag.id, orderIndex);
  };

  const dropChapterAt = (volumeId: string | null, insertAt: number): void => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== "chapter") return;
    const siblings =
      drag.volumeId === null
        ? looseChapters
        : (volumes.find((volume) => volume.id === drag.volumeId)?.chapters ?? []);
    const from = siblings.findIndex((chapter) => chapter.id === drag.id);
    const orderIndex =
      drag.volumeId === volumeId ? sameListOrderIndex(from, insertAt) : Math.max(0, insertAt);
    endDrag();
    if (orderIndex === null) return;
    if (volumeId) setCollapsed((prev) => ({ ...prev, [volumeId]: false }));
    void actions.moveChapter(drag.id, { volumeId, orderIndex });
  };

  const finishTouchDrop = (): void => {
    const drag = dragRef.current;
    const target = dropRef.current;
    if (!drag || !target) {
      endDrag();
      return;
    }
    if (drag.kind === "volume" && target.kind === "volume") {
      dropVolumeAt(target.insertAt);
      return;
    }
    if (drag.kind === "chapter" && target.kind === "chapter") {
      dropChapterAt(target.volumeId, target.insertAt);
      return;
    }
    endDrag();
  };

  const touchGrip = (payload: DragPayload) => ({
    onPointerDown: (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = payload;
      setDraggingId(payload.id);
    },
    onPointerMove: (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.pointerType === "mouse" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const next = dropFromPoint(event.clientX, event.clientY, dragRef.current);
      if (next) rememberDrop(next);
    },
    onPointerUp: (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.pointerType === "mouse") return;
      finishTouchDrop();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.pointerType === "mouse") return;
      endDrag();
    },
  });

  const volumes = tree?.volumes ?? [];
  const looseChapters = tree?.looseChapters ?? [];
  const totalChapters = volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) + looseChapters.length;
  const isEmpty = !loading && totalChapters === 0 && volumes.length === 0;

  // 当前章节滚进可视区（切章/树刷新后）
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentChapterId]);

  const toggleVolume = (volumeId: string): void => {
    setCollapsed((prev) => ({ ...prev, [volumeId]: !prev[volumeId] }));
  };

  /** 章节上移/下移：以同级列表索引为目标 orderIndex */
  const moveChapter = async (chapter: Chapter, direction: -1 | 1): Promise<void> => {
    const siblings =
      chapter.volumeId === null
        ? looseChapters
        : (volumes.find((volume) => volume.id === chapter.volumeId)?.chapters ?? []);
    const index = siblings.findIndex((item) => item.id === chapter.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    await actions.moveChapter(chapter.id, { volumeId: chapter.volumeId, orderIndex: target });
  };

  /** 卷上移/下移 */
  const moveVolume = async (volume: TreeVolume, direction: -1 | 1): Promise<void> => {
    const index = volumes.findIndex((item) => item.id === volume.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= volumes.length) return;
    await actions.moveVolume(volume.id, target);
  };

  /** 跨卷移动：追加到目标卷末尾（或未分卷末尾） */
  const moveToVolume = async (chapter: Chapter, target: TreeVolume | null): Promise<void> => {
    const orderIndex = target ? target.chapters.length : looseChapters.length;
    await actions.moveChapter(chapter.id, { volumeId: target ? target.id : null, orderIndex });
  };

  const submitPrompt = async (value: string): Promise<boolean> => {
    if (!prompt) return false;
    switch (prompt.kind) {
      case "create-volume":
        return actions.createVolume(value);
      case "rename-volume":
        return actions.renameVolume(prompt.volume.id, value);
      case "create-chapter": {
        const chapterId = await actions.createChapter({ volumeId: prompt.volume?.id ?? null, title: value });
        if (chapterId) onSelectChapter(chapterId);
        return chapterId !== null;
      }
      case "rename-chapter":
        return actions.renameChapter(prompt.chapter.id, value);
    }
  };

  const submitDelete = async (): Promise<void> => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      const ok =
        confirm.kind === "delete-volume"
          ? await actions.deleteVolume(confirm.volume.id)
          : await actions.deleteChapter(confirm.chapter.id);
      if (ok) setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const promptMeta = React.useMemo(() => {
    if (!prompt) return { title: "", label: "", placeholder: "", initialValue: "" };
    switch (prompt.kind) {
      case "create-volume":
        return { title: "新建卷", label: "卷名", placeholder: "如：第一卷 · 落雪", initialValue: "" };
      case "rename-volume":
        return { title: "重命名卷", label: "卷名", placeholder: "", initialValue: prompt.volume.title };
      case "create-chapter":
        return {
          title: prompt.volume ? `在「${prompt.volume.title}」新建章节` : "新建章节",
          label: "章节名",
          placeholder: "如：第一章 · 风起",
          initialValue: "",
        };
      case "rename-chapter":
        return { title: "重命名章节", label: "章节名", placeholder: "", initialValue: prompt.chapter.title };
    }
  }, [prompt]);

  /** 章节行下拉菜单 */
  const chapterMenuItems = (chapter: Chapter, siblings: Chapter[], index: number): DropdownItem[] => {
    const items: DropdownItem[] = [
      {
        label: "重命名",
        icon: <Pencil className="size-3.5" />,
        onSelect: () => setPrompt({ kind: "rename-chapter", chapter }),
      },
      {
        label: "上移",
        icon: <ArrowUp className="size-3.5" />,
        disabled: index <= 0,
        onSelect: () => void moveChapter(chapter, -1),
      },
      {
        label: "下移",
        icon: <ArrowDown className="size-3.5" />,
        disabled: index < 0 || index >= siblings.length - 1,
        onSelect: () => void moveChapter(chapter, 1),
      },
    ];

    // 跨卷移动：列出其它卷 + 未分卷
    const otherTargets: { label: string; target: TreeVolume | null }[] = [];
    for (const volume of volumes) {
      if (volume.id !== chapter.volumeId) otherTargets.push({ label: `移入「${volume.title}」`, target: volume });
    }
    if (chapter.volumeId !== null) otherTargets.push({ label: "移出到未分卷", target: null });
    if (otherTargets.length > 0) {
      items.push({ separator: true });
      for (const item of otherTargets) {
        items.push({ label: item.label, onSelect: () => void moveToVolume(chapter, item.target) });
      }
    }

    items.push({ separator: true });
    items.push({
      label: "删除章节",
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onSelect: () => setConfirm({ kind: "delete-chapter", chapter }),
    });
    return items;
  };

  const renderChapterRow = (chapter: Chapter, siblings: Chapter[], index: number): React.ReactNode => {
    const active = chapter.id === currentChapterId;
    const showLine = drop?.kind === "chapter" && drop.volumeId === chapter.volumeId && drop.insertAt === index;
    return (
      <div
        key={chapter.id}
        data-drop="chapter"
        data-index={index}
        data-volume-id={chapter.volumeId ?? ""}
        onDragOver={(event) => {
          if (dragRef.current?.kind !== "chapter") return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const insertAt = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
          rememberDrop({ kind: "chapter", volumeId: chapter.volumeId, insertAt });
        }}
        onDrop={(event) => {
          if (dragRef.current?.kind !== "chapter") return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const insertAt = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
          dropChapterAt(chapter.volumeId, insertAt);
        }}
        className={cn(
          "group flex items-center gap-0.5 rounded-sm pr-0.5 transition-colors duration-150 motion-reduce:transition-none",
          active ? "bg-accent-soft" : "hover:bg-surface-2",
          showLine && "shadow-[inset_0_2px_0_0_var(--color-accent)]",
          draggingId === chapter.id && "opacity-50",
        )}
      >
        <span
          draggable
          aria-label="拖动调整章节顺序"
          title="拖动排序，也可拖到别的卷"
          onDragStart={(event) => beginDrag(event, { kind: "chapter", id: chapter.id, volumeId: chapter.volumeId }, chapter.title)}
          onDragEnd={endDrag}
          {...touchGrip({ kind: "chapter", id: chapter.id, volumeId: chapter.volumeId })}
          className="flex cursor-grab touch-none items-center px-0.5 text-ink-4 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
        <button
          type="button"
          ref={active ? activeRef : undefined}
          onClick={() => onSelectChapter(chapter.id)}
          onDoubleClick={() => setPrompt({ kind: "rename-chapter", chapter })}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-[5px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          title={`${chapter.title || "未命名章节"} · ${CHAPTER_STATUS_LABEL[chapter.status]} · 双击重命名`}
        >
          <span
            className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_CLASS[chapter.status])}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 truncate text-[12px] leading-5",
              active ? "font-medium text-accent" : "text-ink-2",
            )}
          >
            {chapter.title || "未命名章节"}
          </span>
        </button>
        <span className="shrink-0 pl-0.5 text-[10.5px] tabular-nums text-ink-4">
          {chapter.wordCount > 0 ? formatWords(chapter.wordCount) : ""}
        </span>
        {/* 「⋯」菜单常显：避免 hover 才出现导致点不中/被布局变化顶走 */}
        <div className="shrink-0">
          <Dropdown
            align="end"
            width={196}
            items={chapterMenuItems(chapter, siblings, index)}
            trigger={
              <IconButton label="章节操作" size="sm" className="text-ink-4">
                <MoreHorizontal className="size-3.5" />
              </IconButton>
            }
          />
        </div>
      </div>
    );
  };

  const renderVolume = (volume: TreeVolume, index: number): React.ReactNode => {
    const isCollapsed = collapsed[volume.id] ?? false;
    const isCurrentVolume = volume.id === currentVolumeId;
    const items: DropdownItem[] = [
      {
        label: "新建章节",
        icon: <FileText className="size-3.5" />,
        onSelect: () => setPrompt({ kind: "create-chapter", volume }),
      },
      {
        label: "重命名",
        icon: <Pencil className="size-3.5" />,
        onSelect: () => setPrompt({ kind: "rename-volume", volume }),
      },
      { separator: true },
      {
        label: "上移",
        icon: <ArrowUp className="size-3.5" />,
        disabled: index <= 0,
        onSelect: () => void moveVolume(volume, -1),
      },
      {
        label: "下移",
        icon: <ArrowDown className="size-3.5" />,
        disabled: index >= volumes.length - 1,
        onSelect: () => void moveVolume(volume, 1),
      },
      { separator: true },
      {
        label: "删除卷",
        icon: <Trash2 className="size-3.5" />,
        danger: true,
        onSelect: () => setConfirm({ kind: "delete-volume", volume }),
      },
    ];

    const volumeLine = drop?.kind === "volume" && drop.insertAt === index;
    return (
      <div key={volume.id} className="mb-1">
        <div
          onDragOver={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            event.preventDefault();
            if (drag.kind === "volume") {
              const rect = event.currentTarget.getBoundingClientRect();
              const insertAt = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
              rememberDrop({ kind: "volume", insertAt });
              return;
            }
            rememberDrop({ kind: "chapter", volumeId: volume.id, insertAt: volume.chapters.length });
          }}
          onDrop={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            event.preventDefault();
            if (drag.kind === "volume") {
              const rect = event.currentTarget.getBoundingClientRect();
              const insertAt = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
              dropVolumeAt(insertAt);
              return;
            }
            dropChapterAt(volume.id, volume.chapters.length);
          }}
          data-drop="volume"
          data-index={index}
          data-volume-id={volume.id}
          data-count={volume.chapters.length}
          className={cn(
            "group flex items-center gap-0.5 rounded-sm pr-0.5 transition-colors duration-150 motion-reduce:transition-none",
            isCurrentVolume ? "bg-surface-2" : "hover:bg-surface-2",
            volumeLine && "shadow-[inset_0_2px_0_0_var(--color-accent)]",
            draggingId === volume.id && "opacity-50",
          )}
        >
          <span
            draggable
            aria-label="拖动调整卷顺序"
            title="拖动调整卷的顺序"
            onDragStart={(event) => beginDrag(event, { kind: "volume", id: volume.id }, volume.title)}
            onDragEnd={endDrag}
            {...touchGrip({ kind: "volume", id: volume.id })}
            className="flex cursor-grab touch-none items-center pl-0.5 text-ink-4 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </span>
          <button
            type="button"
            onClick={(event) => {
              if (event.detail > 1) {
                toggleVolume(volume.id);
                setPrompt({ kind: "rename-volume", volume });
                return;
              }
              toggleVolume(volume.id);
            }}
            aria-expanded={!isCollapsed}
            aria-current={isCurrentVolume ? "true" : undefined}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            title="单击展开，双击重命名"
          >
            <span
              className={cn(
                "shrink-0 text-ink-4 transition-transform duration-150 motion-reduce:transition-none",
                isCollapsed ? "-rotate-90" : "rotate-0",
              )}
              aria-hidden
            >
              <svg viewBox="0 0 16 16" className="size-3" fill="currentColor">
                <path d="M4 6l4 4 4-4H4z" />
              </svg>
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-[13px] font-semibold tracking-wide",
                isCurrentVolume ? "text-ink" : "text-ink-2",
              )}
            >
              {volume.title}
            </span>
            <span className="ml-auto shrink-0 pl-1 text-[10.5px] tabular-nums text-ink-4">
              {volume.chapters.length} 章 · {volumeWordCount(volume) > 0 ? formatWords(volumeWordCount(volume)) : "—"}
            </span>
          </button>
          <div className="shrink-0">
            <Dropdown
              align="end"
              width={188}
              items={items}
              trigger={
                <IconButton label="卷操作" size="sm" className="text-ink-4">
                  <MoreHorizontal className="size-3.5" />
                </IconButton>
              }
            />
          </div>
        </div>
        {isCollapsed ? null : (
          <div className="space-y-px border-l border-line/70 pl-1.5">
            {volume.chapters.length === 0 ? (
              <button
                type="button"
                onClick={() => setPrompt({ kind: "create-chapter", volume })}
                onDragOver={(event) => {
                  if (dragRef.current?.kind !== "chapter") return;
                  event.preventDefault();
                  rememberDrop({ kind: "chapter", volumeId: volume.id, insertAt: 0 });
                }}
                onDrop={(event) => {
                  if (dragRef.current?.kind !== "chapter") return;
                  event.preventDefault();
                  dropChapterAt(volume.id, 0);
                }}
                data-drop="chapter"
                data-append="1"
                data-index={0}
                data-volume-id={volume.id}
                className="w-full rounded-sm px-2 py-1 text-left text-[11.5px] text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink-3"
              >
                拖到这里，或新建第一章
              </button>
            ) : (
              volume.chapters.map((chapter, chapterIndex) => renderChapterRow(chapter, volume.chapters, chapterIndex))
            )}
            {drop?.kind === "chapter" && drop.volumeId === volume.id && drop.insertAt === volume.chapters.length ? (
              <div className="mx-2 h-0.5 rounded-full bg-accent" />
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 目录工具条 */}
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          icon={<FolderPlus className="size-3.5" />}
          onClick={() => setPrompt({ kind: "create-volume" })}
        >
          新建卷
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => setPrompt({ kind: "create-chapter", volume: null })}
        >
          新建章
        </Button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {loading ? (
          <div className="space-y-1.5 px-1 py-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="px-2 py-6">
            <EmptyState
              icon={<FolderPlus className="size-5" />}
              title="还没有章节"
              description="先建一卷来组织篇幅，或直接写第一章。"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="size-3.5" />}
                    onClick={() => setPrompt({ kind: "create-chapter", volume: null })}
                  >
                    写第一章
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPrompt({ kind: "create-volume" })}>
                    先建卷
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <>
            {volumes.map((volume, index) => renderVolume(volume, index))}
            {drop?.kind === "volume" && drop.insertAt === volumes.length ? (
              <div className="mx-2 mb-1 h-0.5 rounded-full bg-accent" />
            ) : null}
            {looseChapters.length > 0 ? (
              <div className="mb-1 mt-2">
                <div
                  onDragOver={(event) => {
                    if (dragRef.current?.kind !== "chapter") return;
                    event.preventDefault();
                    rememberDrop({ kind: "chapter", volumeId: null, insertAt: looseChapters.length });
                  }}
                  onDrop={(event) => {
                    if (dragRef.current?.kind !== "chapter") return;
                    event.preventDefault();
                    dropChapterAt(null, looseChapters.length);
                  }}
                  data-drop="chapter"
                  data-append="1"
                  data-index={looseChapters.length}
                  data-volume-id=""
                  className="group flex items-center gap-0.5 rounded-sm pr-0.5 hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleVolume("__loose__")}
                    aria-expanded={!(collapsed["__loose__"] ?? false)}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <FolderOpen className="size-3 shrink-0 text-ink-4" aria-hidden />
                    <span className="truncate text-[13px] font-semibold tracking-wide text-ink-2">
                      未分卷
                    </span>
                    <span className="ml-auto shrink-0 pl-1 text-[10.5px] tabular-nums text-ink-4">
                      {looseChapters.length} 章
                    </span>
                  </button>
                  <div className="shrink-0">
                    <IconButton
                      label="新建章节"
                      size="sm"
                      onClick={() => setPrompt({ kind: "create-chapter", volume: null })}
                    >
                      <Plus className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
                {collapsed["__loose__"] ? null : (
                  <div className="space-y-px border-l border-line/70 pl-1.5">
                    {looseChapters.map((chapter, chapterIndex) => renderChapterRow(chapter, looseChapters, chapterIndex))}
                    {drop?.kind === "chapter" && drop.volumeId === null && drop.insertAt === looseChapters.length ? (
                      <div className="mx-2 h-0.5 rounded-full bg-accent" />
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* 新建 / 重命名弹窗 */}
      <PromptDialog
        open={prompt !== null}
        title={promptMeta.title}
        label={promptMeta.label}
        placeholder={promptMeta.placeholder}
        initialValue={promptMeta.initialValue}
        confirmText={prompt?.kind === "rename-chapter" || prompt?.kind === "rename-volume" ? "保存" : "创建"}
        onClose={() => setPrompt(null)}
        onSubmit={submitPrompt}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "delete-volume" ? "删除这一卷？" : "删除这一章？"}
        description={
          confirm?.kind === "delete-volume"
            ? `卷「${confirm.volume.title}」和它的卷纲会被删除。卷里的章节会移到「未分卷」，正文还在。`
            : confirm?.kind === "delete-chapter"
              ? `章节「${confirm.chapter.title}」的正文与章纲将一起删除。`
              : undefined
        }
        confirmText="删除"
        danger
        loading={busy}
        onConfirm={() => void submitDelete()}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </div>
  );
}
