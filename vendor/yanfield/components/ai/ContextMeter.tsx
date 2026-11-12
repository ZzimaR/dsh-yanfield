"use client";

/**
 * 上下文用量条 + 预览数据 hook。
 * 面板通过 useContextPreview 拉取 POST /api/ai/context（随章节与 ContextConfig 自动重算），
 * ContextMeter 只负责展示「已用 x / y tokens」进度条，点击由面板打开 ContextDrawer。
 */
import * as React from "react";
import { ChevronUp, Gauge } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import type { ContextConfig } from "@/lib/types";
import { Skeleton } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import type { ContextPreview, MentionRef } from "./types";
import { formatTokens, normalizeContextPreview } from "./utils";
import { budgetLabel } from "./model-info";

export interface UseContextPreviewOptions {
  novelId: string;
  chapterId?: string | null;
  config: ContextConfig;
  getSelection?: () => string;
  mentions?: MentionRef[];
  enabled?: boolean;
}

export interface UseContextPreviewResult {
  data: ContextPreview | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useContextPreview({
  novelId,
  chapterId,
  config,
  getSelection,
  mentions = [],
  enabled = true,
}: UseContextPreviewOptions): UseContextPreviewResult {
  const [data, setData] = React.useState<ContextPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const configKey = React.useMemo(() => JSON.stringify(config), [config]);
  const mentionsKey = React.useMemo(() => JSON.stringify(mentions), [mentions]);

  React.useEffect(() => {
    if (!enabled || !novelId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const selection = getSelection?.().trim();
    setData(null);
    // 注意：服务端请求字段是 context（不是 config）；响应结构与 UI 结构不同，统一归一化
    apiPost<unknown>("/api/ai/context", {
      novelId,
      chapterId: chapterId ?? null,
      context: config,
      selection: selection || undefined,
      mentions,
    })
      .then((result) => {
        if (alive) setData(normalizeContextPreview(result));
      })
      .catch((err: unknown) => {
        if (alive) {
          setData(null);
          setError(err instanceof Error ? err.message : "上下文预览不可用");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // config 通过序列化 key 参与依赖，避免对象引用变化导致重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, chapterId, configKey, mentions, mentionsKey, getSelection, enabled, tick]);

  const refresh = React.useCallback(() => setTick((prev) => prev + 1), []);
  return { data, loading, error, refresh };
}

export interface ContextMeterProps {
  data: ContextPreview | null;
  loading?: boolean;
  error?: string | null;
  onOpen: () => void;
  /** 当前配置的预算（覆盖预览接口返回的 budget，改预算后立即反映） */
  budget?: number;
  className?: string;
}

export function ContextMeter({ data, loading = false, error, onOpen, budget, className }: ContextMeterProps) {
  const total = data?.totalTokens ?? 0;
  const activeBudget = typeof budget === "number" ? budget : (data?.budget ?? 0);
  const percent = activeBudget > 0 ? Math.min(100, Math.round((total / activeBudget) * 100)) : 0;
  const toneClass = percent >= 85 ? "bg-danger" : percent >= 60 ? "bg-gold" : "bg-jade";

  return (
    <button
      type="button"
      onClick={onOpen}
      title="查看上下文分节明细"
      className={cn(
        "group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
        className,
      )}
    >
      <Gauge className="size-3.5 shrink-0 text-ink-3 dark:text-ink-2" />
      <span className="shrink-0 text-[11px] text-ink-3 dark:text-ink-2">上下文</span>

      {loading && !data ? (
        <Skeleton className="h-1.5 flex-1" />
      ) : error && !data ? (
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-4 dark:text-ink-3" title={error}>
          预览不可用（点击查看）
        </span>
      ) : data ? (
        <>
          <span className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-300", toneClass)}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-3 dark:text-ink-2">
            {activeBudget > 0
              ? `已用 ${formatTokens(total)} / ${budgetLabel(activeBudget)} tokens · ${percent}%`
              : `已用 ${formatTokens(total)} tokens · 不限制`}
          </span>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-4 dark:text-ink-3">点击预览上下文</span>
      )}

      <ChevronUp className="size-3 shrink-0 text-ink-4 transition-transform duration-150 group-hover:-translate-y-0.5 dark:text-ink-3" />
    </button>
  );
}
