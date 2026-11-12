"use client";

import * as React from "react";
import { Archive, BookOpen, ListTree, ScrollText } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui/kit";
import type { EditorTab, NovelTree, TreeActions } from "@/lib/editor/types";
import { ArchiveInlinePanel } from "./ArchiveInlinePanel";
import { ChapterTree } from "./ChapterTree";
import { CodexPanel } from "./CodexPanel";
import { OutlineInlinePanel } from "./OutlineInlinePanel";

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
  onSelectChapter: (chapterId: string) => void;
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
  const chapterCount =
    (tree?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0) +
    (tree?.looseChapters.length ?? 0);

  // 页签保活：只在首次打开时挂载，之后切回不再重新拉数据
  const [visited, setVisited] = React.useState<Set<EditorLeftTab>>(() => new Set([tab]));

  React.useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  const tabs: TabItem[] = [
    { value: "toc", label: "目录", icon: <ListTree className="size-3.5" />, count: chapterCount || undefined },
    { value: "outline", label: "章纲", icon: <ScrollText className="size-3.5" /> },
    { value: "codex", label: "设定", icon: <BookOpen className="size-3.5" /> },
    { value: "archives", label: "档案", icon: <Archive className="size-3.5" /> },
  ];

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface">
      <Tabs
        className="shrink-0 gap-0 px-1 [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button]:gap-1 [&>button]:px-2 [&>button]:text-[12.5px] [&>button>svg]:hidden"
        tabs={tabs}
        value={tab}
        onChange={(value) => {
          if (isEditorLeftTab(value)) onTabChange(value);
        }}
      />
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
