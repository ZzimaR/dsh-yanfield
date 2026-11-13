import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { WorldSetting } from "@/lib/types";
import {
  WORLD_CATEGORIES,
  WORLD_IMPORTANCES,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

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

function validParent(parentId: string | null | undefined, novelId: string): boolean {
  if (!parentId) return true;
  const parent = repo.getWorld(parentId);
  return parent !== undefined && parent.novelId === novelId;
}

export const GET = handle(async (request) => {
  const novelId = queryParam(request, "novelId");
  if (!novelId) return bad("缺少查询参数 novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listWorld(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const title = requireString(body, "title", "设定标题");
  const input = pickFields<WorldSetting>(body, WORLD_FIELDS);
  const category = pickEnum(body, "category", WORLD_CATEGORIES, "设定分类");
  if (category) input.category = category;
  const importance = pickEnum(body, "importance", WORLD_IMPORTANCES, "重要程度");
  if (importance) input.importance = importance;
  if (!validParent(input.parentId, novelId)) return bad("父级设定不存在或不属于该作品");
  return ok(repo.createWorld(novelId, { ...input, title }), { status: 201 });
});
