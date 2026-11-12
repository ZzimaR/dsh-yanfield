import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Character } from "@/lib/types";
import { CHARACTER_ROLES, isObject, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHARACTER_FIELDS: FieldSpec = {
  name: "str",
  aliases: "str[]",
  role: "str",
  gender: "str",
  age: "str",
  identity: "str",
  appearance: "str",
  personality: "str",
  goals: "str",
  secrets: "str",
  arc: "str",
  speechStyle: "str",
  relations: "json",
  currentState: "str",
  aiVisible: "bool",
  revealAtChapter: "num|null",
  tags: "str[]",
  pinned: "bool",
};

function invalidRelations(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.some(
    (item) => !isObject(item) || typeof item.targetId !== "string" || typeof item.relation !== "string",
  );
}

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const character = repo.getCharacter(params.id);
  if (!character) return notFound("角色不存在");
  return ok(character);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current=repo.getCharacter(params.id);
  if (!current) return notFound("角色不存在");
  const body = await readBody(request);
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updatedAt) return bad("资料已有新修改，请重新打开并核对后保存", 409);
  const patch = pickFields<Character>(body, CHARACTER_FIELDS);
  const role = pickEnum(body, "role", CHARACTER_ROLES, "角色定位");
  if (role) patch.role = role;
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return bad("角色名不能为空");
  }
  if (patch.relations !== undefined && invalidRelations(patch.relations)) return bad("relations 格式不正确");
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateCharacter(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getCharacter(params.id)) return notFound("角色不存在");
  repo.deleteCharacter(params.id);
  return ok({ ok: true });
});
