import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Chapter } from "@/lib/types";
import { countWords } from "@/app/api/_lib/text";
import {
  pickFields,
  queryParam,
  readBody,
  requireQueryParam,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAPTER_FIELDS: FieldSpec = {
  title: "str",
  content: "str",
  volumeId: "str|null",
  orderIndex: "num",
};

export const GET = handle(async (request) => {
  const novelId = requireQueryParam(request, "novelId", "novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  let items = repo.listChapters(novelId, queryParam(request, "view") !== "summary");
  const volumeId = queryParam(request, "volumeId");
  if (volumeId) items = items.filter((chapter) => chapter.volumeId === volumeId);
  return ok({ items });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const input = pickFields<Chapter>(body, CHAPTER_FIELDS);
  if (typeof input.volumeId === "string") {
    const volume = repo.getVolume(input.volumeId);
    if (!volume || volume.novelId !== novelId) return bad("卷不存在或不属于该作品");
  }
  if (typeof input.title === "string" && !input.title.trim()) return bad("章节标题不能为空");
  const chapter = repo.createChapter(novelId, {
    title: input.title,
    content: input.content,
    volumeId: input.volumeId,
    orderIndex: input.orderIndex,
  });
  const saved =
    typeof input.content === "string" ? repo.updateChapter(chapter.id, { wordCount: countWords(input.content) }) : chapter;
  return ok(saved, { status: 201 });
});
