/**
 * 模型服务（Provider）响应脱敏：GET/POST/PATCH 一律不回传明文 apiKey。
 */
import type { ProviderConfig, ProviderKind } from "@/lib/types";

export const PROVIDER_KINDS: readonly ProviderKind[] = ["deepseek", "demo", "harness"];

/** 掩码 API Key：sk-****abcd；短 key 只显示 ****；空 key 返回空串 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

/** 前端回传的掩码串（含 ****）不能被当成新 key 写库 */
export function isMaskedApiKey(value: string): boolean {
  return value.includes("****");
}

export type MaskedProvider = ProviderConfig & { apiKeyMasked: string; hasKey: boolean };

/** 脱敏后的 Provider：apiKey 恒为空串，另给 apiKeyMasked / hasKey */
export function maskProvider(provider: ProviderConfig): MaskedProvider {
  const { apiKey, ...rest } = provider;
  return {
    ...rest,
    apiKey: "",
    apiKeyMasked: maskApiKey(apiKey),
    hasKey: apiKey.trim().length > 0,
  };
}
