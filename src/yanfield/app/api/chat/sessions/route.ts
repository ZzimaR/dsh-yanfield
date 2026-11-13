import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ChatSession } from "@/lib/types";
import {
  AGENT_IDS,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_FIELDS: FieldSpec = {
  title: "str",
  chapterId: "str|null",
  agentId: "str",
  mode: "str",
};

/** 返回章 id，null 原样，undefined 表示未提供；false 表示校验失败 */
function checkChapter(
  novelId: string,
  chapterId: string | null | undefined,
): string | null | undefined | false {
  if (chapterId === undefined || chapterId === null) return chapterId;
  const chapter = repo.getChapter(chapterId);
  if (!chapter || chapter.novelId !== novelId) return false;
  return chapterId;
}

export const GET = handle(async (request) => {
  const novelId = queryParam(request, "novelId");
  if (!novelId) return bad("缺少查询参数 novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listChatSessions(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");

  const input = pickFields<ChatSession>(body, SESSION_FIELDS);
  const agentId = pickEnum(body, "agentId", AGENT_IDS, "智能体");
  if (agentId) input.agentId = agentId;
  const mode = pickEnum(body, "mode", ["chat", "collaborate"] as const, "会话模式");
  if (mode) input.mode = mode;
  if (typeof input.title === "string") {
    input.title = input.title.trim();
    if (!input.title) delete input.title;
  }
  const chapterId = checkChapter(novelId, input.chapterId);
  if (chapterId === false) return bad("章节不存在或不属于该作品");
  if (chapterId !== undefined) input.chapterId = chapterId;

  return ok(repo.createChatSession(novelId, input), { status: 201 });
});
