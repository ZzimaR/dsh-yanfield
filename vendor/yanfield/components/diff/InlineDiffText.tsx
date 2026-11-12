"use client";

/**
 * 行内 diff 文本：把 diffInline / diffBlocks 产出的 InlineDiff[] 渲染为
 * 相同 / 新增（绿底）/ 删除（红底+删除线）片段。
 * 颜色统一由 globals.css 的 .diff-add / .diff-del 提供。
 */
import type { InlineDiff } from "@/lib/diff/blocks";
import { cn } from "@/lib/ui/cn";

export interface InlineDiffTextProps {
  parts: InlineDiff[];
  className?: string;
}

export function InlineDiffText({ parts, className }: InlineDiffTextProps) {
  if (parts.length === 0) {
    return <span className={cn("text-ink-4", className)}>（无内容）</span>;
  }
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => {
        if (part.type === "add") {
          return (
            <ins key={index} className="diff-add rounded-[2px] no-underline">
              {part.text}
            </ins>
          );
        }
        if (part.type === "del") {
          return (
            <del key={index} className="diff-del rounded-[2px]">
              {part.text}
            </del>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </span>
  );
}
