"use client";

/**
 * 上下文明细抽屉：
 * 展示 POST /api/ai/context 返回的分节（章节正文 / 前情摘要 / 角色 / 设定 / 大纲 / 引用资料…），
 * 每节显示 token 用量与装配状态；能映射到 ContextConfig 的分节可直接开关，
 * 开关变化通过 onConfigChange 写回面板状态，并随下一条 AiChatRequest.context 生效。
 *
 * 服务端字段：{ sections: [{ id, label, text, tokens, included, truncated, priority }], tokens, budget, dropped }
 * 已由 normalizeContextPreview 归一化为 ContextPreview；本组件只用 id/label/tokens/text/mode，并对脏数据兜底。
 */
import * as React from "react";
import { CircleAlert, Layers, RefreshCw } from "lucide-react";
import type { ContextConfig } from "@/lib/types";
import { MAX_CONTEXT_BUDGET, MAX_OUTPUT_TOKENS } from "@/lib/types";
import { Badge, Button, Sheet, Skeleton, Switch } from "@/components/ui/kit";
import { cn, formatNumber, truncate } from "@/lib/ui/cn";
import type { ContextPreview, ContextSection } from "./types";
import { CHAPTER_SUMMARY_TOGGLE, resolveContextToggle } from "./utils";
import { BUDGET_OPTIONS, budgetLabel, recommendedContextBudget } from "./model-info";

/** 服务端只返回已启用的分节；这些已知布尔分节缺失时补一行「未启用」，方便重新打开 */
const KNOWN_FALLBACK_SECTIONS: Array<{ id: string; label: string }> = [
  { id: "novel-outline", label: "作品总纲" },
  { id: "volume-outline", label: "卷纲" },
  { id: "chapter-blueprint", label: "本章章纲" },
  { id: "chapter-summaries", label: "前情摘要" },
  { id: "archives", label: "故事档案" },
  { id: "characters", label: "角色资料" },
  { id: "world", label: "世界观设定" },
  { id: "foreshadows", label: "伏笔清单" },
  { id: "style", label: "文风指南" },
  { id: "selection", label: "选中片段" },
];

type DrawerSection = ContextSection & { fallback?: boolean };

/** 前情摘要走「开关 + 最近 N 章」组合控件，不做普通布尔开关 */
function isChapterSummarySection(section: ContextSection): boolean {
  const haystack = `${section.id} ${section.label}`.toLowerCase();
  return (
    haystack.includes("chapter-summaries") ||
    haystack.includes("chaptersummaries") ||
    haystack.includes("前情摘要") ||
    haystack.includes("前情回顾") ||
    haystack.includes("章节摘要")
  );
}

export interface ContextDrawerProps {
  open: boolean;
  onClose: () => void;
  data: ContextPreview | null;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
  config: ContextConfig;
  onConfigChange: (config: ContextConfig) => void;
  /** 当前生效的上下文预算（0=不限；来自设置 defaultContext.contextBudget / maxTokens） */
  budget?: number;
  /** 修改预算：由面板负责写回 settings.defaultContext 并刷新预览 */
  onBudgetChange?: (budget: number) => void;
  modelContextWindow?: number | null;
  modelMaxOutputTokens?: number | null;
}

export function ContextDrawer({
  open,
  onClose,
  data,
  loading = false,
  error,
  onRefresh,
  config,
  onConfigChange,
  budget,
  onBudgetChange,
  modelContextWindow,
  modelMaxOutputTokens,
}: ContextDrawerProps) {
  const total = data?.totalTokens ?? 0;
  const activeBudget = typeof budget === "number" ? budget : (data?.budget ?? 0);
  const percent = activeBudget > 0 ? Math.min(100, Math.round((total / activeBudget) * 100)) : 0;
  const toneText = percent >= 85 ? "text-danger" : percent >= 60 ? "text-gold" : "text-jade";
  const toneBg = percent >= 85 ? "bg-danger" : percent >= 60 ? "bg-gold" : "bg-jade";

  /** 预算下拉：预置 2k…128k/不限；若当前值不在列表里则补一项 */
  const budgetOptions = React.useMemo(() => {
    const recommended = recommendedContextBudget(modelContextWindow, modelMaxOutputTokens);
    const options = [...BUDGET_OPTIONS];
    if (recommended && recommended <= MAX_CONTEXT_BUDGET && !options.some((option) => option.value === recommended)) {
      options.push({ value: recommended, label: `建议 ${budgetLabel(recommended)}` });
    }
    if (options.some((option) => option.value === activeBudget)) return options;
    return [...options, { value: activeBudget, label: budgetLabel(activeBudget) }].sort(
      (left, right) => left.value - right.value,
    );
  }, [activeBudget, modelContextWindow, modelMaxOutputTokens]);
  const recommendedBudget = recommendedContextBudget(modelContextWindow, modelMaxOutputTokens);

  /** 合并「服务端已启用分节」与「已知但当前未启用的分节」，id 稳定且去重 */
  const rows = React.useMemo<DrawerSection[]>(() => {
    const base: DrawerSection[] = (data?.sections ?? []).filter(
      (section): section is ContextSection => Boolean(section) && typeof section.id === "string" && section.id.length > 0,
    );
    const present = new Set(base.map((section) => section.id));
    const merged = [...base];
    for (const fallback of KNOWN_FALLBACK_SECTIONS) {
      if (!present.has(fallback.id)) {
        merged.push({ id: fallback.id, label: fallback.label, tokens: 0, included: false, fallback: true });
      }
    }
    return merged;
  }, [data]);

  const summaryCountOptions = React.useMemo(() => {
    const values = new Set([1, 2, 3, 5, 8, 10, config.includeChapterSummaries]);
    return Array.from(values)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
  }, [config.includeChapterSummaries]);

  // 抽屉关闭时不渲染（也避免对预览数据做多余计算）
  if (!open) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="上下文预览"
      width={420}
      footer={
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="size-3" />}
            loading={loading}
            onClick={onRefresh}
          >
            重新估算
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {/* 总览 */}
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 text-ink-2">
              已用 <span className="font-medium tabular-nums text-ink">{formatNumber(total)}</span>
              {activeBudget > 0 ? ` / ${formatNumber(activeBudget)} tokens` : " tokens"}
            </span>
            {activeBudget > 0 ? (
              <span className={cn("shrink-0 tabular-nums", toneText)}>{percent}%</span>
            ) : (
              <span className="shrink-0 text-ink-4 dark:text-ink-3">由模型决定</span>
            )}
          </div>
          {activeBudget > 0 ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full transition-all duration-300", toneBg)} style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-4 dark:text-ink-3">
            仅估算作品资料，不含系统提示和聊天记录。
          </p>

          <label className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-2">
            单次输出上限（0 为自动）
            <input type="number" min={0} max={MAX_OUTPUT_TOKENS} step={1} value={config.maxTokens}
              onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value))onConfigChange({...config,maxTokens:Math.min(MAX_OUTPUT_TOKENS,Math.max(0,Math.round(value)))});}}
              className="w-24 rounded-sm border border-line bg-surface px-1.5 py-1" />
          </label>
          {/* 上下文预算 */}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            <label
              htmlFor="context-budget"
              className="shrink-0 text-[11px] text-ink-2"
            >
              上下文预算
            </label>
            <select
              id="context-budget"
              value={activeBudget}
              disabled={!onBudgetChange || loading}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed) && parsed >= 0) onBudgetChange?.(Math.round(parsed));
              }}
              className={cn(
                "rounded-sm border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2 transition-colors duration-150",
                "focus-visible:border-accent/50 focus-visible:outline-none dark:[color-scheme:dark]",
                (!onBudgetChange || loading) && "cursor-not-allowed opacity-60",
              )}
              title="超出预算的分节会被服务端从低优先级开始丢弃"
            >
              {budgetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === 0 ? "由模型决定" : option.label}
                </option>
              ))}
            </select>
          </div>

          {modelContextWindow ? (
            <p className={cn(
              "mt-1 text-[10.5px] leading-relaxed",
              recommendedBudget && activeBudget > recommendedBudget ? "text-gold" : "text-ink-4 dark:text-ink-3",
            )}>
              当前模型窗口 {formatNumber(modelContextWindow)} tokens
              {recommendedBudget ? `；建议资料预算不超过 ${formatNumber(recommendedBudget)}` : ""}。
              发送时还会检查完整请求及输出预留。
            </p>
          ) : (
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-4 dark:text-ink-3">
              当前模型未提供上下文窗口信息，无法预估上限；发送时只能由服务商判断。
            </p>
          )}
        </div>

        {/* 分节明细 */}
        {error && !data ? (
          <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-[12px] text-danger">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <Button size="sm" variant="secondary" onClick={onRefresh}>
              重试
            </Button>
          </div>
        ) : loading && !data ? (
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-6 text-center">
            <Layers className="size-4 text-ink-4 dark:text-ink-3" />
            <p className="text-[12px] text-ink-3 dark:text-ink-2">还没有可装配的上下文</p>
            <p className="text-[11px] text-ink-4 dark:text-ink-3">
              补充章节、角色或设定后，这里会显示各分节的 token 占用。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-surface">
            {rows.map((section) => {
              const summary = isChapterSummarySection(section);
              const spec = summary ? CHAPTER_SUMMARY_TOGGLE : resolveContextToggle(section.id, section.label);
              const enabled = spec ? spec.get(config) : false;
              return (
                <div
                  key={section.id}
                  className={cn(
                    "border-b border-line px-2.5 py-2 last:border-b-0",
                    section.fallback && "bg-surface-2/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] text-ink">{section.label || section.id}</span>
                        {section.mode ? <Badge tone="default">{section.mode}</Badge> : null}
                        {section.fallback ? <Badge tone="default">{enabled ? "暂无可用内容" : "未启用"}</Badge> : null}
                        {section.truncated ? <Badge tone="gold">已截断</Badge> : null}
                        {!spec && section.included ? <Badge tone="default">自动包含</Badge> : null}
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3 dark:text-ink-2">
                          {section.tokens > 0 ? `${formatNumber(section.tokens)} tokens` : "—"}
                        </span>
                      </div>

                      {section.text ? (
                        <details className="group mt-1">
                          <summary className="cursor-pointer select-none text-[10.5px] text-ink-4 transition-colors hover:text-ink-2 dark:text-ink-3 dark:hover:text-ink-2">
                            查看装配内容
                          </summary>
                          <pre className="scroll-thin mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-surface-2 px-2 py-1.5 font-sans text-[11px] leading-relaxed text-ink-3 dark:text-ink-2">
                            {truncate(section.text, 800)}
                          </pre>
                        </details>
                      ) : null}

                      {summary && enabled ? (
                        <label className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-ink-4 dark:text-ink-3">
                          <span className="shrink-0">携带最近</span>
                          <select
                            value={config.includeChapterSummaries}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              onConfigChange({
                                ...config,
                                includeChapterSummaries:
                                  Number.isFinite(parsed) && parsed > 0 ? Math.min(10, Math.round(parsed)) : 3,
                              });
                            }}
                            className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2 transition-colors duration-150 focus-visible:border-accent/50 focus-visible:outline-none dark:[color-scheme:dark]"
                          >
                            {summaryCountOptions.map((count) => (
                              <option key={count} value={count}>
                                {count} 章
                              </option>
                            ))}
                          </select>
                          <span>的情节摘要</span>
                        </label>
                      ) : null}

                      {spec?.hint ? (
                        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-4 dark:text-ink-3">{spec.hint}</p>
                      ) : null}
                    </div>

                    {spec ? <div className="shrink-0 pt-0.5">
                      <Switch
                        aria-label={section.label || section.id}
                        checked={enabled}
                        onChange={(next) => onConfigChange({ ...config, ...spec.set(config, next) })}
                      />
                    </div> : null}
                  </div>
                </div>
              );
            })}

            {data?.dropped && data.dropped.length > 0 ? (
              <p className="px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-4 dark:text-ink-3">
                预算不足已省略：{data.dropped.join("、")}（可调高上下文预算或关闭部分分节）
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Sheet>
  );
}
