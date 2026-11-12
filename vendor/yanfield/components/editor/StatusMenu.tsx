"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Dropdown, type DropdownItem } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import { CHAPTER_STATUS_LABEL, type ChapterStatus } from "@/lib/types";

/** 状态点颜色：草稿灰 / 修改中金 / 定稿玉 */
export const STATUS_DOT_CLASS: Record<ChapterStatus, string> = {
  draft: "bg-ink-4",
  revising: "bg-gold",
  done: "bg-jade",
};

/** 状态文字颜色（用于徽标） */
export const STATUS_TEXT_CLASS: Record<ChapterStatus, string> = {
  draft: "text-ink-3",
  revising: "text-gold",
  done: "text-jade",
};

const STATUS_ORDER: ChapterStatus[] = ["draft", "revising", "done"];

interface StatusMenuProps {
  status: ChapterStatus;
  onChange: (status: ChapterStatus) => void;
  disabled?: boolean;
  className?: string;
}

/** 章节状态徽标 + 下拉切换 */
export function StatusMenu({ status, onChange, disabled, className }: StatusMenuProps) {
  const items: DropdownItem[] = STATUS_ORDER.map((value) => ({
    onSelect: () => onChange(value),
    label: (
      <span className="flex w-full items-center gap-2">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[value])} aria-hidden />
        <span>{CHAPTER_STATUS_LABEL[value]}</span>
        {status === value ? <Check className="ml-auto size-3.5 text-accent" aria-hidden /> : null}
      </span>
    ),
  }));

  return (
    <Dropdown
      align="start"
      width={168}
      items={items}
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label="切换章节状态"
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2.5 text-[11.5px] font-medium transition-colors duration-150",
            "hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            STATUS_TEXT_CLASS[status],
            className,
          )}
        >
          <span className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[status])} aria-hidden />
          {CHAPTER_STATUS_LABEL[status]}
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </button>
      }
    />
  );
}
