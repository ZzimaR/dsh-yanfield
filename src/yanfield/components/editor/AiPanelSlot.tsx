"use client";

import * as React from "react";
import { AiPanel } from "@/components/ai/AiPanel";

export interface AiPanelSlotProps {
  novelId: string;
  chapterId: string | null;
  chapterTitle?: string | null;
  onClose?: () => void;
  className?: string;
}

/**
 * 右栏 AI 面板插槽。
 * 真正的面板实现在 components/ai/AiPanel.tsx：它自己通过
 * useEditorBridge() 读写正文、并监听 yanfield:editor-focus-ai / yanfield:editor-selection，
 * 所以这里只做 props 透传，编辑器与 AI 面板之间没有其他耦合。
 */
export function AiPanelSlot({ novelId, chapterId, chapterTitle, onClose, className }: AiPanelSlotProps) {
  return (
    <AiPanel
      novelId={novelId}
      chapterId={chapterId}
      chapterTitle={chapterTitle ?? null}
      onClose={onClose}
      className={className}
    />
  );
}
