import type {ProviderKind} from "@/lib/types";

/**
 * 砚田只保留 DeepSeek 与离线演示两种 Provider。
 * 旧数据库里可能还存着 "openai" / "anthropic" / "gemini" / "ollama" 等历史类型，
 * 读取时统一归一到 DeepSeek（用户此前的真实服务多是 baseUrl 指向 api.deepseek.com 的 "openai"），
 * 不改写数据库，避免升级后配置丢失。
 */
export function normalizeProviderKind(raw: unknown): ProviderKind {
  if (raw === "demo") return "demo";
  if (raw === "harness") return "harness";
  return "deepseek";
}
