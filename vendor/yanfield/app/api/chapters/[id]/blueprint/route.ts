import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ChapterBlueprint } from "@/lib/types";
import { pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLUEPRINT_FIELDS: FieldSpec = {
  goal: "str",
  pov: "str",
  conflict: "str",
  emotionalArc: "str",
  scenes: "json",
  plotPoints: "str[]",
  hooks: "str[]",
  targetWords: "num",
  notes: "str",
};

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getChapter(params.id)) return notFound("章节不存在");
  return ok(repo.getBlueprint(params.id));
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  if (!repo.getChapter(params.id)) return notFound("章节不存在");
  const body = await readBody(request);
  const patch = pickFields<ChapterBlueprint>(body, BLUEPRINT_FIELDS);
  if (patch.scenes !== undefined && !Array.isArray(patch.scenes)) return bad("scenes 必须是数组");
  return ok(repo.saveBlueprint(params.id, patch));
});
