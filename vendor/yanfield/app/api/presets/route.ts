import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { PromptPreset } from "@/lib/types";
import {
  AI_FEATURES,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

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

export const GET = handle(async (request) => {
  const novelId = queryParam(request, "novelId");
  return ok({ items: repo.listPresets(novelId ?? undefined) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const name = requireString(body, "name", "预设名称").trim();
  if (!name) return bad("预设名称不能为空");
  const feature = pickEnum(body, "feature", AI_FEATURES, "功能类型");
  if (!feature) return bad("feature 不能为空");

  const input = pickFields<PromptPreset>(body, PRESET_FIELDS);
  const modelRole = pickEnum(body, "modelRole", ["chat", "prose"] as const, "模型角色");
  if (modelRole) input.modelRole = modelRole;
  if (typeof input.temperature === "number") {
    input.temperature = Math.min(2, Math.max(0, input.temperature));
  }
  if (typeof input.novelId === "string" && !repo.getNovel(input.novelId)) {
    return bad("作品不存在");
  }

  return ok(repo.upsertPreset({ ...input, feature, name }), { status: 201 });
});
