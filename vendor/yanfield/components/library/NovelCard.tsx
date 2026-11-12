"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Download, Ellipsis, Pencil, PenLine, Trash } from "lucide-react";
import { InkstoneMark } from "@/components/brand/InkstoneMark";
import { Dropdown, IconButton } from "@/components/ui/kit";
import { resolveCoverStyle } from "@/lib/cover";
import { NOVEL_STATUS_LABEL } from "@/lib/types";
import { formatRelativeTime, formatWords } from "@/lib/ui/cn";
import { downloadNovelExport } from "./utils";
import { editorHref, type NovelListItem } from "./types";

export interface NovelCardProps {
  novel: NovelListItem;
  onDelete: (novel: NovelListItem) => void;
  onEdit?: (novel: NovelListItem) => void;
}

/** 书架作品卡片：封面渐变 + 汇总信息 + 操作菜单。 */
export function NovelCard({ novel, onDelete, onEdit }: NovelCardProps) {
  const router = useRouter();
  const cover = resolveCoverStyle(novel.coverKey);
  const meta = (
    <>
      {novel.volumeCount ?? 0} 卷 · {novel.chapterCount ?? 0} 章
    </>
  );

  return (
    <article className="group relative flex flex-col rounded-lg border border-line bg-surface p-2.5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-float">
      <Link href={`/novel/${novel.id}`} className="block overflow-hidden rounded-md">
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-md transition-transform duration-300 group-hover:scale-[1.015]"
          style={{
            backgroundImage: `linear-gradient(145deg, ${cover.from}, ${cover.to})`,
            color: cover.ink,
          }}
        >
          <div className="relative flex h-full flex-col p-3.5">
            <div className="flex items-center justify-between gap-2 pr-8 text-[11px] tracking-[0.14em] opacity-75">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <InkstoneMark className="size-5 shrink-0 rounded-[4px]" />
                <span className="truncate">砚田</span>
              </span>
              <span className="shrink-0 tracking-[0.05em]">{NOVEL_STATUS_LABEL[novel.status]}</span>
            </div>
            <h3 className="mt-3 line-clamp-4 font-serif text-[20px] leading-snug tracking-wide">
              {novel.title}
            </h3>
            {novel.subtitle ? (
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 opacity-80">{novel.subtitle}</p>
            ) : null}
            <div className="mt-auto flex items-center justify-between pt-2 text-[12px] opacity-85">
              <span className="rounded-full border border-current px-1.5 py-0.5">{novel.genre}</span>
              <span>{meta}</span>
            </div>
          </div>
        </div>
      </Link>

      <div className="absolute right-3.5 top-3.5 z-10">
        <Dropdown
          width={188}
          trigger={
            <IconButton label="更多操作" size="sm" className="bg-surface/85 text-ink-2 backdrop-blur hover:bg-surface">
              <Ellipsis className="size-4" />
            </IconButton>
          }
          items={[
            {
              label: "继续写作",
              icon: <PenLine className="size-3.5" />,
              onSelect: () => {
                router.push(editorHref(novel.id, novel.lastChapterId));
              },
              hint: novel.lastChapterId ? "最近一章" : undefined,
            },
            ...(onEdit
              ? [
                  {
                    label: "编辑信息",
                    icon: <Pencil className="size-3.5" />,
                    onSelect: () => onEdit(novel),
                  },
                ]
              : []),
            {
              label: "作品概览",
              icon: <BookOpen className="size-3.5" />,
              onSelect: () => {
                window.location.href = `/novel/${novel.id}`;
              },
            },
            {
              label: "导出 Markdown",
              icon: <Download className="size-3.5" />,
              onSelect: () => downloadNovelExport(novel.id),
            },
            { separator: true },
            {
              label: "删除作品",
              icon: <Trash className="size-3.5" />,
              danger: true,
              onSelect: () => onDelete(novel),
            },
          ]}
        />
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-2.5">
        <Link href={`/novel/${novel.id}`} className="truncate text-[13.5px] font-medium text-ink transition-colors hover:text-accent">
          {novel.title}
        </Link>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11.5px] leading-4 text-ink-3">
          {novel.synopsis || "还没有简介，点开写两句梗概吧。"}
        </p>
        <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-2 text-[10.5px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <PenLine className="size-3" aria-hidden />
            {formatWords(novel.wordCount ?? 0)} 字
          </span>
          <span>{novel.updatedAt ? formatRelativeTime(novel.updatedAt) : "—"}</span>
        </div>
      </div>
    </article>
  );
}
