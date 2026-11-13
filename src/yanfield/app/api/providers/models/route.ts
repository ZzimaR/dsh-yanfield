/**
 * POST /api/providers/models
 * 用当前（可以是未保存的）服务配置向服务商拉取真实模型列表：
 * - 已保存的 Provider 只需传 providerId（可带新的 baseUrl / kind / apiKey 覆盖草稿）
 * - 新建 Provider 时传 kind + baseUrl + apiKey 即可预览，不写入数据库
 */
import { ProviderError, listProviderModels, redactProviderEndpoint } from "@/lib/ai/provider";
import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ProviderConfig, ProviderKind } from "@/lib/types";
import { PROVIDER_KINDS, isMaskedApiKey } from "@/app/api/_lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_KINDS_SET = new Set<string>(PROVIDER_KINDS);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const POST = handle(async (request) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("请求体不是合法 JSON");
  const providerId = str(body.providerId);
  const stored = providerId ? repo.getProvider(providerId) : undefined;
  if (providerId && !stored) return bad("模型服务不存在", 404);
  const kind = (str(body.kind) || stored?.kind || "deepseek") as ProviderKind;
  if (!PROVIDER_KINDS_SET.has(kind)) return bad("不支持的服务类型");

  const rawKey = str(body.apiKey);
  const apiKey = rawKey && !isMaskedApiKey(rawKey) ? rawKey : (stored?.apiKey ?? "");
  if (!apiKey && kind !== "demo" && kind !== "harness") {
    return bad("请先填写 API Key，再拉取模型列表");
  }
  const now = new Date().toISOString();
  const draft: ProviderConfig = {
    id: stored?.id ?? "draft",
    name: stored?.name ?? "draft",
    kind,
    baseUrl: str(body.baseUrl) || stored?.baseUrl || "",
    apiKey,
    models: stored?.models ?? [],
    enabled: stored?.enabled ?? true,
    createdAt: stored?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    const result = await listProviderModels(draft);
    return ok({
      models: result.models,
      endpoint: redactProviderEndpoint(result.endpoint),
      count: result.models.length,
      providerId: stored?.id ?? null,
      kind,
      baseUrl: redactProviderEndpoint(draft.baseUrl),
    });
  } catch (error) {
    if (error instanceof ProviderError) return bad(error.message, error.status);
    return bad(error instanceof Error ? error.message : "拉取模型列表失败", 500);
  }
});
