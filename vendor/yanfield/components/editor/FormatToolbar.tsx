"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { IconButton, Tooltip } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";

interface FormatToolbarProps {
  /** 编辑器实例；未就绪时工具栏不渲染 */
  editor: Editor | null;
  className?: string;
  children?: React.ReactNode;
}

/** 禁用态视觉：IconButton 本身没有 disabled 样式，这里补齐 */
const DISABLED_CLASS = "disabled:pointer-events-none disabled:opacity-35";

/**
 * 订阅编辑器的 transaction：让工具栏的 active / disabled（撤销重做可用性）随内容与选区即时刷新。
 * Tiptap 的按钮状态不是 React state，必须手动触发重渲染。
 */
function useEditorTick(editor: Editor | null) {
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
  React.useEffect(() => {
    if (!editor) return;
    const update = () => forceUpdate();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}

/** 统一的工具栏按钮：IconButton + Tooltip + 中文 aria-label */
function ToolbarButton({ label, active, disabled, onClick, className, children }: ToolbarButtonProps) {
  return (
    <Tooltip label={label}>
      <IconButton
        label={label}
        size="sm"
        active={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(DISABLED_CLASS, className)}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

/** 「正文 / 标题 2 / 标题 3」这类文字按钮比图标更直观，宽度按内容自适应 */
const TEXT_BUTTON_CLASS = "size-auto h-7 min-w-7 w-auto px-1.5 text-[11px] font-medium";

/**
 * 正文格式工具栏（非沉浸模式显示）。
 *
 * 纯展示 + 命令调用，不持有草稿状态：所有按钮都通过 editor.chain().focus() 操作当前选区，
 * 点击后焦点回到正文，选区不丢失。段落样式用互斥的三个按钮（正文 / H2 / H3），
 * 与图标按钮共用 aria-label 中文 + Tooltip，方便键盘与读屏。
 */
export function FormatToolbar({ editor, className, children }: FormatToolbarProps) {
  useEditorTick(editor);

  if (!editor) return null;

  const isParagraph = editor.isActive("paragraph");

  return (
    <div role="toolbar" aria-label="格式工具栏" className={cn("flex flex-wrap items-center gap-0.5", className)}>
      <ToolbarButton label="撤销" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="重做" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        label="正文"
        active={isParagraph}
        className={TEXT_BUTTON_CLASS}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        正文
      </ToolbarButton>
      <ToolbarButton
        label="标题 2"
        active={editor.isActive("heading", { level: 2 })}
        className={TEXT_BUTTON_CLASS}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="标题 3"
        active={editor.isActive("heading", { level: 3 })}
        className={TEXT_BUTTON_CLASS}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton label="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="下划线"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="高亮"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="size-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        label="无序列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="有序列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-3.5" />
      </ToolbarButton>
      {children?<><ToolbarDivider />{children}</>:null}
    </div>
  );
}
