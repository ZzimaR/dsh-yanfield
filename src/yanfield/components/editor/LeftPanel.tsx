"use client";

import * as React from "react";
import { Archive, BookOpen, ListTree, ScrollText } from "lucide-react";
import { type TabItem } from "@/components/ui/kit";
import type { EditorTab, NovelTree, TreeActions } from "@/lib/editor/types";
import { cn } from "@/lib/ui/cn";
import { ArchiveInlinePanel } from "./ArchiveInlinePanel";
import { ChapterTree } from "./ChapterTree";
import { CodexPanel } from "./CodexPanel";
import { OutlineInlinePanel } from "./OutlineInlinePanel";
import { useT } from "@/lib/i18n";

/** 左栏四个标签页：目录 / 章纲 / 设定 / 档案 */
export type EditorLeftTab = EditorTab | "codex";

function isEditorLeftTab(value: unknown): value is EditorLeftTab {
  return value === "toc" || value === "outline" || value === "codex" || value === "archives";
}

interface LeftPanelProps {
  novelId: string;
  tree: NovelTree | null;
  loading: boolean;
  currentChapterId: string | null;
  currentVolumeId: string | null;
  tab: EditorLeftTab;
  onTabChange: (tab: EditorLeftTab) => void;
  actions: TreeActions;
  onSelectChapter: (chapterId: string) => Promise<boolean>;
}

/** 编辑器左栏：目录 / 章纲 / 设定 / 档案 四个标签页 */
export const LeftPanel = React.memo(function LeftPanel({
  novelId,
  tree,
  loading,
  currentChapterId,
  currentVolumeId,
  tab,
  onTabChange,
  actions,
  onSelectChapter,
}: LeftPanelProps) {
  const tr = useT();

  // 页签保活：只在首次打开时挂载，之后切回不再重新拉数据
  const [visited, setVisited] = React.useState<Set<EditorLeftTab>>(() => new Set([tab]));

  React.useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  const tabs: TabItem[] = [
    { value: "toc", label: tr("目录"), icon: <ListTree className="size-3.5" /> },
    { value: "outline", label: tr("章纲"), icon: <ScrollText className="size-3.5" /> },
    { value: "codex", label: tr("设定"), icon: <BookOpen className="size-3.5" /> },
    { value: "archives", label: tr("档案"), icon: <Archive className="size-3.5" /> },
  ];

  return (
    <div data-yf-reference-sidebar className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-line px-2 py-1.5">
        <div className="flex gap-1" role="tablist" aria-label={tr("左栏页签")}>
          {tabs.map((item) => {
            const active = item.value === tab;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (isEditorLeftTab(item.value)) onTabChange(item.value);
                }}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center rounded-md px-0.5 py-1 text-[11.5px] leading-tight transition-colors duration-150",
                  active
                    ? "bg-surface-2 font-medium text-ink shadow-sm"
                    : "text-ink-3 hover:bg-surface-2/70 hover:text-ink",
                )}
              >
                <span className="max-w-full break-words">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {visited.has("toc") ? (
          <div className={tab === "toc" ? "h-full min-h-0" : "hidden"}>
            <ChapterTree
              novelId={novelId}
              tree={tree}
              loading={loading}
              currentChapterId={currentChapterId}
              currentVolumeId={currentVolumeId}
              actions={actions}
              onSelectChapter={onSelectChapter}
            />
          </div>
        ) : null}
        {visited.has("outline") ? (
          <div className={tab === "outline" ? "h-full min-h-0" : "hidden"}>
            <OutlineInlinePanel
              novelId={novelId}
              chapterId={currentChapterId}
              onSelectChapter={onSelectChapter}
            />
          </div>
        ) : null}
        {visited.has("codex") ? (
          <div className={tab === "codex" ? "h-full min-h-0" : "hidden"}>
            <CodexPanel novelId={novelId} />
          </div>
        ) : null}
        {visited.has("archives") ? (
          <div className={tab === "archives" ? "h-full min-h-0" : "hidden"}>
            <ArchiveInlinePanel novelId={novelId} />
          </div>
        ) : null}
      </div>
    </div>
  );
});
