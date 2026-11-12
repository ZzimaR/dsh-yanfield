"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Archive, Download, Pencil, Target } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Badge, Button, Card, Progress, Skeleton } from "@/components/ui/kit";
import { useApi, useDataChanged } from "@/lib/client/api";
import {
  NOVEL_STATUS_LABEL,
  type ChapterSummary,
  type DashboardStats,
  type Novel,
  type StoryArchive,
  type Volume,
} from "@/lib/types";
import { resolveCoverStyle } from "@/lib/cover";
import { formatRelativeTime, formatWords } from "@/lib/ui/cn";
import { EditNovelDialog } from "@/components/library/EditNovelDialog";
import { editorHref } from "@/components/library/types";
import { downloadNovelExport } from "@/components/library/utils";
import {
  ContinueWritingCard,
  OverviewStats,
  QuickLinks,
  RecentChaptersCard,
  VolumeProgressCard,
  type ChapterEntry,
} from "@/components/library/OverviewSections";

interface NovelTreeResponse {
  novel: Novel;
  volumes: (Volume & { chapters: ChapterSummary[] })[];
  looseChapters: ChapterSummary[];
}

interface ArchivesResponse {
  items: StoryArchive[];
}

export default function NovelOverviewPage() {
  const params = useParams<{ novelId: string }>();
  const novelId = params?.novelId ?? "";

  const novelApi = useApi<Novel>(novelId ? `/api/novels/${novelId}` : null);
  const treeApi = useApi<NovelTreeResponse>(novelId ? `/api/novels/${novelId}/tree?view=summary` : null);
  const archivesApi = useApi<ArchivesResponse>(
    novelId ? `/api/archives?novelId=${encodeURIComponent(novelId)}` : null,
  );
  const statsApi = useApi<DashboardStats>("/api/stats");
  const [editOpen, setEditOpen] = React.useState(false);
  const [focusWordGoal, setFocusWordGoal] = React.useState(false);

  useDataChanged(
    () => {
      void novelApi.refresh();
      void treeApi.refresh();
      void archivesApi.refresh();
    },
    ["novels", "chapters", "archives"],
  );

  const novel = novelApi.data ?? treeApi.data?.novel;
  const volumes = treeApi.data?.volumes ?? [];
  const looseChapters = treeApi.data?.looseChapters ?? [];

  const chapterEntries = React.useMemo<ChapterEntry[]>(() => {
    const entries: ChapterEntry[] = [];
    volumes.forEach((volume) => {
      volume.chapters.forEach((chapter) => entries.push({ chapter, volumeTitle: volume.title }));
    });
    looseChapters.forEach((chapter) => entries.push({ chapter, volumeTitle: "未分卷" }));
    return entries.sort((a, b) => b.chapter.updatedAt.localeCompare(a.chapter.updatedAt));
  }, [volumes, looseChapters]);

  const chapterCount = chapterEntries.length;
  const totalWords = chapterEntries.reduce((sum, entry) => sum + entry.chapter.wordCount, 0);
  const doneChapters = chapterEntries.filter((entry) => entry.chapter.status === "done").length;
  const archives = archivesApi.data?.items ?? [];
  const archiveCount = archives.length;
  const archiveRate = chapterCount > 0 ? Math.min(100, Math.round((archiveCount / chapterCount) * 100)) : 0;
  const lastChapter = chapterEntries[0] ?? null;
  const editorBase = `/editor/${novelId}`;

  const staleCount = archives.filter((archive) => archive.status === "stale").length;
  const pendingCount = archives.filter((archive) => archive.status === "pending").length;
  const freshCount = archives.filter((archive) => archive.status === "fresh").length;

  if (!novel && novelApi.loading) {
    return (
      <AppShell novelId={novelId} active="overview">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-8">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!novel) {
    return (
      <AppShell novelId={novelId} active="overview">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-24 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
            <Archive className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-serif text-xl text-ink">作品不存在或已被删除</h1>
            <p className="mt-1.5 text-[12.5px] text-ink-3">
              {novelApi.error ?? "检查一下书架，这本书也许已经被移除了。"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void novelApi.refresh()} loading={novelApi.loading}>
              重试
            </Button>
            <Link
              href="/library"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              返回书架
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const cover = resolveCoverStyle(novel.coverKey);
  const wordGoal = novel.wordGoal > 0 ? novel.wordGoal : 0;
  const goalPercent = wordGoal > 0 ? Math.min(100, Math.round((totalWords / wordGoal) * 100)) : 0;

  return (
    <AppShell novelId={novelId} active="overview">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-8">
        {/* 作品头部 */}
        <section className="flex gap-4">
          <div
            className="hidden w-24 shrink-0 overflow-hidden rounded-md shadow-paper sm:block"
            style={{
              backgroundImage: `linear-gradient(160deg, ${cover.from}, ${cover.to})`,
            }}
          >
            <div className="flex h-full min-h-[128px] flex-col items-center justify-between p-2.5">
              <span className="font-serif text-[32px] leading-none" style={{ color: cover.ink }}>
                {Array.from(novel.title)[0] ?? "砚"}
              </span>
              <span
                className="rounded-sm px-1.5 py-0.5 text-[9px] tracking-[0.16em]"
                style={{ color: cover.ink, backgroundColor: "rgba(0,0,0,0.18)" }}
              >
                {cover.label}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{novel.genre}</Badge>
              <Badge tone={novel.status === "completed" ? "jade" : "default"}>
                {NOVEL_STATUS_LABEL[novel.status]}
              </Badge>
              <span className="text-[11px] text-ink-3">最近更新 {formatRelativeTime(novel.updatedAt)}</span>
            </div>
            <h1 className="mt-1.5 font-serif text-[26px] leading-tight text-ink sm:text-[32px]">{novel.title}</h1>
            {novel.subtitle ? <p className="mt-1 text-[13px] text-ink-3">{novel.subtitle}</p> : null}
            <p className="mt-2 max-w-3xl text-[12.5px] leading-6 text-ink-2 sm:line-clamp-3">
              {novel.synopsis || "还没有写简介。点右侧「编辑信息」补上一句话，让书架更有存在感。"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil className="size-3.5" />}
                onClick={() => {
                  setFocusWordGoal(false);
                  setEditOpen(true);
                }}
              >
                编辑信息
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Download className="size-3.5" />}
                onClick={() => downloadNovelExport(novel.id, { format: "md", scope: "book" })}
              >
                导出全书
              </Button>
              <Link
                href={editorHref(novel.id, lastChapter?.chapter.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-soft/70"
              >
                <Pencil className="size-3.5" aria-hidden />
                打开编辑器
              </Link>
            </div>
          </div>
        </section>

        {/* 统计 */}
        {treeApi.loading && !treeApi.data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-[100px] w-full" />
            ))}
          </div>
        ) : (
          <OverviewStats
            totalWords={totalWords}
            chapterCount={chapterCount}
            doneChapters={doneChapters}
            volumeCount={volumes.length}
            archiveCount={archiveCount}
            archiveRate={archiveRate}
            todayWords={statsApi.data?.todayWords ?? 0}
          />
        )}

        {treeApi.error ? (
          <Card className="flex items-center justify-between gap-3 border-danger/30 bg-danger/5 p-3.5">
            <p className="text-[12px] text-danger">目录加载失败：{treeApi.error}</p>
            <Button variant="ghost" size="sm" onClick={() => void treeApi.refresh()}>
              重试
            </Button>
          </Card>
        ) : null}

        <ContinueWritingCard
          editorHref={lastChapter ? editorHref(novelId, lastChapter.chapter.id) : editorBase}
          lastChapter={lastChapter}
          todayWords={statsApi.data?.todayWords ?? 0}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <VolumeProgressCard volumes={volumes} looseChapters={looseChapters} editorBase={editorBase} />
            <RecentChaptersCard chapters={chapterEntries.slice(0, 6)} editorBase={editorBase} />
          </div>

          <aside className="space-y-4">
            <QuickLinks novelId={novelId} />

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <Target className="size-3.5 text-ink-3" aria-hidden />
                  写作目标
                </h3>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] text-ink-3">{goalPercent}%</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10.5px]"
                    onClick={() => {
                      setFocusWordGoal(true);
                      setEditOpen(true);
                    }}
                  >
                    调整
                  </Button>
                </div>
              </div>
              <Progress value={goalPercent} max={100} tone="gold" className="mt-2.5" />
              <p className="mt-2 text-[10.5px] text-ink-3">
                {wordGoal > 0 ? `${formatWords(totalWords)} / ${formatWords(wordGoal)} 字` : "尚未设置目标字数（在编辑信息里补充）"}
              </p>
              <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">开始创作</dt>
                  <dd className="text-ink-2">{formatRelativeTime(novel.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">最近更新</dt>
                  <dd className="text-ink-2">{formatRelativeTime(novel.updatedAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">平均章长</dt>
                  <dd className="text-ink-2">
                    {chapterCount > 0 ? `${formatWords(Math.round(totalWords / chapterCount))} 字` : "—"}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <Archive className="size-3.5 text-ink-3" aria-hidden />
                  故事档案
                </h3>
                <Link
                  href={`/editor/${novelId}?tab=archives`}
                  className="text-[11px] text-accent transition-opacity hover:opacity-80"
                >
                  查看
                </Link>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">最新档案</span>
                  <Badge tone="jade">{freshCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">待更新</span>
                  <Badge tone="gold">{staleCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">待提取</span>
                  <Badge tone="default">{pendingCount}</Badge>
                </div>
              </div>
              <p className="mt-2.5 text-[10.5px] leading-5 text-ink-3">
                写完一章就提取一次档案，角色状态与数值总账不会走丢。
              </p>
            </Card>
          </aside>
        </div>
      </div>

      <EditNovelDialog
        open={editOpen}
        novel={novel}
        focusField={focusWordGoal ? "wordGoal" : "title"}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          novelApi.setData(updated);
          setEditOpen(false);
        }}
      />
    </AppShell>
  );
}
