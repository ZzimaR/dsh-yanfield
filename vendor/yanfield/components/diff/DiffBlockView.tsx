"use client";

/**
 * 单个 diff 块的展示：新增块（绿底）/ 删除块（红底删除线）/ 修改块（行内 diff）。
 * 左上角勾选框控制该块是否被接受；纯展示模式隐藏勾选框。
 */
import { Check } from "lucide-react";
import type { BlockChange } from "@/lib/diff/blocks";
import { cn } from "@/lib/ui/cn";
import { InlineDiffText } from "./InlineDiffText";

export const BLOCK_TYPE_LABEL: Record<BlockChange["type"], string> = {
  added: "新增",
  removed: "删除",
  changed: "修改",
};

const BLOCK_TYPE_CLASS: Record<BlockChange["type"], string> = {
  added: "bg-success/10 text-success",
  removed: "bg-danger/10 text-danger",
  changed: "bg-gold-soft text-gold",
};

export interface DiffBlockViewProps {
  item: BlockChange;
  /** 从 0 开始的块序号（展示时 +1） */
  index: number;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  /** 纯展示模式：不显示勾选框 */
  readOnly?: boolean;
  className?: string;
}

export function DiffBlockView({
  item,
  index,
  checked,
  onToggle,
  readOnly = false,
  className,
}: DiffBlockViewProps) {
  const typeLabel = BLOCK_TYPE_LABEL[item.type] ?? item.type;
  const previewText = item.afterText ?? item.beforeText ?? "";
  const charCount = previewText.replace(/\s+/g, "").length;

  return (
    <div
      className={cn(
        "rounded-md border transition-colors duration-150",
        checked
          ? "border-line bg-surface"
          : "border-line bg-surface-2/60 opacity-60 hover:opacity-80",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
        {readOnly ? null : (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`接受第 ${index + 1} 块改动`}
            onClick={() => onToggle(!checked)}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
              checked
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-strong bg-surface text-transparent hover:border-accent/50",
            )}
          >
            <Check className="size-3" />
          </button>
        )}
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
            BLOCK_TYPE_CLASS[item.type],
          )}
        >
          {typeLabel}
        </span>
        <span className="text-[10.5px] text-ink-4">第 {index + 1} 块</span>
        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-4">
          {charCount} 字
        </span>
      </div>

      <div className="scroll-thin max-h-64 overflow-y-auto px-3 py-2 font-serif text-[14px] leading-[1.95] text-ink-2">
        {item.type === "added" ? (
          <div className="diff-add whitespace-pre-wrap break-words rounded-sm px-1.5 py-0.5">
            {item.afterText ?? "（空段落）"}
          </div>
        ) : item.type === "removed" ? (
          <div className="diff-del whitespace-pre-wrap break-words rounded-sm px-1.5 py-0.5">
            {item.beforeText ?? "（空段落）"}
          </div>
        ) : item.inline && item.inline.length > 0 ? (
          <InlineDiffText parts={item.inline} />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="diff-del whitespace-pre-wrap break-words rounded-sm px-1.5 py-0.5">
              {item.beforeText ?? ""}
            </div>
            <div className="diff-add whitespace-pre-wrap break-words rounded-sm px-1.5 py-0.5">
              {item.afterText ?? ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
