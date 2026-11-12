"use client";

import * as React from "react";
import { AiPanelSlot } from "./AiPanelSlot";
import { EditorErrorBoundary } from "./EditorErrorBoundary";

interface EditorRightRailProps {
  novelId: string;
  chapterId: string | null;
  chapterTitle: string | null;
  onClose: () => void;
}

/** 右栏：AI 协作面板容器（面板本体在 components/ai；快捷任务条挂在中栏正文顶部） */
export function EditorRightRail({
  novelId,
  chapterId,
  chapterTitle,
  onClose,
}: EditorRightRailProps) {
  // w-full + min-w-0：右栏宽度由外层 aside 的 style.width 决定，
  // 不给内层面板按内容撑破容器的机会（否则 AI 面板会把关闭按钮挤出视口）
  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l border-line bg-surface">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* AI 面板来自 components/ai，用错误边界隔离：面板异常不拖垮整个编辑器 */}
        <EditorErrorBoundary resetKey={`${novelId}:${chapterId ?? "none"}`} title="AI 面板">
          <AiPanelSlot
            novelId={novelId}
            chapterId={chapterId}
            chapterTitle={chapterTitle}
            onClose={onClose}
            className="min-w-0"
          />
        </EditorErrorBoundary>
      </div>
    </aside>
  );
}
