import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ProviderConfig } from "@/lib/types";
import { isObject, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";
import { PROVIDER_KINDS, isMaskedApiKey, maskProvider } from "@/app/api/_lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_FIELDS: FieldSpec = {
  name: "str",
  baseUrl: "str",
  apiKey: "str",
  models: "json",
  enabled: "bool",
};

function invalidModels(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.some((item) => !isObject(item) || typeof item.id !== "string" || typeof item.label !== "string");
}

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const provider = repo.getProvider(params.id);
  if (!provider) return notFound("模型服务不存在");
  return ok(maskProvider(provider));
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getProvider(params.id);
  if (!current) return notFound("模型服务不存在");

  const body = await readBody(request);
  const patch = pickFields<ProviderConfig>(body, PROVIDER_FIELDS);
  const kind = pickEnum(body, "kind", PROVIDER_KINDS, "服务类型");
  if (kind) patch.kind = kind;
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return bad("服务名称不能为空");
  }
  if (patch.models !== undefined && invalidModels(patch.models)) {
    return bad("models 格式不正确，应为 [{ id, label }] 数组");
  }
  // apiKey 传空串 / undefined / 掩码值都表示「不修改」
  if (typeof patch.apiKey === "string") {
    const value = patch.apiKey.trim();
    if (!value || isMaskedApiKey(value)) delete patch.apiKey;
  }
  if (Object.keys(patch).length === 0) return ok(maskProvider(current));
  return ok(maskProvider(repo.updateProvider(params.id, patch)));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getProvider(params.id)) return notFound("模型服务不存在");
  repo.deleteProvider(params.id);

  // 清理设置中指向该 provider 的模型引用，避免前端引用悬空 id
  const settings = repo.getSettings();
  const chat = { ...settings.models.chat };
  const prose = { ...settings.models.prose };
  let changed = false;
  if (chat.providerId === params.id) {
    chat.providerId = null;
    chat.model = "";
    changed = true;
  }
  if (prose.providerId === params.id) {
    prose.providerId = null;
    prose.model = "";
    changed = true;
  }
  if (changed) repo.saveSettings({ models: { chat, prose } });

  return ok({ ok: true });
});
