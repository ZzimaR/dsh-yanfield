"use client";

import * as React from "react";
import { Archive, BookOpen, FileText, ListTree, MapPin, ScrollText, Search, User } from "lucide-react";
import { Dialog, Input, Kbd, Spinner } from "@/components/ui/kit";
import { apiGet } from "@/lib/client/api";
import { cn } from "@/lib/ui/cn";
import type { Chapter, SearchResult } from "@/lib/types";
import type { EditorLeftTab } from "./LeftPanel";
import { stashPendingCodexCard } from "./CodexPanel";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: string;
  chapters: Chapter[];
  onOpenChapter: (chapterId: string) => void;
  onOpenTab: (tab: EditorLeftTab) => void;
}

interface TabAction {
  kind: "tab";
  key: string;
  tab: EditorLeftTab;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

interface ResultItem {
  kind: "result";
  key: string;
  result: SearchResult;
}

type PaletteItem = TabAction | ResultItem;

const TAB_ACTIONS: TabAction[] = [
  { kind: "tab", key: "tab:toc", tab: "toc", label: "打开目录", hint: "章节结构、新建 / 重命名章节", icon: <ListTree className="size-4" /> },
  { kind: "tab", key: "tab:outline", tab: "outline", label: "打开章纲", hint: "总纲、卷纲、本章章纲", icon: <ScrollText className="size-4" /> },
  { kind: "tab", key: "tab:codex", tab: "codex", label: "打开设定", hint: "角色、世界观、伏笔", icon: <BookOpen className="size-4" /> },
  { kind: "tab", key: "tab:archives", tab: "archives", label: "打开档案", hint: "逐章故事档案与冲突", icon: <Archive className="size-4" /> },
];

const RESULT_TYPE_LABEL: Record<SearchResult["type"], string> = {
  novel: "作品",
  chapter: "章节",
  character: "角色",
  world: "设定",
  archive: "档案",
};

function resultIcon(type: SearchResult["type"]): React.ReactNode {
  switch (type) {
    case "chapter":
      return <FileText className="size-4" />;
    case "character":
      return <User className="size-4" />;
    case "world":
      return <MapPin className="size-4" />;
    case "archive":
      return <Archive className="size-4" />;
    default:
      return <BookOpen className="size-4" />;
  }
}

/**
 * ⌘K 命令面板：搜全书（章节 / 角色 / 设定 / 档案），回车直达。
 * 没有输入时列出左栏四个页签，键盘 ↑↓ 选择，回车打开。
 */
export function CommandPalette({
  open,
  onOpenChange,
  novelId,
  chapters,
  onOpenChapter,
  onOpenTab,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  // 关闭时清空，下次打开是干净状态
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setActive(0);
    }
  }, [open]);

  // 输入防抖后走 /api/search，只保留当前作品的条目
  React.useEffect(() => {
    if (!open) return;
    const keyword = query.trim();
    if (!keyword) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void apiGet<{ items: SearchResult[] }>(`/api/search?q=${encodeURIComponent(keyword)}`)
        .then((data) => {
          if (cancelled) return;
          const items = (data?.items ?? []).filter(
            (item) => item.novelId === novelId && item.type !== "novel",
          );
          setResults(items.slice(0, 20));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, novelId]);

  const items: PaletteItem[] = React.useMemo(() => {
    if (!query.trim()) return TAB_ACTIONS;
    return results.map((result) => ({
      kind: "result" as const,
      key: `${result.type}:${result.id}`,
      result,
    }));
  }, [query, results]);

  React.useEffect(() => {
    setActive(0);
  }, [items]);

  const choose = React.useCallback(
    (item: PaletteItem) => {
      onOpenChange(false);
      if (item.kind === "tab") {
        onOpenTab(item.tab);
        return;
      }
      const { result } = item;
      if (result.type === "chapter") {
        onOpenChapter(result.chapterId ?? result.id);
        return;
      }
      if (result.type === "character" || result.type === "world") {
        onOpenTab("codex");
        // 切页签到 CodexPanel 挂载、再到 /api 数据返回之间有异步窗口：
        // 先暂存请求（面板挂载后取走重试），再派发事件；两者都做，避免竞态丢卡片。
        stashPendingCodexCard({ novelId, kind: result.type, id: result.id });
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("yanfield:open-card", {
              detail: { kind: result.type, id: result.id },
            }),
          );
        }, 0);
        return;
      }
      if (result.type === "archive") onOpenTab("archives");
    },
    [onOpenChange, onOpenChapter, onOpenTab],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((prev) => (prev + delta + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  };

  const empty = !loading && query.trim().length > 0 && items.length === 0;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="快速跳转"
      description="搜章节、角色、设定、档案；没输入时可以直接切左栏页签"
      width={580}
    >
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索章节、角色、设定、档案…"
            className="pl-8"
            aria-label="搜索"
          />
          {loading ? <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2" /> : null}
        </div>

        <ul className="scroll-thin max-h-[46vh] space-y-0.5 overflow-y-auto">
          {items.map((item, index) => {
            const isTab = item.kind === "tab";
            const label = isTab ? item.label : item.result.title;
            const hint = isTab
              ? item.hint
              : `${RESULT_TYPE_LABEL[item.result.type]}${item.result.snippet ? ` · ${item.result.snippet}` : ""}`;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    index === active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-3">
                    {isTab ? item.icon : resultIcon(item.result.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{label}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">{hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {empty ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-3">
            {chapters.length === 0 ? "这本书还没有可搜索的内容。" : "没找到匹配的章节 / 角色 / 设定 / 档案。"}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-line pt-2 text-[10.5px] text-ink-4">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            选择
            <span className="mx-1">·</span>
            <Kbd>↵</Kbd>
            打开
            <span className="mx-1">·</span>
            <Kbd>Esc</Kbd>
            关闭
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </Dialog>
  );
}
