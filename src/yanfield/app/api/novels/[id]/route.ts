import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { isValidNovelWordGoal, MAX_NOVEL_WORD_GOAL } from "@/lib/novel-goal";
import type { Novel } from "@/lib/types";
import { NOVEL_STATUSES, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOVEL_FIELDS: FieldSpec = {
  title: "str",
  subtitle: "str",
  author: "str",
  genre: "str",
  tags: "str[]",
  synopsis: "str",
  coverKey: "str",
  wordGoal: "num",
  targetChapters: "num",
  styleGuide: "str",
  pov: "str",
  forbiddenWords: "str[]",
};

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const novel = repo.getNovel(params.id);
  if (!novel) return notFound("作品不存在");
  return ok(novel);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  if (!repo.getNovel(params.id)) return notFound("作品不存在");
  const body = await readBody(request);
  const patch = pickFields<Novel>(body, NOVEL_FIELDS);
  if (patch.wordGoal !== undefined && !isValidNovelWordGoal(patch.wordGoal)) {
    return bad(`全书目标字数必须是 0 至 ${MAX_NOVEL_WORD_GOAL.toLocaleString("zh-CN")} 之间的整数`);
  }
  const status = pickEnum(body, "status", NOVEL_STATUSES, "作品状态");
  if (status) patch.status = status;
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("作品标题不能为空");
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateNovel(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getNovel(params.id)) return notFound("作品不存在");
  repo.deleteNovel(params.id);
  return ok({ ok: true });
});
