"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Feather, Undo2 } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";

/** 与 kit Button primary 对齐的链接按钮样式（Button 不能渲染成 <a>，这里手写一份） */
const linkButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-accent px-3.5 text-[13px] font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 加载骨架：还原三栏布局，避免首屏跳动 */
export function EditorLoading() {
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper" aria-busy="true" aria-label="正在加载写作台">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="ml-auto h-3.5 w-28" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[288px] shrink-0 space-y-2.5 border-r border-line p-3 md:block">
          {Array.from({ length: 11 }).map((_, index) => (
            <Skeleton key={index} className={cn("h-3.5", index % 4 === 0 ? "w-2/3" : "w-full")} />
          ))}
        </div>
        <div className="mx-auto w-full max-w-[720px] space-y-3 px-6 pt-12">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="mt-8 h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="hidden w-[384px] shrink-0 space-y-2.5 border-l border-line p-3 lg:block">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className={cn("h-3.5", index % 3 === 0 ? "w-1/2" : "w-full")} />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          role="status"
          className="fade-in flex flex-col items-center gap-3 rounded-lg border border-line bg-surface/90 px-7 py-5 shadow-card backdrop-blur"
        >
          <div className="ink-write relative h-7 w-28" aria-hidden>
            <span className="ink-write-line absolute bottom-1 left-0 h-[2px] w-full rounded-full bg-accent/70" />
            <Feather className="ink-write-pen absolute bottom-1 left-0 size-5 text-accent" />
          </div>
          <p className="text-[12.5px] text-ink-3">正在铺开稿纸…</p>
        </div>
      </div>
    </div>
  );
}

/** 作品不存在（404） */
export function EditorNotFound() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-paper px-6">
      <EmptyState
        icon={<Feather className="size-5" />}
        title="没有找到这部作品"
        description="它可能已被删除，或者链接里的作品 ID 不正确。回到书架看看还有哪些作品。"
        action={
          <Link href="/library" className={linkButtonClass}>
            <ArrowLeft className="size-3.5" />
            返回书架
          </Link>
        }
      />
    </div>
  );
}

interface EditorErrorProps {
  message: string;
  onRetry: () => void;
}

/** 加载失败（网络 / 接口异常），提供重试 */
export function EditorError({ message, onRetry }: EditorErrorProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-paper px-6">
      <EmptyState
        icon={<Undo2 className="size-5" />}
        title="写作台没能加载出来"
        description={message}
        action={
          <Button variant="primary" size="sm" icon={<Undo2 className="size-3.5" />} onClick={onRetry}>
            重新加载
          </Button>
        }
      />
    </div>
  );
}
