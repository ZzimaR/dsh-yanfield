import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { NovelOutline } from "@/lib/types";
import { isObject, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTLINE_FIELDS: FieldSpec = {
  premise: "str",
  theme: "str",
  tone: "str",
  mainPlot: "str",
  subplots: "str[]",
  characterArcs: "json",
  worldRules: "str[]",
  ending: "str",
  hooks: "str[]",
};

function invalidCharacterArcs(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.some((item) => !isObject(item) || typeof item.character !== "string" || typeof item.arc !== "string");
}

export const GET = handle<{ novelId: string }>(async (_request, { params }) => {
  if (!repo.getNovel(params.novelId)) return notFound("作品不存在");
  return ok(repo.getNovelOutline(params.novelId));
});

export const PATCH = handle<{ novelId: string }>(async (request, { params }) => {
  if (!repo.getNovel(params.novelId)) return notFound("作品不存在");
  const body = await readBody(request);
  const patch = pickFields<NovelOutline>(body, OUTLINE_FIELDS);
  if (patch.characterArcs !== undefined && invalidCharacterArcs(patch.characterArcs)) {
    return bad("characterArcs 格式不正确");
  }
  return ok(repo.saveNovelOutline(params.novelId, patch));
});
