"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  BookOpen,
  CircleCheck,
  Layers,
  ListTree,
  PenLine,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { Badge, Card, Progress } from "@/components/ui/kit";
import { LinkPendingIcon } from "@/components/ui/LinkPendingIcon";
import { CHAPTER_STATUS_LABEL, type Chapter, type ChapterSummary } from "@/lib/types";
import { cn, formatRelativeTime, formatWords } from "@/lib/ui/cn";

export interface ChapterEntry {
  chapter: ChapterSummary;
  volumeTitle: string;
}

/* ============================== 统计卡 ============================== */

export interface OverviewStatsProps {
  totalWords: number;
  chapterCount: number;
  doneChapters: number;
  volumeCount: number;
  archiveCount: number;
  archiveRate: number;
  todayWords: number;
}

interface StatItem {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  icon: LucideIcon;
  tone: "accent" | "jade" | "gold";
}

const STAT_TONE: Record<StatItem["tone"], string> = {
  accent: "bg-accent-soft text-accent",
  jade: "bg-jade-soft text-jade",
  gold: "bg-gold-soft text-gold",
};

export function OverviewStats({
  totalWords,
  chapterCount,
  doneChapters,
  volumeCount,
  archiveCount,
  archiveRate,
  todayWords,
}: OverviewStatsProps) {
  const items: StatItem[] = [
    {
      label: "总字数",
      value: formatWords(totalWords),
      unit: "字",
      hint: todayWords > 0 ? `今日 +${formatWords(todayWords)}` : "今天还没动笔",
      icon: PenLine,
      tone: "accent",
    },
    {
      label: "章节数",
      value: String(chapterCount),
      unit: "章",
      hint: `${volumeCount} 卷`,
      icon: Layers,
      tone: "jade",
    },
    {
      label: "已完稿",
      value: String(doneChapters),
      unit: "章",
      hint: chapterCount > 0 ? `${Math.round((doneChapters / chapterCount) * 100)}% 完稿率` : "还没有章节",
      icon: CircleCheck,
      tone: "jade",
    },
    {
      label: "故事档案",
      value: `${archiveRate}%`,
      hint: `${archiveCount} / ${chapterCount} 章有档案`,
      icon: Archive,
      tone: "gold",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, unit, hint, icon: Icon, tone }) => (
        <Card key={label} className="p-3.5 sm:p-4" hover>
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-ink-3">{label}</span>
            <span className={cn("flex size-6 items-center justify-center rounded-sm", STAT_TONE[tone])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
          </div>
          <p className="mt-2 font-serif text-[24px] leading-none text-ink sm:text-[28px]">
            {value}
            {unit ? <span className="ml-0.5 text-[12px] font-normal text-ink-3">{unit}</span> : null}
          </p>
          <p className="mt-2 truncate text-[11px] text-ink-3">{hint}</p>
        </Card>
      ))}
    </div>
  );
}

/* ============================== 继续写作 ============================== */

export interface ContinueWritingCardProps {
  editorHref: string;
  lastChapter: ChapterEntry | null;
  todayWords: number;
}

export function ContinueWritingCard({ editorHref, lastChapter, todayWords }: ContinueWritingCardProps) {
  return (
    <Card className="relative overflow-hidden border-accent/20 bg-accent-soft/40 p-4 sm:p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-accent/[0.07] blur-2xl"
      />
      <div className="relative flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">继续写作</p>
          <h2 className="mt-1.5 truncate font-serif text-[20px] leading-snug text-ink sm:text-[22px]">
            {lastChapter ? lastChapter.chapter.title : "从第一章开始"}
          </h2>
          <p className="mt-1 truncate text-[11.5px] text-ink-3">
            {lastChapter
              ? `${lastChapter.volumeTitle} · 上次更新 ${formatRelativeTime(lastChapter.chapter.updatedAt)} · ${formatWords(lastChapter.chapter.wordCount)} 字`
              : "还没有章节，打开编辑器写下第一句。"}
            {todayWords > 0 ? ` · 今日已写 ${formatWords(todayWords)} 字` : ""}
          </p>
        </div>
        <Link
          href={editorHref}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-5 text-[14px] font-medium text-accent-ink shadow-card transition-colors hover:bg-accent-hover"
        >
          <LinkPendingIcon className="size-4">
            <PenLine className="size-4" aria-hidden />
          </LinkPendingIcon>
          继续写作
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

/* ============================== 卷进度 ============================== */

export interface VolumeProgressCardProps {
  volumes: { id: string; title: string; chapters: ChapterSummary[] }[];
  looseChapters: ChapterSummary[];
  editorBase: string;
}

export function VolumeProgressCard({ volumes, looseChapters, editorBase }: VolumeProgressCardProps) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13.5px] font-medium text-ink">卷进度</h3>
        <span className="text-[11px] text-ink-3">{volumes.length} 卷</span>
      </div>
      <div className="mt-3.5 space-y-4">
        {volumes.map((volume) => {
          const chapterCount = volume.chapters.length;
          const done = volume.chapters.filter((chapter) => chapter.status === "done").length;
          const words = volume.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
          const percent = chapterCount > 0 ? Math.round((done / chapterCount) * 100) : 0;
          return (
            <div key={volume.id}>
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`${editorBase}${volume.chapters[0] ? `?chapterId=${volume.chapters[0].id}` : ""}`}
                  className="truncate text-[12.5px] text-ink-2 transition-colors hover:text-accent"
                >
                  {volume.title}
                </Link>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
                  {done}/{chapterCount} 章 · {formatWords(words)}
                </span>
              </div>
              <Progress value={percent} max={100} tone={percent === 100 ? "jade" : "accent"} className="mt-1.5" />
            </div>
          );
        })}

        {volumes.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-3">
            还没有分卷。去大纲里创建第一卷吧。
          </p>
        ) : null}

        {looseChapters.length > 0 ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] text-ink-2">未分卷章节</span>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{looseChapters.length} 章</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {looseChapters.slice(0, 8).map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`${editorBase}?chapterId=${chapter.id}`}
                  className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                >
                  {chapter.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ============================== 最近章节 ============================== */

const STATUS_TONE: Record<Chapter["status"], "default" | "gold" | "jade"> = {
  draft: "default",
  revising: "gold",
  done: "jade",
};

export interface RecentChaptersCardProps {
  chapters: ChapterEntry[];
  editorBase: string;
}

export function RecentChaptersCard({ chapters, editorBase }: RecentChaptersCardProps) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13.5px] font-medium text-ink">最近章节</h3>
        <span className="text-[11px] text-ink-3">按最近编辑排序</span>
      </div>
      {chapters.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-3">
          还没有章节，去编辑器写第一章吧。
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line/70">
          {chapters.map(({ chapter, volumeTitle }) => (
            <li key={chapter.id}>
              <Link
                href={`${editorBase}?chapterId=${chapter.id}`}
                className="group flex items-center gap-2.5 py-2.5 transition-colors hover:text-accent"
              >
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-[10px] text-ink-3"
                >
                  {chapter.orderIndex + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink group-hover:text-accent">{chapter.title}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">
                    {volumeTitle} · {formatWords(chapter.wordCount)} 字 · {formatRelativeTime(chapter.updatedAt)}
                  </span>
                </span>
                <Badge tone={STATUS_TONE[chapter.status]}>{CHAPTER_STATUS_LABEL[chapter.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ============================== 快捷入口 ============================== */

const QUICK_LINKS: { href: (id: string) => string; icon: LucideIcon; title: string; description: string }[] = [
  { href: (id) => `/editor/${id}?tab=outline`, icon: ListTree, title: "章纲", description: "全书 → 分卷 → 章节" },
  { href: (id) => `/editor/${id}?tab=codex`, icon: BookOpen, title: "设定", description: "角色、世界、伏笔" },
  { href: (id) => `/editor/${id}?tab=archives`, icon: Archive, title: "档案", description: "五块档案与冲突" },
  { href: (id) => `/editor/${id}`, icon: ScrollText, title: "写作", description: "三栏编辑器" },
];

export function QuickLinks({ novelId }: { novelId: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {QUICK_LINKS.map(({ href, icon: Icon, title, description }) => (
        <Link
          key={title}
          href={href(novelId)}
          className="group rounded-lg border border-line bg-surface p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
        >
          <span className="flex items-center justify-between">
            <span className="flex size-7 items-center justify-center rounded-sm bg-surface-2 text-ink-2 transition-colors group-hover:bg-accent-soft group-hover:text-accent">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <ArrowRight className="size-3.5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
          </span>
          <span className="mt-2.5 block text-[12.5px] font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-[10.5px] text-ink-3">{description}</span>
        </Link>
      ))}
    </div>
  );
}
