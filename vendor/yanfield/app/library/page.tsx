"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Plus, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button, ConfirmDialog, EmptyState, useToast } from "@/components/ui/kit";
import { apiDelete, apiGet, apiPost, notifyDataChanged, useApi, useDataChanged } from "@/lib/client/api";
import { formatWords } from "@/lib/ui/cn";
import type { Novel } from "@/lib/types";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
import { NovelGrid, NovelGridSkeleton } from "@/components/library/NovelGrid";
import { CreateNovelDialog } from "@/components/library/CreateNovelDialog";
import { EditNovelDialog } from "@/components/library/EditNovelDialog";
import { filterAndSortNovels } from "@/components/library/utils";
import {
  GENRE_ALL,
  type NovelListItem,
  type NovelListResponse,
  type NovelMeta,
  type SortKey,
} from "@/components/library/types";

interface NovelTreeResponse {
  volumes?: { chapters?: unknown[] }[];
  looseChapters?: unknown[];
}

function extractNovel(response: Novel | { novel: Novel }): Novel {
  return "novel" in response ? response.novel : response;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "操作失败，请稍后再试。";
}

export default function LibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, error, loading, refresh } = useApi<NovelListResponse>("/api/novels");

  const [search, setSearch] = React.useState("");
  const [genre, setGenre] = React.useState<string>(GENRE_ALL);
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [metaById, setMetaById] = React.useState<Record<string, NovelMeta>>({});
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NovelListItem | null>(null);
  const [deleting, setDeleting] = React.useState<NovelListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [demoLoading, setDemoLoading] = React.useState(false);

  const novels = React.useMemo<NovelListItem[]>(() => {
    const items = data?.items ?? [];
    return items.map((novel) => {
      const meta = metaById[novel.id];
      if (!meta) return novel;
      return {
        ...novel,
        volumeCount: novel.volumeCount ?? meta.volumeCount,
        chapterCount: novel.chapterCount ?? meta.chapterCount,
        wordCount: novel.wordCount ?? meta.wordCount,
        doneChapters: novel.doneChapters ?? meta.doneChapters,
        lastChapterId: novel.lastChapterId ?? meta.lastChapterId,
      };
    });
  }, [data, metaById]);

  // 契约已附带汇总字段；这里只对缺失字段做一次兜底补全。
  React.useEffect(() => {
    const missing = (data?.items ?? []).filter((novel) => novel.wordCount === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const novel of missing) {
        try {
          const tree = await apiGet<NovelTreeResponse>(`/api/novels/${novel.id}/tree`);
          if (cancelled) return;
          const volumes = tree.volumes ?? [];
          const loose = tree.looseChapters ?? [];
          const chapterCount = volumes.reduce((sum, volume) => sum + (volume.chapters?.length ?? 0), 0) + loose.length;
          const nextMeta: NovelMeta = {
            volumeCount: volumes.length,
            chapterCount,
            wordCount: novel.wordCount ?? 0,
            doneChapters: novel.doneChapters ?? 0,
            lastChapterId: novel.lastChapterId ?? null,
          };
          setMetaById((previous) => ({ ...previous, [novel.id]: nextMeta }));
        } catch {
          // 补全失败时保持原样，不影响书架可用性。
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const refreshList = React.useCallback(() => {
    void refresh();
  }, [refresh]);
  useDataChanged(refreshList, ["novels", "chapters"]);

  const visible = React.useMemo(
    () => filterAndSortNovels(novels, { search, genre, sort }),
    [novels, search, genre, sort],
  );

  const totals = React.useMemo(() => {
    return novels.reduce(
      (accumulator, novel) => ({
        words: accumulator.words + (novel.wordCount ?? 0),
        chapters: accumulator.chapters + (novel.chapterCount ?? 0),
      }),
      { words: 0, chapters: 0 },
    );
  }, [novels]);

  const createDemo = async () => {
    setDemoLoading(true);
    try {
      const created = extractNovel(await apiPost<Novel | { novel: Novel }>("/api/demo"));
      notifyDataChanged("novels");
      await refresh();
      toast({ title: "示例作品已创建", description: `《${created.title}》已放进书架`, tone: "success" });
    } catch (cause) {
      toast({ title: "创建示例作品失败", description: errorMessage(cause), tone: "error" });
    } finally {
      setDemoLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiDelete(`/api/novels/${deleting.id}`);
      notifyDataChanged("novels");
      toast({ title: "作品已删除", description: `《${deleting.title}》已移除`, tone: "success" });
      setDeleting(null);
      await refresh();
    } catch (cause) {
      toast({ title: "删除失败", description: errorMessage(cause), tone: "error" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCreated = (novel: Novel) => {
    setCreateOpen(false);
    toast({ title: "作品已创建", description: `《${novel.title}》可以开始写了`, tone: "success" });
    router.push(`/novel/${novel.id}`);
  };

  const hasAnyNovel = (data?.items ?? []).length > 0;

  return (
    <AppShell active="library">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">Library</p>
            <h1 className="mt-1.5 font-serif text-[26px] leading-tight text-ink sm:text-[30px]">我的书架</h1>
            <p className="mt-2 text-[12.5px] text-ink-3">
              {loading && !data ? (
                "正在打开书架…"
              ) : (
                <>
                  共 <span className="font-mono text-ink-2">{novels.length}</span> 部作品 ·{" "}
                  <span className="font-mono text-ink-2">{formatWords(totals.words)}</span> 字 ·{" "}
                  <span className="font-mono text-ink-2">{totals.chapters}</span> 章
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Sparkles className="size-4" />}
              onClick={createDemo}
              loading={demoLoading}
              className="hidden sm:inline-flex"
            >
              示例作品
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setCreateOpen(true)}
            >
              新建作品
            </Button>
          </div>
        </header>

        <div className="mt-6">
          <LibraryToolbar
            search={search}
            onSearchChange={setSearch}
            genre={genre}
            onGenreChange={setGenre}
            sort={sort}
            onSortChange={setSort}
            count={visible.length}
          />
        </div>

        <div className="mt-4">
          {loading && !data ? (
            <NovelGridSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-6 py-12 text-center shadow-xs">
              <span className="flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger">
                <TriangleAlert className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-[14px] font-medium text-ink">书架没能打开</p>
                <p className="mt-1 text-[12px] text-ink-3">{error}</p>
              </div>
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={refreshList}>
                重试
              </Button>
            </div>
          ) : !hasAnyNovel ? (
            <div className="rounded-lg border border-line bg-surface shadow-xs">
              <EmptyState
                icon={<BookOpenText className="size-7" />}
                title="书架还是空的"
                description="写一本自己的书，或者先创建示例作品《潮信》，看看长篇在砚田里长什么样。"
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                      新建作品
                    </Button>
                    <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={createDemo} loading={demoLoading}>
                      创建示例作品
                    </Button>
                  </div>
                }
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface shadow-xs">
              <EmptyState
                icon={<BookOpenText className="size-7" />}
                title="没有匹配的作品"
                description="换个关键词，或者清空筛选条件。"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setGenre(GENRE_ALL);
                    }}
                  >
                    清空筛选
                  </Button>
                }
              />
            </div>
          ) : (
            <NovelGrid items={visible} onDelete={setDeleting} onEdit={setEditing} />
          )}
        </div>
      </div>

      <CreateNovelDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <EditNovelDialog
        open={editing !== null}
        novel={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={(novel) => {
          setEditing(null);
          toast({ title: "作品信息已更新", description: novel.title, tone: "success" });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `删除《${deleting.title}》？` : "删除作品？"}
        description={
          deleting
            ? "这部作品的所有卷、章节、大纲、设定与故事档案都会被一并删除，无法恢复。"
            : undefined
        }
        confirmText="删除作品"
        danger
        loading={deleteLoading}
        onConfirm={() => {
          void confirmDelete();
        }}
        onClose={() => {
          if (!deleteLoading) setDeleting(null);
        }}
      />
    </AppShell>
  );
}
