"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import { textToInsertHtml, type EditorBridge } from "./bridge";

/**
 * 把 Tiptap 实例包装成 EditorBridge（AI 面板唯一可用的正文操作入口）。
 * 接口定义在 lib/editor/bridge.tsx，不可更改；这里只做实现与容错。
 */
export function useEditorBridgeValue(editor: Editor | null): EditorBridge | null {
  return React.useMemo<EditorBridge | null>(() => {
    if (!editor) return null;

    /** 取得当前选区（纯文本） */
    const readSelection = (): string => {
      const { from, to } = editor.state.selection;
      if (from === to) return "";
      return editor.state.doc.textBetween(from, to, "\n");
    };

    return {
      getHtml: () => editor.getHTML(),

      getSelectionText: () => readSelection(),

      insertText: (text: string) => {
        const html = textToInsertHtml(text);
        if (!html) return;
        editor.chain().focus().insertContent(html).run();
      },

      replaceSelection: (text: string) => {
        const html = textToInsertHtml(text);
        if (!html) return;
        const { from, to } = editor.state.selection;
        editor.chain().focus().insertContentAt({ from, to }, html).run();
      },

      appendText: (text: string) => {
        const html = textToInsertHtml(text);
        if (!html) return;
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, html).run();
      },

      focus: () => {
        editor.commands.focus();
      },

      insertHtml: (html: string) => {
        if (!html) return;
        editor.chain().focus().insertContent(html).run();
      },

      setHtml: (html: string) => {
        editor.commands.setContent(html || "<p></p>", { emitUpdate: true });
      },
    };
  }, [editor]);
}
