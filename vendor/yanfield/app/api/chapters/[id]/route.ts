import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Chapter } from "@/lib/types";
import { countWords } from "@/app/api/_lib/text";
import { CHAPTER_STATUSES, pickEnum, pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAPTER_FIELDS: FieldSpec = {
  title: "str",
  content: "str",
  summary: "str",
  notes: "str",
  orderIndex: "num",
  wordCount: "num",
};

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const chapter = repo.getChapter(params.id);
  if (!chapter) return notFound("章节不存在");
  return ok(chapter);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getChapter(params.id);
  if (!current) return notFound("章节不存在");
  const body = await readBody(request);
  const patch = pickFields<Chapter>(body, CHAPTER_FIELDS);
  const status = pickEnum(body, "status", CHAPTER_STATUSES, "章节状态");
  if (status) patch.status = status;
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("章节标题不能为空");
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  if (typeof patch.content === "string") {
    // 正文变化时字数以服务端 countWords 为准，忽略客户端上报值
    patch.wordCount = countWords(patch.content);
  } else if (patch.wordCount !== undefined) {
    patch.wordCount = Math.max(0, Math.round(patch.wordCount));
  }
  const next = repo.updateChapter(params.id, patch);
  if (typeof patch.content === "string" && patch.content !== current.content) {
    repo.markArchiveStale(params.id);
    repo.markArchivesStaleAfter(current.novelId, current.orderIndex);
  }
  return ok(next);
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getChapter(params.id)) return notFound("章节不存在");
  repo.deleteChapter(params.id);
  return ok({ ok: true });
});
