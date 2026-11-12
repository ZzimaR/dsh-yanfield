import { inputBreakdown, type CacheUsage } from "./cache-usage";
/** 按用户填写的单价估算费用。单价为 0 时返回 null，表示只统计 token、不显示金额。 */
export interface TokenPrice {
  cachedInputPerMillion?: number | null;
  inputPerMillion: number;
  outputPerMillion: number;
}

export function estimateAiCost(promptTokens: number, completionTokens: number, price: TokenPrice, cache:CacheUsage={}): number | null {
  const inputRate = Number(price.inputPerMillion);
  const outputRate = Number(price.outputPerMillion);
  if (!Number.isFinite(inputRate)||!Number.isFinite(outputRate))return null;
  if (!(inputRate > 0) && !(outputRate > 0) && !((price.cachedInputPerMillion??0)>0)) return null;
  const prompt = Math.max(0, promptTokens);
  const completion = Math.max(0, completionTokens);
  const {cached}=inputBreakdown(prompt,cache);
  if(cached>0 && (price.cachedInputPerMillion==null || !Number.isFinite(price.cachedInputPerMillion) || price.cachedInputPerMillion<0))return null;
  const amount = ((prompt-cached) / 1_000_000) * Math.max(0, inputRate) + (cached/1_000_000)*Math.max(0,price.cachedInputPerMillion??0) + (completion / 1_000_000) * Math.max(0, outputRate);
  return Math.round(amount * 100000000) / 100000000;
}

export function formatCny(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "¥0";
  if (amount < 0.000001) return "¥<0.000001";
  if (amount < 0.0001) return `¥${amount.toFixed(6)}`;
  if (amount < 0.01) return `¥${amount.toFixed(4)}`;
  if (amount < 1) return `¥${amount.toFixed(3)}`;
  return `¥${amount.toFixed(2)}`;
}
