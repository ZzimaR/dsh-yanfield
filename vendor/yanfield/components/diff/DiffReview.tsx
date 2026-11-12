"use client";

/**
 * 逐块 diff 审阅：接收修改前/后的 HTML，用 diffBlocks 拆块渲染，
 * 作者逐块勾选后通过 applyBlockDiff 生成新 HTML 交给编辑器 bridge。
 * - mode="dialog"：弹窗审阅（AI 正文类 action 默认入口）
 * - mode="inline"：内嵌展示，可用于编辑器侧栏 / 任务完成预览
 * - readOnly=true：纯展示模式（复用同一套 DiffBlockView）
 */
import * as React from "react";
import { FileText } from "lucide-react";
import { Button, Dialog, EmptyState } from "@/components/ui/kit";
import { applyBlockDiff, diffBlocks, type BlockDiff } from "@/lib/diff/blocks";
import { cn } from "@/lib/ui/cn";
import { DiffBlockView } from "./DiffBlockView";

export interface DiffReviewProps {
  open: boolean;
  beforeHtml: string;
  afterHtml: string;
  title?: string;
  description?: string;
  mode?: "dialog" | "inline";
  /** 纯展示：隐藏勾选与操作 */
  readOnly?: boolean;
  /** 编辑器是否支持整章写回（bridge.setHtml 缺失时置 false） */
  canApply?: boolean;
  applyDisabledHint?: string;
  onClose?: () => void;
  onApply?: (html: string, acceptedIds: string[]) => void;
  className?: string;
}

const EMPTY_DIFF: BlockDiff = { items: [], added: 0, removed: 0, changed: 0 };

export function DiffReview({
  open,
  beforeHtml,
  afterHtml,
  title,
  description,
  mode = "dialog",
  readOnly = false,
  canApply = true,
  applyDisabledHint,
  onClose,
  onApply,
  className,
}: DiffReviewProps) {
  // 弹窗关闭时不计算 diff，避免无谓的逐块比较
  const diff = React.useMemo<BlockDiff>(() => {
    if (mode === "dialog" && !open) return EMPTY_DIFF;
    return diffBlocks(beforeHtml, afterHtml);
  }, [mode, open, beforeHtml, afterHtml]);

  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());

  // 每次重新计算 diff（或重新打开）默认全选
  React.useEffect(() => {
    if (mode === "dialog" && !open) return;
    setAccepted(new Set(diff.items.map((item) => item.id)));
  }, [diff, mode, open]);

  const selectAll = React.useCallback(() => {
    setAccepted(new Set(diff.items.map((item) => item.id)));
  }, [diff.items]);

  const clearAll = React.useCallback(() => setAccepted(new Set()), []);

  const toggle = React.useCallback((id: string, checked: boolean) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const apply = React.useCallback(() => {
    if (!onApply || !canApply || accepted.size === 0) return;
    const ids = diff.items.filter((item) => accepted.has(item.id)).map((item) => item.id);
    onApply(applyBlockDiff(beforeHtml, diff, ids), ids);
  }, [accepted, applyBlockDiff, beforeHtml, canApply, diff, onApply]);

  const summary = (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
      <span className="text-[11px] text-ink-3">共 {diff.items.length} 块改动</span>
      {diff.added > 0 ? (
        <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10.5px] text-success">
          新增 {diff.added} 处
        </span>
      ) : null}
      {diff.removed > 0 ? (
        <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10.5px] text-danger">
          删除 {diff.removed} 处
        </span>
      ) : null}
      {diff.changed > 0 ? (
        <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[10.5px] text-gold">
          修改 {diff.changed} 处
        </span>
      ) : null}
      {readOnly ? null : (
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={selectAll} disabled={diff.items.length === 0}>
            全选
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={accepted.size === 0}>
            全不选
          </Button>
        </div>
      )}
    </div>
  );

  const blocks =
    diff.items.length === 0 ? (
      <EmptyState
        icon={<FileText className="size-5" />}
        title="没有可审阅的改动"
        description="AI 输出与当前正文一致，无需应用。"
      />
    ) : (
      <div className="flex flex-col gap-2">
        {diff.items.map((item, index) => (
          <DiffBlockView
            key={item.id}
            item={item}
            index={index}
            checked={readOnly || accepted.has(item.id)}
            onToggle={(checked) => toggle(item.id, checked)}
            readOnly={readOnly}
          />
        ))}
      </div>
    );

  const disabledHint = applyDisabledHint ?? "当前页面没有可写入的编辑器";

  if (mode === "inline") {
    return (
      <div className={cn("rounded-md border border-line bg-surface p-3", className)}>
        <div className="mb-2">
          <div className="font-serif text-[14px] text-ink">{title ?? "改动预览"}</div>
          {description ? (
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{description}</div>
          ) : null}
        </div>
        {summary}
        <div className="mt-2">{blocks}</div>
        {readOnly || !onApply ? null : (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-ink-4">
              {canApply ? `已选 ${accepted.size} / ${diff.items.length} 块` : disabledHint}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={apply}
              disabled={!canApply || accepted.size === 0}
              title={!canApply ? disabledHint : undefined}
            >
              应用到正文（接受 {accepted.size} 项）
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!open) return null;

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-[11px] text-ink-4">
        {canApply ? `将应用已勾选的 ${accepted.size} 项改动，未勾选的保持原样` : disabledHint}
      </span>
      <Button variant="ghost" size="sm" onClick={onClose ?? (() => undefined)}>
        取消
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={apply}
        disabled={!canApply || accepted.size === 0}
        title={!canApply ? disabledHint : undefined}
      >
        应用到正文（接受 {accepted.size} 项）
      </Button>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose ?? (() => undefined)}
      title={title ?? "逐块审阅 AI 改动"}
      description={
        description ??
        `AI 改动了 ${diff.items.length} 块内容，请逐块确认；只有勾选的块会被写入正文。`
      }
      footer={footer}
      width={820}
    >
      <div className="flex flex-col gap-3">
        {summary}
        {blocks}
      </div>
    </Dialog>
  );
}
