"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import { textToInsertHtml, type EditorBridge } from "./bridge";

/**
 * 把 Tiptap 实例包装成 EditorBridge（AI 面板唯一可用的正文操作入口）。
 * 接口定义在 lib/editor/bridge.tsx。
 */
export function useEditorBridgeValue(editor: Editor | null): EditorBridge | null {
  return React.useMemo<EditorBridge | null>(() => {
    if (!editor) return null;

    /** 取得当前选区（纯文本） */
    const readSelection = (): string => {
      const { from, to } = editor.state.selection;
      if (from === to) return "";
      return editor.state.doc.textBetween(from, to, "\n", node => node.type.name === "hardBreak" ? "\n" : "");
    };

    return {
      getHtml: () => editor.getHTML(),

      getSelectionText: () => readSelection(),
      getSelectionRange: () => {
        const { doc, selection } = editor.state;
        if (selection.empty) return undefined;
        const prefix = doc.textBetween(0, selection.from, "\n", node => node.type.name === "hardBreak" ? "\n" : "");
        const raw = readSelection();
        const text = raw.trim();
        if (!text) return undefined;
        const leading = raw.slice(0, raw.length - raw.trimStart().length);
        const from = prefix.length + leading.length;
        const startLine = (prefix + leading).split("\n").length;
        return { from, to: from + text.length, startLine, endLine: startLine + text.split("\n").length - 1 };
      },

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
