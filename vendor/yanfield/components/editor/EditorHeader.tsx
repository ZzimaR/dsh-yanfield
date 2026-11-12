"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { Dropdown, IconButton, Tooltip, type DropdownItem } from "@/components/ui/kit";
import { openSettingsDialog } from "@/components/settings/open";
import { cn, formatWords } from "@/lib/ui/cn";
import type { Novel } from "@/lib/types";
import type { SaveState } from "@/lib/editor/types";
import { SaveIndicator } from "./SaveIndicator";
import { SaveButton } from "./SaveButton";

export type EditorTheme = "light" | "dark";

interface EditorHeaderProps {
  novelId: string;
  novel: Novel | null;
  volumeTitle: string | null;
  /** 实时草稿标题（未保存也即时反映） */
  title: string;
  wordCount: number;
  saveState: SaveState;
  lastSavedAt: string | null;
  immersive: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  theme: EditorTheme;
  onBack: () => void;
  onOverview: () => void;
  onSave: () => void;
  canSave: boolean;
  /** 返回按钮的去向，例如「返回概览」 */
  backLabel?: string;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleImmersive: () => void;
  onToggleTheme: () => void;
  /** 当前章在全书的顺序（从 1 开始），null 表示未知/无章节 */
  chapterPosition?: number | null;
  chapterTotal?: number;
  /** 相邻章标题，用于按钮 Tooltip */
  prevChapterTitle?: string | null;
  nextChapterTitle?: string | null;
  /** 相邻章导航；到头（或章节顺序未知）时不传，按钮禁用 */
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
}

/** 编辑器顶栏：返回上一级、作品名、面包屑、保存状态、字数、主题、沉浸、AI */
export function EditorHeader({
  novelId,
  novel,
  volumeTitle,
  title,
  wordCount,
  saveState,
  lastSavedAt,
  immersive,
  leftCollapsed,
  rightCollapsed,
  theme,
  onBack,
  onOverview,
  onSave,
  canSave,
  backLabel = "返回概览",
  onToggleLeft,
  onToggleRight,
  onToggleImmersive,
  onToggleTheme,
  chapterPosition = null,
  chapterTotal = 0,
  prevChapterTitle = null,
  nextChapterTitle = null,
  onPrevChapter,
  onNextChapter,
}: EditorHeaderProps) {
  const moreItems: DropdownItem[] = [
    { label: "作品概览", icon: <BookOpen className="size-3.5" />, onSelect: onOverview },
    { separator: true },
    { label: "设置", icon: <Settings2 className="size-3.5" />, onSelect: () => openSettingsDialog() },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-surface/85 px-2 backdrop-blur">
      <Tooltip label={backLabel}>
        <IconButton label={backLabel} onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
      </Tooltip>

      {/* 左栏开关：放在左侧返回按钮旁（移动端用它打开目录抽屉） */}
      <Tooltip label={`${leftCollapsed ? "打开目录" : "收起目录"} (Alt+1)`}>
        <IconButton label="切换目录栏" active={!leftCollapsed} onClick={onToggleLeft}>
          <PanelLeft className="size-4" />
        </IconButton>
      </Tooltip>

      {/* 面包屑：作品 › 卷 › 章（移动端只留作品 › 章，避免挤成一条缝） */}
      <div className="flex min-w-0 flex-1 items-center gap-1 text-[12px]">
        <Link
          href={`/novel/${novelId}`}
          onNavigate={(event) => {
            event.preventDefault();
            onOverview();
          }}
          className="min-w-0 max-w-[150px] truncate font-medium text-ink transition-colors duration-150 hover:text-accent motion-reduce:transition-none"
          title={novel?.title ?? "未命名作品"}
        >
          {novel?.title ?? "未命名作品"}
        </Link>
        {volumeTitle ? (
          <>
            <ChevronRight className="hidden size-3 shrink-0 text-ink-4 sm:block" aria-hidden />
            <span className="hidden max-w-[110px] truncate text-ink-3 sm:block" title={volumeTitle}>
              {volumeTitle}
            </span>
          </>
        ) : null}
        <ChevronRight className="size-3 shrink-0 text-ink-4" aria-hidden />
        <span className="max-w-[200px] truncate text-ink-2" title={title || "未命名章节"}>
          {title || "未命名章节"}
        </span>
      </div>

      {/* 上下章导航：顺序未知（如新建/移出）时不展示 */}
      {chapterPosition != null && chapterTotal > 0 ? (
        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
          <Tooltip label={prevChapterTitle ? `上一章：${prevChapterTitle}` : "上一章"}>
            <IconButton
              label="上一章"
              onClick={onPrevChapter}
              disabled={!onPrevChapter}
              className="disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft className="size-4" />
            </IconButton>
          </Tooltip>
          <span
            className="select-none px-1 text-[11.5px] tabular-nums text-ink-3"
            title={`第 ${chapterPosition} / ${chapterTotal} 章`}
          >
            第 {chapterPosition} / {chapterTotal} 章
          </span>
          <Tooltip label={nextChapterTitle ? `下一章：${nextChapterTitle}` : "下一章"}>
            <IconButton
              label="下一章"
              onClick={onNextChapter}
              disabled={!onNextChapter}
              className="disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight className="size-4" />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} className="mr-1 hidden sm:inline-flex" />
        <SaveButton onSave={onSave} saving={saveState === "saving"} disabled={!canSave} />
        <span className="mr-1 hidden text-[11.5px] tabular-nums text-ink-3 md:inline">
          {formatWords(wordCount)} 字
        </span>

        {/* 更多菜单：移动端收起（header 精简），平板及以上保留 */}
        <Tooltip label="更多">
          <span className="hidden sm:inline-flex">
            <Dropdown
              align="end"
              width={180}
              items={moreItems}
              trigger={
                <IconButton label="更多操作">
                  <Ellipsis className="size-4" />
                </IconButton>
              }
            />
          </span>
        </Tooltip>
        <Tooltip label={immersive ? "退出沉浸模式 (Esc)" : "沉浸模式"}>
          <span className="hidden sm:inline-flex">
            <IconButton label="沉浸模式" active={immersive} onClick={onToggleImmersive}>
              {immersive ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip label="切换深浅主题">
          <IconButton label="切换主题" onClick={onToggleTheme}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
        </Tooltip>
        <Tooltip label="AI 面板 (Alt+J)">
          <IconButton
            label="AI 面板"
            active={!rightCollapsed}
            onClick={onToggleRight}
            className={cn(!rightCollapsed && "text-accent")}
          >
            <Sparkles className="size-4" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
