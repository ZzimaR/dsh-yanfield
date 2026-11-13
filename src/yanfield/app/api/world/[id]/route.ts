import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { WorldSetting } from "@/lib/types";
import { WORLD_CATEGORIES, WORLD_IMPORTANCES, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORLD_FIELDS: FieldSpec = {
  title: "str",
  category: "str",
  parentId: "str|null",
  summary: "str",
  content: "str",
  tags: "str[]",
  aiVisible: "bool",
  revealAtChapter: "num|null",
  orderIndex: "num",
  pinned: "bool",
};

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const setting = repo.getWorld(params.id);
  if (!setting) return notFound("设定不存在");
  return ok(setting);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getWorld(params.id);
  if (!current) return notFound("设定不存在");
  const body = await readBody(request);
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updatedAt) return bad("资料已有新修改，请重新打开并核对后保存", 409);
  const patch = pickFields<WorldSetting>(body, WORLD_FIELDS);
  const category = pickEnum(body, "category", WORLD_CATEGORIES, "设定分类");
  if (category) patch.category = category;
  const importance = pickEnum(body, "importance", WORLD_IMPORTANCES, "重要程度");
  if (importance) patch.importance = importance;
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("设定标题不能为空");
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId === params.id) return bad("父级设定不能是自身");
    if (patch.parentId !== null) {
      const parent = repo.getWorld(patch.parentId);
      if (!parent || parent.novelId !== current.novelId) return bad("父级设定不存在或不属于该作品");
    }
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateWorld(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getWorld(params.id)) return notFound("设定不存在");
  repo.deleteWorld(params.id);
  return ok({ ok: true });
});
