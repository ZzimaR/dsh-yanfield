"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import { MessagesSquare, Minimize2 } from "lucide-react";
import { IconButton, Sheet, Skeleton, Tooltip } from "@/components/ui/kit";
import { cn, countWords, formatDateTime, formatWords } from "@/lib/ui/cn";
import { useLocalStorageState } from "@/lib/ui/hooks";
import type { ChapterStatus } from "@/lib/types";
import { emitSelection } from "@/lib/editor/events";
import type { SaveState, SelectionInfo } from "@/lib/editor/types";
import { SaveIndicator } from "./SaveIndicator";
import { SaveButton } from "./SaveButton";
import { StatusMenu } from "./StatusMenu";
import { SelectionToolbar } from "./SelectionToolbar";
import { FindReplaceBar } from "./FindReplaceBar";
import { FormatToolbar } from "./FormatToolbar";
import { AgentReview } from "./AgentReview";
import type { AgentRun } from "@/lib/ai/agent/types";
import { EditorStatusBar } from "./EditorStatusBar";

interface EditorCanvasProps {
  chapterId: string | null;
  /** 初始正文 HTML（切章时同步进编辑器） */
  initialContent: string;
  title: string;
  status: ChapterStatus;
  wordCount: number;
  saveState: SaveState;
  lastSavedAt: string | null;
  updatedAt: string | null;
  immersive: boolean;
  /** 正文字号 / 行高 / 首行缩进（来自 AppSettings） */
  fontSize: number;
  lineHeight: number;
  firstLineIndent: boolean;
  /** 排版：字重 / 字距(em) / 段间距(px) */
  fontWeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  /** 页面内边距（px）与最大阅读宽度（0 = 自适应） */
  pagePaddingX: number;
  pagePaddingY: number;
  maxContentWidth: number;
  /** 是否显示底部字数 / 保存状态条 */
  showStatusBar: boolean;
  /** 是否显示正文内的 AI 提示标注（预留） */
  showInlineHints: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (html: string, wordCount: number) => void;
  onStatusChange: (status: ChapterStatus) => void;
  onEditorReady: (editor: Editor | null) => void;
  onSelectionChange: (selection: SelectionInfo) => void;
  onAskAi: () => void;
  onExitImmersive: () => void;
  onSave: () => void;
  /** 正文顶部的 AI 快捷任务条插槽（由上层注入，保持本组件与 AI 解耦） */
  aiBar?: React.ReactNode;
  review?: {run:AgentRun;changeId:string}|null;
  onCloseReview?:()=>void;
}

const EMPTY_SELECTION: SelectionInfo = { text: "", from: 0, to: 0, empty: true };

/** 读取编辑器当前选区（纯文本） */
function readSelection(editor: Editor): SelectionInfo {
  const { from, to, empty } = editor.state.selection;
  const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
  return { text, from, to, empty };
}

/** 打字机滚动：把光标放到滚动容器可见高度的约 38% 处 */
const TYPEWRITER_TARGET_RATIO = 0.38;

/**
 * 专注段落的样式：globals.css 不在本次改动范围，所以随组件内联注入。
 * 只作用在 .prose-paper 的直接子块上：当前块保留完整对比度，其余块整体淡化。
 */
const FOCUS_PARAGRAPH_CSS = `
.prose-paper[data-focus-paragraph="on"] > :is(p, h1, h2, h3, blockquote, ul, ol, pre, hr) {
  opacity: 0.4;
  transition: opacity 180ms ease;
}
.prose-paper[data-focus-paragraph="on"] > .is-focus-block {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .prose-paper[data-focus-paragraph="on"] > :is(p, h1, h2, h3, blockquote, ul, ol, pre, hr) {
    transition: none;
  }
}
`;

/** 统计非空文本块（段落）数量 */
function countParagraphs(doc: {
  descendants(callback: (node: { isTextblock: boolean; textContent: string }) => void): void;
}): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.isTextblock && node.textContent.trim().length > 0) count += 1;
  });
  return count;
}

/** 取光标所在「顶层块」的 DOM（段落 / 标题 / 引用 / 列表），供专注段落加 is-focus-block */
function findFocusBlockDom(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;
  const dom = editor.view.nodeDOM($from.before(1));
  return dom instanceof HTMLElement ? dom : null;
}

/**
 * 中栏正文：
 * - 章节标题输入框（衬线大号、无边框）
 * - Tiptap 3 正文，居中阅读宽度，自动保存由外部 hook 驱动
 * - 底部状态条（字数 / 保存状态 / 更新时间）
 * - 选区浮动工具条 + 选区广播给 AI 面板
 */
export function EditorCanvas(props: EditorCanvasProps) {
  const {
    chapterId,
    initialContent,
    title,
    status,
    wordCount,
    saveState,
    lastSavedAt,
    updatedAt,
    immersive,
    fontSize,
    lineHeight,
    firstLineIndent,
    fontWeight,
    letterSpacing,
    paragraphSpacing,
    pagePaddingX,
    pagePaddingY,
    maxContentWidth,
    showStatusBar,
    showInlineHints,
    onTitleChange,
    onContentChange,
    onStatusChange,
    onEditorReady,
    onSelectionChange,
    onAskAi,
    onExitImmersive,
    onSave,
    aiBar,
    review,
    onCloseReview,
  } = props;

  const pendingReview = Boolean(review?.run.changes.some(c => c.id === review.changeId && c.state === "pending"));

  // 最新 props 放 ref，供编辑器事件回调读取，避免 useEditor 闭包过期
  const handlersRef = React.useRef(props);
  React.useEffect(() => {
    handlersRef.current = props;
  });

  const [selection, setSelection] = React.useState<SelectionInfo>(EMPTY_SELECTION);
  const selectionSetterRef = React.useRef(setSelection);
  selectionSetterRef.current = setSelection;

  /** 正文滚动容器：打字机滚动需要它来算可视区 */
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [paragraphCount, setParagraphCount] = React.useState(0);

  /** 查找替换浮条 */
  const [findOpen, setFindOpen] = React.useState(false);
  const [findRequest, setFindRequest] = React.useState(0);

  /** 写作辅助开关：默认关闭，localStorage 记忆（刷新后保持） */
  const [typewriter, setTypewriter] = useLocalStorageState<boolean>("yanfield:editor:typewriter", false);
  const [focusParagraph, setFocusParagraph] = useLocalStorageState<boolean>("yanfield:editor:focus-paragraph", false);

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "在这里落笔……写成段落，别写成 PPT。" }),
      Highlight.configure({ multicolor: false }),
      CharacterCount,
    ],
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent,
    editorProps: {
      attributes: {
        class: "prose-paper min-h-[56vh] max-w-none outline-none",
        spellcheck: "false",
        "aria-label": "章节正文",
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      handlersRef.current.onContentChange(html, countWords(html));
    },
    onSelectionUpdate: ({ editor: instance }) => {
      const info = readSelection(instance);
      selectionSetterRef.current(info);
      handlersRef.current.onSelectionChange(info);
      emitSelection({ ...info, chapterId: handlersRef.current.chapterId });
    },
  });

  // 把编辑器实例交给上层（用于构造 EditorBridge）
  React.useEffect(() => {
    handlersRef.current.onEditorReady(editor ?? null);
    return () => {
      handlersRef.current.onEditorReady(null);
    };
  }, [editor]);

  // 切章：把新章节内容灌进编辑器；首次加载不抢焦点
  const loadedChapterIdRef = React.useRef<string | null>(null);
  const previousChapterIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!editor) return;
    const nextId = chapterId;
    if (loadedChapterIdRef.current === nextId) return;
    previousChapterIdRef.current = loadedChapterIdRef.current;
    loadedChapterIdRef.current = nextId;
    editor.commands.setContent(initialContent || "<p></p>", { emitUpdate: false });
    selectionSetterRef.current(EMPTY_SELECTION);
    handlersRef.current.onSelectionChange(EMPTY_SELECTION);
    emitSelection({ ...EMPTY_SELECTION, chapterId: nextId });
    // 切换章节（非首次加载）后把光标放到文首，方便直接写
    if (previousChapterIdRef.current !== null) {
      editor.commands.focus("start");
    }
  }, [editor, chapterId, initialContent]);

  // 段落数：随正文更新刷新；切章时 setContent 不派发 update，所以依赖 chapterId 兜底重算
  React.useEffect(() => {
    if (!editor) {
      setParagraphCount(0);
      return;
    }
    const recount = () => setParagraphCount(countParagraphs(editor.state.doc));
    recount();
    editor.on("update", recount);
    return () => {
      editor.off("update", recount);
    };
  }, [editor, chapterId]);

  // 专注段落 / 打字机滚动：关闭时不干预滚动，并在切换、卸载时清理干净
  React.useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;

    const clearFocusBlock = () => {
      root.querySelectorAll(".is-focus-block").forEach((node) => node.classList.remove("is-focus-block"));
      root.removeAttribute("data-focus-paragraph");
    };

    const syncFocusBlock = () => {
      if (!focusParagraph) {
        clearFocusBlock();
        return;
      }
      root.setAttribute("data-focus-paragraph", "on");
      const block = findFocusBlockDom(editor);
      root.querySelectorAll(".is-focus-block").forEach((node) => {
        if (node !== block) node.classList.remove("is-focus-block");
      });
      block?.classList.add("is-focus-block");
    };

    const scrollCaretToViewport = () => {
      const container = scrollRef.current;
      if (!container) return;
      try {
        const caret = editor.view.coordsAtPos(editor.state.selection.head);
        const rect = container.getBoundingClientRect();
        const caretOffset = caret.top - rect.top;
        const targetOffset = rect.height * TYPEWRITER_TARGET_RATIO;
        const delta = caretOffset - targetOffset;
        if (Math.abs(delta) < 24) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        container.scrollTo({ top: container.scrollTop + delta, behavior: reduceMotion ? "auto" : "smooth" });
      } catch {
        /* coordsAtPos 在极端光标位置可能抛错，忽略即可，不影响写作 */
      }
    };

    const handleSelectionUpdate = () => {
      syncFocusBlock();
      if (typewriter) scrollCaretToViewport();
    };

    syncFocusBlock();
    if (typewriter) scrollCaretToViewport();
    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
      clearFocusBlock();
    };
  }, [editor, typewriter, focusParagraph]);

  // Ctrl/⌘+F 打开查找替换、Esc 关闭。
  // useHotkeys 会过滤输入控件内的按键，查找是全局能力，所以在捕获阶段单独监听，
  // 并 stopPropagation 抢在 Workbench 的 Esc（退出沉浸）等快捷键之前处理。
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        setFindOpen(true);
        setFindRequest((value) => value + 1);
        return;
      }
      if (event.isComposing) return;
      if (findOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setFindOpen(false);
        editor?.commands.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [findOpen, editor]);

  // 排版设置全部走 CSS 变量 + 内联样式：设置页改动即时生效，无需重挂编辑器
  const styleVars = {
    "--prose-size": `${fontSize}px`,
    "--prose-leading": String(lineHeight),
    "--prose-indent": firstLineIndent ? "2em" : "0",
    "--prose-weight": String(fontWeight),
    "--prose-tracking": `${letterSpacing}em`,
    "--prose-para-gap": `${paragraphSpacing}px`,
  } as React.CSSProperties;

  // 阅读宽度 0 = 自适应：不写 maxWidth，让正文铺满可用宽度（仍保留内边距）
  // 页边距来自设置，但以容器宽度的 10% 为上限：窄屏（如 1024 三栏展开）时
  // 不会被 64px 的固定边距挤成一条缝，宽屏仍按设置值渲染
  const horizontalPadding = `max(16px, min(${pagePaddingX}px, 10%))`;
  const pageStyle: React.CSSProperties = {
    maxWidth: maxContentWidth > 0 ? `${maxContentWidth}px` : undefined,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    paddingTop: pagePaddingY,
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper" style={styleVars}>
      {/* 专注段落样式内联注入：globals.css 不在本次改动范围 */}
      <style>{FOCUS_PARAGRAPH_CSS}</style>
      {findOpen ? (
        <FindReplaceBar
          editor={editor}
          open
          focusRequest={findRequest}
          onClose={() => setFindOpen(false)}
          className={immersive ? "top-14" : undefined}
        />
      ) : null}
      {immersive ? (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <SaveButton onSave={onSave} saving={saveState === "saving"} />
          <Tooltip label="打开 AI 助手（Alt+J）" side="left">
            <IconButton label="打开 AI 助手" onClick={onAskAi} className="border-line bg-surface/90 text-accent shadow-xs backdrop-blur hover:bg-surface">
              <MessagesSquare className="size-4" />
            </IconButton>
          </Tooltip>
          <Tooltip label="退出沉浸" side="left">
            <IconButton
              label="退出沉浸"
              onClick={onExitImmersive}
              className="border-line bg-surface/90 text-ink shadow-xs backdrop-blur hover:bg-surface"
            >
              <Minimize2 className="size-4" />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto w-full pb-24 sm:pb-32"
          style={pageStyle}
          data-inline-hints={showInlineHints ? "on" : "off"}
        >
          <input
            value={title}
            disabled={pendingReview}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="未命名章节"
            aria-label="章节标题"
            className={cn(
              "w-full border-0 bg-transparent font-serif text-[26px] font-semibold leading-tight tracking-wide text-ink sm:text-[30px]",
              "outline-none placeholder:text-ink-4",
              immersive && "text-center",
            )}
          />

          {immersive ? (
            <div className="mb-8 mt-3 flex items-center justify-center gap-3 text-[11.5px] text-ink-4">
              <span className="tabular-nums">{formatWords(wordCount)} 字</span>
              <span className="size-1 rounded-full bg-line" aria-hidden />
              <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} showIdle={false} />
            </div>
          ) : (
            <div className="mb-7 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/70 pb-3">
              <StatusMenu status={status} onChange={onStatusChange} />
              <span className="text-[11.5px] tabular-nums text-ink-4">{formatWords(wordCount)} 字</span>
              {updatedAt ? (
                <span className="text-[11.5px] text-ink-4">更新于 {formatDateTime(updatedAt)}</span>
              ) : null}
            </div>
          )}

          {/* AI 任务收进格式工具栏的一个下拉入口。 */}
          {!immersive ? <FormatToolbar editor={editor} className="mb-6 border-b border-line/70 pb-2">{aiBar}</FormatToolbar> : null}

          {editor ? (
            <>
              {review && pendingReview?<AgentReview key={`${review.run.id}:${review.changeId}`} initial={review.run} changeId={review.changeId} onClose={onCloseReview||(()=>{})}/>:null}
              <div className={pendingReview?"hidden":""}><EditorContent editor={editor} /></div>
              <Sheet open={Boolean(review && !pendingReview)} onClose={onCloseReview || (()=>{})} title="历史改动对比" width={760}>
                {review && !pendingReview?<div className="p-5"><AgentReview key={`${review.run.id}:${review.changeId}`} initial={review.run} changeId={review.changeId} onClose={onCloseReview||(()=>{})}/></div>:null}
              </Sheet>
            </>
          ) : (
            <div className="space-y-2.5 pt-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          )}
        </div>
      </div>

      {/* 底部状态条：非沉浸模式 */}
      {immersive ? (
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
          <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface/85 px-3 py-1.5 text-[11px] text-ink-3 shadow-xs backdrop-blur">
            <span className="tabular-nums">{formatWords(wordCount)} 字</span>
            <span className="size-1 rounded-full bg-line" aria-hidden />
            <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} showIdle={false} />
            <span className="size-1 rounded-full bg-line" aria-hidden />
            <button
              type="button"
              onClick={onExitImmersive}
              className="inline-flex items-center gap-1 text-accent transition-opacity hover:opacity-80"
            >
              <Minimize2 className="size-3.5" />
              退出沉浸
            </button>
          </span>
        </div>
      ) : showStatusBar ? (
        <EditorStatusBar
          wordCount={wordCount}
          paragraphCount={paragraphCount}
          selection={selection}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          typewriter={typewriter}
          focusParagraph={focusParagraph}
          onToggleTypewriter={() => setTypewriter((prev) => !prev)}
          onToggleFocusParagraph={() => setFocusParagraph((prev) => !prev)}
        />
      ) : null}

      <SelectionToolbar editor={editor} selection={selection} onAskAi={onAskAi} />
    </div>
  );
}
