/**
 * 让砚田里保存的 harness 服务跟上宿主当前的模型目录。
 *
 * 宿主（DSH）升级后可能多出模型（例如 deepseek-v4-pro），而砚田的 provider 记录是
 * 第一次创建时写下的快照。这里在读取服务列表时顺手对一次目录，避免用户看到
 * 「只有一个模型」却找不到地方刷新。
 */
import { getHarnessBridge, harnessRouteOf } from "@/lib/ai/harness-bridge";
import * as repo from "@/lib/repo";
import type { ModelOption, ProviderConfig } from "@/lib/types";

function toModelOptions(models: { id: string; label: string; contextWindow?: number }[]): ModelOption[] {
  return models.map((model) => ({
    id: model.id,
    label: model.label,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
  }));
}

function sameModels(left: ModelOption[], right: ModelOption[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((model, index) => model.id === right[index]?.id && model.label === right[index]?.label);
}

/**
 * 把 harness 服务的模型列表同步成宿主目录；返回是否有改动。
 * 目录读不到（宿主没有 llm 服务、正在启动）时保持原样，不阻塞列表接口。
 */
export async function syncHarnessModels(provider: ProviderConfig): Promise<ProviderConfig> {
  if (provider.kind !== "harness") return provider;
  const route = harnessRouteOf(provider.baseUrl);
  const bridge = getHarnessBridge();
  if (!route || !bridge) return provider;
  try {
    const discovered = await bridge.discoverModels(route);
    const models = toModelOptions(discovered);
    if (models.length === 0 || sameModels(models, provider.models)) return provider;
    repo.updateProvider(provider.id, { models });
    return { ...provider, models };
  } catch {
    return provider;
  }
}

/** 列表接口用：对每个 harness 服务做一次目录对齐。 */
export async function syncAllHarnessModels(providers: ProviderConfig[]): Promise<ProviderConfig[]> {
  const synced: ProviderConfig[] = [];
  for (const provider of providers) {
    synced.push(await syncHarnessModels(provider));
  }
  return synced;
}
