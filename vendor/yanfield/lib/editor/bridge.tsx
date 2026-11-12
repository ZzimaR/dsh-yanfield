"use client";

/**
 * 编辑器桥：让 AI 面板 / 工具栏在不直接依赖 Tiptap 实例的情况下操作正文。
 * 编辑器组件里创建 bridge 并注入 Provider；其余面板用 useEditorBridge()。
 */
import * as React from "react";

export interface EditorBridge {
  getHtml(): string;
  getChapterId?(): string | null;
  flush?(): Promise<void>;
  syncSaved?(chapter: import("@/lib/types").Chapter): void;
  setReadOnly?(locked: boolean): void;
  getSelectionText(): string;
  /** 在光标处插入（续写用） */
  insertText(text: string): void;
  replaceSelection(text: string): void;
  appendText(text: string): void;
  focus(): void;
  /** 以 HTML 形式在光标处插入（拆成多段时用） */
  insertHtml?(html: string): void;
  /** 替换整章正文（应用 AI 全文改写时用；调用方需自行确认） */
  setHtml?(html: string): void;
}

const EditorBridgeContext = React.createContext<EditorBridge | null>(null);

export function EditorBridgeProvider({ children, value }: { children: React.ReactNode; value: EditorBridge | null }) {
  return <EditorBridgeContext.Provider value={value}>{children}</EditorBridgeContext.Provider>;
}

export function useEditorBridge(): EditorBridge | null {
  return React.useContext(EditorBridgeContext);
}

/** 把纯文本或简单 markdown 段落转成 Tiptap 可插入的 HTML 片段 */
export function textToInsertHtml(text: string): string {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  if (/^\s*</.test(normalized)) return normalized;
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const escaped = paragraph
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");
}
