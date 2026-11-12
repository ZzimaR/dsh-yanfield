import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Foreshadow } from "@/lib/types";
import { FORESHADOW_STATUSES, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORESHADOW_FIELDS: FieldSpec = {
  title: "str",
  description: "str",
  plantedChapterId: "str|null",
  payoffChapterId: "str|null",
  status: "str",
  notes: "str",
};

function belongsToNovel(chapterId: string | null | undefined, novelId: string): boolean {
  if (!chapterId) return true;
  const chapter = repo.getChapter(chapterId);
  return chapter !== undefined && chapter.novelId === novelId;
}

/** repo 未暴露 getForeshadow：借作品列表反查（作品量小，仅用于 404 与归属校验） */
function findForeshadow(id: string): Foreshadow | undefined {
  for (const novel of repo.listNovels()) {
    const found = repo.listForeshadows(novel.id).find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const foreshadow = findForeshadow(params.id);
  if (!foreshadow) return notFound("伏笔不存在");
  return ok(foreshadow);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = findForeshadow(params.id);
  if (!current) return notFound("伏笔不存在");
  const body = await readBody(request);
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updatedAt) return bad("资料已有新修改，请重新打开并核对后保存", 409);
  const patch = pickFields<Foreshadow>(body, FORESHADOW_FIELDS);
  const status = pickEnum(body, "status", FORESHADOW_STATUSES, "伏笔状态");
  if (status) patch.status = status;
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("伏笔标题不能为空");
  }
  if (!belongsToNovel(patch.plantedChapterId, current.novelId)) return bad("埋设章节不存在或不属于该作品");
  if (!belongsToNovel(patch.payoffChapterId, current.novelId)) return bad("回收章节不存在或不属于该作品");
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateForeshadow(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!findForeshadow(params.id)) return notFound("伏笔不存在");
  repo.deleteForeshadow(params.id);
  return ok({ ok: true });
});
