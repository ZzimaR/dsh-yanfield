import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { StoryArchive } from "@/lib/types";
import {
  ARCHIVE_STATUSES,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARCHIVE_FIELDS: FieldSpec = {
  chapterId: "str|null",
  chapterTitle: "str",
  orderIndex: "num",
  chapterSummary: "str",
  characterStates: "json",
  settingStates: "json",
  ledger: "json",
  timeline: "json",
  foreshadows: "json",
  conflicts: "json",
  status: "str",
  sourceWordCount: "num",
  generatedBy: "str",
  model: "str",
};

const LIST_KEYS = [
  "characterStates",
  "settingStates",
  "ledger",
  "timeline",
  "foreshadows",
  "conflicts",
] as const;

export const GET = handle(async (request) => {
  const novelId = queryParam(request, "novelId");
  const chapterId = queryParam(request, "chapterId");

  if (chapterId) {
    const chapter = repo.getChapter(chapterId);
    if (!chapter) return notFound("章节不存在");
    const archive = repo.getArchiveByChapter(chapterId);
    // 同时带 novelId：返回整部作品的档案列表 + 本章档案，
    // 兼容写作台「档案」页签「优先本章档案、否则回退到最新一卷」的读取方式
    if (novelId && novelId === chapter.novelId) {
      return ok({ item: archive ?? null, items: repo.listArchives(novelId) });
    }
    if (!archive) return ok({ item: null, items: [] });
    return ok({ ...archive, item: archive, items: [archive] });
  }

  if (!novelId) return bad("缺少查询参数 novelId 或 chapterId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listArchives(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");

  const input = pickFields<StoryArchive>(body, ARCHIVE_FIELDS);
  const status = pickEnum(body, "status", ARCHIVE_STATUSES, "档案状态");
  if (status) input.status = status;
  const generatedBy = pickEnum(body, "generatedBy", ["ai", "manual"] as const, "档案来源");
  if (generatedBy) input.generatedBy = generatedBy;

  for (const key of LIST_KEYS) {
    const value = input[key];
    if (value !== undefined && !Array.isArray(value)) return bad(`${key} 必须是数组`);
  }

  let chapterId: string | null = null;
  if (typeof input.chapterId === "string") {
    const chapter = repo.getChapter(input.chapterId);
    if (!chapter || chapter.novelId !== novelId) return bad("章节不存在或不属于该作品");
    chapterId = chapter.id;
  }

  const archive = repo.upsertArchive({ ...input, novelId, chapterId });
  return ok(archive, { status: 201 });
});
