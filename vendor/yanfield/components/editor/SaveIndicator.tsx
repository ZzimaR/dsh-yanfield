"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import type { SaveState } from "@/lib/editor/types";

/** ISO 时间 → HH:mm（本地时区）；非法输入返回空串 */
export function formatClock(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface SaveIndicatorProps {
  state: SaveState;
  lastSavedAt: string | null;
  className?: string;
  /** 是否展示「未修改」这种安静状态 */
  showIdle?: boolean;
}

const BASE = "inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] tabular-nums";

/**
 * 保存状态指示：未保存 / 保存中… / 已保存 HH:mm / 保存失败。
 * 只做展示，不含业务逻辑。
 */
export function SaveIndicator({ state, lastSavedAt, className, showIdle = true }: SaveIndicatorProps) {
  const clock = formatClock(lastSavedAt);

  if (state === "saving") {
    return (
      <span className={cn(BASE, "text-ink-3", className)}>
        <Loader2 className="size-3 animate-spin" aria-hidden />
        保存中…
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className={cn(BASE, "text-danger", className)} title="保存失败，修改尚未写入数据库，可点击保存或按 Ctrl/Cmd+S 重试">
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        保存失败
      </span>
    );
  }

  if (state === "dirty") {
    return (
      <span className={cn(BASE, "text-gold", className)} title="有未保存的修改，可点击保存或按 Ctrl/Cmd+S">
        <span className="size-1.5 rounded-full bg-gold" aria-hidden />
        未保存
      </span>
    );
  }

  if (state === "saved" || (state === "idle" && clock)) {
    return (
      <span className={cn(BASE, "text-jade", className)}>
        <span className="size-1.5 rounded-full bg-jade" aria-hidden />
        已保存{clock ? ` ${clock}` : ""}
      </span>
    );
  }

  if (!showIdle) return null;
  return (
    <span className={cn(BASE, "text-ink-4", className)}>
      <span className="size-1.5 rounded-full bg-ink-4" aria-hidden />
      未修改
    </span>
  );
}
