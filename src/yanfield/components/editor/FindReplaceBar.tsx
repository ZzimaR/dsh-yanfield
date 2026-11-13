"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
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
import { useT } from "@/lib/i18n";
import { findHighlightKey, revealProsePosition } from "@/lib/editor/find-highlight";

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
 * 命中通过编辑器装饰高亮，查找不会改变光标或正文选区。
 * 「全部替换」按文档位置从后往前，避免前面替换导致后面位置偏移。
 * 替换后查找条保持打开，方便继续替换下一处。
 */
export function FindReplaceBar({ editor, open, focusRequest = 0, onClose, className }: FindReplaceBarProps) {
  const tr = useT();
  const [query, setQuery] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const [matches, setMatches] = React.useState<FindMatch[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [scrollRequest, requestScroll] = React.useReducer((value: number) => value + 1, 0);
  const handledScroll = React.useRef(0);

  const findInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  /** 记住最后聚焦的是查找还是替换框，替换后把焦点还回去 */
  const lastFocusRef = React.useRef<"find" | "replace">("find");
  const replacedRef = React.useRef(false);

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
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      const next = findMatches(collectTextSegments(editor.state.doc), query);
      setMatches(next);
      setActiveIndex((prev) => clampMatchIndex(prev, next.length));
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [open, editor, query]);

  React.useEffect(() => {
    if (!open || !editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(findHighlightKey, {
      matches,
      activeIndex: clampMatchIndex(activeIndex, matches.length),
    }));
  }, [open, editor, matches, activeIndex]);

  React.useEffect(() => {
    if (!open || !editor || scrollRequest === handledScroll.current) return;
    const frame = window.requestAnimationFrame(() => {
      handledScroll.current = scrollRequest;
      if (!editor.isDestroyed) editor.view.dom.querySelector(".yf-find-active")?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, editor, scrollRequest]);

  React.useEffect(() => {
    if (!open || !editor) return;
    return () => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(findHighlightKey, { matches: [], activeIndex: 0 }));
    };
  }, [open, editor]);

  const close = () => {
    onClose();
    editor?.commands.focus();
  };

  const move = (step: 1 | -1) => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => stepMatchIndex(prev, matches.length, step));
    requestScroll();
  };

  const refocusLastInput = () => {
    const target = lastFocusRef.current === "replace" ? replaceInputRef : findInputRef;
    target.current?.focus();
  };

  const replaceCurrent = () => {
    if (!editor?.isEditable || matches.length === 0) return;
    const index = clampMatchIndex(activeIndex, matches.length);
    const match = matches[index];
    editor.view.dispatch(closeHistory(editor.state.tr.insertText(replacement, match.from, match.to)));
    revealProsePosition(editor.view, match.from);
    replacedRef.current = true;
    refocusLastInput();
  };

  const replaceAll = () => {
    if (!editor?.isEditable || matches.length === 0) return;
    const transaction = editor.state.tr;
    for (const match of sortMatchesForReplacement(matches)) {
      transaction.insertText(replacement, match.from, match.to);
    }
    editor.view.dispatch(closeHistory(transaction));
    setActiveIndex(0);
    replacedRef.current = true;
    refocusLastInput();
  };

  const undoReplacement = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editor?.isEditable || !replacedRef.current || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) editor.commands.redo();
    else editor.commands.undo();
    return true;
  };

  const onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (undoReplacement(event)) return;
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
    if (undoReplacement(event)) return;
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
      aria-label={tr("查找与替换")}
      className={cn(
        "ml-auto mr-3 mt-2 flex w-[360px] max-w-[calc(100%_-_1.5rem)] shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface p-2",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <input
          ref={findInputRef}
          value={query}
          onChange={(event) => {
            replacedRef.current = false;
            setQuery(event.target.value);
          }}
          onKeyDown={onFindKeyDown}
          onFocus={() => {
            lastFocusRef.current = "find";
          }}
          placeholder={tr("查找")}
          aria-label={tr("查找内容")}
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS}
        />
        <span className="shrink-0 tabular-nums text-[11px] text-ink-4" aria-live="polite">
          {counter}
        </span>
        <Tooltip label={tr("上一个 (Shift+Enter)")}>
          <IconButton
            label={tr("上一个")}
            size="sm"
            disabled={matches.length === 0}
            onClick={() => move(-1)}
            className={DISABLED_CLASS}
          >
            <ChevronUp className="size-3.5" />
          </IconButton>
        </Tooltip>
        <Tooltip label={tr("下一个 (Enter)")}>
          <IconButton
            label={tr("下一个")}
            size="sm"
            disabled={matches.length === 0}
            onClick={() => move(1)}
            className={DISABLED_CLASS}
          >
            <ChevronDown className="size-3.5" />
          </IconButton>
        </Tooltip>
        <Tooltip label={tr("关闭查找替换 (Esc)")}>
          <IconButton label={tr("关闭查找替换")} size="sm" onClick={close}>
            <X className="size-3.5" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1.5">
        <Replace className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <input
          ref={replaceInputRef}
          value={replacement}
          onChange={(event) => {
            replacedRef.current = false;
            setReplacement(event.target.value);
          }}
          onKeyDown={onReplaceKeyDown}
          onFocus={() => {
            lastFocusRef.current = "replace";
          }}
          placeholder={tr("替换为")}
          aria-label={tr("替换内容")}
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={!editor.isEditable || matches.length === 0}
          onClick={replaceCurrent}
          title={tr("替换当前命中 (Enter)")}
          className="h-7 shrink-0 px-2 text-[12px]"
        >
          {tr("替换")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!editor.isEditable || matches.length === 0}
          onClick={replaceAll}
          title={tr("替换全部命中")}
          className="h-7 shrink-0 px-2 text-[12px]"
        >
          {tr("全部替换")}
        </Button>
      </div>
    </div>
  );
}
