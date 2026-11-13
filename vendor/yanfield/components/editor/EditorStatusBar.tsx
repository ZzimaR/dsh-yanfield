"use client";

import * as React from "react";
import { Focus, Type } from "lucide-react";
import { IconButton, Kbd, Tooltip } from "@/components/ui/kit";
import { cn, formatWords } from "@/lib/ui/cn";
import type { SaveState, SelectionInfo } from "@/lib/editor/types";
import styles from "./EditorStatusBar.module.css";
import { SaveIndicator } from "./SaveIndicator";
import { useT } from "@/lib/i18n";

/** 阅读时长：按 400 字/分钟向上取整 */
export function estimateReadingMinutes(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  return Math.ceil(wordCount / 400);
}

interface EditorStatusBarProps {
  wordCount: number;
  /** 非空段落数（由 EditorCanvas 从文档里统计） */
  paragraphCount: number;
  selection: SelectionInfo;
  saveState: SaveState;
  lastSavedAt: string | null;
  /** 打字机滚动开关 */
  typewriter: boolean;
  /** 专注段落开关 */
  focusParagraph: boolean;
  onToggleTypewriter: () => void;
  onToggleFocusParagraph: () => void;
  className?: string;
}

/**
 * 正文底部状态条（非沉浸模式）：
 * 字数 · 段落数 · 阅读时长 · 选中字数 · 保存状态 · Ctrl+S 提示，
 * 右侧是「打字机滚动 / 专注段落」两个写作辅助开关（active 态）。
 */
export function EditorStatusBar({
  wordCount,
  paragraphCount,
  selection,
  saveState,
  lastSavedAt,
  typewriter,
  focusParagraph,
  onToggleTypewriter,
  onToggleFocusParagraph,
  className,
}: EditorStatusBarProps) {
  const tr = useT();
  const minutes = estimateReadingMinutes(wordCount);

  return (
    <footer
      className={cn(
        styles.bar,
        "border-t border-line bg-surface/80 text-[11.5px] text-ink-3",
        className,
      )}
      aria-label={tr("写作状态栏")}
    >
      <div className={styles.content}>
        <span className="tabular-nums">{tr("{words} 字", { words: formatWords(wordCount) })}</span>
        <span className="h-3 w-px bg-line" aria-hidden />
        <span className={cn(styles.paragraphs, "tabular-nums")} title={tr("按非空段落统计")}>
          {tr("段落 {n}", { n: paragraphCount, count: paragraphCount })}
        </span>
        <span className={cn(styles.paragraphs, "h-3 w-px bg-line")} aria-hidden />
        <span className={cn(styles.reading, "tabular-nums")} title={tr("按 400 字/分钟估算")}>
          {tr("阅读 {n} 分钟", { n: minutes })}
        </span>
        <span className={cn(styles.reading, "h-3 w-px bg-line")} aria-hidden />
        <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
        {selection.empty ? null : (
          <span className={cn(styles.selection, "tabular-nums text-accent")}>{tr("已选中 {n} 字", { n: selection.text.length })}</span>
        )}
        <div className={styles.controls}>
          <span className={cn(styles.shortcut, "mr-1 items-center gap-1 text-ink-4")} title={tr("保存快捷键")}>
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>S</Kbd>
          </span>
          <Tooltip label={tr("打字机滚动（光标保持在屏幕约 38% 高度）")}>
            <IconButton label={tr("打字机滚动")} size="sm" active={typewriter} onClick={onToggleTypewriter}>
              <Type className="size-3.5" />
            </IconButton>
          </Tooltip>
          <Tooltip label={tr("专注段落（淡化其他段落）")}>
            <IconButton label={tr("专注段落")} size="sm" active={focusParagraph} onClick={onToggleFocusParagraph}>
              <Focus className="size-3.5" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
}
