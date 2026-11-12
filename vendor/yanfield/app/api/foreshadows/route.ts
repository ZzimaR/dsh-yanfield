import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Foreshadow } from "@/lib/types";
import {
  FORESHADOW_STATUSES,
  pickEnum,
  pickFields,
  readBody,
  requireQueryParam,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

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

export const GET = handle(async (request) => {
  const novelId = requireQueryParam(request, "novelId", "novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listForeshadows(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const title = requireString(body, "title", "伏笔标题");
  const input = pickFields<Foreshadow>(body, FORESHADOW_FIELDS);
  const status = pickEnum(body, "status", FORESHADOW_STATUSES, "伏笔状态");
  if (status) input.status = status;
  if (!belongsToNovel(input.plantedChapterId, novelId)) return bad("埋设章节不存在或不属于该作品");
  if (!belongsToNovel(input.payoffChapterId, novelId)) return bad("回收章节不存在或不属于该作品");
  return ok(repo.createForeshadow(novelId, { ...input, title }), { status: 201 });
});
