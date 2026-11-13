import type { AppSettings } from "@/lib/types";

export type ModelSettings = AppSettings["models"];

/**
 * 对话和写作共用一个默认模型。
 * 旧数据里 chat / prose 可能不一致：有 chat 就以 chat 为准，否则沿用 prose。
 */
export function unifyModelSettings(models: Partial<ModelSettings> | undefined): ModelSettings {
  const chat = models?.chat ?? { providerId: null, model: "" };
  const prose = models?.prose ?? { providerId: null, model: "" };
  const chatSet = Boolean(chat.providerId || chat.model);
  const chosen = chatSet ? chat : prose;
  const slot = { providerId: chosen.providerId ?? null, model: chosen.model ?? "" };
  return { chat: { ...slot }, prose: { ...slot } };
}
