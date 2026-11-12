"use client";

import type { AppSettings, ContextConfig, ModelOption, ProviderConfig } from "@/lib/types";
import { DEFAULT_CONTEXT_CONFIG } from "@/lib/types";
import { formatTokens } from "./utils";

/**
 * 模型与上下文预算相关的纯工具（不依赖 React，方便面板 / 任务条 / 抽屉共用）。
 * 预算语义与服务端 lib/ai/context.ts 一致：contextBudget（token），0 = 不限制。
 */

/** 与服务端默认上下文预算保持一致 */
export const DEFAULT_CONTEXT_BUDGET: number = DEFAULT_CONTEXT_CONFIG.contextBudget;

export interface BudgetOption {
  value: number;
  label: string;
}

/** 上下文预算分段：不限（0）/ 96k / 128k / 256k / 512k */
export const BUDGET_OPTIONS: BudgetOption[] = [
  { value: 0, label: "不限" },
  { value: 96000, label: "96k" },
  { value: 128000, label: "128k" },
  { value: 256000, label: "256k" },
  { value: 512000, label: "512k" },
];

/** 预算 → 可读文案（0 显示「不限」；命中预设时用预设短名） */
export function budgetLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || value <= 0) return "不限";
  const preset = BUDGET_OPTIONS.find((option) => option.value === value);
  if (preset) return preset.label;
  return formatTokens(value);
}

/**
 * 读取设置里配置的上下文预算（settings.defaultContext.contextBudget）。
 * 返回 null 表示设置尚未加载或没有该字段（此时用预览接口返回的 budget）。
 */
export function readConfiguredBudget(settings?: AppSettings | null): number | null {
  if (!settings) return null;
  const raw = settings.defaultContext?.contextBudget;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  return null;
}

/** 把预算写回 ContextConfig（请求时随 AiChatRequest.context 传给服务端） */
export function withContextBudget(config: ContextConfig, budget: number): ContextConfig {
  return { ...config, contextBudget: Math.max(0, Math.round(budget)) };
}

export interface ModelTargetInfo {
  providerId: string;
  providerName: string;
  providerKind: ProviderConfig["kind"];
  model: string;
  modelLabel: string;
  /** 模型上下文窗口（tokens），模型目录提供时才有 */
  contextWindow: number | null;
  maxOutputTokens: number | null;
  /** 是否有可用的 Provider + 模型 */
  ready: boolean;
}

function readContextWindow(option: ModelOption | undefined): number | null {
  if (!option) return null;
  const raw = option.contextWindow;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  return null;
}

/**
 * 按后端 resolveTarget 的规则推导当前对话实际会用的 Provider / 模型：
 * 指定 provider（且已启用）→ demo → 第一个已启用 Provider。
 */
export function describeModelTarget(
  settings: AppSettings | null | undefined,
  providers: ProviderConfig[] | null | undefined,
  _role: "chat" | "prose" = "chat",
): ModelTargetInfo | null {
  if (!settings) return null;
  const setting = settings.models.chat;
  const enabled = (providers ?? []).filter((provider) => provider.enabled);
  const wanted = setting.providerId ? enabled.find((provider) => provider.id === setting.providerId) : undefined;
  const provider = wanted ?? enabled.find((item) => item.kind === "demo") ?? enabled[0];
  if (!provider) return null;

  const configured = setting.model ? provider.models.find((model) => model.id === setting.model) : undefined;
  const fallback: ModelOption | undefined =
    provider.models[0] ?? (provider.kind === "demo" ? { id: "yanfield-demo", label: "离线演示模型" } : undefined);
  const chosen = configured ?? fallback;

  if (!chosen) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.kind,
      model: "",
      modelLabel: "",
      contextWindow: null,
      maxOutputTokens: null,
      ready: false,
    };
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    providerKind: provider.kind,
    model: chosen.id,
    modelLabel: chosen.label || chosen.id,
    contextWindow: readContextWindow(chosen),
    maxOutputTokens: typeof chosen.maxOutputTokens === "number" && chosen.maxOutputTokens > 0
      ? Math.round(chosen.maxOutputTokens)
      : null,
    ready: true,
  };
}

export function recommendedContextBudget(
  contextWindow: number | null | undefined,
  maxOutputTokens: number | null | undefined,
): number | null {
  if (!contextWindow || contextWindow <= 0) return null;
  const outputReserve = maxOutputTokens && maxOutputTokens > 0
    ? Math.min(maxOutputTokens, contextWindow)
    : Math.min(4096, Math.floor(contextWindow * 0.25));
  return Math.max(1000, Math.floor((contextWindow - outputReserve) * 0.4));
}

/** 顶部展示用的模型标识，如「DeepSeek / deepseek-chat」 */
export function formatModelTarget(target: ModelTargetInfo | null): string {
  if (!target || !target.providerName) return "";
  return target.model ? `${target.providerName} / ${target.model}` : target.providerName;
}
