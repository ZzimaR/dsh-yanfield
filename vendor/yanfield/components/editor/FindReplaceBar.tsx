"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { Button, IconButton, Tooltip } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import {
  clampMatchIndex,
  collectTextSegments,
  findMatches,
  sortMatchesForReplacement,
  stepMatchIndex,
  type FindMatch,
} from "@/lib/editor/find";

interface FindReplaceBarProps {
  editor: Editor | null;
  open: boolean;
  /** 每次递增表示请求重新聚焦查找输入框（Ctrl/⌘+F 反复按下时） */
  focusRequest?: number;
  onClose: () => void;
  className?: string;
}

const DISABLED_CLASS = "disabled:pointer-events-none disabled:opacity-35";

const INPUT_CLASS =
  "h-7 min-w-0 flex-1 rounded-sm border border-line bg-paper px-2 text-[12.5px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/60 focus:ring-2 focus:ring-accent/10";

/**
 * 查找 / 替换浮条（Ctrl/⌘+F 打开，Esc 关闭）。
 *
 * 只做「单段内纯文本」匹配（见 lib/editor/find.ts）：跨段查询会被忽略而不是报错。
 * 命中点的选中用 setTextSelection（不抢焦点），替换用 insertContentAt / 单事务批量替换，
 * 「全部替换」按文档位置从后往前，避免前面替换导致后面位置偏移。
 * 替换后查找条保持打开，方便继续替换下一处。
 */
export function FindReplaceBar({ editor, open, focusRequest = 0, onClose, className }: FindReplaceBarProps) {
  const [query, setQuery] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const [matches, setMatches] = React.useState<FindMatch[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const findInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  /** 记住最后聚焦的是查找还是替换框，替换后把焦点还回去 */
  const lastFocusRef = React.useRef<"find" | "replace">("find");

  const recompute = React.useCallback(() => {
    if (!editor) {
      setMatches([]);
      return;
    }
    setMatches(findMatches(collectTextSegments(editor.state.doc), query));
  }, [editor, query]);

  // 打开（或反复按 Ctrl/⌘+F）时聚焦查找框并全选，直接输入即可换关键词
  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const input = findInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusRequest]);

  // 查询词变化后重新计算命中，并回到第一处
  React.useEffect(() => {
    if (!open) {
      setMatches([]);
      setActiveIndex(0);
      return;
    }
    recompute();
    setActiveIndex(0);
  }, [open, recompute]);

  // 正文被外部修改（自动保存、AI 应用、撤销…）时刷新命中数，保持序号合法
  React.useEffect(() => {
    if (!open || !editor) return;
    const onUpdate = () => {
      const next = findMatches(collectTextSegments(editor.state.doc), query);
      setMatches(next);
      setActiveIndex((prev) => clampMatchIndex(prev, next.length));
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [open, editor, query]);

  // 把当前命中选中并滚进视野（不 focus 编辑器，焦点留在查找框里继续输入）
  React.useEffect(() => {
    if (!open || !editor || matches.length === 0) return;
    const match = matches[clampMatchIndex(activeIndex, matches.length)];
    editor.chain().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run();
  }, [open, editor, matches, activeIndex]);

  const close = () => {
    onClose();
    editor?.commands.focus();
  };

  const move = (step: 1 | -1) => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => stepMatchIndex(prev, matches.length, step));
  };

  const refocusLastInput = () => {
    const target = lastFocusRef.current === "replace" ? replaceInputRef : findInputRef;
    target.current?.focus();
  };

  const replaceCurrent = () => {
    if (!editor || matches.length === 0) return;
    const index = clampMatchIndex(activeIndex, matches.length);
    const match = matches[index];
    const chain = editor.chain();
    if (replacement.length > 0) {
      chain.insertContentAt({ from: match.from, to: match.to }, { type: "text", text: replacement });
    } else {
      chain.deleteRange({ from: match.from, to: match.to });
    }
    chain.run();
    const next = findMatches(collectTextSegments(editor.state.doc), query);
    setMatches(next);
    setActiveIndex(clampMatchIndex(index, next.length));
    refocusLastInput();
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;
    const tr = editor.state.tr;
    for (const match of sortMatchesForReplacement(matches)) {
      if (replacement.length > 0) tr.replaceWith(match.from, match.to, editor.schema.text(replacement));
      else tr.delete(match.from, match.to);
    }
    editor.view.dispatch(tr);
    setMatches(findMatches(collectTextSegments(editor.state.doc), query));
    setActiveIndex(0);
    refocusLastInput();
  };

  const onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const onReplaceKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      replaceCurrent();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (!open || !editor) return null;

  const currentIndex = clampMatchIndex(activeIndex, matches.length);
  const counter = matches.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${matches.length}`;

  return (
    <div
      role="dialog"
      aria-label="查找与替换"
      className={cn(
        "absolute right-3 top-3 z-30 flex w-[360px] max-w-[calc(100%_-_1.5rem)] flex-col gap-1.5 rounded-lg border border-line bg-surface/95 p-2 shadow-float backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <input
          ref={findInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFindKeyDown}
          onFocus={() => {
            lastFocusRef.current = "find";
          }}
          placeholder="查找"
          aria-label="查找内容"
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS}
        />
        <span className="shrink-0 tabular-nums text-[11px] text-ink-4" aria-live="polite">
          {counter}
        </span>
        <Tooltip label="上一个 (Shift+Enter)">
          <IconButton
            label="上一个"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => move(-1)}
            className={DISABLED_CLASS}
          >
            <ChevronUp className="size-3.5" />
          </IconButton>
        </Tooltip>
        <Tooltip label="下一个 (Enter)">
          <IconButton
            label="下一个"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => move(1)}
            className={DISABLED_CLASS}
          >
            <ChevronDown className="size-3.5" />
          </IconButton>
        </Tooltip>
        <Tooltip label="关闭查找替换 (Esc)">
          <IconButton label="关闭查找替换" size="sm" onClick={close}>
            <X className="size-3.5" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1.5">
        <Replace className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <input
          ref={replaceInputRef}
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={onReplaceKeyDown}
          onFocus={() => {
            lastFocusRef.current = "replace";
          }}
          placeholder="替换为"
          aria-label="替换内容"
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={matches.length === 0}
          onClick={replaceCurrent}
          title="替换当前命中 (Enter)"
          className="h-7 shrink-0 px-2 text-[12px]"
        >
          替换
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={matches.length === 0}
          onClick={replaceAll}
          title="替换全部命中"
          className="h-7 shrink-0 px-2 text-[12px]"
        >
          全部替换
        </Button>
      </div>
    </div>
  );
}
