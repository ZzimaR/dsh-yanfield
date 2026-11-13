"use client";

import * as React from "react";
import { estimateAiCost, formatCny, type TokenPrice } from "@/lib/ai/cost";
import { t } from "@/lib/i18n";
import { formatTokens } from "./utils";

export function describeAiSpend(promptTokens: number, completionTokens: number, price: TokenPrice, cache: {cachedInputTokens?:number;cacheReportedInputTokens?:number}={}): string {
  const tokens = t("输入 {input} · 输出 {output}", { input: formatTokens(promptTokens), output: formatTokens(completionTokens) });
  const cost = estimateAiCost(promptTokens, completionTokens, price,cache);
  return cost == null ? tokens : t("{tokens} · 约 {cost}", { tokens, cost: formatCny(cost) });
}

export function AiSpendLine({
  promptTokens,
  completionTokens,
  calls,
  price,
  prefix,
  cachedInputTokens,cacheReportedInputTokens,
}: {
  promptTokens: number;
  completionTokens: number;
  calls?: number;
  price: TokenPrice;
  prefix: string;
  cachedInputTokens?:number;cacheReportedInputTokens?:number;
}) {
  const detail = describeAiSpend(promptTokens, completionTokens, price,{cachedInputTokens,cacheReportedInputTokens});
  const times = calls != null ? t(" · {calls} 次", { count: calls, calls }) : "";
  return (
    <p className="text-[12.5px] tabular-nums text-ink-2">
      <span className="text-ink-3">{prefix}</span>
      {detail}
      {times}
    </p>
  );
}
