/**
 * 设置页共享工具：类型标签、模型列表解析、设置深合并。
 * 纯函数，无 React 依赖。
 */

import type { AppSettings, ModelOption, ProviderKind } from "@/lib/types";

export interface ProviderKindOption {
  value: ProviderKind;
  label: string;
  hint: string;
  defaultBaseUrl: string;
}

/**
 * 本构建只保留两种接入类型：DeepSeek 官方接口与离线演示。
 * 其他服务商适配已移除，不再出现在任何新增 / 编辑入口。
 */
export const PROVIDER_KINDS: ProviderKindOption[] = [
  {
    value: "deepseek",
    label: "DeepSeek",
    hint: "DeepSeek 官方接口。Base URL 使用官方地址 https://api.deepseek.com 才能查询账户余额。",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  {
    value: "harness",
    label: "DeepSeek Harness",
    hint: "使用 Harness 里已经配置好的模型，不需要再填一把 API Key。",
    defaultBaseUrl: "harness:deepseek",
  },
  {
    value: "demo",
    label: "离线演示",
    hint: "无需网络与密钥，用内置示例文本跑通全部流程。",
    defaultBaseUrl: "",
  },
];

export function providerKindLabel(kind: ProviderKind): string {
  if (kind === "demo") return "离线演示模式";
  if (kind === "harness") return "DeepSeek Harness";
  return PROVIDER_KINDS.find((item) => item.value === kind)?.label ?? "DeepSeek";
}

/** "id" 或 "id | 显示名"，按逗号/换行分隔；去重保序。 */
export function parseModels(text: string): ModelOption[] {
  const seen = new Set<string>();
  const models: ModelOption[] = [];
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [rawId, rawLabel] = item.split("|").map((part) => part.trim());
      const id = rawId ?? "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      models.push({ id, label: rawLabel || id });
    });
  return models;
}

export function modelsToText(models: ModelOption[] | undefined): string {
  if (!models || models.length === 0) return "";
  return models.map((model) => (model.label && model.label !== model.id ? `${model.id} | ${model.label}` : model.id)).join("\n");
}

/** 与 /api/settings PATCH 的深合并语义保持一致（defaultContext / models / customAgent）。 */
export function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...current,
    ...patch,
    defaultContext: patch.defaultContext ? { ...current.defaultContext, ...patch.defaultContext } : current.defaultContext,
    models: patch.models
      ? {
          chat: { ...current.models.chat, ...patch.models.chat },
          prose: { ...current.models.prose, ...patch.models.prose },
        }
      : current.models,
    customAgent: patch.customAgent ? { ...current.customAgent, ...patch.customAgent } : current.customAgent,
    aiPricing: patch.aiPricing ? { ...current.aiPricing, ...patch.aiPricing } : current.aiPricing,
  };
}

/** 合并两次 patch（用于 debounce 期间累积改动）。 */
export function mergePatches(
  pending: Partial<AppSettings>,
  patch: Partial<AppSettings>,
): Partial<AppSettings> {
  const next: Partial<AppSettings> = { ...pending, ...patch };
  if (pending.defaultContext || patch.defaultContext) {
    next.defaultContext = { ...(pending.defaultContext ?? {}), ...(patch.defaultContext ?? {}) } as AppSettings["defaultContext"];
  }
  if (pending.models || patch.models) {
    next.models = {
      chat: { ...(pending.models?.chat ?? {}), ...(patch.models?.chat ?? {}) },
      prose: { ...(pending.models?.prose ?? {}), ...(patch.models?.prose ?? {}) },
    } as AppSettings["models"];
  }
  if (pending.customAgent || patch.customAgent) {
    next.customAgent = { ...(pending.customAgent ?? {}), ...(patch.customAgent ?? {}) } as AppSettings["customAgent"];
  }
  if (pending.aiPricing || patch.aiPricing) {
    next.aiPricing = { ...(pending.aiPricing ?? {}), ...(patch.aiPricing ?? {}) } as AppSettings["aiPricing"];
  }
  return next;
}
