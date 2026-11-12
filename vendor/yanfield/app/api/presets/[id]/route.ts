import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { PromptPreset } from "@/lib/types";
import { pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESET_FIELDS: FieldSpec = {
  novelId: "str|null",
  name: "str",
  systemPrompt: "str",
  userTemplate: "str",
  temperature: "num",
  modelRole: "str",
  enabled: "bool",
};

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const preset = repo.getPreset(params.id);
  if (!preset) return notFound("预设不存在");
  return ok(preset);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getPreset(params.id);
  if (!current) return notFound("预设不存在");

  const body = await readBody(request);
  const patch = pickFields<PromptPreset>(body, PRESET_FIELDS);
  const modelRole = pickEnum(body, "modelRole", ["chat", "prose"] as const, "模型角色");
  if (modelRole) patch.modelRole = modelRole;
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return bad("预设名称不能为空");
  }
  if (typeof patch.temperature === "number") {
    patch.temperature = Math.min(2, Math.max(0, patch.temperature));
  }
  if (typeof patch.novelId === "string" && !repo.getNovel(patch.novelId)) {
    return bad("作品不存在");
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");

  return ok(
    repo.upsertPreset({
      ...patch,
      id: params.id,
      feature: current.feature,
      name: patch.name ?? current.name,
    }),
  );
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  const preset = repo.getPreset(params.id);
  if (!preset) return notFound("预设不存在");
  if (preset.isBuiltin) return bad("内置预设不可删除，可通过 PATCH 停用");
  repo.deletePreset(params.id);
  return ok({ ok: true });
});
