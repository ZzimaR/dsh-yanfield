"use client";

import * as React from "react";
import { estimateAiCost, formatCny, type TokenPrice } from "@/lib/ai/cost";
import { formatTokens } from "./utils";

export function describeAiSpend(promptTokens: number, completionTokens: number, price: TokenPrice, cache: {cachedInputTokens?:number;cacheReportedInputTokens?:number}={}): string {
  const tokens = `输入 ${formatTokens(promptTokens)} · 输出 ${formatTokens(completionTokens)}`;
  const cost = estimateAiCost(promptTokens, completionTokens, price,cache);
  return cost == null ? tokens : `${tokens} · 约 ${formatCny(cost)}`;
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
  const times = calls != null ? ` · ${calls} 次` : "";
  return (
    <p className="text-[12.5px] tabular-nums text-ink-2">
      <span className="text-ink-3">{prefix}</span>
      {detail}
      {times}
    </p>
  );
}
