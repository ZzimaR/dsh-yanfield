"use client";

/**
 * 正文类 action 的确认弹窗（插入 / 追加 / 替换选区）。
 * 只做「确认 + 预览 + 复制」，真正写入正文由调用方通过 EditorBridge 执行；
 * 编辑器不可用时禁用应用按钮并提示，避免静默修改作者正文。
 */
import * as React from "react";
import { CircleAlert, Copy, Info } from "lucide-react";
import { Badge, Button, Dialog, useToast } from "@/components/ui/kit";
import { cn, stripHtml } from "@/lib/ui/cn";
import type { PendingAction } from "./types";
import { ACTION_LABEL } from "./utils";

/** 各 action 的写入位置说明 */
const TARGET_HINT: Record<PendingAction["action"]["type"], string> = {
  "agent-run": "任务与改动",
  insert: "写入位置：编辑器当前光标处",
  append: "写入位置：当前章节末尾",
  "replace-selection": "写入位置：替换编辑器当前选中的正文",
  "replace-chapter": "写入位置：整章替换（需逐块审阅）",
  "save-archive": "该操作需在「档案」页面确认保存",
  "save-outline": "该操作需在「大纲」页面确认保存",
  "save-entity": "该操作需在「设定」页面确认保存",
  "save-blueprint": "该操作需在「章纲」页面确认保存",
};

export interface ActionReviewProps {
  /** 待确认的 action；null 表示关闭 */
  pending: PendingAction | null;
  onClose: () => void;
  onApply: () => void;
  /** 编辑器 bridge 是否可用（不可用时禁用应用） */
  canApply: boolean;
  /** 不可用原因提示 */
  applyDisabledHint?: string;
  applying?: boolean;
}

export function ActionReview({
  pending,
  onClose,
  onApply,
  canApply,
  applyDisabledHint = "当前页面没有可用的编辑器，无法写入正文。可先复制内容，回到编辑器后手动粘贴。",
  applying = false,
}: ActionReviewProps) {
  const { toast } = useToast();
  const [copying, setCopying] = React.useState(false);

  if (!pending) return null;
  const { action, text } = pending;
  const preview = stripHtml(text);
  const hint = TARGET_HINT[action.type] ?? "该操作需要人工确认";

  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(preview);
      toast({ title: "已复制到剪贴板", tone: "success" });
    } catch {
      toast({ title: "复制失败", description: "浏览器未授予剪贴板权限", tone: "error" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`确认应用：${ACTION_LABEL[action.type] ?? action.label}`}
      description={hint}
      width={620}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy className="size-3" />}
            loading={copying}
            onClick={() => void copy()}
          >
            复制内容
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={applying}
              disabled={!canApply}
              title={canApply ? undefined : applyDisabledHint}
              onClick={onApply}
            >
              应用到正文
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{ACTION_LABEL[action.type] ?? action.type}</Badge>
          {action.label && action.label !== ACTION_LABEL[action.type] ? (
            <span className="text-[11px] text-ink-4">{action.label}</span>
          ) : null}
          <span className="ml-auto text-[11px] tabular-nums text-ink-4">
            {preview.length} 字
          </span>
        </div>

        {!canApply ? (
          <div className="flex items-start gap-1.5 rounded-md border border-gold/30 bg-gold-soft px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <span className="min-w-0 flex-1">{applyDisabledHint}</span>
          </div>
        ) : (
          <div className="flex items-start gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
            <span className="min-w-0 flex-1">
              AI 生成内容将写入正文，请先通读确认；应用后仍可使用编辑器的撤销操作。
            </span>
          </div>
        )}

        <div
          className={cn(
            "scroll-thin max-h-[46vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-paper px-3 py-2.5",
            "font-serif text-[14px] leading-[1.95] text-ink-2",
          )}
        >
          {preview || "（内容为空）"}
        </div>
      </div>
    </Dialog>
  );
}
