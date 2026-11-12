"use client";

import * as React from "react";
import { Bold, Copy, Highlighter, Italic, Sparkles } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/ui/cn";
import type { SelectionInfo } from "@/lib/editor/types";

interface SelectionToolbarProps {
  editor: Editor | null;
  selection: SelectionInfo;
  onAskAi: () => void;
}

interface ToolbarPosition {
  left: number;
  top: number;
  /** 放在选区下方（上方空间不足时） */
  below: boolean;
}

const ACTION_CLASS =
  "inline-flex size-7 items-center justify-center rounded-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/**
 * 选中文字时浮出的迷你工具条：加粗 / 斜体 / 高亮 / 复制 / 问 AI。
 * 用 mousedown + preventDefault 保住选区，避免点击工具条时选区丢失。
 */
export function SelectionToolbar({ editor, selection, onAskAi }: SelectionToolbarProps) {
  const [position, setPosition] = React.useState<ToolbarPosition | null>(null);

  React.useEffect(() => {
    if (!editor || selection.empty) {
      setPosition(null);
      return;
    }
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      setPosition(null);
      return;
    }
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPosition(null);
      return;
    }
    const half = 120;
    const left = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    const below = rect.top < 72;
    setPosition({ left, top: below ? rect.bottom + 8 : rect.top - 8, below });
  }, [editor, selection.empty, selection.from, selection.to]);

  // 滚动/窗口变化时隐藏，避免工具条脱离选区
  React.useEffect(() => {
    if (!position) return;
    const hide = (): void => setPosition(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position]);

  if (!position || !editor) return null;

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    action();
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-1 shadow-float fade-in"
      style={{
        left: position.left,
        top: position.top,
        transform: position.below ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
      role="toolbar"
      aria-label="选区工具条"
    >
      <span className="px-1 text-[10.5px] tabular-nums text-ink-4">{selection.text.length}</span>
      <button
        type="button"
        className={cn(ACTION_CLASS, editor.isActive("bold") && "bg-accent-soft text-accent")}
        title="加粗 (Ctrl/Cmd+B)"
        onMouseDown={run(() => editor.chain().focus().toggleBold().run())}
      >
        <Bold className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(ACTION_CLASS, editor.isActive("italic") && "bg-accent-soft text-accent")}
        title="斜体 (Ctrl/Cmd+I)"
        onMouseDown={run(() => editor.chain().focus().toggleItalic().run())}
      >
        <Italic className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(ACTION_CLASS, editor.isActive("highlight") && "bg-accent-soft text-accent")}
        title="高亮"
        onMouseDown={run(() => editor.chain().focus().toggleHighlight().run())}
      >
        <Highlighter className="size-3.5" aria-hidden />
      </button>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
      <button
        type="button"
        className={ACTION_CLASS}
        title="复制选中文本"
        onMouseDown={run(() => {
          if (!selection.text) return;
          void navigator.clipboard?.writeText(selection.text).catch(() => undefined);
        })}
      >
        <Copy className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(ACTION_CLASS, "text-accent")}
        title="把选中文本交给 AI"
        onMouseDown={run(onAskAi)}
      >
        <Sparkles className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
