import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ImportChapterDraft } from "@/lib/types";
import { countWords } from "@/lib/ui/cn";
import { isObject, optionalString, readBody, requireString } from "@/app/api/_lib/http";
import { MAX_IMPORT_CHAPTERS, toContentHtml } from "@/app/api/_lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 校验并清洗前端提交的章节草稿；返回 string 表示校验错误 */
function normalizeDrafts(value: unknown): ImportChapterDraft[] | string {
  if (!Array.isArray(value) || value.length === 0) return "chapters 必须是非空数组";
  if (value.length > MAX_IMPORT_CHAPTERS) {
    return `章节数超过上限（${MAX_IMPORT_CHAPTERS}）`;
  }
  const drafts: ImportChapterDraft[] = [];
  for (const item of value) {
    if (!isObject(item)) return "章节格式不正确";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const content = typeof item.content === "string" ? item.content : "";
    if (!title) return "章节标题不能为空";
    if (!content.trim()) continue;
    drafts.push({ title, content });
  }
  if (drafts.length === 0) return "没有可导入的章节内容";
  return drafts;
}

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");

  const drafts = normalizeDrafts(body.chapters);
  if (typeof drafts === "string") return bad(drafts);

  // 与设置页文案一致：留空时创建「导入章节」卷
  const volumeTitle = optionalString(body, "volumeTitle")?.trim() || "导入章节";
  const volume = repo.createVolume(novelId, { title: volumeTitle });

  const chapters = drafts.map((draft) => {
    const content = toContentHtml(draft.content);
    const chapter = repo.createChapter(novelId, { title: draft.title, volumeId: volume.id, content });
    return repo.updateChapter(chapter.id, { wordCount: countWords(content) });
  });

  return ok({ volume, chapters }, { status: 201 });
});
