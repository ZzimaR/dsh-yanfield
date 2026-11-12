import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Character } from "@/lib/types";
import {
  CHARACTER_ROLES,
  isObject,
  pickEnum,
  pickFields,
  readBody,
  requireQueryParam,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

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

export const GET = handle(async (request) => {
  const novelId = requireQueryParam(request, "novelId", "novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listCharacters(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const name = requireString(body, "name", "角色名");
  const input = pickFields<Character>(body, CHARACTER_FIELDS);
  const role = pickEnum(body, "role", CHARACTER_ROLES, "角色定位");
  if (role) input.role = role;
  if (input.relations !== undefined && invalidRelations(input.relations)) return bad("relations 格式不正确");
  return ok(repo.createCharacter(novelId, { ...input, name }), { status: 201 });
});
