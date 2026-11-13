import { bad, handle, ok } from "@/lib/api-utils";
import { syncAllHarnessModels } from "@/lib/ai/model-sync";
import * as repo from "@/lib/repo";
import type { ProviderConfig } from "@/lib/types";
import { isObject, pickEnum, pickFields, readBody, requireString, type FieldSpec } from "@/app/api/_lib/http";
import { PROVIDER_KINDS, maskProvider } from "@/app/api/_lib/providers";

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

export const GET = handle(async () => {
  // harness 服务的模型列表跟着宿主目录走：DSH 新增模型时这里自动补上。
  const providers = await syncAllHarnessModels(repo.listProviders());
  return ok({ items: providers.map(maskProvider) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const name = requireString(body, "name", "服务名称").trim();
  if (!name) return bad("服务名称不能为空");
  const input = pickFields<ProviderConfig>(body, PROVIDER_FIELDS);
  const kind = pickEnum(body, "kind", PROVIDER_KINDS, "服务类型");
  if (input.models !== undefined && invalidModels(input.models)) {
    return bad("models 格式不正确，应为 [{ id, label }] 数组");
  }
  const created = repo.createProvider({ ...input, name, kind: kind ?? "deepseek" });
  return ok(maskProvider(created), { status: 201 });
});
